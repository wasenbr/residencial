// Competência = mês de referência no formato 'AAAA-MM'.

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function compAtual(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function somarMeses(comp: string, n: number): string {
  const [a, m] = comp.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diffMeses(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function nomeComp(comp: string, curto = false): string {
  const [a, m] = comp.split('-').map(Number);
  const nome = MESES[m - 1] ?? '?';
  const cap = nome[0].toUpperCase() + nome.slice(1);
  return curto ? cap : `${cap} ${a}`;
}

export function validaComp(comp: unknown): comp is string {
  return typeof comp === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(comp);
}

export function compDeData(data: string): string {
  return data.slice(0, 7);
}

/** Tenta achar o mês no nome do arquivo, ex.: "Fechamento março 2026 .xlsx". */
export function compDeTexto(texto: string): string | null {
  const iso = texto.match(/(20\d{2})[-_/.](0[1-9]|1[0-2])(?!\d)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const semAcento = MESES.map((m) => m.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const ano = t.match(/(20\d{2})/)?.[1];
  for (let i = 0; i < semAcento.length; i++) {
    if (t.includes(semAcento[i]) || t.includes(semAcento[i].slice(0, 3) + ' ') || t.includes(semAcento[i].slice(0, 3) + '/')) {
      if (ano) return `${ano}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  const num = t.match(/(0[1-9]|1[0-2])[-_/.](20\d{2})/);
  if (num) return `${num[2]}-${num[1]}`;
  return null;
}
