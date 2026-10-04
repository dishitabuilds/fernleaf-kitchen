import { Injectable } from '@nestjs/common';
import type { KitchenBoardResponse, OperationalOrderResponse, PrepUnitResponse, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../database/prisma.service';
import { assertCalendarDate, kitchenDate } from '../../domain/calendar';
import { refreshDropReadiness } from '../../domain/operations';
import type { Prisma } from '../../generated/prisma/client';
import { OperationsAction } from '../operations/operations.action';
import { ForceCompleteDto, KitchenQueryDto, OperationalActionDto } from '../operations/operations.dto';
import { operationalOrderResponse, operationalOrderSelect, prepResponse, prepSelect } from '../operations/operations.mapping';

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock, private readonly actions: OperationsAction) {}

  async board(query: KitchenQueryDto): Promise<KitchenBoardResponse> {
    const date = query.date ?? kitchenDate(this.clock.now()); assertCalendarDate(date);
    return this.prisma.$transaction(async (tx) => {
      const parent = { deliveryDate: date, status: 'CONFIRMED' as const };
      const where: Prisma.PrepUnitWhereInput = { combination: { line: { order: parent } },
        ...(query.stationId ? { stationId: query.stationId } : {}), ...(query.status ? { status: query.status } : {}) };
      const [units, total, stations, threshold] = await Promise.all([
        tx.prepUnit.findMany({ where, select: prepSelect, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
          orderBy: [{ combination: { line: { order: { plannedKitchenReadyAt: 'asc' } } } }, { id: 'asc' }] }),
        tx.prepUnit.count({ where }),
        tx.prepUnit.findMany({ where: { combination: { line: { order: parent } }, stationId: { not: null } },
          select: { stationId: true, stationName: true }, distinct: ['stationId'], orderBy: { stationName: 'asc' } }),
        this.threshold(tx),
      ]);
      return { date, items: units.map((unit) => prepResponse(unit, this.clock.now(), threshold)), total,
        page: query.page, pageSize: query.pageSize, riskThresholdMinutes: threshold,
        stations: stations.flatMap((station) => station.stationId && station.stationName ? [{ id: station.stationId, name: station.stationName }] : []) };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async readOrder(id: string): Promise<OperationalOrderResponse> {
    return this.prisma.$transaction((tx) => this.readOrderInTransaction(tx, id), { isolationLevel: 'RepeatableRead' });
  }
  start(id: string, dto: OperationalActionDto, actor: StaffIdentity): Promise<PrepUnitResponse> {
    return this.unitAction(id, dto, actor, false);
  }
  complete(id: string, dto: OperationalActionDto, actor: StaffIdentity): Promise<PrepUnitResponse> {
    return this.unitAction(id, dto, actor, true);
  }
  forceComplete(id: string, dto: ForceCompleteDto, actor: StaffIdentity): Promise<OperationalOrderResponse> {
    if (actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only Admin may force completion.');
    if (!dto.reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'Enter the reason for force completion.');
    return this.actions.run(actor, dto.actionId, { operation: 'FORCE_COMPLETE', id, body: dto }, async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, select: { status: true, version: true } });
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'This order does not exist.');
      this.version(order.version, dto.version);
      if (order.status !== 'CONFIRMED') throw new ApiError(409, 'ORDER_NOT_CONFIRMED', 'Only active confirmed orders may be force completed.');
      const units = await tx.prepUnit.findMany({ where: { combination: { line: { orderId: id } } }, orderBy: { id: 'asc' } });
      if (!units.length) throw new ApiError(409, 'PREP_UNITS_MISSING', 'This order has no preparation units.');
      const now = this.clock.now();
      const unfinished = units.filter((unit) => unit.status !== 'DONE');
      for (const unit of unfinished) {
        await tx.prepUnit.update({ where: { id: unit.id }, data: { status: 'DONE', startedAt: unit.startedAt ?? now, doneAt: now, version: { increment: 1 } } });
        await this.unitEvents(tx, unit, id, actor, true, now);
      }
      if (unfinished.length) {
        await this.refreshOrder(tx, id, actor);
        await tx.orderEvent.create({ data: { orderId: id, actionKey: `force:${actor.id}:${dto.actionId}`, type: 'KITCHEN_FORCE_COMPLETED',
          actorId: actor.id, actorName: actor.displayName, reason: dto.reason, details: { unitIds: unfinished.map((unit) => unit.id) }, createdAt: now } });
      }
      return this.readOrderInTransaction(tx, id);
    });
  }

  private unitAction(id: string, dto: OperationalActionDto, actor: StaffIdentity, complete: boolean): Promise<PrepUnitResponse> {
    if (!['ADMIN', 'KITCHEN'].includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Only Kitchen or Admin may change preparation.');
    return this.actions.run(actor, dto.actionId, { operation: complete ? 'PREP_COMPLETE' : 'PREP_START', id, body: dto }, async (tx) => {
      const unit = await tx.prepUnit.findUnique({ where: { id }, select: prepSelect });
      if (!unit) throw new ApiError(404, 'PREP_UNIT_NOT_FOUND', 'This preparation unit does not exist.');
      const order = unit.combination.line.order;
      if (order.status !== 'CONFIRMED') throw new ApiError(409, 'ORDER_NOT_CONFIRMED', 'Only active confirmed orders may be worked.');
      this.version(unit.version, dto.version);
      if (!complete && unit.status === 'DONE') throw new ApiError(409, 'PREP_ALREADY_DONE', 'This preparation unit is already done.');
      if ((complete && unit.status !== 'DONE') || (!complete && unit.status === 'PENDING')) {
        const now = this.clock.now();
        const updated = await tx.prepUnit.updateMany({ where: { id, version: dto.version, status: unit.status }, data: {
          status: complete ? 'DONE' : 'STARTED', startedAt: unit.startedAt ?? now, ...(complete ? { doneAt: now } : {}), version: { increment: 1 },
        } });
        if (!updated.count) throw new ApiError(409, 'STALE_VERSION', 'This preparation unit changed. Refresh the board.');
        await this.unitEvents(tx, unit, order.id, actor, complete, now);
        await this.refreshOrder(tx, order.id, actor);
      }
      const result = await tx.prepUnit.findUniqueOrThrow({ where: { id }, select: prepSelect });
      return prepResponse(result, this.clock.now(), await this.threshold(tx));
    });
  }
  private async unitEvents(tx: Prisma.TransactionClient, unit: { id: string; startedAt: Date | null }, orderId: string, actor: StaffIdentity, complete: boolean, now: Date) {
    if (!unit.startedAt) await tx.orderEvent.create({ data: { orderId, actionKey: `prep:${unit.id}:started`, type: 'PREP_STARTED',
      actorId: actor.id, actorName: actor.displayName, details: { prepUnitId: unit.id }, createdAt: now } });
    if (complete) await tx.orderEvent.create({ data: { orderId, actionKey: `prep:${unit.id}:done`, type: 'PREP_COMPLETED',
      actorId: actor.id, actorName: actor.displayName, details: { prepUnitId: unit.id }, createdAt: now } });
  }
  private async refreshOrder(tx: Prisma.TransactionClient, id: string, actor: StaffIdentity) {
    const order = await tx.order.findUniqueOrThrow({ where: { id }, select: { dropId: true, version: true, kitchenReadyAt: true } });
    const units = await tx.prepUnit.findMany({ where: { combination: { line: { orderId: id } } }, select: { status: true, startedAt: true, doneAt: true } });
    const starts = units.flatMap((unit) => unit.startedAt ? [unit.startedAt.getTime()] : []);
    const ready = units.length > 0 && units.every((unit) => unit.status === 'DONE' && unit.doneAt !== null);
    const readyAt = ready ? new Date(Math.max(...units.map((unit) => unit.doneAt!.getTime()))) : null;
    const updated = await tx.order.updateMany({ where: { id, status: 'CONFIRMED', version: order.version }, data: {
      kitchenStartedAt: starts.length ? new Date(Math.min(...starts)) : null,
      kitchenReadyAt: readyAt, version: { increment: 1 },
    } });
    if (!updated.count) throw new ApiError(409, 'STALE_VERSION', 'The order changed while preparation was updated. Refresh the board.');
    if (readyAt && !order.kitchenReadyAt) await tx.orderEvent.create({ data: { orderId: id, actionKey: 'kitchen:ready', type: 'KITCHEN_READY',
      actorId: actor.id, actorName: actor.displayName, details: { kitchenReadyAt: readyAt.toISOString() }, createdAt: this.clock.now() } });
    if (order.dropId) await refreshDropReadiness(tx, order.dropId, this.clock.now(), false, actor);
  }
  private async readOrderInTransaction(tx: Prisma.TransactionClient, id: string): Promise<OperationalOrderResponse> {
    const order = await tx.order.findFirst({ where: { id, status: { in: ['CONFIRMED', 'DELIVERED'] } }, select: operationalOrderSelect });
    if (!order) throw new ApiError(404, 'OPERATIONAL_ORDER_NOT_FOUND', 'This order is not available for preparation.');
    return operationalOrderResponse(order, this.clock.now(), await this.threshold(tx));
  }
  private async threshold(tx: Prisma.TransactionClient): Promise<number> {
    const settings = await tx.kitchenSettings.findUnique({ where: { id: 1 }, select: { riskThresholdMinutes: true } });
    if (!settings) throw new ApiError(503, 'SETTINGS_NOT_INITIALIZED', 'Initialize kitchen settings before operating.');
    return settings.riskThresholdMinutes;
  }
  private version(current: number, given: number) {
    if (current !== given) throw new ApiError(409, 'STALE_VERSION', 'This record changed. Refresh before trying again.');
  }
}
