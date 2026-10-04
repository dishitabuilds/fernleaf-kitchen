import type { PageResponse } from './configuration';
import type { CustomDeliveryAddress, DeliveryAddressSnapshot, DishPurchaseSnapshot, EmployeePurchaseSnapshot, OrderStatus, ReferenceSnapshot } from './orders';

export const PREP_STATUSES = ['PENDING', 'STARTED', 'DONE'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];
export const DROP_STATUSES = ['AWAITING_KITCHEN', 'KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];
export type TimingRisk = 'ON_TRACK' | 'AT_RISK' | 'LATE' | 'MISSING_PLAN' | 'COMPLETE';
export interface OperationalActionRequest { version: number; actionId: string }
export interface ForceCompleteRequest extends OperationalActionRequest { reason: string }
export interface AssignDriverRequest extends OperationalActionRequest { driverId: string; reason?: string }
export interface DeliverDropRequest extends OperationalActionRequest { note?: string }
export interface CorrectDropRequest extends OperationalActionRequest {
  reason: string; address?: CustomDeliveryAddress; deliveryDate?: string; deliveryTime?: string;
}
export interface PrepUnitResponse {
  id: string; version: number; status: PrepStatus; quantity: number; station: ReferenceSnapshot | null;
  orderId: string; orderNumber: number; companyName: string; employeeName: string;
  deliveryDate: string; deliveryAt: string; plannedKitchenReadyAt: string | null;
  startedAt: string | null; doneAt: string | null; risk: TimingRisk;
  dish: DishPurchaseSnapshot;
  selections: { groupId: string; groupName: string; optionId: string; optionName: string; allergens: ReferenceSnapshot[]; dietaryTags: ReferenceSnapshot[] }[];
  allergyWarnings: string[]; packaging: ReferenceSnapshot | null;
}
export interface KitchenBoardResponse extends PageResponse<PrepUnitResponse> {
  date: string; stations: ReferenceSnapshot[]; riskThresholdMinutes: number;
}
export interface OperationalOrderResponse {
  id: string; number: number; status: OrderStatus; version: number; companyName: string;
  employee: EmployeePurchaseSnapshot; deliveryDate: string; deliveryAt: string;
  address: DeliveryAddressSnapshot; packaging: ReferenceSnapshot | null; driverInstructions: string;
  plannedKitchenReadyAt: string | null; plannedDispatchReadyAt: string | null;
  kitchenStartedAt: string | null; kitchenReadyAt: string | null; deliveredAt: string | null;
  kitchenRisk: TimingRisk; quantity: number; prepUnits: PrepUnitResponse[];
}
export interface OperationalDropSummary {
  id: string; version: number; status: DropStatus; driver: ReferenceSnapshot | null;
  kitchenReadyAt: string | null; dispatchReadyAt: string | null; departedAt: string | null;
  deliveredAt: string | null; targetAtDeparture: string | null; onTime: boolean | null;
}
export interface DropEventResponse {
  id: string; type: string; actorName: string; reason: string | null; createdAt: string;
  details: Record<string, unknown>;
}
export interface DeliveryDropResponse extends OperationalDropSummary {
  companyId: string; companyName: string; deliveryDate: string; deliveryAt: string;
  address: DeliveryAddressSnapshot; driverInstructions: string; note: string | null;
  plannedKitchenReadyAt: string | null; plannedDispatchReadyAt: string | null;
  kitchenRisk: TimingRisk; dispatchRisk: TimingRisk;
  orderCount: number; quantity: number; orders: OperationalOrderResponse[];
  events: DropEventResponse[];
}
export interface DeliveryDropPage extends PageResponse<DeliveryDropResponse> { date: string; riskThresholdMinutes: number }
export interface DriverChoice { id: string; displayName: string }
