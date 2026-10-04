import { Inject, Injectable } from '@nestjs/common';
import type { OrderDetail, OrderInput, OrderPage, OrderQuoteResponse, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { assertCalendarDate, deadlinePassed } from '../../domain/calendar';
import { Prisma } from '../../generated/prisma/client';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { MenuService } from '../menu/menu.service';
import { CreateOrderDto, OrderQueryDto, OverrideCreateDto, OverrideDto, PlaceOrderDto, QuoteDto, ReasonDto, UpdateOrderDto } from './orders.dto';
import { addressKey, detail, fingerprint, json, orderInclude, summary } from './order.mapping';
import { quoteInTransaction, type QuotePolicy } from './order.quote';
import { overrideDelivery } from './order.delivery';

export const ORDER_QUOTE_POLICY = Symbol('ORDER_QUOTE_POLICY');

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly menu: MenuService,
    private readonly cutoffs: CutoffsService, private readonly clock: Clock,
    @Inject(ORDER_QUOTE_POLICY) private readonly quotePolicy: QuotePolicy) {}

  async list(query: OrderQueryDto): Promise<OrderPage> {
    if (query.from) assertCalendarDate(query.from);
    if (query.to) assertCalendarDate(query.to);
    if (query.from && query.to && query.from > query.to) {
      throw new ApiError(400, 'DATE_RANGE_INVALID', 'The start of the delivery range must precede its end.');
    }
    // Invoice filter uses the real invoiceId column added in Phase 4.
    const invoiceFilter: Prisma.OrderWhereInput = query.invoiced === 'true' ? { invoiceId: { not: null } }
      : query.invoiced === 'false' ? { invoiceId: null } : {};
    const billableFilter: Prisma.OrderWhereInput = query.billable === 'true'
      ? { status: { in: ['CONFIRMED', 'DELIVERED'] }, totalMinor: { not: null } } : {};
    const where: Prisma.OrderWhereInput = {
      ...invoiceFilter,
      AND: [billableFilter],
      ...(query.companyId ? { companyId: query.companyId } : {}), ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { deliveryDate: { gte: query.from, lte: query.to } } : {}),
      ...(query.q ? { OR: [
        { employeeName: { contains: query.q, mode: 'insensitive' } }, { companyName: { contains: query.q, mode: 'insensitive' } },
        ...(/^\d+$/.test(query.q) && Number(query.q) <= 2147483647 ? [{ number: Number(query.q) }] : []),
      ] } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: { lines: { select: { quantity: true } } }, orderBy: [{ deliveryDate: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.order.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items: records.map(summary), total, page: query.page, pageSize: query.pageSize };
  }

  async read(id: string): Promise<OrderDetail> {
    return this.prisma.$transaction((tx) => this.readInTransaction(tx, id), { isolationLevel: 'RepeatableRead' });
  }

  async quote(dto: QuoteDto): Promise<OrderQuoteResponse> {
    try {
      return await serializable(this.prisma, async (tx) => {
        const previous = dto.orderId ? await this.record(tx, dto.orderId) : undefined;
        if (previous && !['DRAFT', 'PLACED'].includes(previous.status)) throw new ApiError(409, 'ORDER_PURCHASE_FROZEN', 'Confirmed and terminal orders retain their purchased quantities and prices. Use a logistics override.');
        if (previous && !dto.overrideReason) this.assertOrdinaryOpen(previous);
        return quoteInTransaction(tx, this.input(dto), { override: !!dto.overrideReason, previous }, this.quotePolicy, this.menu, this.cutoffs);
      });
    } catch (error) { return translateDatabaseError(error); }
  }

  async create(dto: CreateOrderDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'CREATE', body: dto }, async (tx) => {
      const quote = await quoteInTransaction(tx, this.input(dto), { override: false }, this.quotePolicy, this.menu, this.cutoffs);
      return this.createWithQuote(tx, dto, quote, actor);
    });
  }

  async update(id: string, dto: UpdateOrderDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'UPDATE', id, body: dto }, async (tx) => {
      const previous = await this.record(tx, id);
      this.assertVersion(previous, dto.version); this.assertOrdinaryOpen(previous);
      const quote = await quoteInTransaction(tx, this.input(dto), { override: false, previous }, this.quotePolicy, this.menu, this.cutoffs);
      return this.updateWithQuote(tx, previous, dto, quote, actor);
    });
  }

  async place(id: string, dto: PlaceOrderDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'PLACE', id, body: dto }, async (tx) => {
      const previous = await this.record(tx, id);
      this.assertVersion(previous, dto.version); this.assertOrdinaryOpen(previous);
      const quote = await quoteInTransaction(tx, previous.input as unknown as OrderInput, { override: false, previous }, this.quotePolicy, this.menu, this.cutoffs);
      return this.placeWithQuote(tx, previous, dto, quote, actor);
    });
  }

  cancel(id: string, dto: ReasonDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'CANCEL', id, body: dto }, async (tx) =>
      this.finish(tx, await this.record(tx, id), dto, actor, 'CANCELLED', false));
  }
  reject(id: string, dto: ReasonDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'REJECT', id, body: dto }, async (tx) =>
      this.finish(tx, await this.record(tx, id), dto, actor, 'REJECTED', false));
  }

  async overrideCreate(dto: OverrideCreateDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'OVERRIDE_CREATE', body: dto }, async (tx) => {
      const quote = await quoteInTransaction(tx, this.input(dto), { override: true }, this.quotePolicy, this.menu, this.cutoffs);
      return this.createWithQuote(tx, { ...dto, status: 'PLACED' }, quote, actor, dto.reason);
    });
  }

  override(id: string, dto: OverrideDto, actor: StaffIdentity): Promise<OrderDetail> {
    return this.action(actor, dto.actionId, { operation: 'OVERRIDE', id, body: dto }, async (tx) => {
      const previous = await this.record(tx, id);
      this.assertVersion(previous, dto.version);
      if (dto.action === 'CANCEL' || dto.action === 'REJECT') return this.finish(tx, previous, dto, actor,
        dto.action === 'CANCEL' ? 'CANCELLED' : 'REJECTED', true);
      if (dto.action === 'PLACE') {
        if (previous.status !== 'DRAFT') throw new ApiError(409, 'ORDER_NOT_DRAFT', 'Only a draft can be placed.');
        const quote = await quoteInTransaction(tx, previous.input as unknown as OrderInput, { override: true, previous }, this.quotePolicy, this.menu, this.cutoffs);
        return this.placeWithQuote(tx, previous, { ...dto, acceptedQuote: dto.acceptedQuote ?? '' }, quote, actor, dto.reason);
      }
      const change = await overrideDelivery(tx, previous, dto, this.cutoffs, actor);
      await this.event(tx, id, actor, dto.actionId, 'ADMIN_OVERRIDE_DELIVERY', dto.reason,
        { ...change, purchaseTotalMinor: previous.totalMinor, purchasedCompanyId: previous.companyId });
      // Existing purchase revisions remain immutable, including the original
      // delivery target; the current logistics are recorded separately above.
      return this.readInTransaction(tx, id);
    });
  }

  private async createWithQuote(tx: Prisma.TransactionClient, dto: CreateOrderDto,
    quote: OrderQuoteResponse, actor: StaffIdentity, overrideReason?: string): Promise<OrderDetail> {
    const now = this.clock.now();
    const placed = dto.status === 'PLACED';
    if (placed) {
      if (!quote.lines.length) throw new ApiError(400, 'ORDER_EMPTY', 'A placed order must contain at least one dish.');
      this.assertAccepted(quote, dto.acceptedQuote);
    }
    if (!overrideReason && deadlinePassed(now, new Date(quote.cutoffAt))) throw new ApiError(409, 'CUTOFF_PASSED', 'This delivery date reached its kitchen cutoff. Choose a later date or use an explicit Admin override.');
    const input = this.input(dto);
    const order = await tx.order.create({ data: { ...this.purchaseData(input, quote), createdById: actor.id,
      status: dto.status, purchaseSnapshot: placed ? json(quote) : Prisma.DbNull,
      placedAt: placed ? now : null, createdAt: now,
    } });
    await this.persistLines(tx, order.id, quote);
    if (placed) await this.revision(tx, order.id, order.version, quote, actor, overrideReason ?? null);
    await this.event(tx, order.id, actor, dto.actionId, overrideReason ? 'ADMIN_OVERRIDE_PLACED' : placed ? 'PLACED' : 'DRAFT_CREATED',
      overrideReason ?? null, { fingerprint: quote.fingerprint, totalMinor: quote.totalMinor, delivery: quote.delivery });
    // A late Admin placement immediately uses the same confirmed-work helper
    // as scheduled/manual cutoff, inside the placement transaction.
    if (placed && overrideReason && deadlinePassed(now, new Date(quote.cutoffAt))) {
      await this.confirmLatePlacement(tx, order.id, actor);
    }
    return this.readInTransaction(tx, order.id);
  }

  private async updateWithQuote(tx: Prisma.TransactionClient, order: OrderRecord, dto: UpdateOrderDto,
    quote: OrderQuoteResponse, actor: StaffIdentity): Promise<OrderDetail> {
    this.assertVersion(order, dto.version); this.assertOrdinaryOpen(order);
    if (order.status === 'PLACED') {
      if (!quote.lines.length) throw new ApiError(400, 'ORDER_EMPTY', 'A placed order must contain at least one dish.');
      this.assertAccepted(quote, dto.acceptedQuote);
    }
    if (deadlinePassed(this.clock.now(), new Date(quote.cutoffAt))) throw new ApiError(409, 'CUTOFF_PASSED', 'The new delivery date reached its kitchen cutoff. Choose a later date.');
    const changed = await tx.order.updateMany({ where: { id: order.id, version: dto.version, status: order.status },
      data: { ...this.purchaseData(this.input(dto), quote), purchaseSnapshot: order.status === 'PLACED' ? json(quote) : Prisma.DbNull,
        version: { increment: 1 } } });
    if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'This order changed. Reload before trying again.');
    await this.persistLines(tx, order.id, quote);
    if (order.status === 'PLACED') await this.revision(tx, order.id, order.version + 1, quote, actor);
    await this.event(tx, order.id, actor, dto.actionId, order.status === 'PLACED' ? 'PLACED_REVISED' : 'DRAFT_UPDATED', null,
      { previousVersion: order.version, fingerprint: quote.fingerprint, totalMinor: quote.totalMinor });
    return this.readInTransaction(tx, order.id);
  }

  private async placeWithQuote(tx: Prisma.TransactionClient, order: OrderRecord, dto: PlaceOrderDto,
    quote: OrderQuoteResponse, actor: StaffIdentity, overrideReason?: string): Promise<OrderDetail> {
    this.assertVersion(order, dto.version);
    if (order.status !== 'DRAFT') throw new ApiError(409, 'ORDER_NOT_DRAFT', 'Only a draft can be placed.');
    if (!overrideReason) this.assertOrdinaryOpen(order);
    if (!quote.lines.length) throw new ApiError(400, 'ORDER_EMPTY', 'A placed order must contain at least one dish.');
    this.assertAccepted(quote, dto.acceptedQuote);
    const now = this.clock.now();
    if (!overrideReason && deadlinePassed(now, new Date(quote.cutoffAt))) throw new ApiError(409, 'CUTOFF_PASSED', 'This delivery date reached its kitchen cutoff.');
    const changed = await tx.order.updateMany({ where: { id: order.id, version: dto.version, status: 'DRAFT' },
      data: { ...this.purchaseData(this.input(order.input as unknown as OrderInput), quote), purchaseSnapshot: json(quote),
        status: 'PLACED', placedAt: now, version: { increment: 1 } } });
    if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'This order changed. Reload before trying again.');
    await this.persistLines(tx, order.id, quote);
    await this.revision(tx, order.id, order.version + 1, quote, actor, overrideReason ?? null);
    await this.event(tx, order.id, actor, dto.actionId, overrideReason ? 'ADMIN_OVERRIDE_PLACED' : 'PLACED', overrideReason ?? null,
      { fingerprint: quote.fingerprint, totalMinor: quote.totalMinor, delivery: quote.delivery });
    if (overrideReason && deadlinePassed(now, new Date(quote.cutoffAt))) await this.confirmLatePlacement(tx, order.id, actor);
    return this.readInTransaction(tx, order.id);
  }

  private async finish(tx: Prisma.TransactionClient, order: OrderRecord, dto: ReasonDto,
    actor: StaffIdentity, target: 'CANCELLED' | 'REJECTED', override: boolean): Promise<OrderDetail> {
    this.assertVersion(order, dto.version);
    if (target === 'REJECTED' && order.status !== 'PLACED') throw new ApiError(409, 'ORDER_NOT_PLACED', 'Only a placed order can be rejected. Confirmed orders can be explicitly cancelled.');
    if (target === 'CANCELLED' && !['DRAFT', 'PLACED', ...(override ? ['CONFIRMED'] : [])].includes(order.status)) {
      throw new ApiError(409, 'ORDER_LOCKED', 'This order cannot be cancelled. Delivered orders retain their delivery history; record a reasoned shortage credit through Billing.');
    }
    if (!override) this.assertOrdinaryOpen(order);
    const now = this.clock.now();
    const changed = await tx.order.updateMany({ where: { id: order.id, version: dto.version, status: order.status }, data: {
      status: target, version: { increment: 1 }, ...(target === 'CANCELLED' ? { cancelledAt: now } : { rejectedAt: now }),
    } });
    if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'This order changed. Reload before trying again.');
    if (order.status === 'CONFIRMED') await this.cutoffs.detachCancelled(tx, order.id, order.dropId, actor, dto.reason);
    // Keep issued membership and gross historical. The credit commits with the
    // cancellation and its idempotent response, including concurrent retries.
    if (target === 'CANCELLED' && order.invoiceId) {
      if (order.totalMinor === null) throw new ApiError(409, 'BILLING_INCONSISTENT', 'This invoiced order is missing its purchased amount. Review Billing before cancelling.');
      const existing = await tx.billingCredit.aggregate({ where: { orderId: order.id }, _sum: { amountMinor: true } });
      const amountMinor = order.totalMinor - (existing._sum.amountMinor ?? 0);
      if (amountMinor < 0) throw new ApiError(409, 'BILLING_INCONSISTENT', 'Existing credits exceed the purchased amount. Review Billing before cancelling.');
      if (amountMinor > 0) {
        const credit = await tx.billingCredit.create({ data: { invoiceId: order.invoiceId, orderId: order.id,
          amountMinor, reason: dto.reason, actionKey: `cancel:${actor.id}:${dto.actionId}` } });
        await this.event(tx, order.id, actor, `billing:${dto.actionId}`, 'BILLING_CREDIT_CREATED', dto.reason,
          { invoiceId: order.invoiceId, creditId: credit.id, amountMinor, policy: 'INVOICED_CANCELLATION' });
      }
    }
    await this.event(tx, order.id, actor, dto.actionId, override ? `ADMIN_OVERRIDE_${target}` : target, dto.reason,
      { previousStatus: order.status, purchaseTotalMinor: order.totalMinor, previousDropId: order.dropId,
        kitchenStartedAt: order.kitchenStartedAt?.toISOString() ?? null, kitchenReadyAt: order.kitchenReadyAt?.toISOString() ?? null });
    return this.readInTransaction(tx, order.id);
  }

  private async confirmLatePlacement(tx: Prisma.TransactionClient, orderId: string, actor: StaffIdentity): Promise<void> {
    // The shared CutoffsService owns conditional confirmation, prep uniqueness,
    // drop grouping and the cutoff event, including explicit late placement.
    await this.cutoffs.confirmPlaced(tx, orderId, actor);
  }

  private input(value: OrderInput): OrderInput {
    return { employeeId: value.employeeId, deliveryDate: value.deliveryDate, lines: value.lines,
      ...(value.addressId !== undefined ? { addressId: value.addressId } : {}),
      ...(value.customAddress !== undefined ? { customAddress: value.customAddress } : {}),
      ...(value.deliveryTime !== undefined ? { deliveryTime: value.deliveryTime } : {}),
      ...(value.packagingId !== undefined ? { packagingId: value.packagingId } : {}),
    };
  }

  private async readInTransaction(tx: Prisma.TransactionClient, id: string): Promise<OrderDetail> {
    const record = await this.record(tx, id);
    const units = await tx.prepUnit.count({ where: { combination: { line: { orderId: id } } } });
    return detail(record, units);
  }

  private async record(tx: Prisma.TransactionClient, id: string): Promise<OrderRecord> {
    const record = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!record) throw new ApiError(404, 'ORDER_NOT_FOUND', 'This order does not exist.');
    return record;
  }

  private async action(actor: StaffIdentity, actionId: string, payload: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<OrderDetail>): Promise<OrderDetail> {
    const payloadHash = fingerprint(payload);
    try {
      return await serializable(this.prisma, async (tx) => {
        const existing = await tx.orderAction.findUnique({ where: { actorId_key: { actorId: actor.id, key: actionId } } });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ApiError(409, 'ACTION_ID_REUSED', 'This action ID was already used for a different request. Start a new action.');
          return existing.result as unknown as OrderDetail;
        }
        const result = await operation(tx);
        await tx.orderAction.create({ data: { actorId: actor.id, key: actionId, payloadHash, orderId: result.id, result: json(result) } });
        return result;
      });
    } catch (error) {
      // Two requests can race to insert an identical actor/key. Only replay the
      // actual committed result; a reused key with different input is a conflict.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.orderAction.findUnique({ where: { actorId_key: { actorId: actor.id, key: actionId } } });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ApiError(409, 'ACTION_ID_REUSED', 'This action ID was already used for a different request. Start a new action.');
          return existing.result as unknown as OrderDetail;
        }
      }
      return translateDatabaseError(error);
    }
  }

  private assertVersion(order: OrderRecord, version: number): void {
    if (order.version !== version) throw new ApiError(409, 'STALE_VERSION', 'This order changed. Reload before trying again.');
  }
  private assertOrdinaryOpen(order: OrderRecord): void {
    if (!['DRAFT', 'PLACED'].includes(order.status)) throw new ApiError(409, 'ORDER_LOCKED', 'Only drafts and placed orders can use ordinary changes.');
    if (deadlinePassed(this.clock.now(), order.cutoffAt)) throw new ApiError(409, 'CUTOFF_PASSED', 'This order reached its kitchen cutoff. Use an explicit Admin override with a reason.');
  }
  private assertAccepted(quote: OrderQuoteResponse, accepted: string | undefined): void {
    if (quote.fingerprint !== accepted) throw new ApiError(409, 'QUOTE_CHANGED', 'Review and accept the current server quote before saving.', undefined, { quote });
  }
  private async event(tx: Prisma.TransactionClient, orderId: string, actor: StaffIdentity, actionId: string,
    type: string, reason: string | null = null, details: Record<string, unknown> = {}): Promise<void> {
    await tx.orderEvent.create({ data: { orderId, actionKey: `${actor.id}:${actionId}`, actorId: actor.id,
      actorName: actor.displayName, type, reason, details: json(details), createdAt: this.clock.now() } });
  }

  private purchaseData(input: OrderInput, quote: OrderQuoteResponse) {
    return {
      employeeId: quote.employee.id, companyId: quote.company.id, employeeName: quote.employee.name, companyName: quote.company.name,
      employeeSnapshot: json(quote.employee), companySnapshot: json(quote.company), deliveryDate: quote.delivery.deliveryDate,
      deliveryAt: new Date(quote.delivery.deliveryAt), cutoffAt: new Date(quote.cutoffAt), addressKey: addressKey(quote.delivery),
      deliverySnapshot: json(quote.delivery), plannedDispatchReadyAt: new Date(quote.delivery.plannedDispatchReadyAt),
      plannedKitchenReadyAt: new Date(quote.delivery.plannedKitchenReadyAt), input: json(input),
      totalMinor: quote.totalMinor,
    };
  }

  private async persistLines(tx: Prisma.TransactionClient, orderId: string, quote: OrderQuoteResponse): Promise<void> {
    await tx.orderLine.deleteMany({ where: { orderId } });
    for (const [sortOrder, line] of quote.lines.entries()) {
      await tx.orderLine.create({ data: { orderId, dishId: line.dish.id, menuItemId: line.menuItemId, sortOrder,
        quantity: line.quantity, basePriceMinor: line.basePriceMinor, totalMinor: line.totalMinor, dishSnapshot: json(line.dish),
        combinations: { create: line.combinations.map((combination) => ({ canonicalKey: combination.canonicalKey,
          quantity: combination.quantity, unitPriceMinor: combination.unitPriceMinor, totalMinor: combination.totalMinor,
          selections: { create: combination.selections.map((selection, index) => ({ groupId: selection.groupId,
            groupName: selection.groupName, optionId: selection.optionId, optionName: selection.optionName,
            priceMinor: selection.priceMinor, priceSource: selection.priceSource, tierId: selection.tierId, sortOrder: index,
            allergens: json(selection.allergens), dietaryTags: json(selection.dietaryTags) })) },
        })) },
      } });
    }
  }

  private async revision(tx: Prisma.TransactionClient, orderId: string, version: number,
    quote: OrderQuoteResponse, actor: StaffIdentity, reason: string | null = null): Promise<void> {
    await tx.orderRevision.create({ data: { orderId, version, snapshot: json(quote), actorId: actor.id, reason, createdAt: this.clock.now() } });
  }
}
