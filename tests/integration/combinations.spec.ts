import type { OrderLineInput, OrderSelectionSnapshot } from '@fernleaf/contracts';
import { quoteCombinations } from '../../apps/api/src/domain/combinations';
import { MAX_MINOR } from '../../apps/api/src/domain/money';
import { ApiError } from '../../apps/api/src/common/api-error';

const groupId = '70000000-0000-4000-8000-000000000001';
const brownId = '60000000-0000-4000-8000-000000000001';
const jeeraId = '60000000-0000-4000-8000-000000000002';
const option = (id: string, priceMinor: number): OrderSelectionSnapshot => ({
  groupId, groupName: 'Grain', optionId: id, optionName: id === brownId ? 'Brown rice' : 'Jeera rice',
  priceMinor, priceSource: 'EXPLICIT', tierId: '10000000-0000-4000-8000-000000000001', allergens: [], dietaryTags: [],
});
const groups = [{ id: groupId, required: true, options: [option(brownId, 80), option(jeeraId, 120)] }];
function input(): OrderLineInput {
  return { menuItemId: '80000000-0000-4000-8000-000000000001', quantity: 10, combinations: [
    { quantity: 6, selections: [{ groupId, optionId: brownId }] },
    { quantity: 4, selections: [{ groupId, optionId: jeeraId }] },
  ] };
}
function expectCode(operation: () => unknown, code: string) {
  try { operation(); throw new Error('Expected business validation to fail.'); }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).getResponse()).toMatchObject({ code });
  }
}

describe('Exact order combination arithmetic and validation', () => {
  it('reconciles six $8.80 and four $9.20 meals to $89.60 without floating point', () => {
    const result = quoteCombinations(input(), 1, 800, groups, 1);
    expect(result.map(({ quantity, unitPriceMinor }) => ({ quantity, unitPriceMinor })))
      .toEqual(expect.arrayContaining([{ quantity: 6, unitPriceMinor: 880 }, { quantity: 4, unitPriceMinor: 920 }]));
    expect(result.reduce((total, combination) => total + combination.totalMinor, 0)).toBe(8960);
  });

  it('merges equal canonical combinations and produces stable keys regardless of row order', () => {
    const line = input();
    line.combinations = [
      { quantity: 3, selections: [{ groupId, optionId: brownId }] },
      { quantity: 3, selections: [{ groupId, optionId: brownId }] },
      { quantity: 4, selections: [{ groupId, optionId: jeeraId }] },
    ];
    const quote = quoteCombinations(line, 1, 800, groups, 1);
    expect(quote).toHaveLength(2);
    expect(quote).toEqual(quoteCombinations({ ...line, combinations: [...line.combinations].reverse() }, 1, 800, groups, 1));
  });

  it.each([0, -1, 1.5, 100001])('rejects invalid line quantity %s', (quantity) => {
    expectCode(() => quoteCombinations({ ...input(), quantity }, 1, 800, groups, 1), 'LINE_QUANTITY_INVALID');
  });
  it.each([0, -2, 2.5])('rejects invalid combination quantity %s', (quantity) => {
    const line = input(); line.combinations[0].quantity = quantity;
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'COMBINATION_QUANTITY_INVALID');
  });
  it('requires the quantity sum and minimum dish quantity', () => {
    expectCode(() => quoteCombinations({ ...input(), quantity: 11 }, 1, 800, groups, 1), 'COMBINATION_SUM_INVALID');
    expectCode(() => quoteCombinations(input(), 11, 800, groups, 1), 'LINE_QUANTITY_INVALID');
  });
  it('requires groups in every combination, not just one of them', () => {
    const line = input(); line.combinations[1].selections = [];
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'REQUIRED_GROUP_MISSING');
  });
  it('rejects foreign groups/options and duplicate selections', () => {
    const line = input(); line.combinations[0].selections[0].groupId = 'foreign-group';
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'SELECTION_INVALID');
    line.combinations[0].selections = [{ groupId, optionId: 'foreign-option' }];
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'SELECTION_INVALID');
    line.combinations[0].selections = [{ groupId, optionId: brownId }, { groupId, optionId: brownId }];
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'SELECTION_DUPLICATE');
  });
  it('enforces the supplied single-selection cardinality and permits an empty optional group', () => {
    const line = input(); line.combinations[0].selections.push({ groupId, optionId: jeeraId });
    expectCode(() => quoteCombinations(line, 1, 800, groups, 1), 'GROUP_CARDINALITY_INVALID');
    const optional = [{ ...groups[0], required: false }];
    const empty = { ...input(), combinations: [{ quantity: 10, selections: [] }] };
    expect(quoteCombinations(empty, 1, 800, optional, 1)[0].totalMinor).toBe(8000);
  });
  it('rejects unit-price and multiplied-total overflow before persisting money', () => {
    expectCode(() => quoteCombinations(input(), 1, MAX_MINOR, groups, 1), 'ORDER_TOTAL_OVERFLOW');
    const line = { ...input(), quantity: 2, combinations: [{ quantity: 2, selections: [] }] };
    expectCode(() => quoteCombinations(line, 1, MAX_MINOR, [], 1), 'ORDER_TOTAL_OVERFLOW');
  });
});
