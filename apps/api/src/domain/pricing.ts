import { ApiError } from '../common/api-error';
import { assertMinor, roundDerivedMinor } from './money';

export type PriceRule = 'MANUAL' | 'COST' | 'REFERENCE';
export interface TierRule { id: string; rule: PriceRule; numerator: number; denominator: number; referenceTierId: string | null }
export interface PriceResolution { amountMinor: number | null; source: 'EXPLICIT' | 'COST' | 'REFERENCE' | 'MISSING'; tierId: string }
export function chooseTier(companyTierId: string | null, defaultTierId: string): string { return companyTierId ?? defaultTierId; }

export function assertAcyclicTiers(tiers: readonly TierRule[]): void {
  const byId = new Map(tiers.map((tier) => [tier.id, tier]));
  const complete = new Set<string>();
  function visit(id: string, chain: Set<string>): void {
    if (chain.has(id)) throw new ApiError(400, 'PRICE_TIER_CYCLE', 'Price tiers cannot reference themselves or form a cycle.');
    if (complete.has(id)) return;
    const tier = byId.get(id);
    if (!tier) throw new ApiError(400, 'PRICE_TIER_MISSING', 'The referenced price tier does not exist.');
    if (!Number.isInteger(tier.numerator) || tier.numerator < 0 || tier.numerator > 1_000_000 || !Number.isInteger(tier.denominator) || tier.denominator < 1 || tier.denominator > 1_000_000) throw new ApiError(400, 'PRICE_RULE_INVALID', 'Price multipliers require bounded whole-number numerator and denominator values.');
    if (tier.rule === 'REFERENCE') {
      if (!tier.referenceTierId) throw new ApiError(400, 'PRICE_RULE_INVALID', 'A reference rule needs a reference tier.');
      visit(tier.referenceTierId, new Set([...chain, id]));
    } else if (tier.referenceTierId !== null) throw new ApiError(400, 'PRICE_RULE_INVALID', 'Only a reference rule can have a reference tier.');
    complete.add(id);
  }
  for (const tier of tiers) visit(tier.id, new Set());
}

export function resolvePrice(tierId: string, itemCostMinor: number, tiers: readonly TierRule[], explicitPrices: ReadonlyMap<string, number>): PriceResolution {
  assertMinor(itemCostMinor);
  assertAcyclicTiers(tiers);
  function resolve(id: string): PriceResolution {
    const tier = tiers.find((candidate) => candidate.id === id);
    if (!tier) throw new ApiError(400, 'PRICE_TIER_MISSING', 'The selected price tier does not exist.');
    const explicit = explicitPrices.get(id);
    if (explicit !== undefined) { assertMinor(explicit); return { amountMinor: explicit, source: 'EXPLICIT', tierId: id }; }
    if (tier.rule === 'MANUAL') return { amountMinor: null, source: 'MISSING', tierId: id };
    const base = tier.rule === 'COST' ? itemCostMinor : resolve(tier.referenceTierId!).amountMinor;
    if (base === null) return { amountMinor: null, source: 'MISSING', tierId: id };
    return { amountMinor: roundDerivedMinor(BigInt(base) * BigInt(tier.numerator), BigInt(tier.denominator)), source: tier.rule, tierId: id };
  }
  return resolve(tierId);
}
