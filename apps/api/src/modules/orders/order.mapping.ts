import { createHash } from 'node:crypto';
import type { DeliveryPurchaseSnapshot, OrderDetail, OrderInput, OrderQuoteResponse, OrderSummary } from '@fernleaf/contracts';
import type { Order, Prisma } from '../../generated/prisma/client';

export const orderInclude = {
  lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  events: { orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }] },
  revisions: { orderBy: [{ version: 'asc' }] },
} satisfies Prisma.OrderInclude;
type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

// Sort object keys before hashing. JSON object-property order is not a business rule.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function fingerprint(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
export function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export function addressKey(delivery: DeliveryPurchaseSnapshot): string {
  const { address } = delivery;
  // Labels and reference IDs identify a saved record, not the actual destination.
  const normalize = (value: string | null) => (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return fingerprint([address.line1, address.line2, address.city, address.region, address.postalCode, address.country].map(normalize));
}
export function summary(record: Order & { lines: { quantity: number }[] }): OrderSummary {
  return {
    id: record.id, number: record.number, status: record.status, version: record.version,
    employeeId: record.employeeId, companyId: record.companyId, employeeName: record.employeeName, companyName: record.companyName,
    deliveryDate: record.deliveryDate, deliveryAt: record.deliveryAt.toISOString(), cutoffAt: record.cutoffAt.toISOString(),
    totalMinor: record.totalMinor, quantity: record.lines.reduce((total, line) => total + line.quantity, 0), invoiced: false,
    createdAt: record.createdAt.toISOString(), placedAt: record.placedAt?.toISOString() ?? null,
    confirmedAt: record.confirmedAt?.toISOString() ?? null, cancelledAt: record.cancelledAt?.toISOString() ?? null,
    rejectedAt: record.rejectedAt?.toISOString() ?? null,
  };
}
export function detail(record: OrderRecord, prepUnitCount: number): OrderDetail {
  return {
    ...summary(record), input: record.input as unknown as OrderInput,
    employee: record.employeeSnapshot as unknown as OrderDetail['employee'],
    company: record.companySnapshot as unknown as OrderDetail['company'],
    delivery: record.deliverySnapshot as unknown as DeliveryPurchaseSnapshot,
    purchase: record.purchaseSnapshot as unknown as OrderQuoteResponse | null,
    events: record.events.map((event) => ({ id: event.id, type: event.type, actorName: event.actorName,
      reason: event.reason, createdAt: event.createdAt.toISOString(), details: event.details as Record<string, unknown> })),
    revisions: record.revisions.map((revision) => ({ version: revision.version, snapshot: revision.snapshot as unknown as OrderQuoteResponse,
      reason: revision.reason, createdAt: revision.createdAt.toISOString() })), prepUnitCount, dropId: record.dropId,
  };
}
