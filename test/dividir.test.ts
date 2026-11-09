import { afterAll, beforeAll, expect, test } from 'vitest';
import { bancoDeTeste } from './banco';
import { criarApp } from '../src/server/app';

let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
const app = criarApp();
const chamar = (caminho: string, corpo?: unknown) =>
  app.request('/api' + caminho, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, { DB: ctx.db });

const mods = async () => {
  const atual = (await ctx.db.prepare('SELECT id, nome FROM modalidades ORDER BY ordem, id').all()).results as { id: number; nome: string }[];
  if (atual.length >= 2) return atual;
  await ctx.db.batch([ctx.db.prepare("INSERT INTO modalidades (nome, ordem) VALUES ('Zumba', 1)"), ctx.db.prepare("INSERT INTO modalidades (nome, ordem) VALUES ('Funcional', 2)")]);
  return (await ctx.db.prepare('SELECT id, nome FROM modalidades ORDER BY ordem, id').all()).results as { id: number; nome: string }[];
};
async function aluno(nome: string) {
  return (await ctx.db.prepare("INSERT INTO alunos (nome, chave, origem) VALUES (?, ?, 'particular')").bind(nome, nome.toLowerCase()).run()).meta.last_row_id;
}
async function mensalidade(alunoId: number, comp: string, valor: number, modalidadeId: number | null = null) {
  return (await ctx.db.prepare("INSERT INTO mensalidades (aluno_id, competencia, modalidade_id, descricao, valor) VALUES (?, ?, ?, 'Plano', ?)").bind(alunoId, comp, modalidadeId, valor).run()).meta.last_row_id;
}
const mensDe = async (alunoId: number) => (await ctx.db.prepare(
  'SELECT competencia, modalidade_id, valor FROM mensalidades WHERE aluno_id = ? AND cancelada = 0 ORDER BY competencia, id').bind(alunoId).all()).results as
  { competencia: string; modalidade_id: number | null; valor: number }[];

beforeAll(async () => { ctx = await bancoDeTeste(); }, 60000);
afterAll(async () => { await ctx?.fechar(); });

test('divide 150 em 70 + 80 entre duas modalidades, no mês e nos seguintes', async () => {
  const [zumba, funcional] = await mods();
  const ana = await aluno('Ana');
  await mensalidade(ana, '2027-04', 150);
  await mensalidade(ana, '2027-05', 150);

  const r = await chamar(`/alunos/${ana}/dividir`, { competencia: '2027-04', propagar: true, partes: [{ modalidade_id: zumba.id, valor: 70 }, { modalidade_id: funcional.id, valor: 80 }] });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ meses: 2, total: 150 });
  expect(await mensDe(ana)).toEqual([
    { competencia: '2027-04', modalidade_id: zumba.id, valor: 70 }, { competencia: '2027-04', modalidade_id: funcional.id, valor: 80 },
    { competencia: '2027-05', modalidade_id: zumba.id, valor: 70 }, { competencia: '2027-05', modalidade_id: funcional.id, valor: 80 },
  ]);

  // O mês gerado depois copia as duas partes.
  await chamar('/mes/gerar', { competencia: '2027-06' });
  expect((await mensDe(ana)).filter((m) => m.competencia === '2027-06').map((m) => m.valor)).toEqual([70, 80]);
});

test('não divide mês já pago nem mês que já tem várias mensalidades', async () => {
  const [zumba, funcional] = await mods();
  const partes = [{ modalidade_id: zumba.id, valor: 70 }, { modalidade_id: funcional.id, valor: 80 }];
  const bia = await aluno('Bia');
  const m = await mensalidade(bia, '2027-07', 150);
  await chamar('/pagamentos', { mensalidade_id: m, valor: 150, forma: 'dinheiro', data: '2027-07-05' });
  expect((await chamar(`/alunos/${bia}/dividir`, { competencia: '2027-07', partes })).status).toBe(409);

  const caio = await aluno('Caio');
  await mensalidade(caio, '2027-07', 70, zumba.id);
  await mensalidade(caio, '2027-07', 80, funcional.id);
  expect((await chamar(`/alunos/${caio}/dividir`, { competencia: '2027-07', partes })).status).toBe(409);
  expect((await chamar(`/alunos/${caio}/dividir`, { competencia: '2027-07', partes: [partes[0]] })).status).toBe(400);
});

test('cadastro de aluno novo com valor dividido cria uma mensalidade por modalidade', async () => {
  const [zumba, funcional] = await mods();
  const r = await chamar('/alunos', { nome: 'Duda', competencia: '2027-08', partes: [{ modalidade_id: zumba.id, valor: 70 }, { modalidade_id: funcional.id, valor: 80 }] });
  const { id } = await r.json() as { id: number };
  expect((await mensDe(id)).map((m) => [m.modalidade_id, m.valor])).toEqual([[zumba.id, 70], [funcional.id, 80]]);
});
