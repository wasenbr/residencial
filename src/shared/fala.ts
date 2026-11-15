// Interpreta o que o avaliador dita no celular: números ("dezoito vírgula cinco", "18,5",
// "doze e meio") e comandos ("voltar", "pular").

export type Fala = { tipo: 'numero'; valor: number } | { tipo: 'voltar' } | { tipo: 'pular' } | { tipo: 'nada' };

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200,
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** "vinte e tres" → 23; "0" → 0; texto sem número → null. */
function inteiro(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  let total = 0, achou = false;
  for (const p of t.split(/\s+/)) {
    if (p === 'e') continue;
    if (!(p in UNIDADES)) return null;
    total += UNIDADES[p]; achou = true;
  }
  return achou ? total : null;
}

export function interpretarFala(texto: string): Fala {
  const t = norm(texto).replace(/[.!?]$/, '');
  if (/^(voltar|volta|anterior)$/.test(t)) return { tipo: 'voltar' };
  if (/^(pular|pula|proximo|proxima|seguinte)$/.test(t)) return { tipo: 'pular' };
  // Dígitos: "18,5", "18.5", "18 vírgula 5"
  const dig = t.replace(/\s*(virgula|ponto)\s*/g, ',').match(/^(\d+)(?:[,.](\d+))?(?:\s*(mm|cm|kg|milimetros?|centimetros?|quilos?))?$/);
  if (dig) return { tipo: 'numero', valor: Number(`${dig[1]}.${dig[2] ?? 0}`) };
  // Por extenso: "dezoito e meio", "dezoito virgula cinco", "vinte e tres"
  const semUn = t.replace(/\s+(mm|cm|kg|milimetros?|centimetros?|quilos?)$/, '');
  const meio = semUn.match(/^(.+?)\s+e\s+meio$/);
  if (meio) { const i = inteiro(meio[1]); if (i != null) return { tipo: 'numero', valor: i + 0.5 }; }
  const [a, b] = semUn.split(/\s*(?:virgula|ponto|,)\s*/);
  const i = inteiro(a);
  if (i == null) return { tipo: 'nada' };
  if (b == null) return { tipo: 'numero', valor: i };
  const dec = /^\d+$/.test(b) ? b : String(inteiro(b) ?? '');
  if (!dec) return { tipo: 'nada' };
  return { tipo: 'numero', valor: Number(`${i}.${dec}`) };
}
