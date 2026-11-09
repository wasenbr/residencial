import { Hono } from 'hono';
import type {
  Aluno, Config, Contrato, DespesaFixa, Matricula, Mensalidade, Pagamento, Plano, Professor, Turma,
} from '../shared/tipos';
import { FORMAS } from '../shared/tipos';
import { compAtual, diffMeses, dividirValor, periodoDeMeses, somarMeses, validaComp } from '../shared/comp';
import { calcularResumo, type DadosResumo } from '../shared/resumo';
import { importar } from '../import/importar';
import { chaveNome } from '../shared/nomes';
import { MSG_COBRANCA_PADRAO } from '../shared/cobranca';
import { rateio } from '../shared/resumo';

type Env = { Bindings: { DB: D1Database } };

const hoje = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

class Erro extends Error {
  constructor(public status: 400 | 404 | 409, msg: string) { super(msg); }
}

async function carregarConfig(db: D1Database): Promise<Config> {
  const rows = (await db.prepare('SELECT chave, valor FROM config').all()).results as { chave: string; valor: string }[];
  const m = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    nome_academia: m.nome_academia ?? '', nome_usuario: m.nome_usuario ?? '',
    dia_vencimento: Number(m.dia_vencimento ?? 10), desconto_familia: Number(m.desconto_familia ?? 0),
    cartao_caixa: (m.cartao_caixa as Config['cartao_caixa']) ?? 'seguinte',
    aviso_contrato_dias: Number(m.aviso_contrato_dias ?? 30),
    gympass_2x: Number(m.gympass_2x ?? 80), gympass_3x: Number(m.gympass_3x ?? 100), gympass_5x: Number(m.gympass_5x ?? 130),
    msg_cobranca: m.msg_cobranca ?? MSG_COBRANCA_PADRAO,
  };
}

async function fechado(db: D1Database, comp: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS x FROM fechamentos WHERE competencia = ?').bind(comp).first());
}

async function exigeAberto(db: D1Database, comp: string) {
  if (await fechado(db, comp)) throw new Erro(409, `${comp} já está fechado. Reabra o mês para alterar.`);
}

// Dinheiro/Pix/débito entram no caixa do mês do recebimento; crédito e Gympass, no mês seguinte.
function caixaDe(forma: Pagamento['forma'], data: string, cfg: Config): string {
  const mesData = data.slice(0, 7);
  if (forma === 'gympass' || (forma === 'credito' && cfg.cartao_caixa === 'seguinte')) return somarMeses(mesData, 1);
  return mesData;
}

const validaData = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(d);

export async function resumoDoMes(db: D1Database, comp: string) {
  const ant = somarMeses(comp, -1);
  const seg = somarMeses(comp, 1);
  const [config, modalidades, professores, turmas, matriculas, alunos, mensalidades, pagamentos, pagamentosCaixa, caixaSeg, gympAnt, repAnt, existeAnt, saldos, despesas] = await Promise.all([
    carregarConfig(db),
    db.prepare('SELECT * FROM modalidades ORDER BY ordem').all(),
    db.prepare('SELECT * FROM professores').all(),
    db.prepare('SELECT * FROM turmas').all(),
    db.prepare('SELECT * FROM matriculas').all(),
    db.prepare('SELECT id, nome, ativo, origem FROM alunos').all(),
    db.prepare('SELECT * FROM mensalidades WHERE competencia = ?').bind(comp).all(),
    db.prepare('SELECT p.* FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE m.competencia = ? AND m.cancelada = 0').bind(comp).all(),
    db.prepare('SELECT p.*, m.competencia FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE p.caixa = ? AND m.cancelada = 0').bind(comp).all(),
    db.prepare('SELECT p.* FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE substr(p.data, 1, 7) = ? AND p.caixa = ? AND m.cancelada = 0').bind(comp, seg).all(),
    db.prepare("SELECT COALESCE(SUM(p.valor),0) AS v FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE m.competencia = ? AND p.forma = 'gympass' AND m.cancelada = 0").bind(ant).first<{ v: number }>(),
    db.prepare('SELECT * FROM gympass_repasses WHERE competencia = ?').bind(ant).first(),
    db.prepare('SELECT 1 AS x FROM mensalidades WHERE competencia = ? LIMIT 1').bind(ant).first(),
    db.prepare('SELECT chave, valor FROM saldos_importados WHERE competencia = ?').bind(comp).all(),
    db.prepare('SELECT * FROM despesas WHERE competencia = ?').bind(comp).all(),
  ]);
  const dados: DadosResumo = {
    competencia: comp, hoje: hoje(), config,
    modalidades: modalidades.results as never, professores: professores.results as never,
    turmas: turmas.results as never, matriculas: matriculas.results as never, alunos: alunos.results as never,
    mensalidades: mensalidades.results as never, pagamentos: pagamentos.results as never,
    pagamentosCaixa: pagamentosCaixa.results as never, pagamentosCaixaSeguinte: caixaSeg.results as never,
    gympassAnteriorEstimado: existeAnt ? gympAnt?.v ?? 0 : null,
    repasseAnterior: (repAnt as never) ?? null, mesAnteriorExiste: !!existeAnt,
    saldosImportados: saldos.results as never, despesas: despesas.results as never,
  };
  return calcularResumo(dados);
}

function compDe(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query('comp');
  if (q && !validaComp(q)) throw new Erro(400, 'Competência inválida (use AAAA-MM).');
  return q ?? compAtual();
}

