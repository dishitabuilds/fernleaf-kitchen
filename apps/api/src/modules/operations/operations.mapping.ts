import type { DeliveryDropResponse, DeliveryPurchaseSnapshot, DishPurchaseSnapshot, EmployeePurchaseSnapshot, OperationalOrderResponse, PrepUnitResponse, ReferenceSnapshot } from '@fernleaf/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { timingRisk } from '../../domain/operations';

const selectionSelect = { groupId: true, groupName: true, optionId: true, optionName: true, allergens: true, dietaryTags: true } satisfies Prisma.SelectionSnapshotSelect;
const orderFields = {
  id: true, number: true, status: true, version: true, companyName: true, employeeName: true, employeeSnapshot: true,
  deliveryDate: true, deliveryAt: true, deliverySnapshot: true, plannedKitchenReadyAt: true, plannedDispatchReadyAt: true,
  kitchenStartedAt: true, kitchenReadyAt: true, deliveredAt: true,
} satisfies Prisma.OrderSelect;
export const prepSelect = {
  id: true, version: true, status: true, stationId: true, stationName: true, startedAt: true, doneAt: true,
  combination: { select: { quantity: true, selections: { select: selectionSelect, orderBy: { sortOrder: 'asc' } },
    line: { select: { dishSnapshot: true, order: { select: orderFields } } } } },
} satisfies Prisma.PrepUnitSelect;
export const operationalOrderSelect = {
  ...orderFields,
  lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { quantity: true,
    combinations: { orderBy: { id: 'asc' }, select: { prepUnit: { select: prepSelect } } } } },
} satisfies Prisma.OrderSelect;
export const dropSelect = {
  id: true, version: true, companyId: true, company: { select: { name: true } }, deliveryDate: true, deliveryAt: true,
  addressSnapshot: true, driverInstructions: true, driver: { select: { id: true, displayName: true } }, status: true,
  kitchenReadyAt: true, dispatchReadyAt: true, departedAt: true, deliveredAt: true, targetAtDeparture: true, onTime: true, note: true, photoMimeType: true,
  orders: { where: { status: { in: ['CONFIRMED', 'DELIVERED'] } }, orderBy: { number: 'asc' }, select: operationalOrderSelect },
  events: { orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }] },
} satisfies Prisma.DeliveryDropSelect;
export type PrepRecord = Prisma.PrepUnitGetPayload<{ select: typeof prepSelect }>;
export type OperationalOrderRecord = Prisma.OrderGetPayload<{ select: typeof operationalOrderSelect }>;
export type DropRecord = Prisma.DeliveryDropGetPayload<{ select: typeof dropSelect }>;
const instant = (value: Date | null) => value?.toISOString() ?? null;

