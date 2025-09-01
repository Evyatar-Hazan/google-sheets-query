import * as XLSX from 'xlsx';

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export async function parseXlsxFile(file: File): Promise<ParsedSheet> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const json: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  });

  const headers = extractHeaders(worksheet, json);
  const rows: Record<string, string>[] = json.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h) => {
      const value = row[h];
      obj[h] = value == null ? '' : String(value);
    });
    return obj;
  });

  return { headers, rows };
}

function extractHeaders(
  worksheet: XLSX.WorkSheet,
  jsonRows: Record<string, any>[]
): string[] {
  if (jsonRows.length > 0) {
    return Object.keys(jsonRows[0]);
  }
  // Fallback: scan worksheet range
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = worksheet[cellAddress];
    headers.push(cell ? String(cell.v) : `Column ${c + 1}`);
  }
  return headers;
}

export function sortRows(
  rows: Record<string, string>[],
  column: string,
  direction: 'asc' | 'desc'
): Record<string, string>[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[column] ?? '';
    const bv = b[column] ?? '';
    const cmp = String(av).localeCompare(String(bv), 'he');
    return direction === 'asc' ? cmp : -cmp;
  });
  return copy;
}

export function areDatasetsEqual(
  a: Record<string, string>[],
  b: Record<string, string>[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ar = a[i];
    const br = b[i];
    const aKeys = Object.keys(ar);
    const bKeys = Object.keys(br);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if ((ar[k] ?? '') !== (br[k] ?? '')) return false;
    }
  }
  return true;
}

export function diffDatasets(
  a: Record<string, string>[],
  b: Record<string, string>[]
): { index: number; left?: Record<string, string>; right?: Record<string, string> }[] {
  const max = Math.max(a.length, b.length);
  const diffs: { index: number; left?: Record<string, string>; right?: Record<string, string> }[] = [];
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      diffs.push({ index: i, left, right });
      continue;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    let equal = true;
    keys.forEach((k) => {
      if (equal && (left[k] ?? '') !== (right[k] ?? '')) {
        equal = false;
      }
    });
    if (!equal) diffs.push({ index: i, left, right });
  }
  return diffs;
}

