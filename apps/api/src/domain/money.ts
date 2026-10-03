import { ApiError } from '../common/api-error';

export const MAX_MINOR = 2_147_483_647;

export function assertMinor(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_MINOR) throw new ApiError(400, 'MONEY_INVALID', 'Money must be a non-negative whole number of cents within the supported range.');
}

export function roundDerivedMinor(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new ApiError(400, 'PRICE_RULE_INVALID', 'A derived price requires a non-negative numerator and a positive denominator.');
  const divisor = 5n * denominator;
  const amount = 5n * ((numerator + divisor - 1n) / divisor);
  if (amount > BigInt(MAX_MINOR)) throw new ApiError(400, 'PRICE_OVERFLOW', 'This derived price exceeds the supported money range.');
  return Number(amount);
}
