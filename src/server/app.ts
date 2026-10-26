import { Hono } from 'hono';
import type {
  Aluno, Config, Contrato, DespesaFixa, Mensalidade, Pagamento, Plano, Professor,
} from '../shared/tipos';
import { FORMAS } from '../shared/tipos';
import { compAtual, diffMeses, somarMeses, validaComp } from '../shared/comp';
import { calcularResumo, type DadosResumo } from '../shared/resumo';
import { importar } from '../import/importar';
import { chaveNome } from '../shared/nomes';

type Env = { Bindings: { DB: D1Database } };

const hoje = () => new Date().toISOString().slice(0, 10);

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
  };
}

async function fechado(db: D1Database, comp: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS x FROM fechamentos WHERE competencia = ?').bind(comp).first());
}

async function exigeAberto(db: D1Database, comp: string) {
  if (await fechado(db, comp)) throw new Erro(409, `${comp} já está fechado. Reabra o mês para alterar.`);
}

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
    db.prepare('SELECT p.* FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE m.competencia = ? AND p.caixa = ? AND m.cancelada = 0').bind(comp, seg).all(),
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
      db.prepare('SELECT * FROM planos WHERE ativo = 1 ORDER BY categoria, aulas_semana, periodo').all(),
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
    const fech = await c.env.DB.prepare('SELECT fechado_em FROM fechamentos WHERE competencia = ?').bind(comp).first<{ fechado_em: string }>();
    return c.json({ ...resumo, fechadoEm: fech?.fechado_em ?? null });
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
    const [alunos, mats, contratos, mens, pags] = await Promise.all([
      db.prepare('SELECT * FROM alunos ORDER BY nome COLLATE NOCASE').all(),
      db.prepare('SELECT m.aluno_id, m.turma_id, t.nome AS turma, t.modalidade_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id').all(),
      db.prepare('SELECT * FROM contratos WHERE encerrado_em IS NULL').all(),
      db.prepare('SELECT id, aluno_id, valor FROM mensalidades WHERE competencia = ? AND cancelada = 0').bind(comp).all(),
      db.prepare('SELECT p.mensalidade_id, p.valor FROM pagamentos p JOIN mensalidades m ON m.id = p.mensalidade_id WHERE m.competencia = ?').bind(comp).all(),
    ]);
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
        devido: d?.devido ?? 0, pago: d?.pago ?? 0,
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
      origem?: 'particular' | 'gympass'; observacoes?: string; turmas?: number[];
      valor?: number; plano?: string; periodo?: 'mensal' | 'semestral' | 'anual'; competencia?: string; modalidade_id?: number;
    }>();
    if (!b.nome?.trim()) throw new Erro(400, 'Informe o nome do aluno.');
    const comp = b.competencia ?? compAtual();
    if (b.valor && b.valor > 0) await exigeAberto(db, comp);
    const r = await db.prepare(
      'INSERT INTO alunos (nome, chave, telefone, nascimento, responsavel, responsavel_tel, familia, origem, observacoes) VALUES (?,?,?,?,?,?,?,?,?)',
    ).bind(b.nome.trim(), chaveNome(b.nome), b.telefone ?? null, b.nascimento ?? null, b.responsavel ?? null, b.responsavel_tel ?? null, b.familia ?? null, b.origem ?? 'particular', b.observacoes ?? null).run();
    const id = r.meta.last_row_id;
    for (const t of b.turmas ?? []) {
      await db.prepare('INSERT OR IGNORE INTO matriculas (aluno_id, turma_id, inicio) VALUES (?,?,?)').bind(id, t, comp).run();
    }
    let mensalidadeId: number | null = null;
    if (b.valor && b.valor > 0) {
      const cfg = await carregarConfig(db);
      const venc = `${comp}-${String(cfg.dia_vencimento).padStart(2, '0')}`;
      let contratoId: number | null = null;
      const periodo = b.periodo ?? 'mensal';
      if (periodo !== 'mensal') {
        const cr = await db.prepare('INSERT INTO contratos (aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?)')
          .bind(id, b.plano ?? periodo, periodo, b.valor, comp, periodo === 'semestral' ? 6 : 12).run();
        contratoId = cr.meta.last_row_id;
      }
      const mr = await db.prepare('INSERT INTO mensalidades (aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento) VALUES (?,?,?,?,?,?,?)')
        .bind(id, contratoId, comp, b.modalidade_id ?? null, b.plano ?? null, b.valor, venc).run();
      mensalidadeId = mr.meta.last_row_id;
    }
    return c.json({ id, mensalidadeId }, 201);
  });

  app.put('/alunos/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const b = await c.req.json<Partial<Aluno>>();
    const campos = ['nome', 'telefone', 'nascimento', 'responsavel', 'responsavel_tel', 'familia', 'origem', 'ativo', 'observacoes'] as const;
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
  app.get('/turmas/:id/alunos', async (c) => {
    const r = await c.env.DB.prepare('SELECT a.id, a.nome, a.ativo FROM matriculas m JOIN alunos a ON a.id = m.aluno_id WHERE m.turma_id = ? ORDER BY a.nome COLLATE NOCASE').bind(Number(c.req.param('id'))).all();
    return c.json(r.results);
  });

  // ---------- Mensalidades e pagamentos ----------
  app.get('/mensalidades', async (c) => {
    const comp = compDe(c);
    const r = await c.env.DB.prepare(`
      SELECT m.*, a.nome AS aluno, a.origem, md.nome AS modalidade,
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
    const b = await c.req.json<{ valor?: number; cancelada?: number; observacao?: string }>();
    if (b.valor != null) await db.prepare('UPDATE mensalidades SET valor = ? WHERE id = ?').bind(b.valor, id).run();
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
    const mesData = data.slice(0, 7);
    // Dinheiro/Pix/débito entram no caixa do mês do recebimento; crédito e Gympass, no mês seguinte.
    let caixa = mesData;
    if (b.forma === 'gympass' || (b.forma === 'credito' && cfg.cartao_caixa === 'seguinte')) caixa = somarMeses(mesData, 1);
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

  // Gera as mensalidades e despesas fixas de um mês a partir do mês anterior.
  app.post('/mes/gerar', async (c) => {
    const db = c.env.DB;
    const { competencia } = await c.req.json<{ competencia: string }>();
    if (!validaComp(competencia)) throw new Erro(400, 'Competência inválida.');
    await exigeAberto(db, competencia);
    const ant = somarMeses(competencia, -1);
    const cfg = await carregarConfig(db);
    const venc = `${competencia}-${String(cfg.dia_vencimento).padStart(2, '0')}`;
    const ja = await db.prepare('SELECT COUNT(*) AS n FROM mensalidades WHERE competencia = ?').bind(competencia).first<{ n: number }>();
    if ((ja?.n ?? 0) > 0) throw new Erro(409, 'Este mês já tem mensalidades.');
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
    return c.json({ mensalidades: novas.length, despesas: f.meta.changes, contratosFinalizados });
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
    const validas = ['nome_academia', 'nome_usuario', 'dia_vencimento', 'desconto_familia', 'cartao_caixa', 'aviso_contrato_dias', 'gympass_2x', 'gympass_3x', 'gympass_5x'];
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
    const r = await c.env.DB.prepare('INSERT INTO planos (nome, categoria, aulas_semana, periodo, valor) VALUES (?,?,?,?,?)')
      .bind(b.nome, b.categoria ?? 'frequencia', b.aulas_semana ?? null, b.periodo ?? 'mensal', b.valor).run();
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
