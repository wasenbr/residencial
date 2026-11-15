// Relatório de avaliação física em PDF, gerado no aparelho (jsPDF, desenho vetorial).
// Carregado sob demanda: import('../pdf/relatorio').
import { jsPDF } from 'jspdf';
import {
  calcular, DOBRAS, f1, frase, medidasDe, NOME_DOBRA, PERIMETROS, PROTOCOLOS, type Classe, type Resultado,
} from '../shared/avaliacao';
import { escala } from '../shared/escala';
import type { Aluno, Avaliacao } from '../shared/tipos';

type RGB = [number, number, number];
const COR = {
  marca: [15, 110, 92] as RGB, marcaClara: [220, 235, 230] as RGB, gorda: [143, 54, 5] as RGB, azul: [47, 74, 115] as RGB,
  extra: [122, 92, 18] as RGB, texto: [27, 31, 29] as RGB, suave: [86, 93, 89] as RGB, linha: [226, 228, 223] as RGB, fundo: [246, 247, 244] as RGB,
};
const TOM: Record<Classe['tom'], RGB> = { ok: COR.marca, atencao: COR.extra, alerta: COR.gorda };
const W = 210, H = 297, M = 14, CW = W - 2 * M;

const data4 = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };
const data2 = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a.slice(2)}`; };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

type Item = { a: Avaliacao; r: Resultado };

export interface Relatorio { blob: Blob; nome: string }

/** Relatório da avaliação `avaliacaoId` (ou da última), com a evolução até ela. */
export function gerarRelatorio({ aluno, avaliacoes, avaliacaoId, academia }: {
  aluno: Aluno; avaliacoes: Avaliacao[]; avaliacaoId?: number; academia?: string;
}): Relatorio {
  const todas = [...avaliacoes].sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1));
  const iAtual = avaliacaoId != null ? todas.findIndex((a) => a.id === avaliacaoId) : todas.length - 1;
  if (iAtual < 0) throw new Error('Avaliação não encontrada.');
  const hist: Item[] = todas.slice(0, iAtual + 1).map((a) => ({ a, r: calcular(medidasDe(a)) }));
  const atual = hist[hist.length - 1], ant = hist.length > 1 ? hist[hist.length - 2] : null, pri = hist[0];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;
  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fonte = (tam: number, peso: 'normal' | 'bold' = 'normal', c: RGB = COR.texto) => { doc.setFont('helvetica', peso); doc.setFontSize(tam); cor(c); };
  const novaPagina = () => { doc.addPage(); y = M + 4; };
  const espaco = (h: number) => { if (y + h > H - 18) novaPagina(); };
  const titulo = (t: string, minimo = 14) => {
    if (y > 50) y += 3;
    espaco(minimo);
    fonte(12, 'bold', COR.marca); doc.text(t, M, y);
    doc.setDrawColor(...COR.marca); doc.setLineWidth(0.4); doc.line(M, y + 1.8, M + CW, y + 1.8);
    y += 7;
  };

  // ---------- Cabeçalho ----------
  doc.setFillColor(...COR.marca); doc.rect(0, 0, W, 34, 'F');
  fonte(8, 'bold', [200, 230, 220]); doc.text('RELATÓRIO DE AVALIAÇÃO FÍSICA', M, 11);
  fonte(18, 'bold', [255, 255, 255]); doc.text(doc.splitTextToSize(aluno.nome, 110)[0], M, 20);
  const sexo = atual.a.sexo === 'F' ? 'Feminino' : 'Masculino';
  fonte(9, 'normal', [230, 242, 238]); doc.text(`${atual.a.idade} anos · ${sexo}${atual.a.estatura ? ` · ${f1(atual.a.estatura, 0)} cm` : ''}`, M, 27);
  fonte(10, 'bold', [255, 255, 255]); if (academia) doc.text(academia, W - M, 12, { align: 'right' });
  fonte(9, 'normal', [230, 242, 238]);
  doc.text(`Avaliação de ${data4(atual.a.data)}`, W - M, 19, { align: 'right' });
  if (atual.a.avaliador) doc.text(`Avaliado por ${atual.a.avaliador}`, W - M, 25, { align: 'right' });
  doc.text(`${hist.length}ª avaliação`, W - M, 31, { align: 'right' });
  y = 44;

  // ---------- Resultado atual ----------
  titulo('Resultado atual');
  type Kpi = { rot: string; v: number | null; un: string; du?: string; bom: 1 | -1 | 0; antes: number | null | undefined; classe?: Classe };
  const kpis = ([
    { rot: 'Peso', v: atual.a.peso, un: ' kg', bom: 0, antes: ant?.a.peso },
    { rot: '% de gordura', v: atual.r.gordura, un: '%', du: ' p.p.', bom: -1, antes: ant?.r.gordura, classe: atual.r.classes.gordura },
    { rot: 'Massa magra', v: atual.r.massaMagra, un: ' kg', bom: 1, antes: ant?.r.massaMagra },
    { rot: 'Massa gorda', v: atual.r.massaGorda, un: ' kg', bom: -1, antes: ant?.r.massaGorda },
    { rot: 'IMC', v: atual.r.imc, un: '', bom: 0, antes: ant?.r.imc, classe: atual.r.classes.imc },
    { rot: 'Cintura', v: atual.a.perimetros.cintura ?? null, un: ' cm', bom: -1, antes: ant?.a.perimetros.cintura, classe: atual.r.classes.cintura },
  ] as Kpi[]).filter((k) => k.v != null);
  const kw = (CW - 2 * 4) / 3, kh = 23;
  kpis.forEach((k, i) => {
    const x = M + (i % 3) * (kw + 4), yy = y + Math.floor(i / 3) * (kh + 4);
    doc.setFillColor(...COR.fundo); doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.roundedRect(x, yy, kw, kh, 2, 2, 'FD');
    fonte(8, 'normal', COR.suave); doc.text(k.rot, x + 4, yy + 5.5);
    fonte(16, 'bold'); doc.text(f1(k.v), x + 4, yy + 13);
    const largV = doc.getTextWidth(f1(k.v));
    fonte(9, 'bold', COR.suave); doc.text(k.un.trim(), x + 5 + largV, yy + 13);
    let linha = '';
    if (k.classe) { fonte(8, 'bold', TOM[k.classe.tom]); doc.text(k.classe.rotulo, x + 4, yy + 19); linha = k.classe.rotulo; }
    if (k.antes != null && k.v != null) {
      const d = k.v - k.antes;
      const txt = Math.abs(d) < 0.05 ? 'igual' : `${d > 0 ? '+' : '-'}${f1(Math.abs(d))}${k.du ?? k.un}`;
      const c = k.bom === 0 || Math.abs(d) < 0.05 ? COR.suave : (d > 0) === (k.bom === 1) ? COR.marca : COR.gorda;
      fonte(8, 'bold', c);
      const xx = linha ? x + 4 + doc.getTextWidth(linha) + 4 : x + 4;
      doc.text(`${txt}`, xx, yy + 19);
      fonte(7, 'normal', COR.suave); doc.text('vs. anterior', xx + doc.getTextWidth(txt) * (8 / 7) + 2, yy + 19);
    }
  });
  y += Math.ceil(kpis.length / 3) * (kh + 4) + 2;

  // ---------- Resumo da evolução ----------
  const frases: string[] = [];
  const temMassas = (it: Item) => it.r.massaGorda != null && it.r.massaMagra != null;
  if (ant && temMassas(ant) && temMassas(atual)) frases.push(`Desde a avaliação anterior (${data4(ant.a.data)}), você ${frase(atual.r.massaGorda! - ant.r.massaGorda!, 'de gordura')} e ${frase(atual.r.massaMagra! - ant.r.massaMagra!, 'de massa magra')}.`);
  if (pri !== ant && pri !== atual && temMassas(pri) && temMassas(atual)) frases.push(`Desde a primeira avaliação (${data4(pri.a.data)}), você ${frase(atual.r.massaGorda! - pri.r.massaGorda!, 'de gordura')} e ${frase(atual.r.massaMagra! - pri.r.massaMagra!, 'de massa magra')}.`);
  if (atual.r.pesoMaximo != null && atual.r.objetivo != null) {
    frases.push(atual.r.objetivo < 0.05
      ? `Seu peso está dentro da meta para ${atual.r.alvo}% de gordura (até ${f1(atual.r.pesoMaximo)} kg).`
      : `Meta: com ${atual.r.alvo}% de gordura, o peso máximo recomendável é ${f1(atual.r.pesoMaximo)} kg, ou seja, reduzir cerca de ${f1(atual.r.objetivo)} kg de gordura preservando a massa magra.`);
  }
  if (frases.length) {
    fonte(9.5, 'normal');
    const linhas = frases.flatMap((t) => doc.splitTextToSize(t, CW - 10) as string[]);
    const h = linhas.length * 4.6 + 7;
    espaco(h + 4);
    doc.setFillColor(...COR.marcaClara); doc.roundedRect(M, y, CW, h, 2, 2, 'F');
    fonte(9.5, 'normal', [11, 90, 75]); doc.text(linhas, M + 5, y + 6.2, { lineHeightFactor: 1.4 });
    y += h + 6;
  }

  // ---------- Gráficos ----------
  const graficos: { titulo: string; un: string; series: { nome: string; cor: RGB; valores: (number | null)[]; tracejada?: boolean }[] }[] = [
    { titulo: 'Composição corporal (kg)', un: 'kg', series: [
      { nome: 'Massa magra', cor: COR.marca, valores: hist.map((i) => i.r.massaMagra) },
      { nome: 'Massa gorda', cor: COR.gorda, valores: hist.map((i) => i.r.massaGorda) }] },
    { titulo: '% de gordura', un: '%', series: [{ nome: '% de gordura', cor: COR.gorda, valores: hist.map((i) => i.r.gordura) }] },
    { titulo: 'Peso (kg)', un: 'kg', series: [
      { nome: 'Peso', cor: COR.azul, valores: hist.map((i) => i.a.peso) },
      { nome: 'Peso máximo recomendável', cor: COR.azul, tracejada: true, valores: hist.map((i) => i.r.pesoMaximo) }] },
    { titulo: 'Perímetros (cm)', un: 'cm', series: [
      { nome: 'Cintura', cor: COR.gorda, valores: hist.map((i) => i.a.perimetros.cintura ?? null) },
      { nome: 'Abdômen', cor: COR.extra, valores: hist.map((i) => i.a.perimetros.abdomen ?? null) },
      { nome: 'Quadril', cor: COR.azul, valores: hist.map((i) => i.a.perimetros.quadril ?? null) }].filter((s) => s.valores.some((v) => v != null)) },
  ].filter((g) => g.series.some((s) => s.valores.filter((v) => v != null).length >= 1));

  if (hist.length > 1 && graficos.length) {
    titulo('Sua evolução');
    const gw = (CW - 6) / 2, gh = 56;
    graficos.forEach((g, i) => {
      if (i % 2 === 0) espaco(gh + 4);
      const x = M + (i % 2) * (gw + 6);
      grafico(doc, x, y, gw, gh, g.titulo, hist.map((h) => h.a.data), g.series);
      if (i % 2 === 1 || i === graficos.length - 1) y += gh + 6;
    });
  } else if (hist.length === 1) {
    fonte(9, 'normal', COR.suave); espaco(8);
    doc.text('Os gráficos de evolução aparecem a partir da segunda avaliação.', M, y); y += 8;
  }

  // ---------- Histórico ----------
  if (hist.length > 1) {
    titulo('Histórico das avaliações', Math.min(hist.length, 10) * 6.4 + 16);
    const ult = hist.slice(-10);
    tabela(doc, () => y, (v) => (y = v), espaco, [
      { t: 'Data', w: 24 }, { t: 'Peso', w: 20, d: true }, { t: '% gordura', w: 22, d: true }, { t: 'M. magra', w: 22, d: true },
      { t: 'M. gorda', w: 22, d: true }, { t: 'IMC', w: 18, d: true }, { t: 'Cintura', w: 22, d: true }, { t: 'Soma 7 dobras', w: CW - 150, d: true },
    ], ult.map(({ a, r }) => [data2(a.data), f1(a.peso), f1(r.gordura), f1(r.massaMagra), f1(r.massaGorda), f1(r.imc), f1(a.perimetros.cintura), f1(r.soma7)]),
    ult.length - 1);
    y += 4;
  }

  // ---------- Medidas: dobras e perímetros (1ª, anterior, atual) ----------
  const colunas: Item[] = [pri, ant, atual].filter((x, i, arr): x is Item => !!x && arr.indexOf(x) === i);
  const cab = colunas.map((c) => (c === atual ? 'Atual' : data2(c.a.data)));
  const dobrasUsadas = DOBRAS.filter((d) => colunas.some((c) => c.r.medias[d] != null));
  const linhasDobras = dobrasUsadas.map((d) => [NOME_DOBRA[d], ...colunas.map((c) => f1(c.r.medias[d]))]);
  if (dobrasUsadas.length && colunas.some((c) => c.r.soma7 != null)) linhasDobras.push(['Soma das 7', ...colunas.map((c) => f1(c.r.soma7))]);
  const perimUsados = PERIMETROS.filter(([k]) => colunas.some((c) => c.a.perimetros[k] != null));
  const linhasPerim = perimUsados.map(([k, nome]) => [nome, ...colunas.map((c) => f1(c.a.perimetros[k]))]);
  const blocos = [
    { t: 'Dobras cutâneas (mm)', primeira: 'Ponto', linhas: linhasDobras },
    { t: 'Perímetros (cm)', primeira: 'Local', linhas: linhasPerim },
  ].filter((b) => b.linhas.length);
  if (blocos.length) {
    // Lado a lado quando os dois existem; cada um com nome + uma coluna por avaliação.
    const bw = blocos.length === 2 ? (CW - 8) / 2 : CW;
    const altura = Math.max(...blocos.map((b) => b.linhas.length)) * 6.4 + 16;
    espaco(altura);
    const y0 = y + (y > 50 ? 3 : 0);
    let yFim = y0;
    blocos.forEach((b, i) => {
      const x = M + i * (bw + 8);
      y = y0;
      fonte(12, 'bold', COR.marca); doc.text(b.t, x, y);
      doc.setDrawColor(...COR.marca); doc.setLineWidth(0.4); doc.line(x, y + 1.8, x + bw, y + 1.8);
      y += 4;
      const wc = Math.min(24, (bw - 34) / colunas.length);
      tabela(doc, () => y, (v) => (y = v), espaco, [{ t: b.primeira, w: bw - wc * colunas.length }, ...cab.map((t) => ({ t, w: wc, d: true }))], b.linhas, -1, colunas.length, x, bw);
      yFim = Math.max(yFim, y);
    });
    y = yFim + 4;
  }

  // ---------- Indicadores de saúde ----------
  const ind: string[][] = [];
  const r = atual.r, a = atual.a;
  if (r.gordura != null) ind.push(['% de gordura', `${f1(r.gordura)}%`, r.classes.gordura?.rotulo ?? '']);
  if (r.imc != null) ind.push(['Índice de massa corporal (IMC)', f1(r.imc), r.classes.imc?.rotulo ?? '']);
  if (a.perimetros.cintura) ind.push(['Circunferência da cintura', `${f1(a.perimetros.cintura)} cm`, r.classes.cintura?.rotulo ?? '']);
  if (r.rcq != null) ind.push(['Relação cintura-quadril', f1(r.rcq, 2), r.classes.rcq?.rotulo ?? '']);
  if (r.rce != null) ind.push(['Relação cintura-estatura', f1(r.rce, 2), r.classes.rce?.rotulo ?? '']);
  if (r.classes.pressao) ind.push(['Pressão arterial', `${a.pa_sistolica}/${a.pa_diastolica} mmHg`, r.classes.pressao.rotulo]);
  if (a.fc_repouso) ind.push(['Frequência cardíaca de repouso', `${a.fc_repouso} bpm`, '']);
  if (r.densidade != null) ind.push(['Densidade corporal', `${f1(r.densidade, 4)} g/ml`, '']);
  if (ind.length) {
    titulo('Indicadores', ind.length * 6.4 + 16);
    tabela(doc, () => y, (v) => (y = v), espaco, [{ t: 'Indicador', w: 82 }, { t: 'Valor', w: 40, d: true }, { t: 'Classificação', w: CW - 122, tom: (l) => classeDe(l, r) }], ind);
    y += 4;
  }

  // ---------- Laudo ----------
  if (a.laudo) {
    titulo('Laudo', 24);
    fonte(9.5, 'normal');
    for (const linha of doc.splitTextToSize(a.laudo, CW) as string[]) { espaco(5); doc.text(linha, M, y); y += 4.8; }
  }

  // ---------- Rodapé ----------
  const p = PROTOCOLOS[a.protocolo];
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
    fonte(7, 'normal', COR.suave);
    doc.text(doc.splitTextToSize(`Composição corporal estimada por dobras cutâneas: ${p.nome} (${p.fonte}); % de gordura pela equação de Siri. Classificações: ACE (% de gordura), OMS (IMC, cintura, cintura-quadril), Diretriz Brasileira de Hipertensão 2020. Os valores são estimativas e não substituem avaliação médica.`, CW - 22), M, H - 10.5);
    doc.text(`${i}/${total}`, W - M, H - 10.5, { align: 'right' });
  }

  return { blob: doc.output('blob'), nome: `Avaliacao-${semAcento(aluno.nome)}-${atual.a.data}.pdf` };
}

/** Classificação de uma linha de indicador, para colorir. */
function classeDe(l: string[], r: Resultado): Classe | undefined {
  const mapa: Record<string, Classe | undefined> = {
    '% de gordura': r.classes.gordura, 'Índice de massa corporal (IMC)': r.classes.imc, 'Circunferência da cintura': r.classes.cintura,
    'Relação cintura-quadril': r.classes.rcq, 'Relação cintura-estatura': r.classes.rce, 'Pressão arterial': r.classes.pressao,
  };
  return mapa[l[0]];
}

interface Coluna { t: string; w: number; d?: boolean; tom?: (linha: string[]) => Classe | undefined }

/** Tabela simples: cabeçalho cinza, linhas com divisória. `destaque`: linha em negrito; `colsAtual` > 0: última coluna (avaliação atual) em negrito. */
function tabela(doc: jsPDF, getY: () => number, setY: (v: number) => void, espaco: (h: number) => void, cols: Coluna[], linhas: string[][], destaque = -1, colsAtual = 0, x0 = M, largura = CW) {
  const lh = 6.4;
  const cabecalho = () => {
    let x = x0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...COR.suave);
    for (const c of cols) { doc.text(c.t.toUpperCase(), c.d ? x + c.w - 2 : x + 2, getY() + 4, { align: c.d ? 'right' : 'left' }); x += c.w; }
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.3); doc.line(x0, getY() + 6, x0 + largura, getY() + 6);
    setY(getY() + 6);
  };
  espaco(lh * 2 + 6);
  cabecalho();
  linhas.forEach((l, i) => {
    if (getY() + lh > H - 18) { doc.addPage(); setY(M + 4); cabecalho(); }
    let x = x0;
    const yy = getY();
    cols.forEach((c, j) => {
      const negrito = i === destaque || (colsAtual > 0 && j === cols.length - 1);
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(9);
      const tom = c.tom?.(l);
      doc.setTextColor(...(tom ? TOM[tom.tom] : COR.texto));
      if (tom) doc.setFont('helvetica', 'bold');
      doc.text(l[j] ?? '', c.d ? x + c.w - 2 : x + 2, yy + 4.5, { align: c.d ? 'right' : 'left' });
      x += c.w;
    });
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.15); doc.line(x0, yy + lh, x0 + largura, yy + lh);
    setY(yy + lh);
  });
}

/** Gráfico de linhas com eixo de tempo real (avaliações não são mensais). */
function grafico(doc: jsPDF, x0: number, y0: number, w: number, h: number, titulo: string, datas: string[],
  series: { nome: string; cor: RGB; valores: (number | null)[]; tracejada?: boolean }[]) {
  doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.setFillColor(255, 255, 255); doc.roundedRect(x0, y0, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...COR.texto); doc.text(titulo, x0 + 4, y0 + 6);
  // Legenda
  let lx = x0 + 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...COR.suave);
  if (series.length > 1) for (const s of series) {
    doc.setDrawColor(...s.cor); doc.setLineWidth(0.8);
    if (s.tracejada) doc.setLineDashPattern([1, 0.8], 0);
    doc.line(lx, y0 + 10.2, lx + 4, y0 + 10.2); doc.setLineDashPattern([], 0);
    doc.text(s.nome, lx + 5.5, y0 + 11); lx += 5.5 + doc.getTextWidth(s.nome) + 4;
  }
  const L = 12, R = 5, T = series.length > 1 ? 15 : 11, B = 8;
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v != null);
  const min = Math.min(...todos), max = Math.max(...todos);
  const folga = (max - min) * 0.15 || Math.max(1, max * 0.05);
  const { lo, hi, ticks } = escala(max + folga, Math.max(0, min - folga));
  const tempos = datas.map((d) => Date.parse(d));
  const t0 = tempos[0], t1 = tempos[tempos.length - 1];
  const px = (i: number) => (t1 === t0 ? x0 + w / 2 : x0 + L + ((w - L - R) * (tempos[i] - t0)) / (t1 - t0));
  const py = (v: number) => y0 + T + (h - T - B) * (1 - (v - lo) / (hi - lo));
  doc.setFontSize(6.5);
  for (const t of ticks) {
    doc.setDrawColor(238, 240, 236); doc.setLineWidth(0.15); doc.line(x0 + L, py(t), x0 + w - R, py(t));
    doc.setTextColor(...COR.suave); doc.text(f1(t, Number.isInteger(t) ? 0 : 1), x0 + L - 1.5, py(t) + 1, { align: 'right' });
  }
  // Datas sem sobrepor
  let ultimoX = -99;
  datas.forEach((d, i) => {
    const xx = px(i);
    if (xx - ultimoX < 12 && i !== datas.length - 1) return;
    doc.text(data2(d), xx, y0 + h - 2.5, { align: 'center' }); ultimoX = xx;
  });
  for (const s of series) {
    doc.setDrawColor(...s.cor); doc.setLineWidth(0.7);
    if (s.tracejada) doc.setLineDashPattern([1.2, 1], 0);
    let ant: [number, number] | null = null;
    s.valores.forEach((v, i) => {
      if (v == null) return;
      const p: [number, number] = [px(i), py(v)];
      if (ant) doc.line(ant[0], ant[1], p[0], p[1]);
      ant = p;
    });
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...s.cor);
    if (!s.tracejada) s.valores.forEach((v, i) => { if (v != null) doc.circle(px(i), py(v), 0.8, 'F'); });
    // Valor do último ponto
    const iu = s.valores.map((v) => v != null).lastIndexOf(true);
    if (iu >= 0 && !s.tracejada) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...s.cor);
      doc.text(f1(s.valores[iu]), px(iu) - 1, py(s.valores[iu]!) - 1.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    }
  }
}
