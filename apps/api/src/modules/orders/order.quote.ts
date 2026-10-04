import type { CompanyPurchaseSnapshot, DeliveryAddressSnapshot, DeliveryPurchaseSnapshot, EmployeePurchaseSnapshot, OrderInput, OrderQuoteResponse, QuotedOrderLine, ReferenceSnapshot } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { assertCalendarDate, assertLocalTime, isDeliveryDateAllowed } from '../../domain/calendar';
import { checkedMoney, quoteCombinations } from '../../domain/combinations';
import type { Prisma } from '../../generated/prisma/client';
import { dishInclude } from '../catalogue/catalogue.service';
import type { CutoffsService } from '../cutoffs/cutoffs.service';
import type { MenuService } from '../menu/menu.service';
import { fingerprint, orderInclude } from './order.mapping';

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export interface QuotePolicy {
  maximumSelectionsPerGroup: number;
  ordinaryCustomAddresses: boolean;
  rejectDuplicateDishLines: boolean;
}
export interface QuoteContext { override: boolean; previous?: OrderRecord }
const reference = (value: { id: string; name: string }): ReferenceSnapshot => ({ id: value.id, name: value.name });
const references = (values: { reference: { id: string; name: string } }[]) => values.map(({ reference: value }) => reference(value)).sort((a, b) => a.id.localeCompare(b.id));