export function prepResponse(unit: PrepRecord, now: Date, threshold: number): PrepUnitResponse {
  const { line } = unit.combination, order = line.order;
  const dish = line.dishSnapshot as unknown as DishPurchaseSnapshot;
  const employee = order.employeeSnapshot as unknown as EmployeePurchaseSnapshot;
  const delivery = order.deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
  const selections = unit.combination.selections.map((selection) => ({ ...selection,
    allergens: selection.allergens as unknown as ReferenceSnapshot[], dietaryTags: selection.dietaryTags as unknown as ReferenceSnapshot[] }));
  const knownAllergens = [...dish.allergens, ...selections.flatMap((selection) => selection.allergens)];
  const allergyWarnings = [...new Set(knownAllergens.filter((allergen) => employee.allergens.some((entry) => entry.id === allergen.id)).map((allergen) => allergen.name))];
  return { id: unit.id, version: unit.version, status: unit.status, quantity: unit.combination.quantity,
    station: unit.stationId && unit.stationName ? { id: unit.stationId, name: unit.stationName } : null,
    orderId: order.id, orderNumber: order.number, companyName: order.companyName, employeeName: order.employeeName,
    deliveryDate: order.deliveryDate, deliveryAt: order.deliveryAt.toISOString(), plannedKitchenReadyAt: instant(order.plannedKitchenReadyAt),
    startedAt: instant(unit.startedAt), doneAt: instant(unit.doneAt), risk: timingRisk(now, order.plannedKitchenReadyAt, unit.status === 'DONE', threshold),
    dish, selections, allergyWarnings, packaging: delivery.packaging };
}
export function operationalOrderResponse(order: OperationalOrderRecord, now: Date, threshold: number): OperationalOrderResponse {
  const delivery = order.deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
  return { id: order.id, number: order.number, status: order.status, version: order.version, companyName: order.companyName,
    employee: order.employeeSnapshot as unknown as EmployeePurchaseSnapshot,
    deliveryDate: order.deliveryDate, deliveryAt: order.deliveryAt.toISOString(), address: delivery.address, packaging: delivery.packaging,
    driverInstructions: delivery.driverInstructions, plannedKitchenReadyAt: instant(order.plannedKitchenReadyAt),
    plannedDispatchReadyAt: instant(order.plannedDispatchReadyAt), kitchenStartedAt: instant(order.kitchenStartedAt),
    kitchenReadyAt: instant(order.kitchenReadyAt), deliveredAt: instant(order.deliveredAt),
    kitchenRisk: timingRisk(now, order.plannedKitchenReadyAt, order.kitchenReadyAt !== null, threshold),
    quantity: order.lines.reduce((total, line) => total + line.quantity, 0),
    prepUnits: order.lines.flatMap((line) => line.combinations.flatMap((combination) => combination.prepUnit ? [prepResponse(combination.prepUnit, now, threshold)] : [])) };
}
export function dropResponse(drop: DropRecord, now: Date, threshold: number): DeliveryDropResponse {
  const orders = drop.orders.map((order) => operationalOrderResponse(order, now, threshold));
  const earliestPlan = (field: 'plannedKitchenReadyAt' | 'plannedDispatchReadyAt') => drop.orders.length ? new Date(Math.min(...drop.orders.map((order) => order[field].getTime()))) : null;
  const plannedKitchen = earliestPlan('plannedKitchenReadyAt'), plannedDispatch = earliestPlan('plannedDispatchReadyAt');
  const kitchenComplete = orders.length > 0 && orders.every((order) => order.kitchenReadyAt !== null);
  return { id: drop.id, version: drop.version, status: drop.status, companyId: drop.companyId,
    companyName: orders[0]?.companyName ?? drop.company.name, deliveryDate: drop.deliveryDate, deliveryAt: drop.deliveryAt.toISOString(),
    address: drop.addressSnapshot as unknown as DeliveryDropResponse['address'], driverInstructions: drop.driverInstructions,
    driver: drop.driver ? { id: drop.driver.id, name: drop.driver.displayName } : null,
    kitchenReadyAt: instant(drop.kitchenReadyAt), dispatchReadyAt: instant(drop.dispatchReadyAt), departedAt: instant(drop.departedAt),
    deliveredAt: instant(drop.deliveredAt), targetAtDeparture: instant(drop.targetAtDeparture), onTime: drop.onTime, note: drop.note, hasPhoto: drop.photoMimeType !== null,
    plannedKitchenReadyAt: instant(plannedKitchen), plannedDispatchReadyAt: instant(plannedDispatch),
    kitchenRisk: timingRisk(now, plannedKitchen, kitchenComplete, threshold),
    dispatchRisk: timingRisk(now, plannedDispatch, ['DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status), threshold),
    orderCount: orders.length, quantity: orders.reduce((total, order) => total + order.quantity, 0), orders,
    events: drop.events.map((event) => ({ id: event.id, type: event.type, actorName: event.actorName, reason: event.reason,
      createdAt: event.createdAt.toISOString(), details: event.details as Record<string, unknown> })) };
}
