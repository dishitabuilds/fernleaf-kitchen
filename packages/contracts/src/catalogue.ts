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
  options: { optionId: string; sortOrder: number; option: CatalogueOption }[];
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
export interface MenuPreviewOption { id: string; name: string; priceMinor: number; source: PriceSource; allergyWarnings: string[]; dietaryTags: string[] }
export interface MenuPreviewDish {
  menuItemId: string; dishId: string; sku: string; name: string; description: string; imageUrl: string | null;
  priceMinor: number; source: PriceSource; minQuantity: number | null; allergyWarnings: string[]; dietaryTags: string[];
  groups: { id: string; name: string; required: boolean; options: MenuPreviewOption[] }[];
}
export interface MenuDiagnostic { menuItemId: string; dishId: string; dishName: string; reason: string }
export interface EmployeeMenuPreview {
  employeeId: string; companyId: string; tierId: string; currency: 'USD';
  categories: { id: string; name: string; secret: boolean; dishes: MenuPreviewDish[] }[];
  diagnostics: MenuDiagnostic[];
}
