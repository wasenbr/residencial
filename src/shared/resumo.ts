// Cálculo do resumo do mês: faturamento por competência, caixa e sobra.
// Puro (sem banco) para poder ser testado e usado igual no servidor e no app.

import type {
  Config, Despesa, GympassRepasse, Matricula, Mensalidade, Modalidade, Pagamento, Professor, Turma,
} from './tipos';

export interface DadosResumo {
  competencia: string;
  hoje: string;                         // 'AAAA-MM-DD'
  config: Config;
  modalidades: Modalidade[];
  professores: Professor[];
  turmas: Turma[];
  matriculas: Matricula[];
  alunos: { id: number; nome: string; ativo: number; origem: string }[];
  mensalidades: Mensalidade[];          // da competência
  pagamentos: Pagamento[];              // das mensalidades da competência
  pagamentosCaixa: (Pagamento & { competencia: string })[]; // caixa = competência (de qualquer mês)
  pagamentosCaixaSeguinte: Pagamento[]; // das mensalidades da competência com caixa no mês seguinte
  gympassAnteriorEstimado: number | null; // soma estimada do mês anterior, se ele existir no sistema
  repasseAnterior: GympassRepasse | null;
  mesAnteriorExiste: boolean;
  saldosImportados: { chave: string; valor: number }[];
  despesas: Despesa[];
}

export interface LinhaModalidade {
  id: number | null; nome: string; matriculas: number; faturamento: number; recebido: number; aberto: number;
}

export interface Atraso {
  mensalidade_id: number; aluno_id: number; nome: string; modalidade: string;
  devido: number; pago: number; aberto: number; vencimento: string | null;
}

export interface LinhaPessoal {
  professor_id: number | null; nome: string; descricao: string; valor: number; calculado: boolean; despesa_id?: number;
}

