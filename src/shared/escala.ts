/** Eixo de gráfico com passos "redondos" (1, 2, 2,5, 5, 10 × potência de 10). */
export function escala(max: number, min: number) {
  const span = max - min || 1;
  const passo = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const bases = [1, 2, 2.5, 5, 10].map((b) => b * passo);
  const p = bases.find((b) => span / b <= 5) ?? passo * 10;
  const lo = Math.floor(min / p) * p, hi = Math.ceil(max / p) * p;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + p / 2; v += p) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi: hi === lo ? lo + p : hi, ticks };
}
