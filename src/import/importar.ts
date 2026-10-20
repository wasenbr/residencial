// Grava uma leitura de planilha no banco (D1) e devolve o relatório de conferência.
// Reimportar o mesmo mês substitui as mensalidades e pagamentos daquele mês.

import type { Leitura, LinhaLida } from './planilha';
import { chaveNome, parecidos } from '../shared/nomes';
import { somarMeses } from '../shared/comp';

export interface Conferencia {
  modalidade: string;
  planilha: { faturamento: number; recebido: number; alunos: number };
  sistema: { faturamento: number; recebido: number; alunos: number };
  ok: boolean;
}

export interface Relatorio {
  competencia: string;
  arquivo: string | null;
  alunosNovos: number;
  alunosExistentes: number;
  mensalidades: number;
  pagamentos: number;
  turmasNovas: number;
  avisos: { celula: string; texto: string }[];
  duplicatas: [string, string][];
  conferencia: Conferencia[];
  caixa: { creditoAnterior: number; gympassAnterior: number };
  pessoalPlanilha: { nome: string; valor: number }[];
}

type Stmt = D1PreparedStatement;
const r2 = (n: number) => Math.round(n * 100) / 100;

function aulasDe(dias?: string): number {
  const n = dias ? dias.split(',').length : 0;
  return n > 0 ? n : 2;
}

