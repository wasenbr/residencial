import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { abasDoArquivo } from './ler';
import { bancoDeTeste } from './banco';
import { planilhaSintetica } from './sintetica';
import { lerPlanilha } from '../src/import/planilha';
import { importar, type Relatorio } from '../src/import/importar';
import { resumoDoMes } from '../src/server/app';
import { compDeTexto } from '../src/shared/comp';

let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
let rel: Relatorio;
const leitura = () => lerPlanilha(planilhaSintetica());

beforeAll(async () => {
  ctx = await bancoDeTeste();
  rel = await importar(ctx.db, leitura(), '2026-03', 'fechamento-2026-03.xlsx');
}, 60000);
afterAll(async () => { await ctx?.fechar(); });

describe('importação de uma planilha de fechamento', () => {
  test('lê blocos lado a lado, formas de pagamento e totais', async () => {
    const r = await resumoDoMes(ctx.db, '2026-03');
    const por = Object.fromEntries(r.porModalidade.map((m) => [m.nome, m]));
    // Funcional: 200 + 100 + 120 (crédito) + 80 (dinheiro, RECEBER 0) + 130 + 50 + 90 ("pago" sem valor → dinheiro)
    expect(por.Funcional.recebido).toBe(770);
    expect(por.Personal.faturamento).toBe(200 + 240 + 150 + 40); // Aluna Nove usa o preço da aba Alunos
    expect(por.Personal.aberto).toBe(190 + 150);
    expect(por.Ballet.aberto).toBe(80); // Livia sem pagamento: preço da aba Alunos
  });

  test('mesma pessoa em dois blocos vira um aluno só, com responsável separado do nome', async () => {
    const n = await ctx.db.prepare("SELECT COUNT(*) AS n FROM alunos WHERE chave = 'aluna um'").first<{ n: number }>();
    expect(n?.n).toBe(1);
    const liv = await ctx.db.prepare("SELECT nome, responsavel FROM alunos WHERE chave LIKE 'livia%'").first<{ nome: string; responsavel: string }>();
    expect(liv).toEqual({ nome: 'Livia', responsavel: 'Silvana' });
  });

  test('cria contrato semestral a partir de "pago 5/6"', async () => {
    const c = await ctx.db.prepare('SELECT periodo, meses, inicio FROM contratos').first<{ periodo: string; meses: number; inicio: string }>();
    expect(c).toEqual({ periodo: 'semestral', meses: 6, inicio: '2025-11' });
  });

  test('caixa: crédito do mês só entra no mês seguinte; cartão e Gympass do mês anterior vêm da planilha', async () => {
    const r = await resumoDoMes(ctx.db, '2026-03');
    expect(r.formas.credito).toBe(120);
    expect(r.proximoCaixa.credito).toBe(120);
    expect(r.caixa.creditoAnterior).toBe(500);
    expect(r.caixa.gympassAnterior).toBe(300);
    expect(r.caixa.total).toBeCloseTo(r.formas.dinheiroPix + r.formas.debito + 500 + 300, 2);
    expect(r.recebido).toBeCloseTo(r.formas.dinheiroPix + r.formas.debito + r.formas.credito + r.formas.gympass, 2);
  });

  test('despesas fixas vêm da aba Fechamento; salários são calculados, não copiados', async () => {
    const r = await resumoDoMes(ctx.db, '2026-03');
    expect(r.despesas.contas).toBe(1000 + 150 + 400);
    expect(r.despesas.pessoal.find((x) => x.nome === 'Misael')?.valor).toBe(2300);
    expect(rel.pessoalPlanilha).toEqual([{ nome: 'Edison', valor: 240 }, { nome: 'Misael', valor: 1800 }]);
    expect(r.sobra).toBeCloseTo(r.caixa.total - r.despesas.total, 2);
  });

  test('avisa o que não fecha na planilha', () => {
    const textos = rel.avisos.map((a) => a.texto).join('\n');
    expect(textos).toMatch(/Aluno Quatro.*RECEBER/);
    expect(textos).toMatch(/Aluno Onze.*sem pagamento e sem valor/);
    expect(textos).toMatch(/Aluno Seis.*dinheiro/);
  });

  test('conferência compara com a aba Fechamento', () => {
    const f = rel.conferencia.find((c) => c.modalidade === 'Funcional')!;
    expect(f.planilha.recebido).toBe(670);
    expect(f.sistema.recebido).toBe(770);
    expect(f.ok).toBe(false);
  });

  test('reimportar o mesmo mês não duplica nada', async () => {
    const antes = await resumoDoMes(ctx.db, '2026-03');
    const rel2 = await importar(ctx.db, leitura(), '2026-03', 'fechamento-2026-03.xlsx');
    const depois = await resumoDoMes(ctx.db, '2026-03');
    expect(depois.faturamento).toBe(antes.faturamento);
    expect(depois.recebido).toBe(antes.recebido);
    expect(rel2.alunosNovos).toBe(0);
    expect(depois.alunosAtivos).toBe(antes.alunosAtivos);
  }, 60000);

  test('mês seguinte reaproveita os alunos e leva o cartão do mês anterior para o caixa', async () => {
    await importar(ctx.db, leitura(), '2026-04', 'fechamento-2026-04.xlsx');
    const abril = await resumoDoMes(ctx.db, '2026-04');
    // Março existe no sistema: o crédito de março (R$ 120) entra no caixa de abril, não o valor digitado na planilha.
    expect(abril.caixa.creditoAnterior).toBe(120);
    expect(abril.caixa.creditoAnteriorOrigem).toBe('sistema');
    const n = await ctx.db.prepare("SELECT COUNT(*) AS n FROM alunos WHERE chave = 'aluna um'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  }, 60000);
});

test('lê o mês do nome do arquivo', () => {
  expect(compDeTexto('Fechamento março 2026 .xlsx')).toBe('2026-03');
  expect(compDeTexto('Fechamento Abril 2026.xlsx')).toBe('2026-04');
  expect(compDeTexto('fechamento-2026-03.xlsx')).toBe('2026-03');
  expect(compDeTexto('Fechamento dezembro 2025.xlsx')).toBe('2025-12');
  expect(compDeTexto('Fechamento marc\u0327o 2026 .xlsx')).toBe('2026-03');
  expect(compDeTexto('planilha.xlsx')).toBeNull();
});

// Só roda na máquina de quem tem a planilha real em test/privado/ (fora do git).
const real = 'test/privado/fechamento-2026-03.xlsx';
describe.skipIf(!existsSync(real))('planilha real de março/2026', () => {
  test('Spinning, Step e Personal batem com a aba Fechamento', async () => {
    const c = await bancoDeTeste();
    try {
      const r = await importar(c.db, lerPlanilha(abasDoArquivo(real)), '2026-03', 'real.xlsx');
      for (const nome of ['Spinning', 'Step', 'Personal']) expect(r.conferencia.find((x) => x.modalidade === nome)!.ok, nome).toBe(true);
    } finally { await c.fechar(); }
  }, 60000);
});
