import { Injectable } from '@nestjs/common';
import type { CutoffProcessResult, DeliveryPurchaseSnapshot, DishPurchaseSnapshot, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { serializable } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { assertCalendarDate, calculateCutoff, deadlinePassed } from '../../domain/calendar';
import { refreshDropReadiness } from '../../domain/operations';
import type { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CutoffsService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}

  async ensureDate(tx: Prisma.TransactionClient, deliveryDate: string) {
    assertCalendarDate(deliveryDate);
    const existing = await tx.deliveryDateCutoff.findUnique({ where: { deliveryDate } });
    if (existing) return existing;
    const settings = await tx.kitchenSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new ApiError(503, 'SETTINGS_NOT_INITIALIZED', 'Run the database seed to initialize kitchen settings.');
    return tx.deliveryDateCutoff.upsert({ where: { deliveryDate }, update: {}, create: {
      deliveryDate, cutoffAt: calculateCutoff(deliveryDate, settings, settings.cutoffWorkingDays, settings.cutoffTime),
      settingsVersion: settings.version,
      policySnapshot: { timezone: 'Asia/Kolkata', workingDays: settings.workingDays, holidays: settings.holidays,
        cutoffWorkingDays: settings.cutoffWorkingDays, cutoffTime: settings.cutoffTime, settingsVersion: settings.version },
    } });
  }

  async processDate(deliveryDate: string, actor?: StaffIdentity): Promise<CutoffProcessResult> {
    assertCalendarDate(deliveryDate);
    if (actor && actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only Admin may manually process a cutoff.');
    await serializable(this.prisma, async (tx) => {
      const date = await this.ensureDate(tx, deliveryDate);
      const now = this.clock.now();
      if (!deadlinePassed(now, date.cutoffAt)) throw new ApiError(400, 'CUTOFF_NOT_PASSED', 'Manual processing requires an already-passed kitchen cutoff.');
      // A processed policy is frozen, but its orders are always scanned again.
      await tx.deliveryDateCutoff.update({ where: { deliveryDate }, data: {
        processedAt: date.processedAt ?? now, lastProcessedAt: now,
      } });
    });
    const orders = await this.prisma.order.findMany({ where: { deliveryDate }, select: { id: true }, orderBy: [{ number: 'asc' }] });
    const result: CutoffProcessResult = { deliveryDate, confirmed: 0, cancelled: 0, skipped: 0, failed: 0, failures: [] };
    for (const { id } of orders) {
      try {
        const outcome = await serializable(this.prisma, async (tx) => {
          const order = await tx.order.findUnique({ where: { id } });
          const now = this.clock.now();
          if (!order || order.deliveryDate !== deliveryDate || !['DRAFT', 'PLACED'].includes(order.status) || !deadlinePassed(now, order.cutoffAt)) return 'skipped' as const;
          if (order.status === 'PLACED') return await this.confirmPlaced(tx, id, actor, deliveryDate) ? 'confirmed' as const : 'skipped' as const;
          const changed = await tx.order.updateMany({ where: { id, deliveryDate, status: order.status, version: order.version }, data: {
            status: 'CANCELLED', version: { increment: 1 }, cancelledAt: now,
          } });
          if (!changed.count) return 'skipped' as const;
          await tx.orderEvent.create({ data: { orderId: id, actionKey: `cutoff:${deliveryDate}:cancelled`,
            type: 'CANCELLED', actorId: actor?.id ?? null, actorName: actor?.displayName ?? 'Automatic cutoff',
            reason: 'Unplaced draft cancelled at the kitchen cutoff.',
            details: { cutoffAt: order.cutoffAt.toISOString(), deliveryDate, automatic: !actor }, createdAt: now,
          } });
          return 'cancelled' as const;
        });
        result[outcome]++;
      } catch (error) {
        result.failed++;
        const response = error instanceof ApiError ? error.getResponse() as { code: string } : null;
        result.failures.push({ orderId: id, code: response?.code ?? 'CUTOFF_PROCESS_FAILED' });
      }
    }
    return result;
  }

  async scanDue(): Promise<CutoffProcessResult[]> {
    const dates = await this.prisma.deliveryDateCutoff.findMany({
      where: { cutoffAt: { lte: this.clock.now() }, orders: { some: { status: { in: ['DRAFT', 'PLACED'] } } } },
      select: { deliveryDate: true }, orderBy: [{ cutoffAt: 'asc' }, { deliveryDate: 'asc' }],
    });
    const results: CutoffProcessResult[] = [];
    for (const { deliveryDate } of dates) results.push(await this.processDate(deliveryDate));
    return results;
  }

  // Late Admin placement and every due scan use this same transactional workflow.
  async confirmPlaced(tx: Prisma.TransactionClient, orderId: string, actor?: StaffIdentity, expectedDeliveryDate?: string): Promise<boolean> {
    if (actor && actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only Admin may manually confirm a passed cutoff.');
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'PLACED' || (expectedDeliveryDate && order.deliveryDate !== expectedDeliveryDate)) return false;
    const now = this.clock.now();
    const date = await this.ensureDate(tx, order.deliveryDate);
    if (!deadlinePassed(now, order.cutoffAt) || !deadlinePassed(now, date.cutoffAt)) throw new ApiError(400, 'CUTOFF_NOT_PASSED', 'Confirmation requires an already-passed kitchen cutoff.');
    if (order.purchaseSnapshot === null || order.totalMinor === null) throw new ApiError(409, 'ORDER_PURCHASE_MISSING', 'The placed order is missing its purchase snapshot.');
    await tx.deliveryDateCutoff.update({ where: { deliveryDate: order.deliveryDate }, data: {
      processedAt: date.processedAt ?? now, lastProcessedAt: now,
    } });
    const changed = await tx.order.updateMany({ where: { id: orderId, deliveryDate: order.deliveryDate, status: 'PLACED', version: order.version }, data: {
      status: 'CONFIRMED', version: { increment: 1 }, confirmedAt: now,
    } });
    if (!changed.count) return false;
    await this.attachConfirmed(tx, orderId, actor, 'Placed order confirmed at the passed kitchen cutoff.');
    await tx.orderEvent.create({ data: {
      orderId, actionKey: `cutoff:${order.deliveryDate}:confirmed`, type: 'CONFIRMED',
      actorId: actor?.id ?? null, actorName: actor?.displayName ?? 'Automatic cutoff',
      reason: 'Placed order confirmed at the passed kitchen cutoff.',
      details: { cutoffAt: order.cutoffAt.toISOString(), deliveryDate: order.deliveryDate, automatic: !actor }, createdAt: now,
    } });
    return true;
  }

  async attachConfirmed(tx: Prisma.TransactionClient, orderId: string, actor?: StaffIdentity, reason?: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: { include: { combinations: true } } } });
    if (!order || order.status !== 'CONFIRMED') throw new ApiError(409, 'ORDER_NOT_CONFIRMED', 'Only confirmed orders create kitchen and delivery work.');
    if (!order.lines.length || order.lines.some((line) => !line.combinations.length)) throw new ApiError(409, 'ORDER_COMBINATIONS_MISSING', 'The confirmed order must have purchased combinations.');
    for (const line of order.lines) {
      const dish = line.dishSnapshot as unknown as DishPurchaseSnapshot;
      await tx.prepUnit.createMany({ data: line.combinations.map((combination) => ({
        combinationId: combination.id, stationId: dish.station?.id ?? null, stationName: dish.station?.name ?? null,
      })), skipDuplicates: true });
    }
    const delivery = order.deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
    const defaultDriver = delivery.defaultDriverId ? await tx.staffUser.findFirst({
      where: { id: delivery.defaultDriverId, active: true, role: 'DRIVER' }, select: { id: true },
    }) : null;
    const drop = await tx.deliveryDrop.upsert({
      where: { companyId_addressKey_deliveryAt: { companyId: order.companyId, addressKey: order.addressKey, deliveryAt: order.deliveryAt } },
      update: {}, create: { companyId: order.companyId, addressKey: order.addressKey, deliveryAt: order.deliveryAt,
        deliveryDate: order.deliveryDate, addressSnapshot: delivery.address as unknown as Prisma.InputJsonValue,
        driverInstructions: delivery.driverInstructions, driverId: defaultDriver?.id ?? null },
    });
    if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status) && drop.id !== order.dropId) throw new ApiError(409, 'DROP_ALREADY_DEPARTED', 'An order cannot join a departed or delivered drop.');
    if (drop.id !== order.dropId) {
      await tx.order.update({ where: { id: orderId }, data: { dropId: drop.id } });
      await this.refreshDropAfterMembershipChange(tx, drop.id, actor, reason);
    }
  }

  async moveConfirmedDelivery(tx: Prisma.TransactionClient, orderId: string, previousDropId?: string | null, actor?: StaffIdentity, reason?: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { dropId: true } });
    const oldId = previousDropId === undefined ? order?.dropId : previousDropId;
    if (oldId) {
      const old = await tx.deliveryDrop.findUnique({ where: { id: oldId } });
      if (old && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(old.status)) throw new ApiError(409, 'DROP_ALREADY_DEPARTED', 'Address or time changes after departure require a drop-wide correction.');
    }
    await this.attachConfirmed(tx, orderId, actor, reason);
    const next = await tx.order.findUnique({ where: { id: orderId }, select: { dropId: true } });
    // attachConfirmed already recomputed the new drop after joining it.
    if (oldId && next?.dropId !== oldId) await this.refreshDropAfterMembershipChange(tx, oldId, actor, reason);
  }

  async detachCancelled(tx: Prisma.TransactionClient, orderId: string, previousDropId?: string | null, actor?: StaffIdentity, reason?: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { dropId: true, status: true } });
    if (!order || !['CANCELLED', 'REJECTED'].includes(order.status)) throw new ApiError(409, 'ORDER_NOT_CANCELLED', 'Only cancelled or rejected orders can leave active fulfilment.');
    const oldId = previousDropId === undefined ? order.dropId : previousDropId;
    await tx.order.update({ where: { id: orderId }, data: { dropId: null } });
    // Keep the purchased combinations and all actual prep timestamps intact.
    if (oldId) await this.refreshDropAfterMembershipChange(tx, oldId, actor, reason);
  }

  async refreshDropAfterMembershipChange(tx: Prisma.TransactionClient, dropId: string, actor?: StaffIdentity, reason?: string): Promise<void> {
    await refreshDropReadiness(tx, dropId, this.clock.now(), true, actor, reason);
  }
}
