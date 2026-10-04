import type { EmployeeImportResult, EmployeeImportRowResult } from '@fernleaf/contracts';
import { isEmail } from 'class-validator';
import { ApiError } from '../../common/api-error';
import { CsvError, parseCsv } from '../../domain/csv';

export const MAX_IMPORT_ROWS = 2000;
const COLUMNS = ['name', 'email', 'phone', 'can_choose_address', 'can_change_time', 'can_change_packaging', 'allergens', 'dietary_tags'] as const;
type Column = (typeof COLUMNS)[number];
const FLAGS: Record<string, boolean> = { true: true, yes: true, y: true, '1': true, false: false, no: false, n: false, '0': false, '': false };

export interface ImportCandidate {
  line: number; name: string; email: string; phone: string | null;
  canChooseAddress: boolean; canChangeTime: boolean; canChangePackaging: boolean;
  allergenIds: string[]; dietaryTagIds: string[];
}
export interface ImportReferences { allergens: Map<string, string>; dietaryTags: Map<string, string>; existingEmails: Set<string> }

/**
 * Validate every data row independently. A bad row is reported with all of its problems and never blocks the good rows;
 * only a file that cannot be read as a table at all (no header, unknown/missing columns, unclosed quote, too many rows)
 * is rejected as a whole, because then no row can be interpreted reliably.
 */
export function planEmployeeImport(csv: string, references: ImportReferences): { candidates: ImportCandidate[]; rows: EmployeeImportRowResult[] } {
  let records;
  try { records = parseCsv(csv); }
  catch (error) { if (error instanceof CsvError) throw new ApiError(400, 'CSV_UNREADABLE', `Line ${error.line}: ${error.message}`); throw error; }
  if (!records.length) throw new ApiError(400, 'CSV_EMPTY', 'The file is empty. Include a header row such as: name,email,phone');
  const header = records[0].cells.map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const unknown = header.filter((cell) => !(COLUMNS as readonly string[]).includes(cell));
  if (unknown.length) throw new ApiError(400, 'CSV_COLUMNS_INVALID', `Unknown column(s): ${unknown.join(', ')}. Allowed columns: ${COLUMNS.join(', ')}.`);
  if (new Set(header).size !== header.length) throw new ApiError(400, 'CSV_COLUMNS_INVALID', 'Each column may appear only once in the header.');
  if (!header.includes('name') || !header.includes('email')) throw new ApiError(400, 'CSV_COLUMNS_INVALID', 'The header must include name and email columns.');
  const data = records.slice(1);
  if (!data.length) throw new ApiError(400, 'CSV_EMPTY', 'The file has a header but no employee rows.');
  if (data.length > MAX_IMPORT_ROWS) throw new ApiError(400, 'CSV_TOO_LARGE', `Import at most ${MAX_IMPORT_ROWS} employees per file.`);

  const seen = new Map<string, number>();
  const candidates: ImportCandidate[] = [], rows: EmployeeImportRowResult[] = [];
  for (const record of data) {
    const errors: string[] = [];
    const value = (column: Column) => { const at = header.indexOf(column); return at < 0 ? '' : (record.cells[at] ?? '').trim(); };
    if (record.cells.length > header.length) errors.push(`Row has ${record.cells.length} values but the header has ${header.length} columns.`);
    const name = value('name'), email = value('email').toLowerCase(), phone = value('phone');
    if (!name) errors.push('name is required.'); else if (name.length > 120) errors.push('name must be at most 120 characters.');
    if (!email) errors.push('email is required.');
    else if (email.length > 254 || !isEmail(email)) errors.push(`email "${email}" is not a valid email address.`);
    else if (references.existingEmails.has(email)) errors.push(`An employee with email ${email} already exists in this company.`);
    else if (seen.has(email)) errors.push(`email ${email} is repeated; it first appears on line ${seen.get(email)}.`);
    if (email && !seen.has(email)) seen.set(email, record.line);
    if (phone.length > 40) errors.push('phone must be at most 40 characters.');
    const flag = (column: Column, label: string) => {
      const raw = value(column).toLowerCase();
      if (!(raw in FLAGS)) { errors.push(`${label} must be true/false, yes/no or 1/0 (got "${value(column)}").`); return false; }
      return FLAGS[raw];
    };
    const canChooseAddress = flag('can_choose_address', 'can_choose_address');
    const canChangeTime = flag('can_change_time', 'can_change_time');
    const canChangePackaging = flag('can_change_packaging', 'can_change_packaging');
    const lookup = (column: Column, table: Map<string, string>, label: string) => {
      const names = value(column).split(';').map((entry) => entry.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const entry of names) {
        const id = table.get(entry.toLowerCase());
        if (!id) errors.push(`Unknown ${label} "${entry}". Use an active name from Reference lists.`);
        else if (!ids.includes(id)) ids.push(id);
      }
      return ids;
    };
    const allergenIds = lookup('allergens', references.allergens, 'allergen');
    const dietaryTagIds = lookup('dietary_tags', references.dietaryTags, 'dietary tag');
    if (errors.length) { rows.push({ line: record.line, status: 'ERROR', name, email, employeeId: null, errors }); continue; }
    candidates.push({ line: record.line, name, email, phone: phone || null, canChooseAddress, canChangeTime, canChangePackaging, allergenIds, dietaryTagIds });
    rows.push({ line: record.line, status: 'VALID', name, email, employeeId: null, errors: [] });
  }
  return { candidates, rows };
}

export function importSummary(companyId: string, dryRun: boolean, rows: EmployeeImportRowResult[]): EmployeeImportResult {
  return { companyId, dryRun, totalRows: rows.length, created: rows.filter((row) => row.status === 'CREATED').length,
    valid: rows.filter((row) => row.status !== 'ERROR').length, failed: rows.filter((row) => row.status === 'ERROR').length, rows };
}
