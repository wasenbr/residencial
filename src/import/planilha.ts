// Leitura da planilha mensal de fechamento ("Fechamento <mês> <ano>.xlsx").
//
// Cada aba de modalidade tem um ou mais blocos lado a lado (um por turma), com
// as colunas: Nº, nome, PAGAMENTO, formas de pagamento (dinheiro, gympass,
// débito, crédito, em ordem variável) e RECEBER/VALOR. A aba "Fechamento" tem
// os totais da planilha e as contas do mês. A aba "Alunos" é a tabela de preços.
//
// A função recebe as abas como grades de células, para não depender da
// biblioteca que leu o arquivo.

import type { Forma } from '../shared/tipos';
import { chaveNome, nomeLimpo, semAcento, separarResponsavel } from '../shared/nomes';

export type Celula = string | number | boolean | null | undefined;
export type Grade = Celula[][];

export interface PagamentoLido { forma: Forma; valor: number }

export interface LinhaLida {
  aba: string;
  celula: string;              // referência da linha na planilha, ex.: "Funcional!AD5"
  modalidade: string;
  turma: string;
  nomeOriginal: string;
  nome: string;
  chave: string;
  responsavel?: string;
  status: string;              // texto da coluna PAGAMENTO
  pago: boolean;
  devido: number;
  pagamentos: PagamentoLido[];
  contrato?: { mes: number; de: number };
  observacao?: string;
}

export interface TurmaLida { modalidade: string; nome: string; horario?: string; dias?: string }

export interface DespesaLida {
  descricao: string; valor: number; dia?: number; tipo: 'fixa' | 'pessoal'; celula: string;
}

export interface TotalPlanilha { modalidade: string; faturamento: number; recebido: number; alunos: number; faltou: number }

export interface Aviso { celula: string; texto: string }

export interface Leitura {
  modalidades: string[];
  turmas: TurmaLida[];
  linhas: LinhaLida[];
  despesas: DespesaLida[];
  totais: TotalPlanilha[];
  creditoAnterior: number;
  gympassAnterior: number;
  avisos: Aviso[];
}

const ABAS_MODALIDADE: Record<string, string> = {
  funcional: 'Funcional',
  zumba: 'Zumba',
  spinning: 'Spinning',
  bike: 'Spinning',
  personal: 'Personal',
  step: 'Step',
  ballet: 'Ballet',
  'danca sal': 'Dança de Salão',
  'danca de salao': 'Dança de Salão',
  danca: 'Dança de Salão',
};

const ABAS_IGNORADAS = new Set(['alunos', 'fechamento']);

/** Nomes das modalidades como aparecem na aba Fechamento e na aba Alunos. */
function modalidadeDeTexto(t: string): string | null {
  const k = semAcento(t).toLowerCase().trim();
  if (k.startsWith('ballet')) return 'Ballet';
  if (k.startsWith('danca')) return 'Dança de Salão';
  if (k.startsWith('spinning') || k.startsWith('bike')) return 'Spinning';
  for (const [chave, nome] of Object.entries(ABAS_MODALIDADE)) if (k === chave) return nome;
  return null;
}

export function colLetra(c: number): string {
  let s = '';
  c += 1;
  while (c > 0) {
    const r = (c - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}
const ref = (aba: string, r: number, c: number) => `${aba}!${colLetra(c)}${r + 1}`;

const texto = (v: Celula) => (v == null ? '' : String(v).trim());
const numero = (v: Celula): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^r\$\s*/i, '');
    if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  }
  return null;
};

function formaDoCabecalho(h: string): Forma | 'total' | null {
  const k = semAcento(h).toLowerCase().trim();
  if (!k) return null;
  if (/receber|valor/.test(k)) return 'total';
  if (/dinheiro/.test(k)) return 'dinheiro';
  if (/pix/.test(k)) return 'pix';
  if (/gym/.test(k)) return 'gympass';
  if (/deb|cart(ao)? d$/.test(k)) return 'debito';
  if (/cred|cart cre|^safra$/.test(k)) return 'credito';
  return null;
}

const ROTULO = /^(n[ãa]o preencher|total|valor total|alunos|dinheiro|gympass|cart|d[eé]bito|recebido|prof|academia|kids$|\d+\s*(vaga|quarta)|falta)/i;

