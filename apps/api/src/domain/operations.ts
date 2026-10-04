import type { StaffIdentity, TimingRisk } from '@fernleaf/contracts';
import { ApiError } from '../common/api-error';
import type { Prisma } from '../generated/prisma/client';

export function timingRisk(now: Date, planned: Date | null, complete: boolean, thresholdMinutes: number): TimingRisk {
  if (complete) return 'COMPLETE';
  if (!planned || !Number.isFinite(planned.getTime())) return 'MISSING_PLAN';
  const remaining = planned.getTime() - now.getTime();
  if (remaining < 0) return 'LATE';
  return remaining <= thresholdMinutes * 60_000 ? 'AT_RISK' : 'ON_TRACK';
}

// Called inside the same serializable transaction as prep or membership edits.
// Status is the current gate; actual timestamps and immutable events preserve
// history even when new membership invalidates a previous dispatch check.
export async function refreshDropReadiness(tx: Prisma.TransactionClient, dropId: string, now: Date,
  invalidateDispatch = false, actor?: StaffIdentity, reason?: string): Promise<void> {
  const drop = await tx.deliveryDrop.findUnique({ where: { id: dropId } });
  if (!drop) return;
  const members = await tx.order.findMany({ where: { dropId, status: { in: ['CONFIRMED', 'DELIVERED'] } }, select: { id: true, kitchenReadyAt: true }, orderBy: { number: 'asc' } });
  const ready = members.length > 0 && members.every((order) => order.kitchenReadyAt !== null);
  const travelling = ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status);
  const status = travelling ? drop.status : ready ? (!invalidateDispatch && drop.status === 'DISPATCH_READY' ? 'DISPATCH_READY' : 'KITCHEN_READY') : 'AWAITING_KITCHEN';
  const latest = ready && !travelling ? new Date(Math.max(...members.map((order) => order.kitchenReadyAt!.getTime()))) : null;
  if (!invalidateDispatch && drop.status === status && (!latest || latest.getTime() === drop.kitchenReadyAt?.getTime())) return;
  const changed = await tx.deliveryDrop.updateMany({ where: { id: dropId, version: drop.version, status: drop.status }, data: {
    status, ...(latest ? { kitchenReadyAt: latest } : {}), version: { increment: 1 },
  } });
  if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'Drop membership or readiness changed. Refresh before trying again.');
  const before = { status: drop.status, kitchenReadyAt: drop.kitchenReadyAt?.toISOString() ?? null, dispatchReadyAt: drop.dispatchReadyAt?.toISOString() ?? null };
  const after = { status, kitchenReadyAt: (latest ?? drop.kitchenReadyAt)?.toISOString() ?? null, dispatchReadyAt: before.dispatchReadyAt };
  const type = drop.status === 'DISPATCH_READY' && status !== 'DISPATCH_READY' ? 'DISPATCH_INVALIDATED'
    : drop.status === 'AWAITING_KITCHEN' && status === 'KITCHEN_READY' ? 'KITCHEN_READY'
      : invalidateDispatch ? 'DROP_MEMBERSHIP_CHANGED' : 'KITCHEN_READY_CHANGED';
  await tx.dropEvent.create({ data: { dropId, actionKey: `readiness:${drop.version + 1}`, type,
    actorId: actor?.id ?? null, actorName: actor?.displayName ?? 'Fulfilment update',
    reason: reason ?? (invalidateDispatch ? 'Order membership or delivery requirements changed.' : null),
    details: { before, after, activeOrderCount: members.length, activeOrderIds: members.map((order) => order.id) }, createdAt: now } });
}