export interface Resumo {
  competencia: string;
  alunosAtivos: number;
  qtdMensalidades: number;
  faturamento: number;
  recebido: number;
  aberto: number;
  porModalidade: LinhaModalidade[];
  formas: { dinheiroPix: number; debito: number; credito: number; gympass: number };
  caixa: {
    dinheiroMes: number;
    creditoAnterior: number;
    creditoAnteriorOrigem: 'sistema' | 'planilha' | 'nenhum';
    gympassAnterior: number;
    gympassAnteriorSituacao: 'real' | 'estimado' | 'planilha' | 'nenhum';
    total: number;
  };
  despesas: {
    contas: number;          // fixas + variáveis
    contasPagas: number;
    pessoal: LinhaPessoal[];
    totalPessoal: number;
    total: number;
    retiradas: number;
  };
  sobra: number;
  proximoCaixa: { credito: number; gympassEstimado: number };
  atrasos: Atraso[];
  emAberto: Atraso[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Divide o valor de uma mensalidade entre modalidades. */
export function rateio(
  m: Mensalidade,
  matriculasDoAluno: Matricula[],
  turmas: Map<number, Turma>,
): Map<number | null, number> {
  const res = new Map<number | null, number>();
  if (m.modalidade_id != null) {
    res.set(m.modalidade_id, 1);
    return res;
  }
  let soma = 0;
  for (const mt of matriculasDoAluno) {
    const t = turmas.get(mt.turma_id);
    if (!t) continue;
    const peso = Math.max(1, t.aulas_semana || 1);
    res.set(t.modalidade_id, (res.get(t.modalidade_id) ?? 0) + peso);
    soma += peso;
  }
  if (soma === 0) return new Map([[null, 1]]);
  for (const [k, v] of res) res.set(k, v / soma);
  return res;
}

export function calcularResumo(d: DadosResumo): Resumo {
  const turmas = new Map(d.turmas.map((t) => [t.id, t]));
  const modNome = new Map(d.modalidades.map((m) => [m.id, m.nome]));
  const alunoNome = new Map(d.alunos.map((a) => [a.id, a.nome]));
  const matsPorAluno = new Map<number, Matricula[]>();
  for (const mt of d.matriculas) {
    if (!matsPorAluno.has(mt.aluno_id)) matsPorAluno.set(mt.aluno_id, []);
    matsPorAluno.get(mt.aluno_id)!.push(mt);
  }
  const pagosPorMens = new Map<number, number>();
  for (const p of d.pagamentos) pagosPorMens.set(p.mensalidade_id, (pagosPorMens.get(p.mensalidade_id) ?? 0) + p.valor);

  const linhas = new Map<number | null, LinhaModalidade>();
  const linha = (id: number | null) => {
    if (!linhas.has(id)) {
      linhas.set(id, { id, nome: id == null ? 'Sem modalidade' : modNome.get(id) ?? '?', matriculas: 0, faturamento: 0, recebido: 0, aberto: 0 });
    }
    return linhas.get(id)!;
  };
  for (const m of d.modalidades) linha(m.id);

  const ativas = d.mensalidades.filter((m) => !m.cancelada);
  const emAberto: Atraso[] = [];
  let faturamento = 0, recebido = 0, aberto = 0;
  for (const m of ativas) {
    const pago = pagosPorMens.get(m.id) ?? 0;
    const falta = Math.max(0, m.valor - pago);
    faturamento += m.valor;
    recebido += pago;
    aberto += falta;
    const partes = rateio(m, matsPorAluno.get(m.aluno_id) ?? [], turmas);
    for (const [mod, frac] of partes) {
      const l = linha(mod);
      l.matriculas += frac;
      l.faturamento += m.valor * frac;
      l.recebido += pago * frac;
      l.aberto += falta * frac;
    }
    if (falta > 0.009) {
      const mods = [...partes.keys()].map((k) => (k == null ? '—' : modNome.get(k) ?? '?'));
      emAberto.push({
        mensalidade_id: m.id, aluno_id: m.aluno_id, nome: alunoNome.get(m.aluno_id) ?? '?',
        modalidade: mods.join(', '), devido: m.valor, pago, aberto: r2(falta), vencimento: m.vencimento,
      });
    }
  }
  const atrasos = emAberto.filter((a) => a.vencimento != null && a.vencimento < d.hoje);

  const formas = { dinheiroPix: 0, debito: 0, credito: 0, gympass: 0 };
  for (const p of d.pagamentos) {
    if (p.forma === 'dinheiro' || p.forma === 'pix') formas.dinheiroPix += p.valor;
    else formas[p.forma] += p.valor;
  }

  // Caixa: o que efetivamente entra na conta neste mês.
  let dinheiroMes = 0, creditoCaixa = 0;
  for (const p of d.pagamentosCaixa) {
    if (p.forma === 'gympass') continue;
    if (p.forma === 'credito' && p.competencia !== d.competencia) creditoCaixa += p.valor;
    else dinheiroMes += p.valor;
  }
  const saldo = (k: string) => d.saldosImportados.find((s) => s.chave === k)?.valor ?? 0;
  let creditoAnteriorOrigem: Resumo['caixa']['creditoAnteriorOrigem'] = 'nenhum';
  let creditoAnterior = creditoCaixa;
  if (d.mesAnteriorExiste) creditoAnteriorOrigem = 'sistema';
  else if (saldo('credito_anterior') > 0) {
    creditoAnterior += saldo('credito_anterior');
    creditoAnteriorOrigem = 'planilha';
  } else if (creditoCaixa > 0) creditoAnteriorOrigem = 'sistema';

  let gympassAnterior = 0;
  let gympassAnteriorSituacao: Resumo['caixa']['gympassAnteriorSituacao'] = 'nenhum';
  if (d.repasseAnterior) {
    gympassAnterior = d.repasseAnterior.real;
    gympassAnteriorSituacao = 'real';
  } else if (d.mesAnteriorExiste && d.gympassAnteriorEstimado != null) {
    gympassAnterior = d.gympassAnteriorEstimado;
    gympassAnteriorSituacao = 'estimado';
  } else if (saldo('gympass_anterior') > 0) {
    gympassAnterior = saldo('gympass_anterior');
    gympassAnteriorSituacao = 'planilha';
  }
  const caixaTotal = dinheiroMes + creditoAnterior + gympassAnterior;

  // Despesas
  let contas = 0, contasPagas = 0, retiradas = 0;
  const pessoal: LinhaPessoal[] = [];
  const profComLancamento = new Set<number>();
  const profNome = new Map(d.professores.map((p) => [p.id, p.nome]));
  for (const x of d.despesas) {
    if (x.tipo === 'retirada') retiradas += x.valor;
    else if (x.tipo === 'pessoal') {
      if (x.professor_id != null) profComLancamento.add(x.professor_id);
      pessoal.push({
        professor_id: x.professor_id, nome: (x.professor_id != null && profNome.get(x.professor_id)) || x.descricao,
        descricao: x.descricao, valor: x.valor, calculado: false, despesa_id: x.id,
      });
    } else {
      contas += x.valor;
      if (x.pago_em) contasPagas += x.valor;
    }
  }
  for (const p of d.professores) {
    if (!p.ativo || p.regra === 'nenhum' || profComLancamento.has(p.id)) continue;
    if (p.regra === 'fixo') {
      pessoal.push({ professor_id: p.id, nome: p.nome, descricao: `salário fixo`, valor: p.valor, calculado: true });
    } else if (p.regra === 'percentual' && p.modalidade_id != null) {
      const base = linhas.get(p.modalidade_id)?.recebido ?? 0;
      pessoal.push({
        professor_id: p.id, nome: p.nome,
        descricao: `${p.valor}% de ${brl(base)} (${modNome.get(p.modalidade_id) ?? ''})`,
        valor: r2((base * p.valor) / 100), calculado: true,
      });
    }
  }
  const totalPessoal = pessoal.reduce((s, x) => s + x.valor, 0);
  const totalDespesas = contas + totalPessoal;

  const proximoCaixa = { credito: 0, gympassEstimado: 0 };
  for (const p of d.pagamentosCaixaSeguinte) {
    if (p.forma === 'credito') proximoCaixa.credito += p.valor;
  }
  proximoCaixa.gympassEstimado = formas.gympass;

  const porModalidade = [...linhas.values()]
    .filter((l) => l.faturamento > 0 || l.matriculas > 0)
    .map((l) => ({ ...l, matriculas: Math.round(l.matriculas * 10) / 10, faturamento: r2(l.faturamento), recebido: r2(l.recebido), aberto: r2(l.aberto) }))
    .sort((a, b) => b.faturamento - a.faturamento);

  return {
    competencia: d.competencia,
    alunosAtivos: d.alunos.filter((a) => a.ativo).length,
    qtdMensalidades: ativas.length,
    faturamento: r2(faturamento),
    recebido: r2(recebido),
    aberto: r2(aberto),
    porModalidade,
    formas: { dinheiroPix: r2(formas.dinheiroPix), debito: r2(formas.debito), credito: r2(formas.credito), gympass: r2(formas.gympass) },
    caixa: {
      dinheiroMes: r2(dinheiroMes), creditoAnterior: r2(creditoAnterior), creditoAnteriorOrigem,
      gympassAnterior: r2(gympassAnterior), gympassAnteriorSituacao, total: r2(caixaTotal),
    },
    despesas: {
      contas: r2(contas), contasPagas: r2(contasPagas), pessoal, totalPessoal: r2(totalPessoal),
      total: r2(totalDespesas), retiradas: r2(retiradas),
    },
    sobra: r2(caixaTotal - totalDespesas),
    proximoCaixa: { credito: r2(proximoCaixa.credito), gympassEstimado: r2(proximoCaixa.gympassEstimado) },
    atrasos: atrasos.sort((a, b) => b.aberto - a.aberto),
    emAberto: emAberto.sort((a, b) => b.aberto - a.aberto),
  };
}

export function brl(n: number, centavos = false): string {
  return 'R$ ' + n.toLocaleString('pt-BR', {
    minimumFractionDigits: centavos ? 2 : 0,
    maximumFractionDigits: centavos ? 2 : (Number.isInteger(n) ? 0 : 2),
  });
}
