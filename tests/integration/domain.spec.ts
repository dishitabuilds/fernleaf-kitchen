import { calculateCutoff, deadlinePassed, isDeliveryDateAllowed, kitchenDate, assertCalendar } from '../../apps/api/src/domain/calendar';
import { chooseTier, resolvePrice, assertAcyclicTiers, type TierRule } from '../../apps/api/src/domain/pricing';
import { assertMinor, roundDerivedMinor } from '../../apps/api/src/domain/money';

describe('Exact minor-unit price rules', () => {
  const tiers: TierRule[] = [
    { id: 'default', rule: 'MANUAL', numerator: 1, denominator: 1, referenceTierId: null },
    { id: 'company', rule: 'MANUAL', numerator: 1, denominator: 1, referenceTierId: null },
    { id: 'cost', rule: 'COST', numerator: 115, denominator: 100, referenceTierId: null },
    { id: 'reference', rule: 'REFERENCE', numerator: 120, denominator: 100, referenceTierId: 'default' },
  ];
  it('chooses company/default tier once and does not fill missing company prices from another tier', () => {
    expect(chooseTier(null, 'default')).toBe('default');
    expect(chooseTier('company', 'default')).toBe('company');
    expect(resolvePrice('company', 200, tiers, new Map([['default', 800]]))).toMatchObject({ amountMinor: null, source: 'MISSING' });
  });
  it('preserves explicit prices including zero and non-nickel overrides', () => {
    expect(resolvePrice('cost', 200, tiers, new Map([['cost', 211]]))).toMatchObject({ amountMinor: 211, source: 'EXPLICIT' });
    expect(resolvePrice('company', 200, tiers, new Map([['company', 0]]))).toMatchObject({ amountMinor: 0, source: 'EXPLICIT' });
  });
  it('derives from independent item costs and rounds using exact rational intermediates', () => {
    expect(resolvePrice('cost', 211, tiers, new Map())).toMatchObject({ amountMinor: 245, source: 'COST' });
    expect(roundDerivedMinor(211n, 1n)).toBe(215);
    expect(roundDerivedMinor(210n, 1n)).toBe(210);
    expect(roundDerivedMinor(21100n, 100n)).toBe(215);
    expect(roundDerivedMinor(0n, 100n)).toBe(0);
  });
  it('resolves reference chains or leaves them missing without another-tier fallback', () => {
    expect(resolvePrice('reference', 200, tiers, new Map([['default', 211]]))).toMatchObject({ amountMinor: 255, source: 'REFERENCE' });
    expect(resolvePrice('reference', 200, tiers, new Map())).toMatchObject({ amountMinor: null, source: 'MISSING' });
  });
  it('rejects cycles even where an explicit item override would mask the cycle', () => {
    const cycle: TierRule[] = [
      { id: 'a', rule: 'REFERENCE', numerator: 1, denominator: 1, referenceTierId: 'b' },
      { id: 'b', rule: 'REFERENCE', numerator: 1, denominator: 1, referenceTierId: 'a' },
    ];
    expect(() => resolvePrice('a', 200, cycle, new Map([['a', 100]]))).toThrow('cycle');
    expect(() => assertAcyclicTiers([{ ...cycle[0], referenceTierId: 'a' }])).toThrow('cycle');
  });
  it('rejects money fractions, negatives, overflow and invalid derivations', () => {
    for (const amount of [-1, 2.11, Number.NaN, 2_147_483_648]) expect(() => assertMinor(amount)).toThrow();
    expect(() => roundDerivedMinor(2_147_483_647n, 1n)).toThrow('range');
    expect(() => roundDerivedMinor(1n, 0n)).toThrow();
    expect(() => assertAcyclicTiers([{ ...tiers[2], denominator: 0 }])).toThrow();
    expect(() => assertAcyclicTiers([{ ...tiers[3], referenceTierId: 'absent' }])).toThrow();
  });
  it('handles large exact intermediates without binary floating-point price drift', () => {
    expect(roundDerivedMinor(211n * 1000000n, 1000000n)).toBe(215);
    expect(roundDerivedMinor(210n * 1000000n, 1000000n)).toBe(210);
  });
});

describe('Kitchen-local calendars and cutoff boundaries', () => {
  const weekdays = { workingDays: [1, 2, 3, 4, 5], holidays: [] as string[] };
  it('counts before delivery day across kitchen working days', () => {
    expect(calculateCutoff('2026-10-07', weekdays, 2, '16:00').toISOString()).toBe('2026-10-05T10:30:00.000Z');
    expect(calculateCutoff('2026-10-05', weekdays, 2, '16:00').toISOString()).toBe('2026-10-01T10:30:00.000Z');
  });
  it('skips a kitchen holiday and the weekend', () => {
    expect(calculateCutoff('2026-10-07', { ...weekdays, holidays: ['2026-10-05'] }, 2, '16:00').toISOString()).toBe('2026-10-02T10:30:00.000Z');
  });
  it('uses company holidays only for delivery eligibility', () => {
    const company = { ...weekdays, holidays: ['2026-10-07'] };
    expect(isDeliveryDateAllowed('2026-10-07', company)).toBe(false);
    expect(calculateCutoff('2026-10-07', weekdays, 2, '16:00').toISOString()).toBe('2026-10-05T10:30:00.000Z');
    expect(isDeliveryDateAllowed('2026-10-03', weekdays)).toBe(false);
    expect(isDeliveryDateAllowed('2026-10-03', { workingDays: [0,1,2,3,4,5,6], holidays: [] })).toBe(true);
  });
  it('zero days uses the delivery date and locks exactly at the cutoff instant', () => {
    const cutoff = calculateCutoff('2026-10-07', weekdays, 0, '16:00');
    expect(cutoff.toISOString()).toBe('2026-10-07T10:30:00.000Z');
    expect(deadlinePassed(new Date(cutoff.getTime() - 1), cutoff)).toBe(false);
    expect(deadlinePassed(cutoff, cutoff)).toBe(true);
  });
  it('computes today in Asia/Kolkata around UTC midnight, independent of server/browser zone', () => {
    expect(kitchenDate(new Date('2026-10-02T18:29:59Z'))).toBe('2026-10-02');
    expect(kitchenDate(new Date('2026-10-02T18:30:00Z'))).toBe('2026-10-03');
    expect(calculateCutoff('2026-10-07', weekdays, 2, '00:00').toISOString()).toBe('2026-10-04T18:30:00.000Z');
  });
  it('rejects impossible dates/times and unbounded or duplicate calendar input', () => {
    expect(() => calculateCutoff('2026-02-30', weekdays, 2, '16:00')).toThrow();
    expect(() => calculateCutoff('2026-10-07', weekdays, 2, '24:00')).toThrow();
    expect(() => calculateCutoff('2026-10-07', weekdays, 31, '16:00')).toThrow();
    expect(() => assertCalendar({ workingDays: [], holidays: [] })).toThrow();
    expect(() => assertCalendar({ workingDays: [1,1], holidays: [] })).toThrow();
    expect(() => assertCalendar({ workingDays: [1], holidays: ['2026-10-03','2026-10-03'] })).toThrow();
  });
});
