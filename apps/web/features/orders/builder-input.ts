import type { CustomDeliveryAddress, OrderInput, OrderLineInput } from '@fernleaf/contracts';

export interface EditableCombination { key: string; quantity: string; selections: { groupId: string; optionId: string; portionSizeId?: string }[] }
export interface EditableLine { key: string; menuItemId: string; quantity: string; combinations: EditableCombination[] }
export interface DeliveryChoices {
  addressId: string; deliveryTime: string; packaging: string;
  custom: boolean; customAddress: CustomDeliveryAddress;
}
export const emptyAddress: CustomDeliveryAddress = { label: '', line1: '', line2: null, city: '', region: '', postalCode: '', country: 'India' };
export function deliveryChoices(input?: OrderInput): DeliveryChoices {
  return { addressId: input?.addressId ?? '', deliveryTime: input?.deliveryTime ?? '',
    packaging: input?.packagingId === null ? 'none' : input?.packagingId ?? '',
    custom: Boolean(input?.customAddress), customAddress: input?.customAddress ?? { ...emptyAddress } };
}
export function editableLines(lines: OrderLineInput[]): EditableLine[] {
  return lines.map((line, index) => ({ key: `line-${index}`, menuItemId: line.menuItemId, quantity: String(line.quantity),
    combinations: line.combinations.map((combination, combinationIndex) => ({ key: `combination-${index}-${combinationIndex}`,
      quantity: String(combination.quantity), selections: combination.selections.map((selection) => ({ ...selection })) })) }));
}
function quantity(value: string, label: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000) throw new Error(`${label} must be a whole number from 1 to 100,000.`);
  return Number(value);
}
export function orderLines(lines: EditableLine[]): OrderLineInput[] {
  return lines.map((line, index) => ({ menuItemId: line.menuItemId, quantity: quantity(line.quantity, `Line ${index + 1} quantity`),
    combinations: line.combinations.map((combination, combinationIndex) => ({ quantity: quantity(combination.quantity, `Line ${index + 1}, combination ${combinationIndex + 1} quantity`),
      selections: combination.selections.map((selection) => ({ ...selection })) })) }));
}
