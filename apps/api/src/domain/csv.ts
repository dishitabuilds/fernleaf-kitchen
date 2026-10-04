/** Minimal RFC 4180 reader: quoted fields, doubled quotes, embedded commas/newlines, CRLF or LF, optional UTF-8 BOM. */
export interface CsvRecord { line: number; cells: string[] }

export function parseCsv(text: string): CsvRecord[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [], cell = '', quoted = false, line = 1, recordLine = 1, index = 0;
  const endRecord = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== '')) records.push({ line: recordLine, cells });
    cells = []; cell = '';
  };
  while (index < input.length) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 2; continue; }
      if (char === '"') { quoted = false; index += 1; continue; }
      if (char === '\n') line += 1;
      cell += char; index += 1; continue;
    }
    if (char === '"' && cell === '') { quoted = true; index += 1; continue; }
    if (char === ',') { cells.push(cell); cell = ''; index += 1; continue; }
    if (char === '\r' || char === '\n') {
      endRecord();
      index += char === '\r' && input[index + 1] === '\n' ? 2 : 1;
      line += 1; recordLine = line; continue;
    }
    cell += char; index += 1;
  }
  if (quoted) throw new CsvError(recordLine, 'A quoted value is not closed.');
  if (cell !== '' || cells.length) endRecord();
  return records;
}

export class CsvError extends Error {
  constructor(readonly line: number, message: string) { super(message); }
}
