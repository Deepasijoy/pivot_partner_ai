import { readFileSync } from 'node:fs';

// Minimal RFC4180 CSV parser — handles quoted fields, embedded commas and
// newlines, and doubled-quote escaping. ESCO's CSV exports rely on exactly
// this quoting style (descriptions/altLabels routinely embed newlines), so a
// naive split-on-comma-or-newline parse silently corrupts row counts and
// field boundaries.
export function parseCsv(path) {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows[0];
  const records = rows
    .slice(1)
    .filter((r) => r.length > 1 || r[0] !== '')
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = r[idx] ?? '';
      });
      return obj;
    });
  return { header, records };
}
