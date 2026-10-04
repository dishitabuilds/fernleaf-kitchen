export const REFERENCE_KINDS = ['ALLERGEN', 'DIETARY_TAG', 'KITCHEN_STATION', 'PORTION_SIZE', 'PACKAGING_TYPE', 'PUBLIC_EMAIL_DOMAIN'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export interface ReferenceValueResponse { id: string; kind: ReferenceKind; name: string; active: boolean; sortOrder: number }
export interface PageResponse<T> { items: T[]; total: number; page: number; pageSize: number }
export interface CalendarConfiguration { workingDays: number[]; holidays: string[] }
export interface SettingsResponse extends CalendarConfiguration {
  id: number; timezone: 'Asia/Kolkata'; currency: 'USD'; phase: 3; version: number;
  defaultPriceTierId: string; cutoffTime: string; cutoffWorkingDays: number; riskThresholdMinutes: number;
}
export interface SettingsUpdateRequest extends CalendarConfiguration {
  version: number; defaultPriceTierId: string; cutoffTime: string; cutoffWorkingDays: number; riskThresholdMinutes: number;
}
export interface CutoffPreviewResponse { deliveryDate: string; cutoffAt: string; companyDeliveryAllowed: boolean | null; settingsVersion: number }
export interface CompanyAddressResponse { id: string; companyId: string; label: string; line1: string; line2: string | null; city: string; region: string; postalCode: string; country: string; active: boolean }
export interface EmployeeResponse {
  id: string; companyId: string; name: string; email: string; phone: string | null; active: boolean;
  canChooseAddress: boolean; canChangeTime: boolean; canChangePackaging: boolean; allergenIds: string[]; dietaryTagIds: string[];
}
export interface CompanyResponse extends CalendarConfiguration {
  id: string; name: string; billingName: string; billingEmail: string; billingAddress: string; billingContactName: string;
  phone: string | null; active: boolean; ownerEmployeeId: string | null; defaultAddressId: string | null; priceTierId: string | null;
  deliveryTime: string; deliveryMinutes: number; packagingId: string | null; defaultDriverId: string | null; driverInstructions: string;
  version: number; domains: string[]; addresses: CompanyAddressResponse[]; employees: EmployeeResponse[];
  hiddenCategoryIds: string[]; hiddenMenuItemIds: string[];
}
export interface AddressWriteRequest { label: string; line1: string; line2?: string | null; city: string; region: string; postalCode: string; country: string; active?: boolean }
export interface CompanyCreateRequest extends CalendarConfiguration {
  name: string; billingName: string; billingEmail: string; billingAddress: string; billingContactName: string;
  phone?: string | null; domains: string[]; owner: { name: string; email: string }; address: AddressWriteRequest;
  priceTierId?: string | null; deliveryTime: string; deliveryMinutes: number; packagingId?: string | null;
  defaultDriverId?: string | null; driverInstructions?: string; active?: boolean;
}
export interface CompanyUpdateRequest extends Partial<Omit<CompanyCreateRequest, 'owner' | 'address'>> {
  version: number; ownerEmployeeId?: string; defaultAddressId?: string; hiddenCategoryIds?: string[]; hiddenMenuItemIds?: string[];
}
export interface EmployeeCreateRequest {
  companyId: string; name: string; email: string; phone?: string | null; active?: boolean;
  canChooseAddress?: boolean; canChangeTime?: boolean; canChangePackaging?: boolean; allergenIds?: string[]; dietaryTagIds?: string[];
}
export type EmployeeUpdateRequest = Partial<Omit<EmployeeCreateRequest, 'companyId'>>;
export interface EmployeeTransferRequest { companyId: string; replacementOwnerId?: string }
export interface DriverChoiceResponse { id: string; displayName: string }
