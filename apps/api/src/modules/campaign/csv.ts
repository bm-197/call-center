import { AppError } from '../../common/middleware/error-handler.js';

export type CsvRow = Record<string, string>;

const TRUTHY_CONSENT = new Set(['yes', 'y', 'true', '1', 'opted_in', 'opt-in']);

export function parseCsv(input: string): CsvRow[] {
  const rows = parseCells(input.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => h.trim());
  if (headers.length === 0 || headers.some((h) => !h)) {
    throw new AppError(400, 'CSV header row is missing or invalid');
  }
  if (!headers.includes('phoneNumber')) {
    throw new AppError(400, 'CSV must include a phoneNumber column');
  }

  return rows
    .slice(1)
    .filter((cells) => cells.some((c) => c.trim()))
    .map((cells) => {
      const row: CsvRow = {};
      for (let i = 0; i < headers.length; i++) {
        row[headers[i]!] = (cells[i] ?? '').trim();
      }
      return row;
    });
}

export function hasExplicitConsent(value: string | undefined): boolean {
  return TRUTHY_CONSENT.has((value ?? '').trim().toLowerCase());
}

function parseCells(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const next = input[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      if (next === '\n') continue;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (quoted) throw new AppError(400, 'CSV contains an unclosed quoted field');
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
