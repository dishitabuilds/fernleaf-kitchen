export type DishTemperature = 'HOT' | 'COLD' | 'AMBIENT';
export type TierRule = 'MANUAL' | 'COST' | 'REFERENCE';
export type PriceSource = 'EXPLICIT' | 'COST' | 'REFERENCE' | 'MISSING';
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ReferenceSummary { id: string; name: string; active: boolean }
export interface CatalogueReference { referenceId: string; reference: ReferenceSummary }
export interface CatalogueOption {
  id: string; name: string; description: string; costMinor: number; active: boolean;
  allergens: CatalogueReference[]; dietaryTags: CatalogueReference[];
}
export interface CatalogueGroup {
  id: string; name: string; required: boolean; sortOrder: number;
  options: { optionId: string; sortOrder: number; option: CatalogueOption; portionPrices: { portionSizeId: string; surchargeMinor: number }[] }[];
  /** Empty when the group does not sell portions. */
  portionSizes: { portionSizeId: string; sortOrder: number; portionSize: ReferenceSummary }[];
}
export interface GroupPortionSurchargeInput { optionId: string; portionSizeId: string; surchargeMinor: number }
export interface DishGroupInput {
  id?: string; name: string; required: boolean; sortOrder: number; optionIds: string[];
  /** Ordered sizes the group sells; omit or leave empty for a group without portions. */
  portionSizeIds?: string[];
  /** Required for every option × size when portionSizeIds is non-empty. */
  portionSurcharges?: GroupPortionSurchargeInput[];
}
export interface CatalogueDish {
  id: string; sku: string; name: string; description: string; imageUrl: string | null;
  temperature: DishTemperature; costMinor: number; stationId: string | null;
  minQuantity: number | null; active: boolean; allergens: CatalogueReference[];
  dietaryTags: CatalogueReference[]; groups: CatalogueGroup[];
}
export interface MenuCategory { id: string; name: string; active: boolean; secret: boolean; sortOrder: number }
export interface CatalogueMenuItem { id: string; categoryId: string; dishId: string; active: boolean; sortOrder: number; category: MenuCategory; dish: CatalogueDish }
export interface PriceTierRecord {
  id: string; name: string; rule: TierRule; numerator: number; denominator: number;
  referenceTierId: string | null; active: boolean;
}
export interface PriceMatrixEntry {
  kind: 'DISH' | 'OPTION'; itemId: string; name: string; active: boolean; costMinor: number;
  explicitMinor: number | null; effectiveMinor: number | null; source: PriceSource;
}
export interface PriceMatrix extends Page<PriceMatrixEntry> { tier: PriceTierRecord }
export interface MenuPreviewOption {
  id: string; name: string; priceMinor: number; source: PriceSource; allergyWarnings: string[]; dietaryTags: string[];
  /** Per-size surcharge on top of priceMinor; empty when the group has no portions. */
  portions: { portionSizeId: string; name: string; surchargeMinor: number }[];
}
export interface MenuPreviewDish {
  menuItemId: string; dishId: string; sku: string; name: string; description: string; imageUrl: string | null;
  priceMinor: number; source: PriceSource; minQuantity: number | null; allergyWarnings: string[]; dietaryTags: string[];
  groups: { id: string; name: string; required: boolean; portionSizes: { id: string; name: string }[]; options: MenuPreviewOption[] }[];
}
export interface MenuDiagnostic { menuItemId: string; dishId: string; dishName: string; reason: string }
export interface EmployeeMenuPreview {
  employeeId: string; companyId: string; tierId: string; currency: 'USD';
  categories: { id: string; name: string; secret: boolean; dishes: MenuPreviewDish[] }[];
  diagnostics: MenuDiagnostic[];
}
