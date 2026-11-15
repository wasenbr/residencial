import { afterAll, beforeAll, expect, test } from 'vitest';
import { calcular, classePressao, estaturaCm, idadeEm, type Medidas } from '../src/shared/avaliacao';
import { bancoDeTeste } from './banco';
import { criarApp } from '../src/server/app';

const base = (p: Partial<Medidas>): Medidas => ({
  sexo: 'M', idade: 30, peso: 80, estatura: 175, protocolo: 'jp7', alvo_gordura: null, dobras: {}, perimetros: {}, ...p,
});
// Sete dobras com a mesma média: a soma é 7 × valor.
const sete = (v: number) => Object.fromEntries(['subescapular', 'triceps', 'peitoral', 'axilar', 'suprailiaca', 'abdominal', 'coxa'].map((d) => [d, [v, v, v]]));

test('Pollock 7 dobras, homem: densidade, Siri, massas e peso máximo', () => {
  const r = calcular(base({ dobras: sete(100 / 7) }));
  expect(r.somaProtocolo).toBeCloseTo(100, 6);
  expect(r.densidade).toBeCloseTo(1.0653532, 6);
  expect(r.gordura).toBeCloseTo(14.6346, 3);
  expect(r.massaGorda).toBeCloseTo(80 * 0.146346, 3);
  expect(r.massaMagra! + r.massaGorda!).toBeCloseTo(80, 6);
  // Alvo padrão do homem: 15%.
  expect(r.alvo).toBe(15);
  expect(r.pesoMaximo).toBeCloseTo(r.massaMagra! / 0.85, 6);
  expect(r.objetivo).toBe(0);
  expect(r.imc).toBeCloseTo(80 / 1.75 ** 2, 6);
  expect(r.classes.gordura?.rotulo).toBe('Boa forma');
});

test('Pollock 7 dobras, mulher; alvo escolhido gera objetivo de emagrecimento', () => {
  const r = calcular(base({ sexo: 'F', idade: 40, peso: 70, dobras: sete(120 / 7), alvo_gordura: 20 }));
  expect(r.gordura).toBeCloseTo(24.3344, 3);
  expect(r.pesoMaximo).toBeCloseTo((70 * (1 - 0.243344)) / 0.8, 3);
  expect(r.objetivo).toBeCloseTo(70 - r.pesoMaximo!, 6);
});

test('Pollock 3 dobras usa os pontos do sexo e avisa o que falta', () => {
  const r = calcular(base({ sexo: 'F', idade: 25, protocolo: 'jp3', dobras: { triceps: [20, 20], suprailiaca: [20] } }));
  expect(r.faltam).toEqual(['coxa']);
  expect(r.gordura).toBeNull();
  const ok = calcular(base({ sexo: 'F', idade: 25, protocolo: 'jp3', dobras: { triceps: [20], suprailiaca: [20], coxa: [19, 21, 20] } }));
  expect(ok.densidade).toBeCloseTo(1.0447181, 6);
  expect(ok.gordura).toBeCloseTo(23.812, 3);
});

test('Guedes 3 dobras (homem) e idade fora da faixa', () => {
  const r = calcular(base({ idade: 35, protocolo: 'guedes', dobras: { triceps: [15], suprailiaca: [15], abdominal: [15] } }));
  expect(r.gordura).toBeCloseTo(16.7629, 3);
  expect(r.foraDaFaixa).toBe(true);
});

test('média das medidas, medida dispersa, perímetros e pressão', () => {
  const r = calcular(base({ dobras: { triceps: [10, 10.4, null], abdominal: [20, 24, 22] }, perimetros: { cintura: 96, quadril: 100 } }));
  expect(r.medias.triceps).toBeCloseTo(10.2, 6);
  expect(r.dispersas).toEqual(['abdominal']);
  expect(r.rcq).toBeCloseTo(0.96, 6);
  expect(r.classes.rcq?.tom).toBe('alerta');
  expect(r.classes.cintura?.rotulo).toBe('Risco aumentado');
  expect(r.rce).toBeCloseTo(96 / 175, 6);
  expect(classePressao(118, 76).rotulo).toBe('Ótima');
  expect(classePressao(125, 92).rotulo).toBe('Hipertensão estágio 1');
});

