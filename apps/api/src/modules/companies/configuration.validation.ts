import { domainToASCII } from 'node:url';
import { ApiError } from '../../common/api-error';

export function requiredString(value: string | null | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new ApiError(400, 'VALIDATION_FAILED', `${field} is required.`, { [field]: ['Enter a value.'] });
  return value;
}

export function rejectUnexpectedNulls(value: object, nullableFields: string[] = []): void {
  for (const [field, entry] of Object.entries(value)) {
    if (entry === null && !nullableFields.includes(field)) throw new ApiError(400, 'VALIDATION_FAILED', `${field} cannot be null.`);
  }
}

export function normalizeCompanyDomain(value: string): string {
  const domain = domainToASCII(value.trim().toLowerCase());
  const labels = domain.split('.');
  if (!domain || domain.length > 253 || labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^\d+$/.test(labels.at(-1)!)) {
    throw new ApiError(400, 'INVALID_COMPANY_DOMAIN', 'Enter a domain such as company.example without a scheme, path or email address.');
  }
  return domain;
}

export function requiredVersion(value: number | undefined): number {
  if (!Number.isInteger(value) || value! < 1) throw new ApiError(400, 'VERSION_REQUIRED', 'Send the version shown by the latest read.');
  return value!;
}