export async function importar(
  db: D1Database,
  leitura: Leitura,
  competencia: string,
  arquivo: string | null,
): Promise<Relatorio> {
  const cfg = Object.fromEntries(
    ((await db.prepare('SELECT chave, valor FROM config').all()).results as { chave: string; valor: string }[]).map((c) => [c.chave, c.valor]),
  );
  const diaVenc = String(cfg.dia_vencimento ?? '10').padStart(2, '0');
  const vencimento = `${competencia}-${diaVenc}`;
  const seguinte = somarMeses(competencia, 1);
  const stmts: Stmt[] = [];
  const run = (sql: string, ...p: unknown[]) => stmts.push(db.prepare(sql).bind(...p));

  const maxId = async (t: string) => ((await db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${t}`).first<{ m: number }>())?.m ?? 0);
  let idAluno = await maxId('alunos');
  let idMod = await maxId('modalidades');
  let idTurma = await maxId('turmas');
  let idMens = await maxId('mensalidades');
  let idPag = await maxId('pagamentos');
  let idContr = await maxId('contratos');
  let idMat = await maxId('matriculas');
  let idProf = await maxId('professores');
  let idFixa = await maxId('despesas_fixas');
  let idDesp = await maxId('despesas');

  // Mês reimportado: apaga o que veio da importação anterior.
  run('DELETE FROM pagamentos WHERE mensalidade_id IN (SELECT id FROM mensalidades WHERE competencia = ?)', competencia);
  run('DELETE FROM mensalidades WHERE competencia = ?', competencia);
  run('DELETE FROM despesas WHERE competencia = ?', competencia);
  run('DELETE FROM saldos_importados WHERE competencia = ?', competencia);

  // Modalidades
  const mods = new Map(
    ((await db.prepare('SELECT id, nome FROM modalidades').all()).results as { id: number; nome: string }[]).map((m) => [m.nome, m.id]),
  );
  let ordem = mods.size;
  for (const nome of leitura.modalidades) {
    if (mods.has(nome)) continue;
    mods.set(nome, ++idMod);
    run('INSERT INTO modalidades (id, nome, ordem) VALUES (?,?,?)', idMod, nome, ++ordem);
  }

  // Turmas
  const turmas = new Map(
    ((await db.prepare('SELECT id, modalidade_id, nome FROM turmas').all()).results as { id: number; modalidade_id: number; nome: string }[])
      .map((t) => [`${t.modalidade_id}|${t.nome}`, t.id]),
  );
  let turmasNovas = 0;
  const turmaId = (modalidade: string, nome: string) => turmas.get(`${mods.get(modalidade)}|${nome}`);
  for (const t of leitura.turmas) {
    if (turmaId(t.modalidade, t.nome)) continue;
    const id = ++idTurma;
    turmas.set(`${mods.get(t.modalidade)}|${t.nome}`, id);
    turmasNovas++;
    run(
      'INSERT INTO turmas (id, modalidade_id, nome, dias, horario, aulas_semana) VALUES (?,?,?,?,?,?)',
      id, mods.get(t.modalidade), t.nome, t.dias ?? null, t.horario ?? null, aulasDe(t.dias),
    );
  }

  // Alunos: casa pelo nome normalizado; quem não existe é criado.
  const existentes = (await db.prepare('SELECT id, nome, chave FROM alunos').all()).results as { id: number; nome: string; chave: string | null }[];
  const porChave = new Map(existentes.filter((a) => a.chave).map((a) => [a.chave!, a.id]));
  const ids = new Map<string, number>();
  const nomesNovos: string[] = [];
  const usadosExistentes = new Set<number>();
  const origemPorChave = new Map<string, 'gympass' | 'particular'>();
  for (const l of leitura.linhas) {
    const soGympass = l.pagamentos.length > 0 && l.pagamentos.every((p) => p.forma === 'gympass');
    const atual = origemPorChave.get(l.chave);
    if (!atual) origemPorChave.set(l.chave, soGympass ? 'gympass' : 'particular');
    else if (!soGympass) origemPorChave.set(l.chave, 'particular');
  }
  for (const l of leitura.linhas) {
    if (ids.has(l.chave)) continue;
    const ex = porChave.get(l.chave);
    if (ex) {
      ids.set(l.chave, ex);
      usadosExistentes.add(ex);
      continue;
    }
    const id = ++idAluno;
    ids.set(l.chave, id);
    nomesNovos.push(l.nome);
    run(
      'INSERT INTO alunos (id, nome, chave, responsavel, origem) VALUES (?,?,?,?,?)',
      id, l.nome, l.chave, l.responsavel ?? null, origemPorChave.get(l.chave) ?? 'particular',
    );
  }

  // Matrículas, mensalidades, pagamentos e contratos
  const matriculasExistentes = new Set(
    ((await db.prepare('SELECT aluno_id, turma_id FROM matriculas').all()).results as { aluno_id: number; turma_id: number }[])
      .map((m) => `${m.aluno_id}|${m.turma_id}`),
  );
  const contratoAluno = new Set(
    ((await db.prepare('SELECT DISTINCT aluno_id FROM contratos WHERE encerrado_em IS NULL').all()).results as { aluno_id: number }[]).map((c) => c.aluno_id),
  );
  const contratoId = new Map<number, number>();
  const sistema = new Map<string, { faturamento: number; recebido: number; alunos: Set<number> }>();
  let qtdPag = 0, qtdMens = 0;
  const avisos = [...leitura.avisos];

  for (const l of leitura.linhas) {
    const alunoId = ids.get(l.chave)!;
    const tid = turmaId(l.modalidade, l.turma);
    if (tid && !matriculasExistentes.has(`${alunoId}|${tid}`)) {
      matriculasExistentes.add(`${alunoId}|${tid}`);
      run('INSERT INTO matriculas (id, aluno_id, turma_id, inicio) VALUES (?,?,?,?)', ++idMat, alunoId, tid, competencia);
    }
    if (l.devido <= 0 && l.pagamentos.length === 0) continue; // sem valor: só consta no aviso

    if (l.contrato && !contratoAluno.has(alunoId) && !contratoId.has(alunoId)) {
      const id = ++idContr;
      contratoId.set(alunoId, id);
      run(
        'INSERT INTO contratos (id, aluno_id, plano, periodo, valor_mensal, inicio, meses) VALUES (?,?,?,?,?,?,?)',
        id, alunoId, l.contrato.de === 6 ? 'Semestral' : 'Anual', l.contrato.de === 6 ? 'semestral' : 'anual',
        l.devido, somarMeses(competencia, -(l.contrato.mes - 1)), l.contrato.de,
      );
    }

    const mid = ++idMens;
    qtdMens++;
    run(
      `INSERT INTO mensalidades (id, aluno_id, contrato_id, competencia, modalidade_id, descricao, valor, vencimento, observacao)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      mid, alunoId, contratoId.get(alunoId) ?? null, competencia, mods.get(l.modalidade), l.turma, r2(l.devido), vencimento,
      [l.observacao, `Importado de ${l.celula}`].filter(Boolean).join(' · '),
    );
    let recebido = 0;
    for (const p of l.pagamentos) {
      recebido += p.valor;
      qtdPag++;
      const caixa = p.forma === 'credito' || p.forma === 'gympass' ? seguinte : competencia;
      run(
        'INSERT INTO pagamentos (id, mensalidade_id, valor, forma, data, caixa) VALUES (?,?,?,?,?,?)',
        ++idPag, mid, r2(p.valor), p.forma, vencimento, caixa,
      );
    }
    const s = sistema.get(l.modalidade) ?? { faturamento: 0, recebido: 0, alunos: new Set<number>() };
    s.faturamento += l.devido;
    s.recebido += recebido;
    s.alunos.add(mid);
    sistema.set(l.modalidade, s);
  }

  // Equipe: na primeira importação, cria as regras de repasse conhecidas.
  const nProf = (await db.prepare('SELECT COUNT(*) AS n FROM professores').first<{ n: number }>())?.n ?? 0;
  if (nProf === 0) {
    const mid = (n: string) => mods.get(n) ?? null;
    const seed: [string, string, string, number, number | null][] = [
      ['Edison', 'Dança de Salão', 'percentual', 60, mid('Dança de Salão')],
      ['Grazi', 'Ballet', 'percentual', 60, mid('Ballet')],
      ['Misael', 'Autônomo', 'fixo', 2300, null],
      ['Liege', 'Dona · demais modalidades', 'nenhum', 0, null],
    ];
    for (const [nome, funcao, regra, valor, m] of seed) {
      run('INSERT INTO professores (id, nome, funcao, regra, valor, modalidade_id) VALUES (?,?,?,?,?,?)', ++idProf, nome, funcao, regra, valor, m);
    }
  }

  // Despesas fixas
  const fixas = new Map(
    ((await db.prepare('SELECT id, descricao FROM despesas_fixas').all()).results as { id: number; descricao: string }[])
      .map((f) => [chaveNome(f.descricao), f.id]),
  );
  const pessoalPlanilha: { nome: string; valor: number }[] = [];
  for (const d of leitura.despesas) {
    if (d.tipo === 'pessoal') {
      pessoalPlanilha.push({ nome: d.descricao, valor: d.valor });
      continue;
    }
    let fid = fixas.get(chaveNome(d.descricao));
    if (!fid) {
      fid = ++idFixa;
      fixas.set(chaveNome(d.descricao), fid);
      run('INSERT INTO despesas_fixas (id, descricao, dia, valor) VALUES (?,?,?,?)', fid, d.descricao, d.dia ?? null, d.valor);
    }
    run(
      `INSERT INTO despesas (id, competencia, descricao, categoria, tipo, valor, vencimento, pago_em, despesa_fixa_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ++idDesp, competencia, d.descricao, 'Contas', 'fixa', d.valor,
      d.dia ? `${competencia}-${String(d.dia).padStart(2, '0')}` : null, `${competencia}-${String(d.dia ?? 28).padStart(2, '0')}`, fid,
    );
  }

  // Cartão e Gympass que a planilha trazia do mês anterior
  if (leitura.creditoAnterior > 0) run("INSERT INTO saldos_importados VALUES (?,?,?)", competencia, 'credito_anterior', leitura.creditoAnterior);
  if (leitura.gympassAnterior > 0) run("INSERT INTO saldos_importados VALUES (?,?,?)", competencia, 'gympass_anterior', leitura.gympassAnterior);

  // Conferência com a aba Fechamento
  const conferencia: Conferencia[] = leitura.totais.map((t) => {
    const s = sistema.get(t.modalidade);
    const sis = { faturamento: r2(s?.faturamento ?? 0), recebido: r2(s?.recebido ?? 0), alunos: s?.alunos.size ?? 0 };
    return {
      modalidade: t.modalidade,
      planilha: { faturamento: t.faturamento, recebido: t.recebido, alunos: t.alunos },
      sistema: sis,
      ok: Math.abs(sis.faturamento - t.faturamento) < 0.01 && Math.abs(sis.recebido - t.recebido) < 0.01,
    };
  });

  // Possíveis duplicatas (Susete × Suseti), entre todos os alunos do banco e da planilha.
  const todos = [...existentes.map((a) => a.nome), ...nomesNovos];
  const duplicatas: [string, string][] = [];
  const vistos = [...new Set(todos)];
  for (let i = 0; i < vistos.length; i++) {
    for (let j = i + 1; j < vistos.length; j++) {
      if (parecidos(vistos[i], vistos[j])) duplicatas.push([vistos[i], vistos[j]]);
    }
  }

  const relatorio: Relatorio = {
    competencia, arquivo,
    alunosNovos: nomesNovos.length,
    alunosExistentes: usadosExistentes.size,
    mensalidades: qtdMens, pagamentos: qtdPag, turmasNovas,
    avisos, duplicatas, conferencia,
    caixa: { creditoAnterior: leitura.creditoAnterior, gympassAnterior: leitura.gympassAnterior },
    pessoalPlanilha,
  };
  run('INSERT INTO importacoes (competencia, arquivo, relatorio) VALUES (?,?,?)', competencia, arquivo, JSON.stringify(relatorio));

  // D1 aceita no máximo 100 comandos por lote em alguns planos; envia em partes ordenadas.
  for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));
  return relatorio;
}

export type { LinhaLida };
