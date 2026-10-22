import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { bancoDeTeste } from './banco';
import { criarApp } from '../src/server/app';

// O histórico consulta o banco ~180 vezes por chamada; o limite padrão de 5 s fica no limite.
vi.setConfig({ testTimeout: 30000 });

let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
const app = criarApp();
const chamar = (caminho: string, corpo?: unknown) =>
  app.request('/api' + caminho, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, { DB: ctx.db });

async function aluno(nome: string) {
  return (await ctx.db.prepare('INSERT INTO alunos (nome, chave) VALUES (?, ?)').bind(nome, nome.toLowerCase()).run()).meta.last_row_id;
}
async function contrato(alunoId: number, inicio: string, meses: number) {
  return (await ctx.db.prepare("INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?, 'x', 'semestral', 100, ?, ?)").bind(alunoId, inicio, meses).run()).meta.last_row_id;
}
async function mensalidade(alunoId: number, comp: string, contratoId: number | null = null) {
  return (await ctx.db.prepare('INSERT INTO mensalidades (aluno_id, contrato_id, competencia, valor) VALUES (?, ?, ?, 100)').bind(alunoId, contratoId, comp).run()).meta.last_row_id;
}
const alunosDoMes = async (comp: string) =>
  ((await ctx.db.prepare('SELECT a.nome FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id WHERE m.competencia = ? ORDER BY a.nome').bind(comp).all()).results as { nome: string }[]).map((x) => x.nome);

beforeAll(async () => { ctx = await bancoDeTeste(); }, 60000);
afterAll(async () => { await ctx?.fechar(); });

test('gerar o mês para de copiar contrato que chegou ao fim e segue o contrato renovado', async () => {
  const mensal = await aluno('Mensal');
  const inativo = await aluno('Inativo');
  await ctx.db.prepare('UPDATE alunos SET ativo = 0 WHERE id = ?').bind(inativo).run();
  const acaba = await aluno('Acaba');
  const renova = await aluno('Renova');
  const cAcaba = await contrato(acaba, '2026-01', 6); // jan..jun
  const cRenova = await contrato(renova, '2026-01', 6);
  for (const a of [mensal, inativo]) await mensalidade(a, '2026-06');
  await mensalidade(acaba, '2026-06', cAcaba);
  await mensalidade(renova, '2026-06', cRenova);

  // renovar: encerra o contrato e cria o novo a partir de julho
  expect((await chamar(`/contratos/${cRenova}/renovar`, {})).status).toBe(200);

  const r = await (await chamar('/mes/gerar', { competencia: '2026-07' })).json() as { mensalidades: number; contratosFinalizados: number };
  expect(r.contratosFinalizados).toBe(1);
  expect(await alunosDoMes('2026-07')).toEqual(['Mensal', 'Renova']);
  const novo = await ctx.db.prepare("SELECT m.contrato_id, c.inicio FROM mensalidades m JOIN contratos c ON c.id = m.contrato_id WHERE m.competencia = '2026-07'").first<{ contrato_id: number; inicio: string }>();
  expect(novo?.inicio).toBe('2026-07');

  // dentro do prazo continua copiando
  const r2 = await (await chamar('/mes/gerar', { competencia: '2026-08' })).json() as { contratosFinalizados: number };
  expect(r2.contratosFinalizados).toBe(0);
  expect(await alunosDoMes('2026-08')).toEqual(['Mensal', 'Renova']);
});

test('histórico traz 12 meses, com alunos novos e saídas', async () => {
  const lista = await (await chamar('/historico?comp=2026-08&meses=12')).json() as {
    competencia: string; temDados: boolean; alunos: number; novos: number | null; saidas: number | null; faturamento: number;
  }[];
  expect(lista).toHaveLength(12);
  expect(lista[0].competencia).toBe('2025-09');
  expect(lista[0].temDados).toBe(false);
  const por = Object.fromEntries(lista.map((m) => [m.competencia, m]));
  expect(por['2026-06']).toMatchObject({ alunos: 4, faturamento: 400 });
  expect(por['2026-07']).toMatchObject({ alunos: 2, saidas: 2, novos: 0 });
  expect(por['2026-08']).toMatchObject({ alunos: 2, saidas: 0 });
});

test('histórico separa as despesas por categoria e a soma bate com o total', async () => {
  const lista = await (await chamar('/historico?comp=2026-08&meses=12')).json() as {
    competencia: string; despesas: number; despesasPor: Record<string, number>;
  }[];
  for (const m of lista) {
    const soma = Object.values(m.despesasPor).reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(m.despesas, 2);
  }
});

test('histórico por ano traz janeiro a dezembro; "tudo" vai do primeiro ao último mês com lançamento', async () => {
  const ano = await (await chamar('/historico?ano=2026')).json() as { competencia: string; temDados: boolean }[];
  expect(ano.map((m) => m.competencia)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
  expect(ano[0].temDados).toBe(false);
  expect(ano[7].temDados).toBe(true);

  const tudo = await (await chamar('/historico?tudo=1')).json() as { competencia: string; temDados: boolean }[];
  expect(tudo[0].competencia).toBe('2026-06');
  expect(tudo[tudo.length - 1].competencia).toBe('2026-08');
  expect(tudo.every((m) => m.temDados)).toBe(true);

  expect((await chamar('/historico?ano=26')).status).toBe(400);
});

test('salário fixo calculado não faz um mês sem lançamentos virar "com dados"', async () => {
  await ctx.db.prepare("INSERT INTO professores (nome, regra, valor) VALUES ('Fixo', 'fixo', 2300)").run();
  const lista = await (await chamar('/historico?comp=2026-08&meses=12')).json() as { competencia: string; temDados: boolean; despesas: number }[];
  expect(lista[0].competencia).toBe('2025-09');
  expect(lista[0].despesas).toBe(2300);
  expect(lista[0].temDados).toBe(false);
});
