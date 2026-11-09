import { afterAll, beforeAll, expect, test } from 'vitest';
import { bancoDeTeste } from './banco';
import { criarApp } from '../src/server/app';

let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
const app = criarApp();
const chamar = (caminho: string, corpo?: unknown) =>
  app.request('/api' + caminho, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, { DB: ctx.db });

async function aluno(nome: string, origem = 'particular') {
  return (await ctx.db.prepare('INSERT INTO alunos (nome, chave, origem) VALUES (?, ?, ?)').bind(nome, nome.toLowerCase(), origem).run()).meta.last_row_id;
}
async function mensalidade(alunoId: number, comp: string, valor = 250, contratoId: number | null = null) {
  return (await ctx.db.prepare("INSERT INTO mensalidades (aluno_id, contrato_id, competencia, descricao, valor) VALUES (?, ?, ?, 'Pilates 2x', ?)").bind(alunoId, contratoId, comp, valor).run()).meta.last_row_id;
}
const mensDe = async (alunoId: number) => (await ctx.db.prepare(
  'SELECT competencia, valor, descricao, contrato_id FROM mensalidades WHERE aluno_id = ? AND cancelada = 0 ORDER BY competencia, id').bind(alunoId).all()).results as
  { competencia: string; valor: number; descricao: string | null; contrato_id: number | null }[];
const alunoDb = (id: number) => ctx.db.prepare('SELECT origem, forma_pagamento FROM alunos WHERE id = ?').bind(id).first<{ origem: string; forma_pagamento: string | null }>();

beforeAll(async () => { ctx = await bancoDeTeste(); }, 60000);
afterAll(async () => { await ctx?.fechar(); });

test('aluno que pagava em dinheiro passa para o Gympass e os próximos meses seguem assim', async () => {
  const ana = await aluno('Ana');
  const ct = (await ctx.db.prepare("INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?, 'Semestral', 'semestral', 250, '2026-09', 6)").bind(ana).run()).meta.last_row_id;
  await mensalidade(ana, '2026-11', 250, ct);

  const r = await chamar(`/alunos/${ana}/plano`, { origem: 'gympass', valor: 100, a_partir: '2026-11' });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ alteradas: 1, mantidas: 0, criada: false });
  expect(await alunoDb(ana)).toEqual({ origem: 'gympass', forma_pagamento: 'gympass' });
  expect(await mensDe(ana)).toEqual([{ competencia: '2026-11', valor: 100, descricao: 'Gympass', contrato_id: null }]);
  // Gympass não tem contrato: o antigo foi encerrado.
  expect((await ctx.db.prepare('SELECT encerrado_em FROM contratos WHERE id = ?').bind(ct).first<{ encerrado_em: string | null }>())?.encerrado_em).not.toBeNull();

  // O mês seguinte copia o valor novo (e não para por causa do contrato encerrado).
  const g = await (await chamar('/mes/gerar', { competencia: '2026-12' })).json() as { contratosFinalizados: number };
  expect(g.contratosFinalizados).toBe(0);
  expect((await mensDe(ana)).map((m) => [m.competencia, m.valor])).toEqual([['2026-11', 100], ['2026-12', 100]]);

  // A forma habitual vem na lista de mensalidades, para já vir marcada ao receber.
  const lista = await (await chamar('/mensalidades?comp=2026-12')).json() as { aluno_id: number; forma_pagamento: string | null }[];
  expect(lista.find((m) => m.aluno_id === ana)?.forma_pagamento).toBe('gympass');
});

test('troca a forma e o valor mantendo o contrato; mensalidade já paga não muda', async () => {
  const bia = await aluno('Bia');
  const ct = (await ctx.db.prepare("INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?, 'Anual', 'anual', 200, '2027-01', 12)").bind(bia).run()).meta.last_row_id;
  const jan = await mensalidade(bia, '2027-01', 200, ct);
  await mensalidade(bia, '2027-02', 200, ct);
  await chamar('/pagamentos', { mensalidade_id: jan, valor: 200, forma: 'dinheiro', data: '2027-01-05' });

  const r = await (await chamar(`/alunos/${bia}/plano`, { origem: 'particular', valor: 230, forma_pagamento: 'credito', a_partir: '2027-01', contrato: 'manter' })).json();
  expect(r).toMatchObject({ alteradas: 1, mantidas: 1 });
  expect(await alunoDb(bia)).toEqual({ origem: 'particular', forma_pagamento: 'credito' });
  expect((await mensDe(bia)).map((m) => [m.competencia, m.valor, m.contrato_id])).toEqual([['2027-01', 200, ct], ['2027-02', 230, ct]]);
});

test('Gympass cadastrado sem mensalidade vira particular com contrato novo', async () => {
  // Mês já gerado por causa de outro aluno.
  await mensalidade(await aluno('Outro'), '2027-03');
  const caio = await aluno('Caio', 'gympass');
  const r = await chamar(`/alunos/${caio}/plano`, { origem: 'particular', valor: 180, forma_pagamento: 'pix', a_partir: '2027-03', contrato: 'novo', meses: 6, descricao: 'Semestral 2x' });
  expect(await r.json()).toMatchObject({ criada: true });
  const ct = await ctx.db.prepare('SELECT id, meses, valor_mensal FROM contratos WHERE aluno_id = ? AND encerrado_em IS NULL').bind(caio).first<{ id: number; meses: number; valor_mensal: number }>();
  expect(ct).toMatchObject({ meses: 6, valor_mensal: 180 });
  expect(await mensDe(caio)).toEqual([{ competencia: '2027-03', valor: 180, descricao: 'Semestral 2x', contrato_id: ct!.id }]);
});

test('recusa mês ainda não gerado e particular pagando "pelo Gympass"', async () => {
  const dani = await aluno('Dani');
  expect((await chamar(`/alunos/${dani}/plano`, { origem: 'particular', valor: 200, a_partir: '2030-01' })).status).toBe(400);
  await mensalidade(dani, '2027-04');
  expect((await chamar(`/alunos/${dani}/plano`, { origem: 'particular', valor: 200, forma_pagamento: 'gympass', a_partir: '2027-04' })).status).toBe(400);
});
