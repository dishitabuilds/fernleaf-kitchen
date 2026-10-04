import type { PageResponse } from './configuration';
import type { CompanyPurchaseSnapshot } from './orders';

export interface InvoiceOrderSummary {
  id: string; number: number; employeeName: string; deliveryDate: string;
  totalMinor: number; status: string;
  company: CompanyPurchaseSnapshot;
}

export interface InvoiceSummary {
  id: string; number: number; companyId: string; companyName: string;
  totalMinor: number; paidAmountMinor: number; creditTotalMinor: number;
  netDueMinor: number; issuedAt: string; paidAt: string | null;
  orderCount: number;
}

export interface BillingCreditResponse {
  id: string; invoiceId: string; orderId: string; orderNumber: number;
  amountMinor: number; reason: string; createdAt: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  company: CompanyPurchaseSnapshot;
  orders: InvoiceOrderSummary[];
  credits: BillingCreditResponse[];
}

export interface CreateInvoiceRequest {
  companyId: string; orderIds: string[]; actionId: string;
}

export interface PayInvoiceRequest {
  amountMinor: number; actionId: string;
}

export interface CreateCreditRequest {
  orderId: string; amountMinor: number; reason: string; actionId: string;
}

export type InvoicePage = PageResponse<InvoiceSummary>;

export interface UninvoicedOrderSummary {
  id: string; number: number; employeeName: string; deliveryDate: string;
  totalMinor: number; status: string;
}

export interface StaffUserResponse {
  id: string; email: string; displayName: string; role: string; active: boolean;
  createdAt: string;
}

export interface CreateStaffRequest {
  email: string; displayName: string; password: string; role: string;
}

export interface UpdateStaffRequest {
  displayName?: string; role?: string; active?: boolean; password?: string;
}

export type StaffPage = PageResponse<StaffUserResponse>;

// Dashboard response types
export interface AdminUpcomingCutoff {
  deliveryDate: string; cutoffAt: string; draftCount: number; placedCount: number;
}

export interface AdminDashboardResponse {
  /** Asia/Kolkata delivery date the date-scoped figures describe. */
  date: string;
  todayOrders: number; todayMeals: number;
  draftCount: number; placedCount: number;
  cancelledCount: number; rejectedCount: number;
  uninvoicedTotalMinor: number;
  outstandingBalanceMinor: number; companyCreditMinor: number;
  /** Same definitions as the Kitchen and Dispatch summaries for the selected date. */
  kitchenRemainingUnits: number; kitchenLateUnits: number; kitchenAtRiskUnits: number;
  unassignedDrops: number;
  /** Next delivery dates (today onwards) that still hold Draft/Placed orders, earliest cutoff first, max 5. */
  upcomingCutoffs: AdminUpcomingCutoff[];
}

export interface KitchenDashboardResponse {
  unitsByStation: { stationId: string | null; stationName: string; remaining: number; total: number }[];
  lateCount: number; atRiskCount: number; missingPlanCount: number;
}

export interface DispatchDashboardResponse {
  waiting: number; ready: number; unassigned: number;
  travelling: number; delivered: number;
}

export interface DriverDashboardResponse {
  totalDrops: number; completedDrops: number; onTimeCount: number;
  timedCompletedDrops: number; missingTimingCount: number;
  nextDrop: { id: string; companyName: string; deliveryAt: string; address: string } | null;
}

export type DashboardResponse =
  | { role: 'ADMIN'; data: AdminDashboardResponse }
  | { role: 'KITCHEN'; data: KitchenDashboardResponse }
  | { role: 'DISPATCH'; data: DispatchDashboardResponse }
  | { role: 'DRIVER'; data: DriverDashboardResponse };
