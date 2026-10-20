import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import type { Grade } from '../src/import/planilha';

export function abasDoArquivo(caminho: string): Record<string, Grade> {
  const wb = XLSX.read(readFileSync(caminho), { type: 'buffer' });
  const abas: Record<string, Grade> = {};
  for (const n of wb.SheetNames) abas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
  return abas;
}
