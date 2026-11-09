import { afterAll, beforeAll, expect, test } from 'vitest';
import { bancoDeTeste } from './banco';
import { criarApp } from '../src/server/app';
import { dividirValor, rotuloMeses } from '../src/shared/comp';

let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
const app = criarApp();
const chamar = (caminho: string, corpo?: unknown) =>
  app.request('/api' + caminho, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, { DB: ctx.db });

async function aluno(nome: string) {
  return (await ctx.db.prepare('INSERT INTO alunos (nome, chave) VALUES (?, ?)').bind(nome, nome.toLowerCase()).run()).meta.last_row_id;
}
async function mensalidade(alunoId: number, comp: string, valor = 250) {
  return (await ctx.db.prepare("INSERT INTO mensalidades (aluno_id, competencia, descricao, valor) VALUES (?, ?, 'Pilates 2x', ?)").bind(alunoId, comp, valor).run()).meta.last_row_id;
}
type Linha = { competencia: string; valor: number; adiantado: number; contrato_id: number | null; pago: number; caixa: string | null };
const mensDe = async (alunoId: number) => (await ctx.db.prepare(`
  SELECT m.competencia, m.valor, m.adiantado, m.contrato_id,
         COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago,
         (SELECT MAX(caixa) FROM pagamentos WHERE mensalidade_id = m.id) AS caixa
  FROM mensalidades m WHERE m.aluno_id = ? AND m.cancelada = 0 ORDER BY m.competencia`).bind(alunoId).all()).results as unknown as Linha[];

beforeAll(async () => { ctx = await bancoDeTeste(); }, 60000);
afterAll(async () => { await ctx?.fechar(); });

test('divide o total em parcelas com centavos exatos', () => {
  expect(dividirValor(600, 3)).toEqual([200, 200, 200]);
  expect(dividirValor(1000, 3)).toEqual([333.33, 333.33, 333.34]);
  expect(dividirValor(2600, 13).reduce((s, x) => s + x, 0)).toBe(2600);
  expect(rotuloMeses(3)).toBe('Trimestral');
  expect(rotuloMeses(13)).toBe('13 meses');
});

test('pagamento adiantado de 3 meses: faturamento mês a mês, caixa todo no mês do recebimento', async () => {
  const eliane = await aluno('Eliane');
  const outro = await aluno('Outro');
  await mensalidade(eliane, '2026-11');
  await mensalidade(outro, '2026-11', 200);

  const r = await chamar(`/alunos/${eliane}/adiantado`, { inicio: '2026-11', meses: 3, valor_total: 600, forma: 'pix', data: '2026-11-05' });
  expect(r.status).toBe(201);
  expect(await r.json()).toMatchObject({ de: '2026-11', ate: '2027-01', parcela: 200, caixa: '2026-11' });

  const mens = await mensDe(eliane);
  expect(mens.map((m) => [m.competencia, m.valor, m.pago, m.caixa, m.adiantado])).toEqual([
    ['2026-11', 200, 200, '2026-11', 1],
    ['2026-12', 200, 200, '2026-11', 1],
    ['2027-01', 200, 200, '2026-11', 1],
  ]);
  const ct = await ctx.db.prepare('SELECT * FROM contratos WHERE aluno_id = ? AND encerrado_em IS NULL').bind(eliane).first<{ id: number; meses: number; inicio: string; valor_mensal: number }>();
  expect(ct).toMatchObject({ meses: 3, inicio: '2026-11', valor_mensal: 200 });
  expect(new Set(mens.map((m) => m.contrato_id))).toEqual(new Set([ct!.id]));

  // Novembro: fatura só a parte dele, mas o caixa recebe os 600.
  const nov = await (await chamar('/resumo?comp=2026-11')).json() as { faturamento: number; recebido: number; caixa: { dinheiroMes: number }; mesGerado: boolean };
  expect(nov.faturamento).toBe(400);
  expect(nov.recebido).toBe(200);
  expect(nov.caixa.dinheiroMes).toBe(600);

  // Dezembro ainda não foi gerado, mesmo já tendo a mensalidade adiantada.
  const dezAntes = await (await chamar('/resumo?comp=2026-12')).json() as { mesGerado: boolean; qtdMensalidades: number; caixa: { dinheiroMes: number } };
  expect(dezAntes).toMatchObject({ mesGerado: false, qtdMensalidades: 1 });
  expect(dezAntes.caixa.dinheiroMes).toBe(0);

  // Gerar dezembro copia os outros e não duplica a Eliane.
  const g = await (await chamar('/mes/gerar', { competencia: '2026-12' })).json() as { mensalidades: number; adiantados: number };
  expect(g).toMatchObject({ mensalidades: 1, adiantados: 1 });
  expect((await mensDe(eliane)).filter((m) => m.competencia === '2026-12')).toHaveLength(1);
  expect((await chamar('/mes/gerar', { competencia: '2026-12' })).status).toBe(409);

  // Lista de alunos mostra até quando está pago.
  const lista = await (await chamar('/alunos?comp=2026-12')).json() as { id: number; pago_ate: string | null }[];
  expect(lista.find((a) => a.id === eliane)?.pago_ate).toBe('2027-01');
  expect(lista.find((a) => a.id === outro)?.pago_ate).toBeNull();

  // Janeiro também pula; em fevereiro o contrato de 3 meses terminou e pede renovação.
  await chamar('/mes/gerar', { competencia: '2027-01' });
  const fev = await (await chamar('/mes/gerar', { competencia: '2027-02' })).json() as { contratosFinalizados: number };
  expect(fev.contratosFinalizados).toBe(1);
  expect((await mensDe(eliane)).map((m) => m.competencia)).toEqual(['2026-11', '2026-12', '2027-01']);
});

