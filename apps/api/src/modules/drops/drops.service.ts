import { Injectable } from '@nestjs/common';
import type { CompanyPurchaseSnapshot, DeliveryDropPage, DeliveryDropResponse, DeliveryPurchaseSnapshot, DriverChoice, OrderInput, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../database/prisma.service';
import { parseDeliveryPhoto } from '../../domain/photo';
import { assertCalendarDate, assertLocalTime, isDeliveryDateAllowed, kitchenDate } from '../../domain/calendar';
import type { Prisma } from '../../generated/prisma/client';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { addressKey, json } from '../orders/order.mapping';
import { OperationsAction } from '../operations/operations.action';
import { AssignDriverDto, CorrectDropDto, DeliverDropDto, DriverQueryDto, DropQueryDto, OperationalActionDto } from '../operations/operations.dto';
import { dropResponse, dropSelect, type DropRecord } from '../operations/operations.mapping';

@Injectable()
export class DropsService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock, private readonly actions: OperationsAction,
    private readonly cutoffs: CutoffsService) {}

  async list(query: DropQueryDto): Promise<DeliveryDropPage> {
    const date = query.date ?? kitchenDate(this.clock.now()); assertCalendarDate(date);
    return this.page(query, date);
  }
  async driverToday(query: DriverQueryDto, actor: StaffIdentity): Promise<DeliveryDropPage> {
    return this.page(query, kitchenDate(this.clock.now()), actor.id);
  }
  async read(id: string, driver?: StaffIdentity): Promise<DeliveryDropResponse> {
    return this.prisma.$transaction((tx) => this.readInTransaction(tx, id, driver), { isolationLevel: 'RepeatableRead' });
  }
  async drivers(): Promise<DriverChoice[]> {
    return this.prisma.staffUser.findMany({ where: { role: 'DRIVER', active: true }, select: { id: true, displayName: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }] });
  }
  assign(id: string, dto: AssignDriverDto, actor: StaffIdentity): Promise<DeliveryDropResponse> {
    this.dispatchActor(actor);
    return this.actions.run(actor, dto.actionId, { operation: 'DROP_ASSIGN', id, body: dto }, async (tx) => {
      const drop = await this.record(tx, id); this.version(drop.version, dto.version);
      if (drop.status === 'DELIVERED') throw new ApiError(409, 'DROP_ALREADY_DELIVERED', 'Delivered drops retain their recorded Driver.');
      const travelling = drop.status === 'OUT_FOR_DELIVERY';
      if (travelling && actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only Admin may reassign a travelling drop with a reason.');
      if (travelling && (typeof dto.reason !== 'string' || !dto.reason.trim())) throw new ApiError(400, 'REASON_REQUIRED', 'Enter the reason for changing a travelling drop\'s Driver.');
      if (!drop.orders.length) throw new ApiError(409, 'DROP_EMPTY', 'An empty drop cannot receive a driver assignment.');
      const driver = await tx.staffUser.findFirst({ where: { id: dto.driverId, active: true, role: 'DRIVER' }, select: { id: true, displayName: true } });
      if (!driver) {
        throw new ApiError(400, 'DRIVER_INVALID', 'Choose an active Driver account.');
      }
      if (drop.driver?.id !== dto.driverId) {
        await this.change(tx, drop, { driverId: dto.driverId });
        await this.events(tx, drop, actor, dto.actionId, travelling ? 'DRIVER_REASSIGNED' : 'DRIVER_ASSIGNED', dto.reason ?? null,
          { beforeDriverId: drop.driver?.id ?? null, beforeDriverName: drop.driver?.displayName ?? null,
            driverId: driver.id, driverName: driver.displayName, travelling, affectedOrderIds: drop.orders.map((order) => order.id) });
      }
      return this.readInTransaction(tx, id);
    });
  }
  dispatchReady(id: string, dto: OperationalActionDto, actor: StaffIdentity): Promise<DeliveryDropResponse> {
    this.dispatchActor(actor);
    return this.actions.run(actor, dto.actionId, { operation: 'DISPATCH_READY', id, body: dto }, async (tx) => {
      const drop = await this.record(tx, id); this.version(drop.version, dto.version); this.beforeDeparture(drop); this.ready(drop);
      if (!['KITCHEN_READY', 'DISPATCH_READY'].includes(drop.status)) throw new ApiError(409, 'KITCHEN_NOT_READY', 'The drop must be kitchen ready before dispatch preparation.');
      if (drop.status !== 'DISPATCH_READY') {
        const now = this.clock.now();
        await this.change(tx, drop, { status: 'DISPATCH_READY', dispatchReadyAt: now });
        await this.events(tx, drop, actor, dto.actionId, 'DISPATCH_READY', null, { dispatchReadyAt: now.toISOString() });
      }
      return this.readInTransaction(tx, id);
    });
  }
  depart(id: string, dto: OperationalActionDto, actor: StaffIdentity): Promise<DeliveryDropResponse> {
    this.dispatchActor(actor);
    return this.actions.run(actor, dto.actionId, { operation: 'DROP_DEPART', id, body: dto }, async (tx) => {
      const drop = await this.record(tx, id); this.version(drop.version, dto.version); this.ready(drop);
      if (drop.status !== 'DISPATCH_READY') throw new ApiError(409, 'DISPATCH_NOT_READY', 'Mark the drop dispatch ready before departure.');
      if (!drop.driver || !await tx.staffUser.findFirst({ where: { id: drop.driver.id, active: true, role: 'DRIVER' }, select: { id: true } })) {
        throw new ApiError(409, 'DRIVER_REQUIRED', 'Assign an active Driver before departure.');
      }
      const now = this.clock.now();
      await this.change(tx, drop, { status: 'OUT_FOR_DELIVERY', departedAt: now, targetAtDeparture: drop.deliveryAt });
      await this.events(tx, drop, actor, dto.actionId, 'DROP_DEPARTED', null,
        { departedAt: now.toISOString(), targetAtDeparture: drop.deliveryAt.toISOString(), driverId: drop.driver.id });
      return this.readInTransaction(tx, id);
    });
  }
  deliver(id: string, dto: DeliverDropDto, actor: StaffIdentity, own = false): Promise<DeliveryDropResponse> {
    if (own ? actor.role !== 'DRIVER' : actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'This account cannot mark this drop delivered.');
    const photo = dto.photoDataUrl ? parseDeliveryPhoto(dto.photoDataUrl) : null;
    const scope = own ? async (tx: Prisma.TransactionClient) => { await this.record(tx, id, actor); } : undefined;
    return this.actions.run(actor, dto.actionId, { operation: 'DROP_DELIVER', id, body: dto }, async (tx) => {
      const drop = await this.record(tx, id, own ? actor : undefined); this.version(drop.version, dto.version);
      if (drop.status !== 'OUT_FOR_DELIVERY' || !drop.departedAt || !drop.targetAtDeparture) throw new ApiError(409, 'DROP_NOT_OUT_FOR_DELIVERY', 'Only a departed drop can be delivered.');
      if (!drop.orders.length || drop.orders.some((order) => order.status !== 'CONFIRMED')) throw new ApiError(409, 'DROP_EMPTY', 'This drop has no eligible active orders to deliver.');
      const now = this.clock.now(), onTime = now.getTime() <= drop.targetAtDeparture.getTime();
      await this.change(tx, drop, { status: 'DELIVERED', deliveredAt: now, onTime, note: dto.note ?? null,
        photo: photo ? new Uint8Array(photo.bytes) : null, photoMimeType: photo?.mimeType ?? null });
      for (const order of drop.orders) {
        const changed = await tx.order.updateMany({ where: { id: order.id, dropId: id, status: 'CONFIRMED', version: order.version },
          data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } } });
        if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'A drop member changed. Refresh before delivering.');
      }
      await this.events(tx, drop, actor, dto.actionId, 'DELIVERED', null,
        { deliveredAt: now.toISOString(), targetAtDeparture: drop.targetAtDeparture.toISOString(), onTime, note: dto.note ?? null, hasPhoto: photo !== null, photoBytes: photo?.bytes.length ?? 0 });
      return this.readInTransaction(tx, id, own ? actor : undefined);
    }, scope);
  }
  /** Photo bytes for a delivered drop; driver reads are limited to their own drops for today. */
  async photo(id: string, driver?: StaffIdentity): Promise<{ bytes: Buffer; mimeType: string }> {
    await this.record(this.prisma, id, driver);
    const row = await this.prisma.deliveryDrop.findUnique({ where: { id }, select: { photo: true, photoMimeType: true } });
    if (!row?.photo || !row.photoMimeType) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'No delivery photo was recorded for this drop.');
    return { bytes: Buffer.from(row.photo), mimeType: row.photoMimeType };
  }
  correct(id: string, dto: CorrectDropDto, actor: StaffIdentity): Promise<DeliveryDropResponse> {
    if (actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only Admin may correct a travelling drop.');
    if (!dto.reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'Enter the correction reason.');
    if (!dto.address && !dto.deliveryDate && !dto.deliveryTime) throw new ApiError(400, 'CORRECTION_EMPTY', 'Enter an address or delivery date/time correction.');
    return this.actions.run(actor, dto.actionId, { operation: 'DROP_CORRECT', id, body: dto }, async (tx) => {
      const drop = await this.record(tx, id); this.version(drop.version, dto.version);
      if (!['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status)) throw new ApiError(409, 'DROP_NOT_DEPARTED', 'Before departure, change the individual order delivery details.');
      if (!drop.orders.length) throw new ApiError(409, 'DROP_EMPTY', 'An empty drop cannot receive a delivery correction.');
      const company = await tx.company.findUniqueOrThrow({ where: { id: drop.companyId } });
      const date = dto.deliveryDate ?? drop.deliveryDate; assertCalendarDate(date);
      if (date !== drop.deliveryDate && !isDeliveryDateAllowed(date, company)) throw new ApiError(400, 'COMPANY_DATE_CLOSED', 'The purchased company does not accept delivery on this date.');
      const first = drop.orders[0].deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
      const time = dto.deliveryTime ?? first.deliveryTime; assertLocalTime(time);
      const address = dto.address ? { ...dto.address, id: null, line2: dto.address.line2 ?? null } : first.address;
      const deliveryAt = new Date(`${date}T${time}:00+05:30`);
      const key = addressKey({ ...first, address });
      const collision = await tx.deliveryDrop.findFirst({ where: { companyId: drop.companyId, addressKey: key, deliveryAt, id: { not: id } }, select: { id: true } });
      if (collision) throw new ApiError(409, 'DROP_CORRECTION_CONFLICT', 'This correction matches another drop. Departed drops cannot be silently merged.', undefined, { dropId: collision.id });
      const cutoff = await this.cutoffs.ensureDate(tx, date);
      const members = await tx.order.findMany({ where: { dropId: id, status: { in: ['CONFIRMED', 'DELIVERED'] } },
        select: { id: true, version: true, status: true, companySnapshot: true, input: true, deliverySnapshot: true } });
      for (const order of members) {
        const before = order.deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
        const captured = order.companySnapshot as unknown as CompanyPurchaseSnapshot;
        const dispatch = new Date(deliveryAt.getTime() - captured.deliveryMinutes * 60_000), kitchen = new Date(dispatch.getTime() - 30 * 60_000);
        const after: DeliveryPurchaseSnapshot = { ...before, address, deliveryDate: date, deliveryTime: time, deliveryAt: deliveryAt.toISOString(),
          plannedDispatchReadyAt: dispatch.toISOString(), plannedKitchenReadyAt: kitchen.toISOString() };
        const original = order.input as unknown as OrderInput;
        const { addressId: _addressId, customAddress: _custom, ...rest } = original; void _addressId; void _custom;
        const { id: _referenceId, ...customAddress } = address; void _referenceId;
        await tx.order.update({ where: { id: order.id }, data: { deliveryDate: date, deliveryAt, addressKey: key, cutoffAt: cutoff.cutoffAt,
          deliverySnapshot: json(after), plannedDispatchReadyAt: dispatch, plannedKitchenReadyAt: kitchen,
          input: json({ ...rest, deliveryDate: date, deliveryTime: time, ...(address.id ? { addressId: address.id } : { customAddress }) }), version: { increment: 1 } } });
      }
      await this.change(tx, drop, { deliveryDate: date, deliveryAt, addressKey: key, addressSnapshot: json(address) });
      await this.events(tx, drop, actor, dto.actionId, 'DROP_CORRECTED', dto.reason,
        { affectedOrderIds: members.map((order) => order.id), before: { address: drop.addressSnapshot, deliveryAt: drop.deliveryAt.toISOString(), deliveryDate: drop.deliveryDate },
          after: { address, deliveryAt: deliveryAt.toISOString(), deliveryDate: date }, targetAtDeparture: drop.targetAtDeparture?.toISOString() ?? null });
      return this.readInTransaction(tx, id);
    });
  }

  private async page(query: DropQueryDto | DriverQueryDto, date: string, driverId?: string): Promise<DeliveryDropPage> {
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.DeliveryDropWhereInput = { deliveryDate: date, ...(driverId ? { driverId } : {}), ...(query.status ? { status: query.status } : {}),
        // Cancelled-only drops remain historical records, not actionable work.
        orders: { some: { status: { in: ['CONFIRMED', 'DELIVERED'] } } } };
      const [drops, total, threshold] = await Promise.all([
        tx.deliveryDrop.findMany({ where, select: dropSelect, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ deliveryAt: 'asc' }, { id: 'asc' }] }),
        tx.deliveryDrop.count({ where }), this.threshold(tx),
      ]);
      return { date, items: drops.map((drop) => dropResponse(drop, this.clock.now(), threshold)), total,
        page: query.page, pageSize: query.pageSize, riskThresholdMinutes: threshold };
    }, { isolationLevel: 'RepeatableRead' });
  }
  private async readInTransaction(tx: Prisma.TransactionClient, id: string, driver?: StaffIdentity) {
    return dropResponse(await this.record(tx, id, driver), this.clock.now(), await this.threshold(tx));
  }
  private async record(tx: Prisma.TransactionClient | PrismaService, id: string, driver?: StaffIdentity): Promise<DropRecord> {
    const record = await tx.deliveryDrop.findFirst({ where: { id, ...(driver ? { driverId: driver.id, deliveryDate: kitchenDate(this.clock.now()),
      orders: { some: { status: { in: ['CONFIRMED', 'DELIVERED'] } } } } : {}) }, select: dropSelect });
    if (!record) throw new ApiError(404, 'DROP_NOT_FOUND', 'This drop is not available to your account.');
    return record;
  }
  private async change(tx: Prisma.TransactionClient, drop: DropRecord, data: Prisma.DeliveryDropUncheckedUpdateManyInput) {
    const changed = await tx.deliveryDrop.updateMany({ where: { id: drop.id, version: drop.version, status: drop.status }, data: { ...data, version: { increment: 1 } } });
    if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'This drop changed. Refresh before trying again.');
  }
  private async events(tx: Prisma.TransactionClient, drop: DropRecord, actor: StaffIdentity, actionId: string, type: string, reason: string | null, details: Record<string, unknown>) {
    const data = { actionKey: `drop:${actor.id}:${actionId}`, type, actorId: actor.id, actorName: actor.displayName, reason, details: json(details), createdAt: this.clock.now() };
    await tx.dropEvent.create({ data: { ...data, dropId: drop.id } });
    for (const order of drop.orders) await tx.orderEvent.create({ data: { ...data, orderId: order.id } });
  }
  private ready(drop: DropRecord) {
    if (!drop.orders.length || drop.orders.some((order) => order.status !== 'CONFIRMED' || !order.kitchenReadyAt ||
      !order.lines.length || order.lines.some((line) => !line.combinations.length || line.combinations.some((combination) => combination.prepUnit?.status !== 'DONE')))) {
      throw new ApiError(409, 'KITCHEN_NOT_READY', 'Every active member order and preparation unit must be kitchen ready.');
    }
  }
  private beforeDeparture(drop: DropRecord) {
    if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status)) throw new ApiError(409, 'DROP_ALREADY_DEPARTED', 'This action is available only before departure.');
  }
  private dispatchActor(actor: StaffIdentity) {
    if (!['ADMIN', 'DISPATCH'].includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Only Dispatch or Admin may manage dispatch.');
  }
  private version(current: number, given: number) {
    if (current !== given) throw new ApiError(409, 'STALE_VERSION', 'This drop changed. Refresh before trying again.');
  }
  private async threshold(tx: Prisma.TransactionClient): Promise<number> {
    const settings = await tx.kitchenSettings.findUnique({ where: { id: 1 }, select: { riskThresholdMinutes: true } });
    if (!settings) throw new ApiError(503, 'SETTINGS_NOT_INITIALIZED', 'Initialize kitchen settings before operating.');
    return settings.riskThresholdMinutes;
  }
}
