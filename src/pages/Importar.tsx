import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import { compAtual, compDeTexto, nomeComp, validaComp } from '../shared/comp';
import { lerPlanilha, type Grade, type Leitura } from '../import/planilha';
import type { Relatorio } from '../import/importar';
import { useApp } from '../store';
import { Botao, Campo, Num, Pilula, Topo, useDados } from '../ui';

interface Arquivo { nome: string; comp: string; leitura: Leitura | null; erro?: string; relatorio?: Relatorio; enviando?: boolean }

async function lerArquivo(f: File): Promise<Leitura> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const abas: Record<string, Grade> = {};
  for (const n of wb.SheetNames) abas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) as Grade;
  return lerPlanilha(abas);
}

export function Importar() {
  const { toast, recarregar, base } = useApp();
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const entrada = useRef<HTMLInputElement>(null);
  const { dados: historico } = useDados(() => get<{ id: number; competencia: string; arquivo: string | null; criado_em: string; relatorio: Relatorio }[]>('/importacoes'), [arquivos.length]);

  async function escolher(files: FileList | null) {
    if (!files) return;
    const novos: Arquivo[] = [];
    for (const f of Array.from(files)) {
      const comp = compDeTexto(f.name) ?? compAtual();
      try { novos.push({ nome: f.name, comp, leitura: await lerArquivo(f) }); }
      catch (e) { novos.push({ nome: f.name, comp, leitura: null, erro: 'Não consegui ler este arquivo: ' + (e instanceof Error ? e.message : e) }); }
    }
    setArquivos((a) => [...a, ...novos].sort((x, y) => x.comp.localeCompare(y.comp)));
    if (entrada.current) entrada.current.value = '';
  }
  const alterar = (i: number, p: Partial<Arquivo>) => setArquivos((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function enviar(i: number) {
    const a = arquivos[i];
    if (!a.leitura) return;
    alterar(i, { enviando: true, erro: undefined });
    try {
      const relatorio = await post<Relatorio>('/importar', { competencia: a.comp, arquivo: a.nome, leitura: a.leitura });
      alterar(i, { relatorio, enviando: false });
      toast(`${nomeComp(a.comp)} importado.`);
      await recarregar();
    } catch (e) {
      alterar(i, { enviando: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  async function enviarTodos() {
    for (let i = 0; i < arquivos.length; i++) if (arquivos[i].leitura && !arquivos[i].relatorio) await enviar(i);
  }

  return (
    <>
      <Topo titulo="Importar planilhas" sub="Envie as planilhas “Fechamento <mês>” antigas. Cada uma vira um mês no sistema, com alunos, turmas, pagamentos e despesas.">
        <Botao tipo="primario" onClick={() => entrada.current?.click()}>Escolher arquivos</Botao>
      </Topo>
      <input ref={entrada} type="file" accept=".xlsx,.xlsm,.xls" multiple hidden onChange={(e) => escolher(e.target.files)} />

      {arquivos.length === 0 && (
        <div className="cartao vazio">Nenhum arquivo selecionado. Pode escolher vários de uma vez; o mês é lido do nome do arquivo e você pode corrigir.</div>
      )}

      {arquivos.map((a, i) => (
        <section key={a.nome + i} className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><b>{a.nome}</b>{a.leitura && <div className="pequeno suave">{a.leitura.linhas.length} linhas de alunos · {a.leitura.turmas.length} turmas · {a.leitura.avisos.length} avisos</div>}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <Campo rotulo="Mês da planilha"><input type="month" value={a.comp} disabled={!!a.relatorio} onChange={(e) => validaComp(e.target.value) && alterar(i, { comp: e.target.value })} /></Campo>
              {!a.relatorio && <Botao tipo="primario" desligado={!a.leitura || a.enviando || base?.fechados.includes(a.comp)} onClick={() => enviar(i)}>{a.enviando ? 'Importando…' : 'Importar'}</Botao>}
            </div>
          </div>
          {base?.fechados.includes(a.comp) && <div className="faixa">{nomeComp(a.comp)} está fechado. Reabra o mês em Fechamento para importar de novo.</div>}
          {a.erro && <div className="faixa">{a.erro}</div>}
          {a.relatorio && <RelatorioView r={a.relatorio} />}
        </section>
      ))}

      {arquivos.filter((a) => a.leitura && !a.relatorio).length > 1 && <div><Botao tipo="primario" onClick={enviarTodos}>Importar todos em ordem</Botao></div>}

      {historico && historico.length > 0 && (
        <section className="cartao">
          <div style={{ padding: '16px 20px' }}><h2>Importações anteriores</h2></div>
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Mês</th><th>Arquivo</th><th className="d">Alunos novos</th><th className="d">Mensalidades</th><th>Quando</th></tr></thead>
            <tbody>{historico.map((h) => <tr key={h.id}><td>{nomeComp(h.competencia)}</td><td>{h.arquivo ?? '—'}</td><td className="d num">{h.relatorio.alunosNovos}</td><td className="d num">{h.relatorio.mensalidades}</td><td>{new Date(h.criado_em + 'Z').toLocaleString('pt-BR')}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

function RelatorioView({ r }: { r: Relatorio }) {
  const divergentes = r.conferencia.filter((c) => !c.ok);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="faixa info"><span>Importado: <b>{r.alunosNovos}</b> alunos novos{r.alunosExistentes ? ` (${r.alunosExistentes} já existiam)` : ''}, <b>{r.mensalidades}</b> mensalidades, <b>{r.pagamentos}</b> pagamentos, {r.turmasNovas} turmas novas.</span><Link to="/">Ver painel</Link></div>

      <div>
        <h2 style={{ marginBottom: 8 }}>Conferência com a aba Fechamento da planilha</h2>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Modalidade</th><th className="d">Faturamento (planilha → sistema)</th><th className="d">Recebido (planilha → sistema)</th><th /></tr></thead>
          <tbody>{r.conferencia.map((c) => (
            <tr key={c.modalidade}><td>{c.modalidade}</td>
              <td className="d"><Num v={c.planilha.faturamento} /> → <Num v={c.sistema.faturamento} /></td>
              <td className="d"><Num v={c.planilha.recebido} /> → <Num v={c.sistema.recebido} /></td>
              <td>{c.ok ? <Pilula tipo="ok">Bateu</Pilula> : <Pilula tipo="atraso">Diferente</Pilula>}</td></tr>
          ))}</tbody>
        </table></div>
        {divergentes.length > 0 && <div className="pequeno suave" style={{ marginTop: 8 }}>Onde difere, o sistema segue as abas das turmas (aluno por aluno). A aba Fechamento da planilha é digitada à mão e às vezes não acompanha as turmas. Confira os avisos abaixo.</div>}
      </div>

      {r.duplicatas.length > 0 && (
        <div>
          <h2 style={{ marginBottom: 8 }}>Nomes parecidos para conferir</h2>
          <div className="fichas">{r.duplicatas.map(([a, b], i) => <Pilula key={i} tipo="info">{a} × {b}</Pilula>)}</div>
          <div className="pequeno suave" style={{ marginTop: 8 }}>Se for a mesma pessoa, unifique em <Link to="/alunos">Alunos</Link>.</div>
        </div>
      )}

      {r.pessoalPlanilha.length > 0 && (
        <div className="pequeno suave">Na planilha, o pessoal aparece como {r.pessoalPlanilha.map((p) => `${p.nome} R$ ${p.valor}`).join(' e ')}. O sistema calcula repasses e salários pelas regras de Configurações.</div>
      )}

      {r.avisos.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{r.avisos.length} avisos da leitura</summary>
          <ul style={{ paddingLeft: 20 }}>{r.avisos.map((a, i) => <li key={i} className="pequeno" style={{ margin: '6px 0' }}><span className="suave">{a.celula}</span> · {a.texto}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