function horarioDe(t: string): { horario?: string; dias?: string } {
  const h = t.match(/(\d{1,2})\s*[:.h]\s*(\d{2})/);
  const horario = h ? `${h[1].padStart(2, '0')}:${h[2]}` : undefined;
  const k = semAcento(t).toLowerCase();
  const dias: string[] = [];
  if (/seg/.test(k)) dias.push('seg');
  if (/ter/.test(k)) dias.push('ter');
  if (/qua/.test(k)) dias.push('qua');
  if (/qui/.test(k)) dias.push('qui');
  if (/sex/.test(k)) dias.push('sex');
  if (/sab/.test(k)) dias.push('sáb');
  return { horario, dias: dias.length ? dias.join(', ') : undefined };
}

interface Bloco {
  linhaCab: number; colPag: number; colNome: number;
  colFormas: { c: number; forma: Forma }[]; colTotal: number | null; titulo: string;
}

function acharBlocos(g: Grade): Bloco[] {
  const blocos: Bloco[] = [];
  for (let r = 0; r < Math.min(6, g.length); r++) {
    const row = g[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const h = semAcento(texto(row[c])).toLowerCase();
      if (h !== 'pagamento' && h !== 'forma') continue;
      if (c === 0) continue;
      const colFormas: Bloco['colFormas'] = [];
      let colTotal: number | null = null;
      for (let k = c + 1; k < c + 9; k++) {
        const f = formaDoCabecalho(texto(row[k]));
        if (f === 'total') { colTotal = k; break; }
        if (f) { colFormas.push({ c: k, forma: f }); continue; }
        // Cabeçalho vazio logo após as formas: é a coluna de total (aba Personal).
        if (!texto(row[k]) && colFormas.length > 0) {
          const temNumero = g.slice(r + 1, r + 15).some((l) => numero(l?.[k]) != null);
          if (temNumero) colTotal = k;
          break;
        }
      }
      let titulo = '';
      for (let rr = r - 1; rr >= 0 && !titulo; rr--) {
        for (let k = Math.max(0, c - 2); k <= c && !titulo; k++) {
          const t = texto(g[rr]?.[k]);
          if (t && !/^#/.test(t) && !/^(nº|n)$/i.test(t)) titulo = t;
        }
      }
      blocos.push({ linhaCab: r, colPag: c, colNome: c - 1, colFormas, colTotal, titulo });
    }
  }
  return blocos;
}

function lerPrecos(g: Grade | undefined): Map<string, number> {
  const precos = new Map<string, number>();
  if (!g) return precos;
  for (const row of g) {
    const nome = texto(row?.[1]);
    const mod = modalidadeDeTexto(texto(row?.[2]));
    const valor = numero(row?.[3]);
    if (!nome || !mod || valor == null || valor <= 0) continue;
    precos.set(`${mod}|${chaveNome(nome)}`, valor);
  }
  return precos;
}

function lerFechamento(g: Grade | undefined, aba: string) {
  const totais: TotalPlanilha[] = [];
  const despesas: DespesaLida[] = [];
  let creditoAnterior = 0, gympassAnterior = 0;
  if (!g) return { totais, despesas, creditoAnterior, gympassAnterior };

  // Totais por modalidade (colunas A..E, até "TOTAL GERAL").
  for (let r = 2; r < Math.min(g.length, 20); r++) {
    const nome = texto(g[r]?.[0]);
    if (/total geral/i.test(nome)) break;
    const mod = modalidadeDeTexto(nome);
    if (!mod) continue;
    totais.push({
      modalidade: mod,
      faturamento: numero(g[r]?.[1]) ?? 0,
      recebido: numero(g[r]?.[2]) ?? 0,
      alunos: numero(g[r]?.[3]) ?? 0,
      faltou: numero(g[r]?.[4]) ?? 0,
    });
  }

  for (let r = 0; r < g.length; r++) {
    const rot = semAcento(texto(g[r]?.[0])).toLowerCase();
    if (rot.startsWith('credito mes ant')) creditoAnterior = numero(g[r]?.[1]) ?? 0;
    if (rot.startsWith('gympass mes ant')) gympassAnterior = numero(g[r]?.[1]) ?? 0;
  }

  // Contas da academia: coluna com "Aluguel" e valores à direita, até "TOTAL".
  // A coluna A também tem uma linha "Aluguel" (no quadro de totais), então
  // fica a ocorrência mais à direita.
  let colDesc = -1, linhaIni = -1;
  for (let r = 0; r < Math.min(g.length, 10); r++) {
    for (let c = 1; c < (g[r]?.length ?? 0); c++) {
      if (/^aluguel/i.test(texto(g[r]?.[c])) && numero(g[r]?.[c + 1]) != null && c > colDesc) { colDesc = c; linhaIni = r; }
    }
  }
  if (colDesc >= 0) {
    let iniciou = false, pessoal = false;
    for (let r = Math.max(0, linhaIni - 2); r < g.length; r++) {
      const d = texto(g[r]?.[colDesc]);
      const v = numero(g[r]?.[colDesc + 1]);
      if (/^total$/i.test(d)) break;
      // Na planilha, um subtotal sem descrição separa as contas fixas do pessoal.
      if (!d) { if (v != null && iniciou) pessoal = true; continue; }
      if (/^aluguel/i.test(d) || /^iptu/i.test(d)) iniciou = true;
      if (!iniciou) continue;
      if (/^dinheiro$/i.test(d)) continue; // subtotal do pessoal
      if (v == null || v === 0) continue;
      const dia = Number(d.match(/(\d{1,2})\s*$/)?.[1]) || undefined;
      const descricao = d.replace(/\s*(dia|venc(imento)?)?\s*-?\s*\d{1,2}\s*$/i, '').replace(/\s*-\s*$/, '').trim();
      despesas.push({ descricao, valor: v, dia, tipo: pessoal ? 'pessoal' : 'fixa', celula: ref(aba, r, colDesc) });
    }
  }
  return { totais, despesas, creditoAnterior, gympassAnterior };
}

export function lerPlanilha(abas: Record<string, Grade>): Leitura {
  const avisos: Aviso[] = [];
  const nomesAbas = Object.keys(abas);
  const abaPor = (n: string) => nomesAbas.find((a) => semAcento(a).toLowerCase().trim() === n);
  const precos = lerPrecos(abas[abaPor('alunos') ?? '']);
  const fech = lerFechamento(abas[abaPor('fechamento') ?? ''], abaPor('fechamento') ?? 'Fechamento');

  const modalidades: string[] = [];
  const turmas: TurmaLida[] = [];
  const linhas: LinhaLida[] = [];

  for (const aba of nomesAbas) {
    const k = semAcento(aba).toLowerCase().trim();
    if (ABAS_IGNORADAS.has(k)) continue;
    const modalidade = ABAS_MODALIDADE[k] ?? modalidadeDeTexto(aba) ?? aba.trim();
    const g = abas[aba];
    const blocos = acharBlocos(g);
    if (blocos.length === 0) {
      avisos.push({ celula: `${aba}!A1`, texto: `A aba "${aba}" não tem o formato de turma e foi ignorada.` });
      continue;
    }
    if (!ABAS_MODALIDADE[k]) avisos.push({ celula: `${aba}!A1`, texto: `A aba "${aba}" virou a modalidade "${modalidade}".` });
    if (!modalidades.includes(modalidade)) modalidades.push(modalidade);

    blocos.forEach((b, i) => {
      const nomeTurma = b.titulo && semAcento(b.titulo).toLowerCase() !== semAcento(modalidade).toLowerCase()
        ? tituloTurma(b.titulo, modalidade)
        : blocos.length > 1 ? `${modalidade} turma ${i + 1}` : modalidade;
      const turma: TurmaLida = { modalidade, nome: nomeTurma, ...horarioDe(b.titulo) };
      let usada = false;
      const vistosNoBloco = new Map<string, number>();

      for (let r = b.linhaCab + 1; r < Math.min(g.length, b.linhaCab + 60); r++) {
        const row = g[r] ?? [];
        const nomeCel = row[b.colNome];
        const nomeOriginal = texto(nomeCel);
        if (!nomeOriginal || numero(nomeCel) != null || ROTULO.test(nomeOriginal)) continue;
        const celula = ref(aba, r, b.colNome);
        const status = texto(row[b.colPag]);
        const pagamentos: PagamentoLido[] = [];
        for (const f of b.colFormas) {
          const v = numero(row[f.c]);
          const t = texto(row[f.c]);
          if (v != null && v !== 0) pagamentos.push({ forma: f.forma, valor: v });
          else if (v == null && t) avisos.push({ celula: ref(aba, r, f.c), texto: `${nomeOriginal}: texto "${t}" na coluna de ${f.forma} foi ignorado.` });
        }
        const total = b.colTotal != null ? numero(row[b.colTotal]) ?? 0 : 0;
        const somaPag = pagamentos.reduce((s, p) => s + p.valor, 0);
        const pagoTexto = /^p(a)?go/i.test(status);
        const pago = pagoTexto || somaPag > 0;
        if (pagoTexto && somaPag === 0 && total > 0) {
          pagamentos.push({ forma: 'dinheiro', valor: total });
          avisos.push({ celula, texto: `${nomeOriginal}: marcado como pago sem forma de pagamento; considerado dinheiro (${total}).` });
        }
        const colunaVazia = b.colTotal == null || row[b.colTotal] == null || row[b.colTotal] === '';
        if (!colunaVazia && somaPag > 0 && total < somaPag - 0.01 && !(pagoTexto && somaPag === 0)) {
          avisos.push({ celula, texto: `${nomeOriginal} (${nomeTurma}): as formas de pagamento somam ${somaPag}, mas a coluna RECEBER/VALOR mostra ${total}. Valem as formas de pagamento; confira.` });
        }
        let devido = Math.max(total, pagamentos.reduce((s, p) => s + p.valor, 0));
        const sep = separarResponsavel(nomeOriginal);
        const nome = nomeLimpo(sep.nome);
        let chave = chaveNome(nomeOriginal);
        if (!chave) continue;
        if (!pago && devido === 0) {
          const preco = precos.get(`${modalidade}|${chave}`);
          if (preco) devido = preco;
          else avisos.push({ celula, texto: `${nomeOriginal} (${nomeTurma}): sem pagamento e sem valor; ficou com valor a definir.` });
        }
        if (pago && devido === 0) {
          avisos.push({ celula, texto: `${nomeOriginal} (${nomeTurma}): marcado como pago com valor zero.` });
        }
        const repet = vistosNoBloco.get(chave) ?? 0;
        vistosNoBloco.set(chave, repet + 1);
        if (repet > 0) {
          avisos.push({ celula, texto: `${nomeOriginal} aparece ${repet + 1}× na mesma turma; cadastrado como outra pessoa ("${nome} ${repet + 1}"). Unifique se for a mesma.` });
          chave = `${chave} ${repet + 1}`;
        }
        const cm = status.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
        let contrato: LinhaLida['contrato'];
        let observacao: string | undefined;
        if (cm && Number(cm[1]) <= Number(cm[2]) && [6, 12].includes(Number(cm[2]))) {
          contrato = { mes: Number(cm[1]), de: Number(cm[2]) };
        } else if (status && !/^p(a)?go$/i.test(status)) {
          // Ex.: "pago 1/10" (parcelas) ou outras anotações: guardadas como observação.
          observacao = `Planilha: "${status}"`;
        }
        if (/\(.*\)/.test(nomeOriginal)) {
          const nota = nomeOriginal.match(/\((.*?)\)/)?.[1];
          if (nota && !/^\d+$/.test(nota)) observacao = [observacao, nota].filter(Boolean).join(' · ');
        }
        usada = true;
        linhas.push({
          aba, celula, modalidade, turma: nomeTurma, nomeOriginal,
          nome: repet > 0 ? `${nome} ${repet + 1}` : nome,
          chave, responsavel: sep.responsavel, status, pago, devido, pagamentos, contrato, observacao,
        });
      }
      if (usada) turmas.push(turma);
    });
  }

  return {
    modalidades, turmas, linhas,
    despesas: fech.despesas, totais: fech.totais,
    creditoAnterior: fech.creditoAnterior, gympassAnterior: fech.gympassAnterior,
    avisos,
  };
}

function tituloTurma(titulo: string, modalidade: string): string {
  const { horario, dias } = horarioDe(titulo);
  if (horario) return `${modalidade} ${horario}${dias ? ` ${dias}` : ''}`;
  const t = titulo.replace(/\s+/g, ' ').trim();
  const k = semAcento(t).toLowerCase();
  if (k.startsWith(semAcento(modalidade).toLowerCase())) return t[0].toUpperCase() + t.slice(1);
  return `${modalidade} ${t}`;
}
