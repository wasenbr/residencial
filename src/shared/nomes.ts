// Normalização de nomes para casar o mesmo aluno entre abas e meses.

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "Susete (mae felipe)" → "susete"; "Zeneide (20)" → "zeneide"; "Rejane 24" → "rejane". */
export function chaveNome(nome: string): string {
  return semAcento(nome)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+\d+\s*$/g, ' ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove anotações entre parênteses e números soltos no fim, mantendo acentos. */
export function nomeLimpo(nome: string): string {
  return nome.replace(/\(.*?\)/g, ' ').replace(/\s+\d+\s*$/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extrai responsável de nomes como "Laura 4 anos Suzani" ou "Luisa mae Luiza". */
export function separarResponsavel(nome: string): { nome: string; responsavel?: string; idade?: number } {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const anos = limpo.match(/^(.+?)\s+(\d{1,2})\s+anos?\s+(.+)$/i);
  if (anos) return { nome: anos[1], idade: Number(anos[2]), responsavel: anos[3] };
  const mae = limpo.match(/^(.+?)\s+m[aã]e\s+(.+)$/i);
  if (mae && !/^m[aã]e\b/i.test(limpo)) return { nome: mae[1], responsavel: mae[2] };
  const resp = limpo.match(/^(.+?)\s+resp\.?\s+(.+)$/i);
  if (resp) return { nome: resp[1], responsavel: resp[2] };
  return { nome: limpo };
}

export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Nomes parecidos o bastante para merecer conferência ("Susete" × "Suseti"). */
export function parecidos(a: string, b: string): boolean {
  const x = chaveNome(a), y = chaveNome(b);
  if (!x || !y || x === y) return x === y && !!x;
  const fx = x.replace(/s/g, 'z'), fy = y.replace(/s/g, 'z');
  if (fx === fy) return true;
  const lim = Math.min(x.length, y.length) >= 4 ? 1 : 0;
  return distancia(x, y) <= lim;
}
