import { Injectable } from '@nestjs/common';
import type {
  AdminDashboardResponse, KitchenDashboardResponse, DispatchDashboardResponse,
  DriverDashboardResponse, DashboardResponse, StaffIdentity,
} from '@fernleaf/contracts';
import { PrismaService } from '../../database/prisma.service';
import { Clock } from '../../common/clock';
import { assertCalendarDate, kitchenDate } from '../../domain/calendar';
import type { DashboardQueryDto } from './dashboard.dto';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}

  async read(actor: StaffIdentity, query: DashboardQueryDto): Promise<DashboardResponse> {
    if (query.date) assertCalendarDate(query.date);
    return this.prisma.$transaction(async (tx): Promise<DashboardResponse> => {
      switch (actor.role) {
        case 'ADMIN': return { role: 'ADMIN', data: await this.admin(query, tx) };
        case 'KITCHEN': return { role: 'KITCHEN', data: await this.kitchen(query, tx) };
        case 'DISPATCH': return { role: 'DISPATCH', data: await this.dispatch(query, tx) };
        case 'DRIVER': return { role: 'DRIVER', data: await this.driver(actor, tx) };
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  // ── ADMIN DASHBOARD ──────────────────────────────────────────────
  // Today's committed orders: Confirmed + Delivered for selected delivery date.
  // Meals: sum of line quantities for those orders.
  // Draft/Placed counts shown separately (not committed).
  // Uninvoiced value: all dates, Confirmed/Delivered with no invoiceId.
  // Outstanding balance: sum(invoice.totalMinor - credits - paidAmountMinor).
  private async admin(query: DashboardQueryDto, tx: Prisma.TransactionClient): Promise<AdminDashboardResponse> {
    const date = query.date ?? kitchenDate(this.clock.now());

    // Today's committed orders (Confirmed/Delivered)
    const committedOrders = await tx.order.findMany({
      where: { deliveryDate: date, status: { in: ['CONFIRMED', 'DELIVERED'] } },
      select: { lines: { select: { quantity: true } } },
    });
    const todayOrders = committedOrders.length;
    const todayMeals = committedOrders.reduce((s, o) => s + o.lines.reduce((ls, l) => ls + l.quantity, 0), 0);

    // Draft and Placed counts for today
    const [draftCount, placedCount] = await Promise.all([
      tx.order.count({ where: { deliveryDate: date, status: 'DRAFT' } }),
      tx.order.count({ where: { deliveryDate: date, status: 'PLACED' } }),
    ]);

    // Uninvoiced value: all dates, Confirmed/Delivered, no invoice
    const uninvoicedAgg = await tx.order.aggregate({
      where: { invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] }, totalMinor: { not: null } },
      _sum: { totalMinor: true },
    });
    const uninvoicedTotalMinor = uninvoicedAgg._sum.totalMinor ?? 0;

    // Outstanding balance: all invoices, sum(gross - credits - paid)
    const invoices = await tx.invoice.findMany({
      select: { totalMinor: true, paidAmountMinor: true, credits: { select: { amountMinor: true } } },
    });
    let outstandingBalanceMinor = 0;
    let companyCreditMinor = 0;
    for (const inv of invoices) {
      const creditTotal = inv.credits.reduce((s, c) => s + c.amountMinor, 0);
      const net = inv.totalMinor - creditTotal - inv.paidAmountMinor;
      if (net > 0) outstandingBalanceMinor += net;
      else if (net < 0) companyCreditMinor += Math.abs(net);
    }

    return { todayOrders, todayMeals, draftCount, placedCount, uninvoicedTotalMinor, outstandingBalanceMinor, companyCreditMinor };
  }

  // ── KITCHEN DASHBOARD ────────────────────────────────────────────
  // Units remaining by station: active Confirmed orders' prep units not Done.
  // Late/at-risk: unfinished units past/within riskThresholdMinutes of planned kitchen ready.
  private async kitchen(query: DashboardQueryDto, tx: Prisma.TransactionClient): Promise<KitchenDashboardResponse> {
    const date = query.date ?? kitchenDate(this.clock.now());
    const now = this.clock.now();

    const settings = await tx.kitchenSettings.findUniqueOrThrow({ where: { id: 1 } });
    const riskMs = settings.riskThresholdMinutes * 60_000;

    // Get all prep units for confirmed orders on this date
    const units = await tx.prepUnit.findMany({
      where: {
        combination: { line: { order: { deliveryDate: date, status: 'CONFIRMED' } } },
      },
      select: {
        id: true, status: true, stationId: true, stationName: true,
        combination: { select: { line: { select: { order: { select: { plannedKitchenReadyAt: true } } } } } },
      },
    });

    // Group by station
    const stationMap = new Map<string, { stationName: string; remaining: number; total: number }>();
    let lateCount = 0;
    let atRiskCount = 0;
    let missingPlanCount = 0;

    for (const unit of units) {
      const key = unit.stationId ?? '__none__';
      const name = unit.stationName ?? 'Unassigned';
      if (!stationMap.has(key)) stationMap.set(key, { stationName: name, remaining: 0, total: 0 });
      const station = stationMap.get(key)!;
      station.total++;
      if (unit.status !== 'DONE') {
        station.remaining++;
        const planned = unit.combination.line.order.plannedKitchenReadyAt;
        if (!planned) { missingPlanCount++; }
        else {
          const diff = planned.getTime() - now.getTime();
          if (diff < 0) lateCount++;
          else if (diff <= riskMs) atRiskCount++;
        }
      }
    }

    return {
      unitsByStation: Array.from(stationMap.entries()).map(([stationId, s]) => ({
        stationId: stationId === '__none__' ? null : stationId,
        stationName: s.stationName, remaining: s.remaining, total: s.total,
      })),
      lateCount, atRiskCount, missingPlanCount,
    };
  }

  // ── DISPATCH DASHBOARD ───────────────────────────────────────────
  // Drop counts by status for the selected delivery date.
  private async dispatch(query: DashboardQueryDto, tx: Prisma.TransactionClient): Promise<DispatchDashboardResponse> {
    const date = query.date ?? kitchenDate(this.clock.now());

    const drops = await tx.deliveryDrop.findMany({
      where: { deliveryDate: date },
      select: { status: true, driverId: true, orders: { where: { status: { in: ['CONFIRMED', 'DELIVERED'] } }, select: { id: true } } },
    });

    let waiting = 0, ready = 0, unassigned = 0, travelling = 0, delivered = 0;
    for (const drop of drops) {
      if (drop.orders.length === 0) continue; // Skip empty drops
      switch (drop.status) {
        case 'AWAITING_KITCHEN': waiting++; if (!drop.driverId) unassigned++; break;
        case 'KITCHEN_READY': ready++; if (!drop.driverId) unassigned++; break;
        case 'DISPATCH_READY': ready++; if (!drop.driverId) unassigned++; break;
        case 'OUT_FOR_DELIVERY': travelling++; break;
        case 'DELIVERED': delivered++; break;
      }
    }

    return { waiting, ready, unassigned, travelling, delivered };
  }

  // ── DRIVER DASHBOARD ─────────────────────────────────────────────
  // Own assigned drops for kitchen's current date, ordered by deliveryAt.
  // Completed/on-time ratio among delivered drops with valid target.
  private async driver(actor: StaffIdentity, tx: Prisma.TransactionClient): Promise<DriverDashboardResponse> {
    const date = kitchenDate(this.clock.now());

    const drops = await tx.deliveryDrop.findMany({
      where: { driverId: actor.id, deliveryDate: date, orders: { some: { status: { in: ['CONFIRMED', 'DELIVERED'] } } } },
      select: {
        id: true, status: true, deliveredAt: true, targetAtDeparture: true,
        deliveryAt: true, company: { select: { name: true } },
        addressSnapshot: true,
      },
      orderBy: [{ deliveryAt: 'asc' }, { id: 'asc' }],
    });

    const totalDrops = drops.length;
    const completedDrops = drops.filter((d) => d.status === 'DELIVERED').length;
    const deliveredWithTarget = drops.filter((d) => d.status === 'DELIVERED' && d.deliveredAt !== null && d.targetAtDeparture !== null);
    const onTimeCount = deliveredWithTarget.filter((d) => d.deliveredAt!.getTime() <= d.targetAtDeparture!.getTime()).length;

    // Next drop: first non-delivered drop
    const nextDropRecord = drops.find((d) => d.status !== 'DELIVERED');
    const nextDrop = nextDropRecord ? {
      id: nextDropRecord.id,
      companyName: nextDropRecord.company.name,
      deliveryAt: nextDropRecord.deliveryAt.toISOString(),
      address: formatAddress(nextDropRecord.addressSnapshot),
    } : null;

    return { totalDrops, completedDrops, onTimeCount, timedCompletedDrops: deliveredWithTarget.length, missingTimingCount: completedDrops - deliveredWithTarget.length, nextDrop };
  }
}

function formatAddress(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const s = snapshot as Record<string, unknown>;
  return [s.line1, s.city].filter(Boolean).join(', ');
}
