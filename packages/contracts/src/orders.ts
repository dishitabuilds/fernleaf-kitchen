import type { DishTemperature, PriceSource } from './catalogue';
import type { PageResponse } from './configuration';
import type { OperationalDropSummary } from './operations';

export const ORDER_STATUSES = ['DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export interface OrderSelectionInput { groupId: string; optionId: string }
export interface OrderCombinationInput { quantity: number; selections: OrderSelectionInput[] }
export interface OrderLineInput { menuItemId: string; quantity: number; combinations: OrderCombinationInput[] }
export interface DeliveryAddressSnapshot {
  id: string | null; label: string; line1: string; line2: string | null;
  city: string; region: string; postalCode: string; country: string;
}
export type CustomDeliveryAddress = Omit<DeliveryAddressSnapshot, 'id'>;
export interface OrderInput {
  employeeId: string; deliveryDate: string; lines: OrderLineInput[];
  addressId?: string; deliveryTime?: string; packagingId?: string | null;
  customAddress?: CustomDeliveryAddress;
}
export interface OrderQuoteRequest extends OrderInput { orderId?: string; overrideReason?: string }
export interface ReferenceSnapshot { id: string; name: string }
export interface EmployeePurchaseSnapshot {
  id: string; name: string; email: string; phone: string | null;
  canChooseAddress: boolean; canChangeTime: boolean; canChangePackaging: boolean;
  allergens: ReferenceSnapshot[]; dietaryTags: ReferenceSnapshot[];
}
export interface CompanyPurchaseSnapshot {
  id: string; name: string; billingName: string; billingEmail: string; billingAddress: string;
  billingContactName: string; phone: string | null; deliveryMinutes: number;
}
export interface DeliveryPurchaseSnapshot {
  deliveryDate: string; deliveryTime: string; deliveryAt: string; address: DeliveryAddressSnapshot;
  packaging: ReferenceSnapshot | null; driverInstructions: string; defaultDriverId: string | null;
  plannedDispatchReadyAt: string; plannedKitchenReadyAt: string;
}
export interface DishPurchaseSnapshot {
  id: string; sku: string; name: string; description: string; imageUrl: string | null;
  temperature: DishTemperature; station: ReferenceSnapshot | null;
  allergens: ReferenceSnapshot[]; dietaryTags: ReferenceSnapshot[];
}
export interface OrderSelectionSnapshot {
  groupId: string; groupName: string; optionId: string; optionName: string;
  priceMinor: number; priceSource: PriceSource; tierId: string;
  allergens: ReferenceSnapshot[]; dietaryTags: ReferenceSnapshot[];
}
export interface QuotedCombination {
  canonicalKey: string; quantity: number; unitPriceMinor: number; totalMinor: number;
  selections: OrderSelectionSnapshot[];
}
export interface QuotedOrderLine {
  menuItemId: string; dish: DishPurchaseSnapshot; quantity: number; basePriceMinor: number;
  priceSource: PriceSource; tierId: string; totalMinor: number; combinations: QuotedCombination[];
  allergyWarnings: string[];
}
export interface OrderQuoteResponse {
  fingerprint: string; currency: 'USD'; employee: EmployeePurchaseSnapshot;
  company: CompanyPurchaseSnapshot; delivery: DeliveryPurchaseSnapshot;
  tier: ReferenceSnapshot; cutoffAt: string; settingsVersion: number;
  lines: QuotedOrderLine[]; totalMinor: number;
}
export interface OrderCreateRequest extends OrderInput {
  status: 'DRAFT' | 'PLACED'; actionId: string; acceptedQuote?: string;
}
export interface OrderUpdateRequest extends OrderInput { version: number; actionId: string; acceptedQuote?: string }
export interface OrderPlaceRequest { version: number; actionId: string; acceptedQuote: string }
export interface OrderReasonRequest { version: number; actionId: string; reason: string }
export interface OrderOverrideCreateRequest extends OrderInput { actionId: string; acceptedQuote: string; reason: string }
export interface OrderOverrideRequest {
  version: number; actionId: string; reason: string; action: 'DELIVERY' | 'CANCEL' | 'REJECT' | 'PLACE';
  acceptedQuote?: string; deliveryDate?: string; deliveryTime?: string; addressId?: string;
  customAddress?: CustomDeliveryAddress; packagingId?: string | null;
}
export interface OrderSummary {
  id: string; number: number; status: OrderStatus; version: number; employeeId: string; companyId: string;
  employeeName: string; companyName: string; deliveryDate: string; deliveryAt: string; cutoffAt: string;
  totalMinor: number | null; quantity: number; invoiced: boolean; createdAt: string;
  placedAt: string | null; confirmedAt: string | null; cancelledAt: string | null; rejectedAt: string | null;
}
export interface OrderEventResponse {
  id: string; type: string; actorName: string; reason: string | null; createdAt: string;
  details: Record<string, unknown>;
}
export interface OrderDetail extends OrderSummary {
  input: OrderInput; employee: EmployeePurchaseSnapshot; company: CompanyPurchaseSnapshot;
  delivery: DeliveryPurchaseSnapshot; purchase: OrderQuoteResponse | null;
  events: OrderEventResponse[];
  revisions: { version: number; snapshot: OrderQuoteResponse; reason: string | null; createdAt: string }[];
  prepUnitCount: number; dropId: string | null;
  plannedKitchenReadyAt: string; plannedDispatchReadyAt: string;
  kitchenStartedAt: string | null; kitchenReadyAt: string | null; deliveredAt: string | null;
  drop: OperationalDropSummary | null;
}
export type OrderPage = PageResponse<OrderSummary>;
export interface CutoffProcessResult {
  deliveryDate: string; confirmed: number; cancelled: number; skipped: number; failed: number;
  failures: { orderId: string; code: string }[];
}