test('valor que não divide exato e cartão de crédito entrando no mês seguinte', async () => {
  const ana = await aluno('Ana');
  const r = await chamar(`/alunos/${ana}/adiantado`, { inicio: '2026-11', meses: 3, valor_total: 1000, forma: 'credito', data: '2026-11-20', descricao: 'Plano trimestral' });
  expect(r.status).toBe(201);
  const mens = await mensDe(ana);
  expect(mens.map((m) => m.valor)).toEqual([333.33, 333.33, 333.34]);
  expect(mens.every((m) => m.caixa === '2026-12')).toBe(true);
  const nov = await (await chamar('/resumo?comp=2026-11')).json() as { proximoCaixa: { credito: number } };
  expect(nov.proximoCaixa.credito).toBe(1000);
  const dez = await (await chamar('/resumo?comp=2026-12')).json() as { caixa: { creditoAnterior: number } };
  expect(dez.caixa.creditoAnterior).toBe(1000);
});

test('recusa quando um dos meses já tem pagamento ou está fechado', async () => {
  const bia = await aluno('Bia');
  const m = await mensalidade(bia, '2027-03');
  await chamar('/pagamentos', { mensalidade_id: m, valor: 100, forma: 'pix', data: '2027-03-02' });
  const r = await chamar(`/alunos/${bia}/adiantado`, { inicio: '2027-03', meses: 2, valor_total: 400, forma: 'pix', data: '2027-03-05' });
  expect(r.status).toBe(409);
  expect((await mensDe(bia))).toHaveLength(1); // nada foi gravado

  await ctx.db.prepare("INSERT INTO fechamentos (competencia, fechado_em, resumo) VALUES ('2027-06', '2027-07-01', '{}')").run();
  const r2 = await chamar(`/alunos/${bia}/adiantado`, { inicio: '2027-05', meses: 2, valor_total: 400, forma: 'pix', data: '2027-05-05' });
  expect(r2.status).toBe(409);

  // Pagamento comum também não entra no caixa de um mês fechado.
  const m2 = await mensalidade(bia, '2027-07');
  const r3 = await chamar('/pagamentos', { mensalidade_id: m2, valor: 100, forma: 'pix', data: '2027-06-28' });
  expect(r3.status).toBe(409);
});

test('contrato novo para aluno já cadastrado, de qualquer duração', async () => {
  const caio = await aluno('Caio');
  await mensalidade(caio, '2027-08', 250);
  const semMes = await chamar(`/alunos/${caio}/contratos`, { plano: 'Plano 13 meses', valor_mensal: 200, meses: 13, inicio: '2027-09' });
  expect(semMes.status).toBe(400);
  const r = await chamar(`/alunos/${caio}/contratos`, { plano: 'Plano 13 meses', valor_mensal: 200, meses: 13, inicio: '2027-08' });
  expect(r.status).toBe(201);
  const ct = await ctx.db.prepare('SELECT * FROM contratos WHERE aluno_id = ? AND encerrado_em IS NULL').bind(caio).first<{ id: number; meses: number; periodo: string }>();
  expect(ct).toMatchObject({ meses: 13, periodo: 'anual' });
  expect(await mensDe(caio)).toMatchObject([{ competencia: '2027-08', valor: 200, contrato_id: ct!.id }]);
});
