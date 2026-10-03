import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PriceMatrixEntry } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { assertAcyclicTiers, resolvePrice } from '../../domain/pricing';
import type { Prisma } from '../../generated/prisma/client';
import { CatalogueQuery } from '../catalogue/catalogue.dto';
import { MatrixInput, MatrixQuery, TierInput } from './pricing.dto';

export async function readPriceContext(tx: Prisma.TransactionClient) {
  const [tiers, dishPrices, optionPrices] = await Promise.all([
    tx.priceTier.findMany(), tx.dishTierPrice.findMany(), tx.optionTierPrice.findMany(),
  ]);
  return { tiers, dishPrices, optionPrices };
}
export type PriceContext = Awaited<ReturnType<typeof readPriceContext>>;
export function resolveItemPrice(context: PriceContext, tierId: string, kind: 'DISH' | 'OPTION', id: string, costMinor: number) {
  const tier = context.tiers.find((tier) => tier.id === tierId);
  if (!tier?.active) throw new ApiError(400, 'PRICE_TIER_INACTIVE', 'The effective price tier must be active.');
  const explicit = new Map<string, number>();
  if (kind === 'DISH') for (const price of context.dishPrices) { if (price.dishId === id) explicit.set(price.tierId, price.amountMinor); }
  else for (const price of context.optionPrices) { if (price.optionId === id) explicit.set(price.tierId, price.amountMinor); }
  return { ...resolvePrice(tierId, costMinor, context.tiers, explicit), explicitMinor: explicit.get(tierId) ?? null };
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: CatalogueQuery) {
    const where: Prisma.PriceTierWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active === 'true' }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.priceTier.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      this.prisma.priceTier.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async tier(id: string) {
    const tier = await this.prisma.priceTier.findUnique({ where: { id } });
    if (!tier) throw new ApiError(404, 'PRICE_TIER_NOT_FOUND', 'This price tier does not exist.');
    return tier;
  }
  async save(id: string | undefined, input: TierInput) {
    if ((!id || input.name !== undefined) && !input.name?.trim()) throw new ApiError(400, 'VALIDATION_FAILED', 'Name the price tier.', { name: ['Provide a name.'] });
    if (!id && !input.rule) throw new ApiError(400, 'VALIDATION_FAILED', 'Select a pricing rule.', { rule: ['Select manual, cost or reference.'] });
    try {
      return await serializable(this.prisma, async (tx) => {
        const tiers = await tx.priceTier.findMany();
        const previous = id ? tiers.find((tier) => tier.id === id) : undefined;
        if (id && !previous) throw new ApiError(404, 'PRICE_TIER_NOT_FOUND', 'This price tier does not exist.');
        const next = {
          id: id ?? randomUUID(), name: input.name?.trim() ?? previous!.name,
          rule: input.rule ?? previous?.rule ?? 'MANUAL', numerator: input.numerator ?? previous?.numerator ?? 1,
          denominator: input.denominator ?? previous?.denominator ?? 1,
          referenceTierId: input.referenceTierId === undefined ? previous?.referenceTierId ?? null : input.referenceTierId,
          active: input.active ?? previous?.active ?? true,
        };
        if (next.rule === 'REFERENCE') {
          if (!next.referenceTierId || !tiers.some((tier) => tier.id === next.referenceTierId && tier.active)) throw new ApiError(400, 'REFERENCE_TIER_INVALID', 'Select an active reference tier.');
        } else if (next.referenceTierId !== null) throw new ApiError(400, 'REFERENCE_TIER_INVALID', 'Only reference pricing may have a reference tier. Clear the reference first.');
        assertAcyclicTiers([...tiers.filter((tier) => tier.id !== next.id), next]);
        if (id && !next.active) {
          const [defaults, companies] = await Promise.all([
            tx.kitchenSettings.count({ where: { defaultPriceTierId: id } }), tx.company.count({ where: { priceTierId: id } }),
          ]);
          if (defaults || companies || tiers.some((tier) => tier.id !== id && tier.active && tier.referenceTierId === id)) throw new ApiError(409, 'PRICE_TIER_IN_USE', 'Change default, company and reference-tier assignments before deactivating this tier.');
        }
        return id ? tx.priceTier.update({ where: { id }, data: next }) : tx.priceTier.create({ data: next });
      });
    } catch (error) { translateDatabaseError(error); }
  }
  async matrix(id: string, query: MatrixQuery) {
    return this.prisma.$transaction(async (tx) => {
      const context = await readPriceContext(tx);
      const tier = context.tiers.find((tier) => tier.id === id);
      if (!tier) throw new ApiError(404, 'PRICE_TIER_NOT_FOUND', 'This price tier does not exist.');
      const filter = { ...(query.active === undefined ? {} : { active: query.active === 'true' }), ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}) };
      const [dishes, options] = await Promise.all([
        query.kind === 'OPTION' ? [] : tx.dish.findMany({ where: filter, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        query.kind === 'DISH' ? [] : tx.option.findMany({ where: filter, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      ]);
      const entries: PriceMatrixEntry[] = [];
      for (const [kind, records] of [['DISH', dishes], ['OPTION', options]] as const) {
        for (const item of records) {
          // Inactive tiers remain inspectable in the matrix; ordering only uses active tiers.
          const explicit = new Map<string, number>();
          if (kind === 'DISH') for (const price of context.dishPrices) { if (price.dishId === item.id) explicit.set(price.tierId, price.amountMinor); }
          else for (const price of context.optionPrices) { if (price.optionId === item.id) explicit.set(price.tierId, price.amountMinor); }
          const price = resolvePrice(id, item.costMinor, context.tiers, explicit);
          if (query.missing !== undefined && (price.amountMinor === null) !== (query.missing === 'true')) continue;
          entries.push({ kind, itemId: item.id, name: item.name, active: item.active, costMinor: item.costMinor, explicitMinor: explicit.get(id) ?? null, effectiveMinor: price.amountMinor, source: price.source });
        }
      }
      return { tier, items: entries.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: entries.length, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async saveMatrix(tierId: string, input: MatrixInput) {
    const keys = input.entries.map((entry) => `${entry.kind}:${entry.itemId.toLowerCase()}`);
    if (new Set(keys).size !== keys.length) throw new ApiError(400, 'PRICE_DUPLICATE', 'Include each item only once per bulk edit.');
    if (input.entries.some((entry) => entry.amountMinor === undefined)) throw new ApiError(400, 'VALIDATION_FAILED', 'Provide an integer price or null to remove an override.');
    try {
      return await serializable(this.prisma, async (tx) => {
        if (!await tx.priceTier.findUnique({ where: { id: tierId } })) throw new ApiError(404, 'PRICE_TIER_NOT_FOUND', 'This price tier does not exist.');
        for (const entry of input.entries) {
          if (entry.kind === 'DISH') {
            if (!await tx.dish.findUnique({ where: { id: entry.itemId } })) throw new ApiError(400, 'PRICE_ITEM_INVALID', 'A dish in this edit does not exist. No prices were changed.');
            const key = { tierId_dishId: { tierId, dishId: entry.itemId } };
            if (entry.amountMinor === null) await tx.dishTierPrice.deleteMany({ where: { tierId, dishId: entry.itemId } });
            else await tx.dishTierPrice.upsert({ where: key, create: { tierId, dishId: entry.itemId, amountMinor: entry.amountMinor }, update: { amountMinor: entry.amountMinor } });
          } else {
            if (!await tx.option.findUnique({ where: { id: entry.itemId } })) throw new ApiError(400, 'PRICE_ITEM_INVALID', 'An option in this edit does not exist. No prices were changed.');
            const key = { tierId_optionId: { tierId, optionId: entry.itemId } };
            if (entry.amountMinor === null) await tx.optionTierPrice.deleteMany({ where: { tierId, optionId: entry.itemId } });
            else await tx.optionTierPrice.upsert({ where: key, create: { tierId, optionId: entry.itemId, amountMinor: entry.amountMinor }, update: { amountMinor: entry.amountMinor } });
          }
        }
        return { updated: input.entries.length };
      });
    } catch (error) { translateDatabaseError(error); }
  }
}