export function criarApp() {
  const app = new Hono<Env>().basePath('/api');

  app.onError((e, c) => {
    if (e instanceof Erro) return c.json({ erro: e.message }, e.status);
    console.error(e);
    return c.json({ erro: 'Erro interno: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  });

  // ---------- Base ----------
  app.get('/bootstrap', async (c) => {
    const db = c.env.DB;
    const [config, modalidades, turmas, professores, planos, fixas, comps, fech] = await Promise.all([
      carregarConfig(db),
      db.prepare('SELECT * FROM modalidades ORDER BY ordem').all(),
      db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM matriculas m JOIN alunos a ON a.id = m.aluno_id WHERE m.turma_id = t.id AND a.ativo = 1) AS ocupadas
                  FROM turmas t WHERE t.ativo = 1 ORDER BY t.modalidade_id, t.horario, t.nome`).all(),
      db.prepare('SELECT * FROM professores WHERE ativo = 1').all(),
      db.prepare('SELECT * FROM planos WHERE ativo = 1 ORDER BY categoria, aulas_semana, meses').all(),
      db.prepare('SELECT * FROM despesas_fixas WHERE ativo = 1 ORDER BY dia').all(),
      db.prepare('SELECT DISTINCT competencia FROM mensalidades UNION SELECT DISTINCT competencia FROM despesas ORDER BY competencia DESC').all(),
      db.prepare('SELECT competencia FROM fechamentos').all(),
    ]);
    return c.json({
      config, modalidades: modalidades.results, turmas: turmas.results, professores: professores.results,
      planos: planos.results, despesasFixas: fixas.results,
      competencias: (comps.results as { competencia: string }[]).map((x) => x.competencia),
      fechados: (fech.results as { competencia: string }[]).map((x) => x.competencia),
      hoje: hoje(), compAtual: compAtual(),
    });
  });

  app.get('/resumo', async (c) => {
    const comp = compDe(c);
    const resumo = await resumoDoMes(c.env.DB, comp);
    const [fech, contatos] = await Promise.all([
      c.env.DB.prepare('SELECT fechado_em FROM fechamentos WHERE competencia = ?').bind(comp).first<{ fechado_em: string }>(),
      c.env.DB.prepare('SELECT id, telefone, responsavel, responsavel_tel, recorrente FROM alunos').all(),
    ]);
    const porId = new Map((contatos.results as { id: number }[]).map(({ id, ...ct }) => [id, ct]));
    const comContato = <T extends { aluno_id: number }>(l: T[]) => l.map((x) => ({ ...x, ...porId.get(x.aluno_id) }));
    return c.json({ ...resumo, atrasos: comContato(resumo.atrasos), emAberto: comContato(resumo.emAberto), fechadoEm: fech?.fechado_em ?? null });
  });

  // Indicadores mês a mês (padrão: 12 meses terminando na competência pedida).
  app.get('/historico', async (c) => {
    const db = c.env.DB;
    const ano = c.req.query('ano');
    if (ano && !/^\d{4}$/.test(ano)) throw new Erro(400, 'Ano inválido (use AAAA).');
    let comps: string[];
    if (ano) {
      comps = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    } else if (c.req.query('tudo')) {
      // Do primeiro ao último mês que tem lançamento no sistema.
      const lim = await db.prepare('SELECT MIN(competencia) AS a, MAX(competencia) AS b FROM (SELECT competencia FROM mensalidades UNION ALL SELECT competencia FROM despesas)').first<{ a: string | null; b: string | null }>();
      const fim = lim?.b ?? compAtual();
      const n = Math.min(120, diffMeses(lim?.a ?? fim, fim) + 1);
      comps = Array.from({ length: n }, (_, i) => somarMeses(fim, i - (n - 1)));
    } else {
      const fim = compDe(c);
      const n = Math.min(24, Math.max(1, Number(c.req.query('meses') ?? 12) || 12));
      comps = Array.from({ length: n }, (_, i) => somarMeses(fim, i - (n - 1)));
    }
    const primeira = somarMeses(comps[0], -1);
    const [resumos, pares, fech] = await Promise.all([
      Promise.all(comps.map((comp) => resumoDoMes(db, comp))),
      db.prepare('SELECT DISTINCT aluno_id, competencia FROM mensalidades WHERE cancelada = 0 AND valor > 0').all(),
      db.prepare('SELECT competencia FROM fechamentos').all(),
    ]);
    const porMes = new Map<string, Set<number>>();
    const primeiroMes = new Map<number, string>();
    for (const p of pares.results as { aluno_id: number; competencia: string }[]) {
      if (!porMes.has(p.competencia)) porMes.set(p.competencia, new Set());
      porMes.get(p.competencia)!.add(p.aluno_id);
      const f = primeiroMes.get(p.aluno_id);
      if (!f || p.competencia < f) primeiroMes.set(p.aluno_id, p.competencia);
    }
    const fechados = new Set((fech.results as { competencia: string }[]).map((x) => x.competencia));
    const meses = resumos.map((r, i) => {
      const comp = comps[i];
      const ant = i === 0 ? primeira : comps[i - 1];
      const ativos = porMes.get(comp) ?? new Set<number>();
      const antes = porMes.get(ant);
      // Salário calculado pela regra do professor existe em qualquer mês; só conta como dado o que foi lançado.
      const temDados = ativos.size > 0 || r.despesas.contas > 0 || r.despesas.pessoal.some((x) => !x.calculado);
      // Entradas e saídas só fazem sentido quando o mês anterior também tem dados no sistema.
      let novos: number | null = null, saidas: number | null = null;
      if (antes && antes.size > 0 && ativos.size > 0) {
        novos = [...ativos].filter((a) => !antes.has(a) && primeiroMes.get(a) === comp).length;
        saidas = [...antes].filter((a) => !ativos.has(a)).length;
      }
      const porModalidade = Object.fromEntries(r.porModalidade.map((m) => [m.nome, m.faturamento]));
      return {
        competencia: comp, temDados, fechado: fechados.has(comp),
        alunos: ativos.size, novos, saidas,
        faturamento: r.faturamento, recebido: r.recebido, aberto: r.aberto, atrasado: r.atrasos.reduce((s, a) => s + a.aberto, 0),
        caixa: r.caixa.total, despesas: r.despesas.total, despesasPor: r.despesas.porCategoria, sobra: r.sobra,
        ticket: ativos.size ? Math.round((r.faturamento / ativos.size) * 100) / 100 : 0,
        inadimplencia: r.faturamento ? Math.round((r.aberto / r.faturamento) * 1000) / 10 : 0,
        porModalidade,
      };
    });
    return c.json(meses);
  });

  // ---------- Alunos ----------
  app.get('/alunos', async (c) => {
    const db = c.env.DB;
    const comp = compDe(c);
    const [alunos, mats, contratos, mens, pags, adiantados] = await Promise.all([
      db.prepare('SELECT * FROM alunos ORDER BY nome COLLATE NOCASE').all(),
      db.prepare('SELECT m.aluno_id, m.turma_id, t.nome AS turma, t.modalidade_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id').all(),
      db.prepare('SELECT * FROM contratos WHERE encerrado_em IS NULL').all(),
      db.prepare('SELECT id, aluno_id, valor FROM mensalidades WHERE competencia = ? AND cancelada = 0').bind(comp).all(),
      db.prepare('SELECT p.mensalidade_id, p.valor FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE m.competencia = ?').bind(comp).all(),
      // Último mês futuro já quitado (pagamento adiantado).
      db.prepare(`SELECT m.aluno_id, MAX(m.competencia) AS ate FROM mensalidades m
                  WHERE m.competencia > ? AND m.cancelada = 0
                    AND m.valor <= COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) + 0.009
                  GROUP BY m.aluno_id`).bind(comp).all(),
    ]);
    const pagoAte = new Map((adiantados.results as { aluno_id: number; ate: string }[]).map((x) => [x.aluno_id, x.ate]));
    const pago = new Map<number, number>();
    for (const p of pags.results as { mensalidade_id: number; valor: number }[]) pago.set(p.mensalidade_id, (pago.get(p.mensalidade_id) ?? 0) + p.valor);
    const dev = new Map<number, { devido: number; pago: number }>();
    for (const m of mens.results as { id: number; aluno_id: number; valor: number }[]) {
      const x = dev.get(m.aluno_id) ?? { devido: 0, pago: 0 };
      x.devido += m.valor; x.pago += pago.get(m.id) ?? 0;
      dev.set(m.aluno_id, x);
    }
    const lista = (alunos.results as unknown as Aluno[]).map((a) => {
      const mt = (mats.results as { aluno_id: number; turma: string; turma_id: number }[]).filter((x) => x.aluno_id === a.id);
      const contrato = (contratos.results as unknown as Contrato[]).find((x) => x.aluno_id === a.id) ?? null;
      const d = dev.get(a.id);
      return {
        ...a, turmas: mt.map((x) => ({ id: x.turma_id, nome: x.turma })), contrato,
        devido: d?.devido ?? 0, pago: d?.pago ?? 0, pago_ate: pagoAte.get(a.id) ?? null,
      };
    });
    return c.json(lista);
  });

  app.get('/alunos/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const aluno = await db.prepare('SELECT * FROM alunos WHERE id = ?').bind(id).first<Aluno>();
    if (!aluno) throw new Erro(404, 'Aluno não encontrado.');
    const [turmas, contratos, mens, familia] = await Promise.all([
      db.prepare('SELECT t.*, md.nome AS modalidade FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN modalidades md ON md.id = t.modalidade_id WHERE m.aluno_id = ?').bind(id).all(),
      db.prepare('SELECT * FROM contratos WHERE aluno_id = ? ORDER BY inicio DESC').bind(id).all(),
      db.prepare(`SELECT m.*, md.nome AS modalidade,
                    COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago,
                    (SELECT GROUP_CONCAT(DISTINCT forma) FROM pagamentos WHERE mensalidade_id = m.id) AS formas
                  FROM mensalidades m LEFT JOIN modalidades md ON md.id = m.modalidade_id
                  WHERE m.aluno_id = ? ORDER BY m.competencia DESC, m.id`).bind(id).all(),
      aluno.familia ? db.prepare('SELECT id, nome FROM alunos WHERE familia = ? AND id != ?').bind(aluno.familia, id).all() : Promise.resolve({ results: [] }),
    ]);
    return c.json({ aluno, turmas: turmas.results, contratos: contratos.results, mensalidades: mens.results, familia: familia.results });
  });

  app.post('/alunos', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json<{
      nome: string; telefone?: string; nascimento?: string; responsavel?: string; responsavel_tel?: string; familia?: string;
      origem?: 'particular' | 'gympass'; observacoes?: string; turmas?: number[]; recorrente?: boolean;
      valor?: number; plano?: string; periodo?: 'mensal' | 'semestral' | 'anual'; meses?: number; competencia?: string; modalidade_id?: number;
      partes?: { modalidade_id: number; valor: number }[];
    }>();
    if (!b.nome?.trim()) throw new Erro(400, 'Informe o nome do aluno.');
    const comp = b.competencia ?? compAtual();
    // Valor dividido entre modalidades: o total é a soma das partes.
    const partes = (b.partes ?? []).filter((p) => p.modalidade_id && p.valor > 0);
    if (partes.length > 1) b.valor = r2(partes.reduce((s, p) => s + p.valor, 0));
    if (b.valor && b.valor > 0) await exigeAberto(db, comp);
    const r = await db.prepare(
      'INSERT INTO alunos (nome, chave, telefone, nascimento, responsavel, responsavel_tel, familia, origem, observacoes, recorrente) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(b.nome.trim(), chaveNome(b.nome), b.telefone ?? null, b.nascimento ?? null, b.responsavel ?? null, b.responsavel_tel ?? null, b.familia ?? null, b.origem ?? 'particular', b.observacoes ?? null, b.recorrente ? 1 : 0).run();
    const id = r.meta.last_row_id;
    for (const t of b.turmas ?? []) {
      await db.prepare('INSERT OR IGNORE INTO matriculas (aluno_id, turma_id, inicio) VALUES (?,?,?)').bind(id, t, comp).run();
    }
    let mensalidadeId: number | null = null;
    if (b.valor && b.valor > 0) {
      const cfg = await carregarConfig(db);
      const venc = `${comp}-${String(cfg.dia_vencimento).padStart(2, '0')}`;
      let contratoId: number | null = null;
      const meses = b.meses ?? (b.periodo === 'semestral' ? 6 : b.periodo === 'anual' ? 12 : 1);
      if (meses > 1) {
        const periodo = periodoDeMeses(meses);
        const cr = await db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?)')
          .bind(id, b.plano ?? periodo, periodo, b.valor, comp, meses).run();
        contratoId = cr.meta.last_row_id;
      }
      const lista = partes.length > 1 ? partes : [{ modalidade_id: b.modalidade_id ?? null, valor: b.valor }];
      for (const p of lista) {
        const mr = await db.prepare('INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento) VALUES (?,?,?,?,?,?,?)')
          .bind(id, contratoId, comp, p.modalidade_id, b.plano ?? null, p.valor, venc).run();
        mensalidadeId ??= mr.meta.last_row_id;
      }
    }
    return c.json({ id, mensalidadeId }, 201);
  });

  app.put('/alunos/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<Partial<Aluno>>();
    const campos = ['nome', 'telefone', 'nascimento', 'responsavel', 'responsavel_tel', 'familia', 'origem', 'ativo', 'observacoes', 'recorrente'] as const;
    const sets: string[] = [], vals: unknown[] = [];
    for (const k of campos) if (k in b) { sets.push(`${k} = ?`); vals.push(b[k] ?? null); }
    if (b.nome) { sets.push('chave = ?'); vals.push(chaveNome(b.nome)); }
    if (!sets.length) return c.json({ ok: true });
    await db.prepare(`UPDATE alunos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
    return c.json({ ok: true });
  });

  app.post('/alunos/:id/turmas', async (c) => {
    const { turma_id } = await c.req.json<{ turma_id: number }>();
    await c.env.DB.prepare('INSERT OR IGNORE INTO matriculas (aluno_id, turma_id, inicio) VALUES (?,?,?)').bind(Number(c.req.param('id')), turma_id, compAtual()).run();
    return c.json({ ok: true });
  });
  app.delete('/alunos/:id/turmas/:turma', async (c) => {
    await c.env.DB.prepare('DELETE FROM matriculas WHERE aluno_id = ? AND turma_id = ?').bind(Number(c.req.param('id')), Number(c.req.param('turma'))).run();
    return c.json({ ok: true });
  });

  // Unifica dois cadastros: tudo do "origem" passa para o "destino".
  app.post('/alunos/unificar', async (c) => {
    const db = c.env.DB;
    const { destino, origem } = await c.req.json<{ destino: number; origem: number }>();
    if (!destino || !origem || destino === origem) throw new Erro(400, 'Escolha dois cadastros diferentes.');
    await db.batch([
      db.prepare('UPDATE mensalidades SET aluno_id = ? WHERE aluno_id = ?').bind(destino, origem),
      db.prepare('UPDATE OR IGNORE matriculas SET aluno_id = ? WHERE aluno_id = ?').bind(destino, origem),
      db.prepare('DELETE FROM matriculas WHERE aluno_id = ?').bind(origem),
      db.prepare('UPDATE contratos SET aluno_id = ? WHERE aluno_id = ?').bind(destino, origem),
      db.prepare('DELETE FROM alunos WHERE id = ?').bind(origem),
    ]);
    return c.json({ ok: true });
  });

  // Troca o plano de pagamento de um aluno que já existe: particular ↔ Gympass,
  // valor, forma habitual (dinheiro, Pix, cartão...) e contrato. Vale a partir de
  // um mês já gerado; as mensalidades em aberto desse mês em diante passam a ter
  // o valor novo e os meses seguintes copiam dele. As já pagas não mudam.
  app.post('/alunos/:id/plano', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{
      origem: 'particular' | 'gympass'; valor: number; forma_pagamento?: Pagamento['forma'] | null; descricao?: string;
      a_partir: string; contrato?: 'manter' | 'encerrar' | 'novo'; meses?: number;
    }>();
    const aluno = await db.prepare('SELECT * FROM alunos WHERE id = ?').bind(id).first<Aluno>();
    if (!aluno) throw new Erro(404, 'Aluno não encontrado.');
    if (b.origem !== 'particular' && b.origem !== 'gympass') throw new Erro(400, 'Escolha particular ou Gympass.');
    if (!validaComp(b.a_partir)) throw new Erro(400, 'Informe a partir de qual mês.');
    if (!(b.valor > 0)) throw new Erro(400, b.origem === 'gympass' ? 'Informe o valor estimado do Gympass.' : 'Informe o valor da mensalidade.');
    const forma = b.origem === 'gympass' ? 'gympass' : b.forma_pagamento ?? null;
    if (forma != null && !FORMAS.includes(forma)) throw new Erro(400, 'Forma de pagamento inválida.');
    if (b.origem === 'particular' && forma === 'gympass') throw new Erro(400, 'Para pagar pelo Gympass, escolha o tipo Gympass.');
    // Gympass não tem contrato com o estúdio.
    const modo = b.origem === 'gympass' ? 'encerrar' : b.contrato ?? 'manter';
    const meses = b.meses ?? 1;
    if (modo === 'novo' && (!Number.isInteger(meses) || meses < 2 || meses > 60)) throw new Erro(400, 'Duração do contrato inválida (2 a 60 meses).');
    await exigeAberto(db, b.a_partir);

    const mens = (await db.prepare(`
      SELECT m.id, m.competencia, m.modalidade_id, m.contrato_id, COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago
      FROM mensalidades m WHERE m.aluno_id = ? AND m.cancelada = 0 AND m.competencia >= ? ORDER BY m.competencia, m.id`).bind(id, b.a_partir).all()).results as
      { id: number; competencia: string; modalidade_id: number | null; contrato_id: number | null; pago: number }[];
    const temNoMes = mens.some((m) => m.competencia === b.a_partir);
    if (!temNoMes) {
      const gerado = await db.prepare('SELECT 1 AS x FROM mensalidades WHERE competencia = ? AND adiantado = 0 LIMIT 1').bind(b.a_partir).first();
      if (!gerado) throw new Erro(400, `${b.a_partir} ainda não foi gerado. Gere o mês antes ou troque o plano a partir de um mês já gerado.`);
    }
    const porMes = new Map<string, number>();
    for (const m of mens) porMes.set(m.competencia, (porMes.get(m.competencia) ?? 0) + 1);

    const descricao = b.descricao?.trim() || (b.origem === 'gympass' ? 'Gympass' : null);
    const ativo = await db.prepare('SELECT * FROM contratos WHERE aluno_id = ? AND encerrado_em IS NULL ORDER BY inicio DESC LIMIT 1').bind(id).first<Contrato>();
    const stmts: D1PreparedStatement[] = [
      db.prepare('UPDATE alunos SET origem = ?, forma_pagamento = ? WHERE id = ?').bind(b.origem, forma, id),
    ];
    if (ativo && modo !== 'manter') stmts.push(db.prepare('UPDATE contratos SET encerrado_em = ? WHERE id = ?').bind(hoje(), ativo.id));
    if (modo === 'novo') {
      stmts.push(db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?)')
        .bind(id, descricao ?? periodoDeMeses(meses), periodoDeMeses(meses), b.valor, b.a_partir, meses));
    }
    // contrato_id que as mensalidades em aberto passam a ter
    const fimNovo = somarMeses(b.a_partir, meses);
    const contratoDe = (comp: string): [string, unknown[]] => {
      if (modo === 'novo') return comp < fimNovo ? ['(SELECT MAX(id) FROM contratos WHERE aluno_id = ?)', [id]] : ['NULL', []];
      if (modo === 'encerrar') return ['NULL', []];
      return ['contrato_id', []];
    };
    let alteradas = 0, mantidas = 0;
    for (const m of mens) {
      if (m.pago > 0) { mantidas++; continue; }
      const [sqlC, argsC] = contratoDe(m.competencia);
      if (porMes.get(m.competencia) === 1) {
        stmts.push(db.prepare(`UPDATE mensalidades SET valor = ?, descricao = COALESCE(?, descricao), contrato_id = ${sqlC} WHERE id = ?`)
          .bind(b.valor, descricao, ...argsC, m.id));
        alteradas++;
      } else {
        // Várias modalidades no mesmo mês: o valor de cada uma fica como está.
        stmts.push(db.prepare(`UPDATE mensalidades SET contrato_id = ${sqlC} WHERE id = ?`).bind(...argsC, m.id));
        mantidas++;
      }
    }
    let criada = false;
    if (!temNoMes) {
      // Aluno sem mensalidade no mês (ex.: Gympass cadastrado sem valor): cria a do mês.
      const ultima = await db.prepare('SELECT modalidade_id FROM mensalidades WHERE aluno_id = ? ORDER BY competencia DESC, id DESC LIMIT 1').bind(id).first<{ modalidade_id: number | null }>();
      const mods = (await db.prepare('SELECT DISTINCT t.modalidade_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = ?').bind(id).all()).results as { modalidade_id: number }[];
      const modalidadeId = ultima?.modalidade_id ?? (mods.length === 1 ? mods[0].modalidade_id : null);
      const cfg = await carregarConfig(db);
      const [sqlC, argsC] = contratoDe(b.a_partir);
      stmts.push(db.prepare(`INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento) VALUES (?, ${sqlC === 'contrato_id' ? (ativo ? String(ativo.id) : 'NULL') : sqlC}, ?,?,?,?,?)`)
        .bind(id, ...argsC, b.a_partir, modalidadeId, descricao, b.valor, `${b.a_partir}-${String(cfg.dia_vencimento).padStart(2, '0')}`));
      criada = true;
    }
    await db.batch(stmts);
    return c.json({ alteradas, mantidas, criada });
  });

  // Divide a mensalidade de um aluno entre modalidades (ex.: R$ 150 = 70 Zumba + 80 Funcional).
  // A mensalidade do mês vira uma por modalidade; com "propagar", os meses seguintes já
  // gerados (sem pagamento e ainda com o valor antigo) são divididos igual, e os novos copiam.
  app.post('/alunos/:id/dividir', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{ competencia: string; partes: { modalidade_id: number; valor: number }[]; propagar?: boolean }>();
    if (!validaComp(b.competencia)) throw new Erro(400, 'Informe o mês.');
    const partes = (b.partes ?? []).map((p) => ({ modalidade_id: Number(p.modalidade_id), valor: r2(Number(p.valor)) }));
    if (partes.length < 2) throw new Erro(400, 'Informe pelo menos duas modalidades.');
    if (new Set(partes.map((p) => p.modalidade_id)).size !== partes.length) throw new Erro(400, 'Cada modalidade só pode aparecer uma vez.');
    if (partes.some((p) => !(p.valor > 0))) throw new Erro(400, 'Informe o valor de cada modalidade.');
    await exigeAberto(db, b.competencia);
    const existentes = new Set(((await db.prepare('SELECT id FROM modalidades').all()).results as { id: number }[]).map((x) => x.id));
    if (partes.some((p) => !existentes.has(p.modalidade_id))) throw new Erro(400, 'Modalidade inválida.');

    const mens = (await db.prepare(`
      SELECT m.*, COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago
      FROM mensalidades m WHERE m.aluno_id = ? AND m.cancelada = 0 AND m.competencia >= ? ORDER BY m.competencia, m.id`).bind(id, b.competencia).all()).results as unknown as
      (Mensalidade & { pago: number })[];
    const doMes = mens.filter((m) => m.competencia === b.competencia);
    if (doMes.length !== 1) throw new Erro(409, doMes.length === 0 ? 'O aluno não tem mensalidade nesse mês.' : 'Esse mês já tem mais de uma mensalidade. Use “Alterar” em cada linha.');
    const alvo = doMes[0];
    if (alvo.pago > 0) throw new Erro(409, 'Esse mês já tem pagamento registrado. Divida a partir do mês seguinte.');

    const alvos = [alvo];
    if (b.propagar) {
      const fechados = new Set(((await db.prepare('SELECT competencia FROM fechamentos').all()).results as { competencia: string }[]).map((x) => x.competencia));
      const porMes = new Map<string, number>();
      for (const m of mens) porMes.set(m.competencia, (porMes.get(m.competencia) ?? 0) + 1);
      for (const m of mens) {
        if (m.competencia <= b.competencia || fechados.has(m.competencia) || porMes.get(m.competencia) !== 1) continue;
        if (m.pago > 0 || m.modalidade_id !== alvo.modalidade_id || m.descricao !== alvo.descricao || Math.abs(m.valor - alvo.valor) > 0.009) continue;
        alvos.push(m);
      }
    }
    const stmts: D1PreparedStatement[] = [];
    for (const m of alvos) {
      stmts.push(db.prepare('UPDATE mensalidades SET valor = ?, modalidade_id = ? WHERE id = ?').bind(partes[0].valor, partes[0].modalidade_id, m.id));
      for (const p of partes.slice(1)) {
        stmts.push(db.prepare('INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento, adiantado) VALUES (?,?,?,?,?,?,?,?)')
          .bind(id, m.contrato_id, m.competencia, p.modalidade_id, m.descricao, p.valor, m.vencimento, m.adiantado));
      }
    }
    const total = r2(partes.reduce((s, p) => s + p.valor, 0));
    if (b.propagar && alvo.contrato_id != null) stmts.push(db.prepare('UPDATE contratos SET valor_mensal = ? WHERE id = ?').bind(total, alvo.contrato_id));
    await db.batch(stmts);
    return c.json({ meses: alvos.length, total });
  });

  // Contrato novo para um aluno que já está cadastrado. Vale a partir de um mês
  // que já tem a mensalidade dele; os meses seguintes copiam dela.
  app.post('/alunos/:id/contratos', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{ plano?: string; valor_mensal: number; meses: number; inicio: string }>();
    if (!validaComp(b.inicio)) throw new Erro(400, 'Informe o mês de início.');
    if (!(b.valor_mensal > 0)) throw new Erro(400, 'Informe o valor mensal.');
    if (!Number.isInteger(b.meses) || b.meses < 1 || b.meses > 60) throw new Erro(400, 'Duração inválida (1 a 60 meses).');
    await exigeAberto(db, b.inicio);
    const mens = (await db.prepare(`
      SELECT m.id, m.competencia, COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago
      FROM mensalidades m WHERE m.aluno_id = ? AND m.competencia >= ? AND m.cancelada = 0`).bind(id, b.inicio).all()).results as { id: number; competencia: string; pago: number }[];
    if (!mens.some((m) => m.competencia === b.inicio)) {
      throw new Erro(400, `O aluno ainda não tem mensalidade em ${b.inicio}. Gere o mês antes ou comece o contrato em outro mês.`);
    }
    // Só mexe nos meses com uma mensalidade só (com várias modalidades, o valor de cada uma fica como está).
    const porMes = new Map<string, number>();
    for (const m of mens) porMes.set(m.competencia, (porMes.get(m.competencia) ?? 0) + 1);
    const fim = somarMeses(b.inicio, b.meses);
    const plano = b.plano?.trim() || periodoDeMeses(b.meses);
    const stmts: D1PreparedStatement[] = [
      db.prepare('UPDATE contratos SET encerrado_em = ? WHERE aluno_id = ? AND encerrado_em IS NULL').bind(hoje(), id),
      db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?)')
        .bind(id, plano, periodoDeMeses(b.meses), b.valor_mensal, b.inicio, b.meses),
    ];
    for (const m of mens) {
      if (m.competencia >= fim) continue;
      const novoContrato = 'contrato_id = (SELECT MAX(id) FROM contratos WHERE aluno_id = ?)';
      if (porMes.get(m.competencia) === 1 && m.pago === 0) {
        stmts.push(db.prepare(`UPDATE mensalidades SET ${novoContrato}, valor = ?, descricao = ? WHERE id = ?`).bind(id, b.valor_mensal, plano, m.id));
      } else {
        stmts.push(db.prepare(`UPDATE mensalidades SET ${novoContrato} WHERE id = ?`).bind(id, m.id));
      }
    }
    await db.batch(stmts);
    return c.json({ ok: true }, 201);
  });

  // Pagamento adiantado de vários meses (ex.: 3 meses de uma vez, plano de 13 meses).
  // Faturamento: cada mês recebe a sua parte (total ÷ meses). Caixa: tudo no mês do recebimento.
  app.post('/alunos/:id/adiantado', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{
      inicio: string; meses: number; valor_total: number; forma: Pagamento['forma']; data?: string;
      modalidade_id?: number | null; descricao?: string; contrato?: 'novo' | 'atual';
    }>();
    const aluno = await db.prepare('SELECT * FROM alunos WHERE id = ?').bind(id).first<Aluno>();
    if (!aluno) throw new Erro(404, 'Aluno não encontrado.');
    if (!validaComp(b.inicio)) throw new Erro(400, 'Informe o primeiro mês pago.');
    if (!Number.isInteger(b.meses) || b.meses < 2 || b.meses > 36) throw new Erro(400, 'Informe de 2 a 36 meses.');
    if (!(b.valor_total > 0)) throw new Erro(400, 'Informe o valor recebido.');
    if (!FORMAS.includes(b.forma) || b.forma === 'gympass') throw new Erro(400, 'Forma de pagamento inválida para pagamento adiantado.');
    const data = b.data ?? hoje();
    if (!validaData(data)) throw new Erro(400, 'Data do pagamento inválida.');
    const cfg = await carregarConfig(db);
    const caixa = caixaDe(b.forma, data, cfg);
    const comps = Array.from({ length: b.meses }, (_, i) => somarMeses(b.inicio, i));
    for (const comp of new Set([...comps, caixa])) await exigeAberto(db, comp);

    // Modalidade e descrição: as informadas, ou as da mensalidade mais recente do aluno.
    const ultima = await db.prepare('SELECT modalidade_id, descricao FROM mensalidades WHERE aluno_id = ? AND cancelada = 0 ORDER BY competencia DESC, id DESC LIMIT 1')
      .bind(id).first<{ modalidade_id: number | null; descricao: string | null }>();
    const modalidadeId = b.modalidade_id !== undefined ? b.modalidade_id : ultima?.modalidade_id ?? null;
    const descricao = b.descricao?.trim() || ultima?.descricao || 'Plano adiantado';

    const existentes = (await db.prepare(`
      SELECT m.id, m.competencia, m.modalidade_id, COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago
      FROM mensalidades m WHERE m.aluno_id = ? AND m.cancelada = 0 AND m.competencia BETWEEN ? AND ?`)
      .bind(id, comps[0], comps[comps.length - 1]).all()).results as { id: number; competencia: string; modalidade_id: number | null; pago: number }[];
    const doMes = new Map<string, (typeof existentes)[number]>();
    for (const m of existentes) {
      if (m.modalidade_id !== modalidadeId) continue;
      if (doMes.has(m.competencia)) throw new Erro(409, `${aluno.nome} tem mais de uma mensalidade em ${m.competencia} nessa modalidade. Cancele a duplicada antes.`);
      if (m.pago > 0) throw new Erro(409, `A mensalidade de ${m.competencia} já tem pagamento. Comece o adiantado no mês seguinte ou remova aquele pagamento.`);
      doMes.set(m.competencia, m);
    }

    const ativo = await db.prepare('SELECT * FROM contratos WHERE aluno_id = ? AND encerrado_em IS NULL ORDER BY inicio DESC LIMIT 1').bind(id).first<Contrato>();
    const modoContrato = b.contrato ?? 'novo';
    if (modoContrato === 'atual' && !ativo) throw new Erro(400, 'O aluno não tem contrato ativo.');
    const parcelas = dividirValor(b.valor_total, b.meses);
    const stmts: D1PreparedStatement[] = [];
    let contratoSql = '?';
    let contratoArg: number = ativo?.id ?? 0;
    if (modoContrato === 'novo') {
      // O contrato cobre os meses pagos; ao terminar, aparece em "contratos terminando" para renovar.
      if (ativo) stmts.push(db.prepare('UPDATE contratos SET encerrado_em = ? WHERE id = ?').bind(hoje(), ativo.id));
      stmts.push(db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?)')
        .bind(id, descricao, periodoDeMeses(b.meses), parcelas[0], b.inicio, b.meses));
      contratoSql = '(SELECT MAX(id) FROM contratos WHERE aluno_id = ?)';
      contratoArg = id;
    }
    const insPag = 'INSERT INTO pagamentos (mensalidade_id, valor, forma, data, caixa) VALUES (?,?,?,?,?)';
    comps.forEach((comp, i) => {
      const ex = doMes.get(comp);
      const venc = `${comp}-${String(cfg.dia_vencimento).padStart(2, '0')}`;
      if (ex) {
        stmts.push(db.prepare(`UPDATE mensalidades SET contrato_id = ${contratoSql}, valor = ?, adiantado = 1 WHERE id = ?`).bind(contratoArg, parcelas[i], ex.id));
        stmts.push(db.prepare(insPag).bind(ex.id, parcelas[i], b.forma, data, caixa));
      } else {
        stmts.push(db.prepare(`INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento, adiantado) VALUES (?, ${contratoSql}, ?,?,?,?,?, 1)`)
          .bind(id, contratoArg, comp, modalidadeId, descricao, parcelas[i], venc));
        stmts.push(db.prepare('INSERT INTO pagamentos (mensalidade_id, valor, forma, data, caixa) VALUES (last_insert_rowid(),?,?,?,?)')
          .bind(parcelas[i], b.forma, data, caixa));
      }
    });
    await db.batch(stmts);
    return c.json({ meses: b.meses, de: comps[0], ate: comps[comps.length - 1], parcela: parcelas[0], caixa }, 201);
  });

  // Contratos que estão no último mês (ou já passaram dele) na competência.
  app.get('/contratos/vencendo', async (c) => {
    const comp = compDe(c);
    const r = await c.env.DB.prepare(`
      SELECT c.*, a.nome FROM contratos c JOIN alunos a ON a.id = c.aluno_id
      WHERE c.encerrado_em IS NULL AND c.meses IS NOT NULL AND a.ativo = 1 ORDER BY c.inicio`).all();
    const lista = (r.results as unknown as (Contrato & { nome: string })[])
      .map((x) => ({ ...x, mes: diffMeses(x.inicio, comp) + 1 }))
      .filter((x) => x.mes >= (x.meses ?? 99) && x.mes >= 1);
    return c.json(lista);
  });

  app.post('/contratos/:id/encerrar', async (c) => {
    await c.env.DB.prepare('UPDATE contratos SET encerrado_em = ? WHERE id = ?').bind(hoje(), Number(c.req.param('id'))).run();
    return c.json({ ok: true });
  });
  app.post('/contratos/:id/renovar', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const ct = await db.prepare('SELECT * FROM contratos WHERE id = ?').bind(id).first<Contrato>();
    if (!ct) throw new Erro(404, 'Contrato não encontrado.');
    const novoInicio = somarMeses(ct.inicio, ct.meses ?? 1);
    await db.batch([
      db.prepare('UPDATE contratos SET encerrado_em = ? WHERE id = ?').bind(hoje(), id),
      db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, desconto, inicio, meses) VALUES (?,?,?,?,?,?,?)')
        .bind(ct.aluno_id, ct.plano, ct.periodo, ct.valor_mensal, ct.desconto, novoInicio, ct.meses),
    ]);
    return c.json({ ok: true });
  });

  // ---------- Turmas ----------
  app.post('/turmas', async (c) => {
    const b = await c.req.json<{ modalidade_id: number; nome: string; dias?: string; horario?: string; aulas_semana?: number; vagas?: number; professor_id?: number }>();
    if (!b.nome?.trim() || !b.modalidade_id) throw new Erro(400, 'Informe modalidade e nome da turma.');
    const r = await c.env.DB.prepare('INSERT INTO turmas (modalidade_id, nome, dias, horario, aulas_semana, vagas, professor_id) VALUES (?,?,?,?,?,?,?)')
      .bind(b.modalidade_id, b.nome.trim(), b.dias ?? null, b.horario ?? null, b.aulas_semana ?? 1, b.vagas ?? null, b.professor_id ?? null).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });
  app.put('/turmas/:id', async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if ('nome' in b) {
      const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
      if (!nome) throw new Erro(400, 'Informe o nome da turma.');
      b.nome = nome;
    }
    const campos = ['nome', 'dias', 'horario', 'aulas_semana', 'vagas', 'professor_id', 'ativo'];
    const sets: string[] = [], vals: unknown[] = [];
    for (const k of campos) if (k in b) { sets.push(`${k} = ?`); vals.push(b[k] ?? null); }
    if (sets.length) await c.env.DB.prepare(`UPDATE turmas SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, Number(c.req.param('id'))).run();
    return c.json({ ok: true });
  });
  app.get('/turmas/inativas', async (c) => {
    const r = await c.env.DB.prepare(`SELECT t.*, (SELECT COUNT(*) FROM matriculas m JOIN alunos a ON a.id = m.aluno_id WHERE m.turma_id = t.id AND a.ativo = 1) AS ocupadas
      FROM turmas t WHERE t.ativo = 0 ORDER BY t.modalidade_id, t.horario, t.nome`).all();
    return c.json(r.results);
  });
  // Alunos da turma com a situação de pagamento na competência.
  app.get('/turmas/:id/alunos', async (c) => {
    const comp = compDe(c);
    const r = await c.env.DB.prepare(`
      SELECT a.id, a.nome, a.ativo, a.telefone, a.responsavel, a.responsavel_tel, a.recorrente,
             COALESCE(SUM(ms.valor), 0) AS devido,
             COALESCE(SUM((SELECT SUM(p.valor) FROM pagamentos p WHERE p.mensalidade_id = ms.id)), 0) AS pago,
             MIN(ms.vencimento) AS vencimento, COUNT(ms.id) AS qtd
      FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN mensalidades ms ON ms.aluno_id = a.id AND ms.competencia = ? AND ms.cancelada = 0
      WHERE m.turma_id = ? GROUP BY a.id ORDER BY a.nome COLLATE NOCASE`).bind(comp, Number(c.req.param('id'))).all();
    return c.json(r.results);
  });

  // ---------- Mensalidades e pagamentos ----------
  app.get('/mensalidades', async (c) => {
    const comp = compDe(c);
    const r = await c.env.DB.prepare(`
      SELECT m.*, a.nome AS aluno, a.origem, a.telefone, a.responsavel, a.responsavel_tel, a.recorrente, a.forma_pagamento, md.nome AS modalidade,
             COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago,
             (SELECT GROUP_CONCAT(DISTINCT forma) FROM pagamentos WHERE mensalidade_id = m.id) AS formas
      FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id LEFT JOIN modalidades md ON md.id = m.modalidade_id
      WHERE m.competencia = ? AND m.cancelada = 0 ORDER BY a.nome COLLATE NOCASE, m.id`).bind(comp).all();
    return c.json(r.results);
  });

  app.post('/mensalidades', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json<{ aluno_id: number; competencia: string; valor: number; modalidade_id?: number; descricao?: string }>();
    if (!validaComp(b.competencia) || !(b.valor > 0)) throw new Erro(400, 'Informe competência e valor.');
    await exigeAberto(db, b.competencia);
    const cfg = await carregarConfig(db);
    const r = await db.prepare('INSERT INTO mensalidades (aluno_id, competencia, modalidade_id, descricao, valor, vencimento) VALUES (?,?,?,?,?,?)')
      .bind(b.aluno_id, b.competencia, b.modalidade_id ?? null, b.descricao ?? null, b.valor, `${b.competencia}-${String(cfg.dia_vencimento).padStart(2, '0')}`).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.put('/mensalidades/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const m = await db.prepare('SELECT * FROM mensalidades WHERE id = ?').bind(id).first<Mensalidade>();
    if (!m) throw new Erro(404, 'Mensalidade não encontrada.');
    await exigeAberto(db, m.competencia);
    const b = await c.req.json<{ valor?: number; cancelada?: number; observacao?: string; propagar?: boolean }>();
    if (b.valor != null) {
      if (!(b.valor >= 0)) throw new Erro(400, 'Valor inválido.');
      await db.prepare('UPDATE mensalidades SET valor = ? WHERE id = ?').bind(b.valor, id).run();
      if (b.propagar) {
        // Meses seguintes já gerados (e não fechados) da mesma cobrança, que ainda tinham o valor antigo, passam ao novo.
        await db.prepare(`UPDATE mensalidades SET valor = ? WHERE aluno_id = ? AND competencia > ? AND cancelada = 0
            AND modalidade_id IS ? AND descricao IS ? AND ABS(valor - ?) < 0.01 AND competencia NOT IN (SELECT competencia FROM fechamentos)`)
          .bind(b.valor, m.aluno_id, m.competencia, m.modalidade_id, m.descricao, m.valor).run();
        if (m.contrato_id != null) await db.prepare('UPDATE contratos SET valor_mensal = ? WHERE id = ?').bind(b.valor, m.contrato_id).run();
      }
    }
    if (b.cancelada != null) await db.prepare('UPDATE mensalidades SET cancelada = ? WHERE id = ?').bind(b.cancelada ? 1 : 0, id).run();
    if (b.observacao != null) await db.prepare('UPDATE mensalidades SET observacao = ? WHERE id = ?').bind(b.observacao, id).run();
    return c.json({ ok: true });
  });

  app.post('/pagamentos', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json<{ mensalidade_id: number; valor: number; forma: Pagamento['forma']; data?: string }>();
    if (!FORMAS.includes(b.forma)) throw new Erro(400, 'Forma de pagamento inválida.');
    if (!(b.valor > 0)) throw new Erro(400, 'Informe o valor recebido.');
    const m = await db.prepare('SELECT * FROM mensalidades WHERE id = ?').bind(b.mensalidade_id).first<Mensalidade>();
    if (!m) throw new Erro(404, 'Mensalidade não encontrada.');
    await exigeAberto(db, m.competencia);
    const cfg = await carregarConfig(db);
    const data = b.data ?? hoje();
    if (!validaData(data)) throw new Erro(400, 'Data do pagamento inválida.');
    const caixa = caixaDe(b.forma, data, cfg);
    // O dinheiro não pode entrar no caixa de um mês já fechado.
    if (caixa !== m.competencia) await exigeAberto(db, caixa);
    const r = await db.prepare('INSERT INTO pagamentos (mensalidade_id, valor, forma, data, caixa) VALUES (?,?,?,?,?)')
      .bind(b.mensalidade_id, b.valor, b.forma, data, caixa).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.delete('/pagamentos/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const m = await db.prepare('SELECT m.competencia FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE p.id = ?').bind(id).first<{ competencia: string }>();
    if (m) await exigeAberto(db, m.competencia);
    await db.prepare('DELETE FROM pagamentos WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  });

  app.get('/mensalidades/:id/pagamentos', async (c) => {
    const r = await c.env.DB.prepare('SELECT * FROM pagamentos WHERE mensalidade_id = ? ORDER BY data, id').bind(Number(c.req.param('id'))).all();
    return c.json(r.results);
  });

  // Baixa em lote das mensalidades em aberto dos alunos com cobrança recorrente no cartão.
  app.post('/mensalidades/baixar-recorrentes', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json<{ competencia: string; data?: string }>();
    if (!validaComp(b.competencia)) throw new Erro(400, 'Competência inválida.');
    await exigeAberto(db, b.competencia);
    const cfg = await carregarConfig(db);
    const data = b.data ?? hoje();
    const mesData = data.slice(0, 7);
    const caixa = cfg.cartao_caixa === 'seguinte' ? somarMeses(mesData, 1) : mesData;
    const abertas = (await db.prepare(`
      SELECT m.id, m.valor - COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS falta
      FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
      WHERE m.competencia = ? AND m.cancelada = 0 AND a.recorrente = 1`).bind(b.competencia).all()).results as { id: number; falta: number }[];
    const st = abertas.filter((x) => x.falta > 0.009)
      .map((x) => db.prepare("INSERT INTO pagamentos (mensalidade_id, valor, forma, data, caixa) VALUES (?,?,'credito',?,?)").bind(x.id, Math.round(x.falta * 100) / 100, data, caixa));
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    return c.json({ baixadas: st.length });
  });

  // Mensalidades que compõem o faturamento de uma modalidade (com o mesmo rateio do dashboard).
  app.get('/modalidades/:id/mensalidades', async (c) => {
    const db = c.env.DB;
    const comp = compDe(c);
    const idParam = c.req.param('id');
    const alvo = idParam === 'sem' ? null : Number(idParam);
    const [mens, mats, turmas] = await Promise.all([
      db.prepare(`SELECT m.*, a.nome AS aluno, a.telefone, a.responsavel, a.responsavel_tel, a.recorrente,
                    COALESCE((SELECT SUM(valor) FROM pagamentos WHERE mensalidade_id = m.id), 0) AS pago
                  FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
                  WHERE m.competencia = ? AND m.cancelada = 0 ORDER BY a.nome COLLATE NOCASE`).bind(comp).all(),
      db.prepare('SELECT * FROM matriculas').all(),
      db.prepare('SELECT * FROM turmas').all(),
    ]);
    const mapaTurmas = new Map((turmas.results as unknown as Turma[]).map((t) => [t.id, t]));
    const porAluno = new Map<number, Matricula[]>();
    for (const mt of mats.results as unknown as Matricula[]) {
      if (!porAluno.has(mt.aluno_id)) porAluno.set(mt.aluno_id, []);
      porAluno.get(mt.aluno_id)!.push(mt);
    }
    const linhas = [];
    for (const m of mens.results as unknown as (Mensalidade & { pago: number })[]) {
      const frac = rateio(m, porAluno.get(m.aluno_id) ?? [], mapaTurmas).get(alvo) ?? 0;
      if (frac <= 0) continue;
      linhas.push({ ...m, fracao: frac, valor: m.valor * frac, pago: m.pago * frac, valor_total: m.valor, pago_total: m.pago });
    }
    return c.json(linhas);
  });

  // Gera as mensalidades e despesas fixas de um mês a partir do mês anterior.
  app.post('/mes/gerar', async (c) => {
    const db = c.env.DB;
    const { competencia } = await c.req.json<{ competencia: string }>();
    if (!validaComp(competencia)) throw new Erro(400, 'Competência inválida.');
    await exigeAberto(db, competencia);
    const ant = somarMeses(competencia, -1);
    const cfg = await carregarConfig(db);
    const venc = `${competencia}-${String(cfg.dia_vencimento).padStart(2, '0')}`;
    const ja = await db.prepare('SELECT COUNT(*) AS n FROM mensalidades WHERE competencia = ? AND adiantado = 0').bind(competencia).first<{ n: number }>();
    if ((ja?.n ?? 0) > 0) throw new Erro(409, 'Este mês já tem mensalidades.');
    // Quem pagou adiantado já tem a mensalidade do mês: não duplica.
    const jaLancadas = new Set(((await db.prepare('SELECT aluno_id, modalidade_id FROM mensalidades WHERE competencia = ? AND cancelada = 0').bind(competencia).all()).results as
      { aluno_id: number; modalidade_id: number | null }[]).map((x) => `${x.aluno_id}|${x.modalidade_id ?? ''}`));
    let adiantados = 0;
    const anteriores = (await db.prepare(`
      SELECT m.aluno_id, m.contrato_id, m.modalidade_id, m.descricao, m.valor
      FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
      WHERE m.competencia = ? AND m.cancelada = 0 AND a.ativo = 1 AND m.valor > 0`).bind(ant).all()).results as unknown as
      Pick<Mensalidade, 'aluno_id' | 'contrato_id' | 'modalidade_id' | 'descricao' | 'valor'>[];
    const contratos = new Map((await db.prepare('SELECT * FROM contratos').all()).results.map((x) => [(x as unknown as Contrato).id, x as unknown as Contrato]));
    const vigente = (ct: Contrato) => !ct.encerrado_em && (ct.meses == null || diffMeses(ct.inicio, competencia) < ct.meses);
    const novas: D1PreparedStatement[] = [];
    let contratosFinalizados = 0;
    for (const m of anteriores) {
      if (jaLancadas.has(`${m.aluno_id}|${m.modalidade_id ?? ''}`)) { adiantados++; continue; }
      let contratoId = m.contrato_id;
      if (contratoId != null) {
        const atual = contratos.get(contratoId);
        let ct = atual && vigente(atual) ? atual : undefined;
        // Contrato renovado: a cobrança segue no contrato novo do mesmo aluno.
        if (!ct && atual?.encerrado_em) {
          ct = [...contratos.values()].find((x) => x.aluno_id === m.aluno_id && x.id !== atual.id && x.inicio <= competencia && vigente(x));
        }
        if (!ct) {
          if (atual && !atual.encerrado_em) contratosFinalizados++;
          continue;
        }
        contratoId = ct.id;
      }
      novas.push(db.prepare('INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento) VALUES (?,?,?,?,?,?,?)')
        .bind(m.aluno_id, contratoId, competencia, m.modalidade_id, m.descricao, m.valor, venc));
    }
    for (let i = 0; i < novas.length; i += 50) await db.batch(novas.slice(i, i + 50));
    const f = await db.prepare(`
      INSERT INTO despesas (competencia, descricao, categoria, tipo, valor, vencimento, despesa_fixa_id)
      SELECT ?, f.descricao, f.categoria, 'fixa', COALESCE(f.valor, 0),
             CASE WHEN f.dia IS NULL THEN NULL ELSE ? || '-' || printf('%02d', f.dia) END, f.id
      FROM despesas_fixas f WHERE f.ativo = 1
        AND NOT EXISTS (SELECT 1 FROM despesas d WHERE d.competencia = ? AND d.despesa_fixa_id = f.id)`).bind(competencia, competencia, competencia).run();
    return c.json({ mensalidades: novas.length, despesas: f.meta.changes, contratosFinalizados, adiantados });
  });

  // ---------- Despesas ----------
  app.get('/despesas', async (c) => {
    const comp = compDe(c);
    const r = await c.env.DB.prepare('SELECT * FROM despesas WHERE competencia = ? ORDER BY tipo = \'retirada\', pago_em IS NOT NULL, vencimento, id').bind(comp).all();
    return c.json(r.results);
  });
  app.post('/despesas', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json<{ competencia: string; descricao: string; categoria?: string; tipo?: string; valor: number; vencimento?: string; pago?: boolean }>();
    if (!validaComp(b.competencia) || !b.descricao?.trim() || !(b.valor >= 0)) throw new Erro(400, 'Informe descrição e valor.');
    await exigeAberto(db, b.competencia);
    const tipo = ['fixa', 'variavel', 'pessoal', 'retirada'].includes(b.tipo ?? '') ? b.tipo : 'variavel';
    const r = await db.prepare('INSERT INTO despesas (competencia, descricao, categoria, tipo, valor, vencimento, pago_em) VALUES (?,?,?,?,?,?,?)')
      .bind(b.competencia, b.descricao.trim(), b.categoria ?? 'Outros', tipo, b.valor, b.vencimento ?? null, b.pago || tipo === 'retirada' ? hoje() : null).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });
  app.put('/despesas/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const d = await db.prepare('SELECT competencia FROM despesas WHERE id = ?').bind(id).first<{ competencia: string }>();
    if (!d) throw new Erro(404, 'Despesa não encontrada.');
    await exigeAberto(db, d.competencia);
    const b = await c.req.json<{ valor?: number; descricao?: string; vencimento?: string; pago?: boolean }>();
    if (b.valor != null) await db.prepare('UPDATE despesas SET valor = ? WHERE id = ?').bind(b.valor, id).run();
    if (b.descricao) await db.prepare('UPDATE despesas SET descricao = ? WHERE id = ?').bind(b.descricao, id).run();
    if (b.vencimento !== undefined) await db.prepare('UPDATE despesas SET vencimento = ? WHERE id = ?').bind(b.vencimento, id).run();
    if (b.pago != null) await db.prepare('UPDATE despesas SET pago_em = ? WHERE id = ?').bind(b.pago ? hoje() : null, id).run();
    return c.json({ ok: true });
  });
  app.delete('/despesas/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const d = await db.prepare('SELECT competencia FROM despesas WHERE id = ?').bind(id).first<{ competencia: string }>();
    if (d) await exigeAberto(db, d.competencia);
    await db.prepare('DELETE FROM despesas WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  });

  // ---------- Gympass ----------
  app.get('/gympass', async (c) => {
    const db = c.env.DB;
    const comp = compDe(c);
    const cfg = await carregarConfig(db);
    const alunos = await db.prepare(`
      SELECT a.id, a.nome, m.id AS mensalidade_id, md.nome AS modalidade, m.descricao, SUM(p.valor) AS estimado
      FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN modalidades md ON md.id = m.modalidade_id
      WHERE m.competencia = ? AND p.forma = 'gympass' AND m.cancelada = 0
      GROUP BY m.id ORDER BY a.nome COLLATE NOCASE`).bind(comp).all();
    const hist = await db.prepare(`
      SELECT m.competencia, COALESCE(SUM(p.valor),0) AS estimado, r.real, r.recebido_em, r.justificativa
      FROM mensalidades m JOIN pagamentos p ON p.mensalidade_id = m.id AND p.forma = 'gympass'
      LEFT JOIN gympass_repasses r ON r.competencia = m.competencia
      WHERE m.cancelada = 0 GROUP BY m.competencia ORDER BY m.competencia DESC`).all();
    return c.json({
      alunos: alunos.results, historico: hist.results,
      tabela: [{ aulas: 2, valor: cfg.gympass_2x }, { aulas: 3, valor: cfg.gympass_3x }, { aulas: 5, valor: cfg.gympass_5x }],
    });
  });
  app.put('/gympass/:comp', async (c) => {
    const comp = c.req.param('comp');
    if (!validaComp(comp)) throw new Erro(400, 'Competência inválida.');
    const b = await c.req.json<{ real: number; justificativa?: string }>();
    if (!(b.real >= 0)) throw new Erro(400, 'Informe o valor do repasse.');
    await c.env.DB.prepare(`INSERT INTO gympass_repasses (competencia, real, recebido_em, justificativa) VALUES (?,?,?,?)
      ON CONFLICT(competencia) DO UPDATE SET real = excluded.real, recebido_em = excluded.recebido_em, justificativa = excluded.justificativa`)
      .bind(comp, b.real, hoje(), b.justificativa ?? null).run();
    return c.json({ ok: true });
  });

  // ---------- Fechamento ----------
  app.post('/fechar', async (c) => {
    const db = c.env.DB;
    const { competencia } = await c.req.json<{ competencia: string }>();
    if (!validaComp(competencia)) throw new Erro(400, 'Competência inválida.');
    await exigeAberto(db, competencia);
    const resumo = await resumoDoMes(db, competencia);
    await db.prepare('INSERT INTO fechamentos (competencia, fechado_em, resumo) VALUES (?,?,?)').bind(competencia, new Date().toISOString(), JSON.stringify(resumo)).run();
    return c.json({ ok: true });
  });
  app.post('/reabrir', async (c) => {
    const { competencia } = await c.req.json<{ competencia: string }>();
    await c.env.DB.prepare('DELETE FROM fechamentos WHERE competencia = ?').bind(competencia).run();
    return c.json({ ok: true });
  });
  app.get('/exportar', async (c) => {
    const db = c.env.DB;
    const comp = compDe(c);
    const resumo = await resumoDoMes(db, comp);
    const fmt = c.req.query('formato') ?? 'json';
    if (fmt === 'csv') {
      const linhas = [['Modalidade', 'Matrículas', 'Faturamento', 'Recebido', 'Em aberto'].join(';')];
      for (const m of resumo.porModalidade) linhas.push([m.nome, m.matriculas, m.faturamento, m.recebido, m.aberto].join(';').replace(/\./g, ','));
      return new Response('﻿' + linhas.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="fechamento-${comp}.csv"` } });
    }
    return c.json(resumo);
  });

  // ---------- Configurações ----------
  app.get('/config', async (c) => c.json(await carregarConfig(c.env.DB)));
  app.put('/config', async (c) => {
    const b = await c.req.json<Record<string, string | number>>();
    const validas = ['nome_academia', 'nome_usuario', 'dia_vencimento', 'desconto_familia', 'cartao_caixa', 'aviso_contrato_dias', 'gympass_2x', 'gympass_3x', 'gympass_5x', 'msg_cobranca'];
    const st = Object.entries(b).filter(([k]) => validas.includes(k))
      .map(([k, v]) => c.env.DB.prepare('INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').bind(k, String(v)));
    if (st.length) await c.env.DB.batch(st);
    return c.json({ ok: true });
  });

  app.get('/professores', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM professores ORDER BY id').all()).results));
  app.post('/professores', async (c) => {
    const b = await c.req.json<Partial<Professor>>();
    if (!b.nome?.trim()) throw new Erro(400, 'Informe o nome.');
    const r = await c.env.DB.prepare('INSERT INTO professores (nome, funcao, regra, valor, modalidade_id) VALUES (?,?,?,?,?)')
      .bind(b.nome.trim(), b.funcao ?? null, b.regra ?? 'nenhum', b.valor ?? 0, b.modalidade_id ?? null).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });
  app.put('/professores/:id', async (c) => {
    const b = await c.req.json<Partial<Professor>>();
    await c.env.DB.prepare('UPDATE professores SET nome = COALESCE(?, nome), funcao = ?, regra = COALESCE(?, regra), valor = COALESCE(?, valor), modalidade_id = ?, ativo = COALESCE(?, ativo) WHERE id = ?')
      .bind(b.nome ?? null, b.funcao ?? null, b.regra ?? null, b.valor ?? null, b.modalidade_id ?? null, b.ativo ?? null, Number(c.req.param('id'))).run();
    return c.json({ ok: true });
  });

  app.post('/despesas-fixas', async (c) => {
    const b = await c.req.json<Partial<DespesaFixa>>();
    if (!b.descricao?.trim()) throw new Erro(400, 'Informe a descrição.');
    const r = await c.env.DB.prepare('INSERT INTO despesas_fixas (descricao, dia, valor, categoria) VALUES (?,?,?,?)')
      .bind(b.descricao.trim(), b.dia ?? null, b.valor ?? null, b.categoria ?? 'Contas').run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });
  app.put('/despesas-fixas/:id', async (c) => {
    const b = await c.req.json<Partial<DespesaFixa>>();
    await c.env.DB.prepare('UPDATE despesas_fixas SET descricao = COALESCE(?, descricao), dia = ?, valor = ?, ativo = COALESCE(?, ativo) WHERE id = ?')
      .bind(b.descricao ?? null, b.dia ?? null, b.valor ?? null, b.ativo ?? null, Number(c.req.param('id'))).run();
    return c.json({ ok: true });
  });

  app.post('/planos', async (c) => {
    const b = await c.req.json<Partial<Plano>>();
    if (!b.nome || !(b.valor! >= 0)) throw new Erro(400, 'Informe nome e valor.');
    const meses = b.meses ?? (b.periodo === 'semestral' ? 6 : b.periodo === 'anual' ? 12 : 1);
    if (!Number.isInteger(meses) || meses < 1 || meses > 60) throw new Erro(400, 'Duração inválida (1 a 60 meses).');
    const r = await c.env.DB.prepare('INSERT INTO planos (nome, categoria, aulas_semana, periodo, meses, valor) VALUES (?,?,?,?,?,?)')
      .bind(b.nome, b.categoria ?? 'frequencia', b.aulas_semana ?? null, periodoDeMeses(meses), meses, b.valor).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });
  app.put('/planos/:id', async (c) => {
    const b = await c.req.json<Partial<Plano>>();
    await c.env.DB.prepare('UPDATE planos SET valor = COALESCE(?, valor), ativo = COALESCE(?, ativo) WHERE id = ?').bind(b.valor ?? null, b.ativo ?? null, Number(c.req.param('id'))).run();
    return c.json({ ok: true });
  });

  // ---------- Importação ----------
  app.post('/importar', async (c) => {
    const b = await c.req.json<{ competencia: string; arquivo?: string; leitura: Parameters<typeof importar>[1] }>();
    if (!validaComp(b.competencia)) throw new Erro(400, 'Informe o mês da planilha (AAAA-MM).');
    await exigeAberto(c.env.DB, b.competencia);
    // Reimportar apaga as mensalidades do mês, e com elas os pagamentos adiantados.
    const adiantadas = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM mensalidades WHERE competencia = ? AND adiantado = 1').bind(b.competencia).first<{ n: number }>();
    if ((adiantadas?.n ?? 0) > 0) throw new Erro(409, `${b.competencia} já tem mensalidades pagas adiantado. Importar a planilha apagaria esses pagamentos.`);
    const rel = await importar(c.env.DB, b.leitura, b.competencia, b.arquivo ?? null);
    return c.json(rel);
  });
  app.get('/importacoes', async (c) => {
    const r = await c.env.DB.prepare('SELECT id, competencia, arquivo, criado_em, relatorio FROM importacoes ORDER BY id DESC LIMIT 30').all();
    return c.json((r.results as { relatorio: string }[]).map((x) => ({ ...x, relatorio: JSON.parse(x.relatorio) })));
  });

  app.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404));
  return app;
}
