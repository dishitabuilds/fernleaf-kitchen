import { createHash } from 'node:crypto';
import type { OrderLineInput, OrderSelectionSnapshot, QuotedCombination } from '@fernleaf/contracts';
import { ApiError } from '../common/api-error';
import { MAX_MINOR, assertMinor } from './money';

export interface PricedPortion { portionSizeId: string; name: string; surchargeMinor: number }
export interface PricedOption extends OrderSelectionSnapshot { portions?: PricedPortion[] }
export interface PricedGroup {
  /** usesPortions: the group sells sizes, so every selection in it must name one of the option's priced sizes. */
  id: string; required: boolean; usesPortions?: boolean; options: PricedOption[];
}
function selectedPrice(group: PricedGroup, option: PricedOption, portionSizeId: string | undefined): OrderSelectionSnapshot {
  const { portions, ...base } = option;
  if (!group.usesPortions) {
    if (portionSizeId) throw new ApiError(400, 'PORTION_NOT_OFFERED', `${option.groupName} does not sell portion sizes.`);
    return { ...base, portionSizeId: null, portionName: null, portionSurchargeMinor: null };
  }
  if (!portionSizeId) throw new ApiError(400, 'PORTION_REQUIRED', `Choose a portion size for ${option.optionName} in ${option.groupName}.`);
  const portion = portions?.find((candidate) => candidate.portionSizeId === portionSizeId);
  if (!portion) throw new ApiError(400, 'PORTION_INVALID', `${option.optionName} is not available in the selected size.`);
  assertMinor(portion.surchargeMinor);
  return { ...base, priceMinor: checkedMoney(BigInt(base.priceMinor) + BigInt(portion.surchargeMinor)),
    portionSizeId, portionName: portion.name, portionSurchargeMinor: portion.surchargeMinor };
}
export function checkedMoney(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_MINOR)) throw new ApiError(400, 'ORDER_TOTAL_OVERFLOW', 'This order exceeds the supported total. Reduce its quantities.');
  return Number(value);
}
export function quoteCombinations(line: OrderLineInput, minimum: number, basePriceMinor: number,
  groups: PricedGroup[], maximumSelectionsPerGroup: number): QuotedCombination[] {
  assertMinor(basePriceMinor);
  const positiveQuantity = (quantity: number) => Number.isInteger(quantity) && quantity > 0 && quantity <= 100000;
  if (!positiveQuantity(line.quantity) || line.quantity < minimum) throw new ApiError(400, 'LINE_QUANTITY_INVALID', `Dish quantity must be a positive whole number of at least ${minimum}.`);
  if (!line.combinations.length || line.combinations.length > 100) throw new ApiError(400, 'COMBINATIONS_REQUIRED', 'Provide at least one combination for every dish line.');
  if (line.combinations.some((combination) => !positiveQuantity(combination.quantity))) throw new ApiError(400, 'COMBINATION_QUANTITY_INVALID', 'Combination quantities must be positive whole numbers.');
  if (line.combinations.reduce((total, combination) => total + BigInt(combination.quantity), 0n) !== BigInt(line.quantity)) {
    throw new ApiError(400, 'COMBINATION_SUM_INVALID', 'Combination quantities must add up exactly to the dish line quantity.');
  }
  const merged = new Map<string, QuotedCombination>();
  for (const combination of line.combinations) {
    if (combination.selections.length > 100) throw new ApiError(400, 'SELECTIONS_INVALID', 'Too many selections in a combination.');
    const byGroup = new Map<string, string[]>();
    const selections: OrderSelectionSnapshot[] = [];
    for (const selection of combination.selections) {
      const group = groups.find((candidate) => candidate.id === selection.groupId);
      const priced = group?.options.find((candidate) => candidate.optionId === selection.optionId);
      if (!group || !priced) throw new ApiError(400, 'SELECTION_INVALID', 'Every option must be available and priced in its selected dish group.');
      const choices = byGroup.get(group.id) ?? [];
      if (choices.includes(selection.optionId)) throw new ApiError(400, 'SELECTION_DUPLICATE', 'The same option cannot be repeated in one combination.');
      choices.push(selection.optionId); byGroup.set(group.id, choices);
      if (choices.length > maximumSelectionsPerGroup) throw new ApiError(400, 'GROUP_CARDINALITY_INVALID', 'This group has too many selected options.');
      selections.push(selectedPrice(group, priced, selection.portionSizeId));
    }
    if (groups.some((group) => group.required && !byGroup.get(group.id)?.length)) throw new ApiError(400, 'REQUIRED_GROUP_MISSING', 'Every required group must be satisfied in every combination.');
    selections.sort((a, b) => a.groupId.localeCompare(b.groupId) || a.optionId.localeCompare(b.optionId));
    // Portion is part of the cooked unit's identity; unportioned selections keep their historical two-part key.
    const key = createHash('sha256').update(JSON.stringify(selections.map(({ groupId, optionId, portionSizeId }) => portionSizeId ? [groupId, optionId, portionSizeId] : [groupId, optionId]))).digest('hex');
    const unitPriceMinor = checkedMoney(selections.reduce((total, selection) => total + BigInt(selection.priceMinor), BigInt(basePriceMinor)));
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += combination.quantity;
      existing.totalMinor = checkedMoney(BigInt(existing.quantity) * BigInt(unitPriceMinor));
    } else {
      merged.set(key, { canonicalKey: key, quantity: combination.quantity, unitPriceMinor,
        totalMinor: checkedMoney(BigInt(combination.quantity) * BigInt(unitPriceMinor)), selections });
    }
  }
  return [...merged.values()].sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey));
}