test('idade na data e estatura em metros ou centímetros', () => {
  expect(idadeEm('1990-06-15', '2026-06-14')).toBe(35);
  expect(idadeEm('1990-06-15', '2026-06-15')).toBe(36);
  expect(idadeEm(null, '2026-01-01')).toBeNull();
  expect(estaturaCm(1.72)).toBe(172);
  expect(estaturaCm(168)).toBe(168);
});

// ---------- API ----------
let ctx: Awaited<ReturnType<typeof bancoDeTeste>>;
const app = criarApp();
const chamar = (caminho: string, metodo = 'GET', corpo?: unknown) =>
  app.request('/api' + caminho, corpo === undefined ? { method: metodo } : { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, { DB: ctx.db });

beforeAll(async () => { ctx = await bancoDeTeste(); }, 60000);
afterAll(async () => { await ctx?.fechar(); });

test('lança, lista em ordem de data, edita e exclui avaliações', async () => {
  const id = (await ctx.db.prepare("INSERT INTO alunos (nome, chave) VALUES ('Ana', 'ana')").run()).meta.last_row_id;
  const corpo = { data: '2026-10-01', sexo: 'F', idade: 30, peso: 62.5, estatura: 165, protocolo: 'jp7', dobras: { triceps: [18, 18.5, ''], lixo: [1] }, perimetros: { cintura: 72, nada: 3 } };
  const r = await chamar(`/alunos/${id}/avaliacoes`, 'POST', corpo);
  expect(r.status).toBe(201);
  const { id: av } = await r.json() as { id: number };
  await chamar(`/alunos/${id}/avaliacoes`, 'POST', { ...corpo, data: '2026-07-01', peso: 64 });

  const lista = await (await chamar(`/alunos/${id}/avaliacoes`)).json() as { id: number; data: string; dobras: Record<string, unknown>; perimetros: Record<string, unknown> }[];
  expect(lista.map((a) => a.data)).toEqual(['2026-07-01', '2026-10-01']);
  expect(lista[1].dobras).toEqual({ triceps: [18, 18.5, null] });
  expect(lista[1].perimetros).toEqual({ cintura: 72 });
  // O sexo do aluno vem da primeira avaliação.
  expect((await ctx.db.prepare('SELECT sexo FROM alunos WHERE id = ?').bind(id).first<{ sexo: string }>())?.sexo).toBe('F');

  expect((await chamar(`/avaliacoes/${av}`, 'PUT', { ...corpo, peso: 61 })).status).toBe(200);
  expect(((await (await chamar(`/avaliacoes/${av}`)).json()) as { peso: number }).peso).toBe(61);
  expect((await chamar(`/avaliacoes/${av}`, 'DELETE')).status).toBe(200);
  expect((await chamar(`/avaliacoes/${av}`)).status).toBe(404);
});

test('recusa avaliação sem sexo, sem data ou com medida absurda', async () => {
  const id = (await ctx.db.prepare("INSERT INTO alunos (nome, chave) VALUES ('Bruno', 'bruno')").run()).meta.last_row_id;
  const ok = { data: '2026-10-01', sexo: 'M', idade: 30, protocolo: 'jp7' };
  expect((await chamar(`/alunos/${id}/avaliacoes`, 'POST', { ...ok, sexo: undefined })).status).toBe(400);
  expect((await chamar(`/alunos/${id}/avaliacoes`, 'POST', { ...ok, data: '01/10/2026' })).status).toBe(400);
  expect((await chamar(`/alunos/${id}/avaliacoes`, 'POST', { ...ok, dobras: { triceps: [500] } })).status).toBe(400);
  expect((await chamar(`/alunos/999999/avaliacoes`, 'POST', ok)).status).toBe(404);
});