export async function quoteInTransaction(tx: Prisma.TransactionClient, input: OrderInput, context: QuoteContext,
  policy: QuotePolicy, menu: MenuService, cutoffs: CutoffsService): Promise<OrderQuoteResponse> {
  assertCalendarDate(input.deliveryDate);
  const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, include: {
    company: { include: { packaging: true, defaultAddress: true } },
    allergens: { include: { reference: true } }, dietaryTags: { include: { reference: true } },
  } });
  if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'Select an existing company employee.');
  if (!employee.active || !employee.company.active) throw new ApiError(400, 'EMPLOYEE_INACTIVE', 'Ordering requires an active employee and company.');
  const company = employee.company;
  const previous = context.previous;
  if (previous && previous.status === 'PLACED') {
    if (input.employeeId !== previous.employeeId) throw new ApiError(400, 'ORDER_EMPLOYEE_LOCKED', 'A placed order keeps its purchased employee.');
    if (company.id !== previous.companyId) throw new ApiError(409, 'EMPLOYEE_TRANSFERRED', 'This employee moved company. The placed purchase remains with its original billing company; use logistics overrides or cancellation.');
  }
  if (!isDeliveryDateAllowed(input.deliveryDate, company)) throw new ApiError(400, 'COMPANY_DATE_CLOSED', 'This company does not accept delivery on the selected date.');
  if (input.addressId && input.customAddress) throw new ApiError(400, 'ADDRESS_AMBIGUOUS', 'Choose a saved address or a custom address, not both.');
  let address: DeliveryAddressSnapshot;
  if (input.customAddress) {
    if (!context.override && !policy.ordinaryCustomAddresses) throw new ApiError(400, 'CUSTOM_ADDRESS_OVERRIDE_REQUIRED', 'Custom delivery addresses require an explicit Admin override and reason.');
    if (!context.override && !employee.canChooseAddress) throw new ApiError(403, 'EMPLOYEE_ADDRESS_LOCKED', 'This employee must use the company default delivery address.');
    address = { ...input.customAddress, id: null, line2: input.customAddress.line2 ?? null };
  } else {
    const addressId = input.addressId ?? company.defaultAddressId;
    if (!addressId) throw new ApiError(400, 'DELIVERY_ADDRESS_MISSING', 'Configure an active company default address before ordering.');
    if (!context.override && !employee.canChooseAddress && addressId !== company.defaultAddressId) throw new ApiError(403, 'EMPLOYEE_ADDRESS_LOCKED', 'This employee must use the company default delivery address.');
    const saved = addressId === company.defaultAddressId ? company.defaultAddress : await tx.companyAddress.findUnique({ where: { id: addressId } });
    if (!saved || !saved.active || saved.companyId !== company.id) throw new ApiError(400, 'DELIVERY_ADDRESS_INVALID', 'Select an active address belonging to the employee company.');
    address = { id: saved.id, label: saved.label, line1: saved.line1, line2: saved.line2, city: saved.city,
      region: saved.region, postalCode: saved.postalCode, country: saved.country };
  }
  const deliveryTime = input.deliveryTime ?? company.deliveryTime;
  assertLocalTime(deliveryTime);
  if (!context.override && !employee.canChangeTime && deliveryTime !== company.deliveryTime) throw new ApiError(403, 'EMPLOYEE_TIME_LOCKED', 'This employee must use the company default delivery time.');
  const packagingId = input.packagingId === undefined ? company.packagingId : input.packagingId;
  if (!context.override && !employee.canChangePackaging && packagingId !== company.packagingId) throw new ApiError(403, 'EMPLOYEE_PACKAGING_LOCKED', 'This employee must use the company default packaging.');
  const packaging = packagingId ? await tx.referenceValue.findFirst({ where: { id: packagingId, kind: 'PACKAGING_TYPE', active: true } }) : null;
  if (packagingId && !packaging) throw new ApiError(400, 'PACKAGING_INVALID', 'Select an active packaging reference.');
  const cutoff = await cutoffs.ensureDate(tx, input.deliveryDate);
  const settings = await tx.kitchenSettings.findUniqueOrThrow({ where: { id: 1 } });
  const tierId = company.priceTierId ?? settings.defaultPriceTierId;
  const tier = await tx.priceTier.findFirst({ where: { id: tierId, active: true } });
  if (!tier) throw new ApiError(400, 'PRICE_TIER_INACTIVE', 'Ordering requires an active effective price tier.');
  const employeeSnapshot: EmployeePurchaseSnapshot = { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone,
    canChooseAddress: employee.canChooseAddress, canChangeTime: employee.canChangeTime, canChangePackaging: employee.canChangePackaging,
    allergens: references(employee.allergens), dietaryTags: references(employee.dietaryTags) };
  const companySnapshot: CompanyPurchaseSnapshot = previous?.status === 'PLACED'
    ? previous.companySnapshot as unknown as CompanyPurchaseSnapshot
    : { id: company.id, name: company.name, billingName: company.billingName, billingEmail: company.billingEmail,
      billingAddress: company.billingAddress, billingContactName: company.billingContactName, phone: company.phone, deliveryMinutes: company.deliveryMinutes };
  const deliveryAt = new Date(`${input.deliveryDate}T${deliveryTime}:00+05:30`);
  const dispatchAt = new Date(deliveryAt.getTime() - companySnapshot.deliveryMinutes * 60000);
  const delivery: DeliveryPurchaseSnapshot = { deliveryDate: input.deliveryDate, deliveryTime, deliveryAt: deliveryAt.toISOString(),
    address, packaging: packaging ? reference(packaging) : null, driverInstructions: company.driverInstructions,
    defaultDriverId: company.defaultDriverId, plannedDispatchReadyAt: dispatchAt.toISOString(),
    plannedKitchenReadyAt: new Date(dispatchAt.getTime() - 30 * 60000).toISOString() };
  const items = await tx.menuItem.findMany({ where: { id: { in: input.lines.map((line) => line.menuItemId) } },
    include: { category: true, dish: { include: { ...dishInclude, station: true } } } });
  const previews = new Map<string, Awaited<ReturnType<MenuService['previewInTransaction']>>>();
  const lines: QuotedOrderLine[] = [];
  const dishIds = new Set<string>();
  for (const line of input.lines) {
    const item = items.find((candidate) => candidate.id === line.menuItemId);
    if (!item) throw new ApiError(400, 'MENU_ITEM_INVALID', 'Select an existing menu item.');
    if (policy.rejectDuplicateDishLines && dishIds.has(item.dishId)) throw new ApiError(400, 'DUPLICATE_DISH_LINE', 'Each dish may appear once per order. Add its quantities and combinations to the existing line.');
    dishIds.add(item.dishId);
    let preview = previews.get(item.categoryId);
    if (!preview) { preview = await menu.previewInTransaction(tx, employee.id, item.categoryId); previews.set(item.categoryId, preview); }
    const available = preview.categories.flatMap((category) => category.dishes).find((dish) => dish.menuItemId === item.id);
    if (!available || available.priceMinor === null) throw new ApiError(400, 'MENU_ITEM_UNAVAILABLE', 'This dish is unavailable for the employee because of activity, hiding, required options or pricing.', undefined,
      { menuItemId: item.id, diagnostics: preview.diagnostics.filter((diagnostic) => diagnostic.menuItemId === item.id) });
    const groups = available.groups.map((group) => ({ id: group.id, required: group.required, usesPortions: group.portionSizes.length > 0 ||
      item.dish.groups.find((candidate) => candidate.id === group.id)!.portionSizes.length > 0, options: group.options.map((option) => {
      const source = item.dish.groups.find((candidate) => candidate.id === group.id)!.options.find((candidate) => candidate.optionId === option.id)!.option;
      return { groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceMinor: option.priceMinor,
        priceSource: option.source, tierId, allergens: references(source.allergens), dietaryTags: references(source.dietaryTags),
        portionSizeId: null, portionName: null, portionSurchargeMinor: null, portions: option.portions };
    }) }));
    const combinations = quoteCombinations(line, item.dish.minQuantity ?? 1, available.priceMinor, groups, policy.maximumSelectionsPerGroup);
    const allergyIds = new Set(employee.allergens.map((entry) => entry.referenceId));
    const allergyWarnings = new Set(available.allergyWarnings);
    combinations.forEach((combination) => combination.selections.forEach((selection) => selection.allergens.forEach((allergen) => {
      if (allergyIds.has(allergen.id)) allergyWarnings.add(allergen.name);
    })));
    lines.push({ menuItemId: item.id, dish: { id: item.dishId, sku: item.dish.sku, name: item.dish.name,
      description: item.dish.description, imageUrl: item.dish.imageUrl, temperature: item.dish.temperature,
      station: item.dish.station ? reference(item.dish.station) : null,
      allergens: references(item.dish.allergens), dietaryTags: references(item.dish.dietaryTags) },
      quantity: line.quantity, basePriceMinor: available.priceMinor, priceSource: available.source, tierId,
      totalMinor: checkedMoney(combinations.reduce((total, combination) => total + BigInt(combination.totalMinor), 0n)), combinations,
      allergyWarnings: [...allergyWarnings].sort() });
  }
  const result = { currency: 'USD' as const, employee: employeeSnapshot, company: companySnapshot, delivery, tier: reference(tier),
    cutoffAt: cutoff.cutoffAt.toISOString(), settingsVersion: cutoff.settingsVersion,
    lines, totalMinor: checkedMoney(lines.reduce((total, line) => total + BigInt(line.totalMinor), 0n)) };
  return { ...result, fingerprint: fingerprint(result) };
}
