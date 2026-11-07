import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import type { Contrato } from '../shared/tipos';
import { nomeComp } from '../shared/comp';
import type { Atraso, LinhaModalidade, Resumo } from '../shared/resumo';
import { useApp } from '../store';
import { Botao, Carregando, Icone, Modal, Num, Pilula, SeletorMes, Topo, useDados, useLargura, diaMes } from '../ui';
import { BotaoCobrar } from '../components/Cobranca';
import { status } from './Mensalidades';
import { PagarModal, type Devendo } from '../components/Pagar';

type Contrato2 = Contrato & { nome: string; mes: number };
interface Contato { telefone: string | null; responsavel: string | null; responsavel_tel: string | null; recorrente: number }
type AtrasoContato = Atraso & Contato;
type ResumoMes = Omit<Resumo, 'atrasos' | 'emAberto'> & { atrasos: AtrasoContato[]; emAberto: AtrasoContato[]; fechadoEm: string | null };

export function Dashboard() {
  const estreito = useLargura();
  return estreito ? <Inicio /> : <Painel />;
}

function usarResumo() {
  const { comp } = useApp();
  return useDados(() => get<ResumoMes>(`/resumo?comp=${comp}`), [comp]);
}

export function Painel() {
  const { comp, toast } = useApp();
  const { dados: r, erro, recarregar } = usarResumo();
  const { dados: contratos } = useDados(() => get<Contrato2[]>(`/contratos/vencendo?comp=${comp}`), [comp]);
  const [pagar, setPagar] = useState<Devendo | null>(null);
  const [modAberta, setModAberta] = useState<LinhaModalidade | null>(null);
  if (!r) return <Carregando erro={erro} />;
  const pct = r.faturamento ? Math.round((r.recebido / r.faturamento) * 100) : 0;
  const total = r.formas.dinheiroPix + r.formas.credito + r.formas.gympass + r.formas.debito || 1;
  return (
    <>
      <Topo titulo="Dashboard" sub={`${r.alunosAtivos} alunos ativos · ${r.qtdMensalidades} mensalidades em ${nomeComp(comp)}`}>
        <SeletorMes />
        <Link className="btn" to="/historico">Visão anual</Link>
        <Link className="btn primario" to="/fechamento">Ver fechamento</Link>
      </Topo>

      {r.qtdMensalidades === 0 && <SemMes comp={comp} onGerado={recarregar} />}

      <div className="grade">
        <Kpi rot="Faturamento" valor={r.faturamento} nota={`${r.qtdMensalidades} mensalidades`} />
        <Kpi rot="Recebido" valor={r.recebido} nota={`${pct}% do faturamento`} destaque />
        <Kpi rot="Em aberto" valor={r.aberto} nota={`${r.emAberto.length} mensalidades`} atraso />
        <Kpi rot="Caixa do mês" valor={r.caixa.total} nota="com cartão e Gympass do mês anterior" />
        <Kpi rot="Despesas" valor={r.despesas.total} nota="contas, salários e repasses" />
        <Kpi rot="Sobra prevista" valor={r.sobra} nota="caixa menos despesas" />
      </div>

      <div className="grade2">
        <section className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Faturamento por modalidade</h2>
          {r.porModalidade.map((m) => (
            <button key={m.id ?? 'x'} type="button" className="modalidade-link" onClick={() => setModAberta(m)} title={`Ver mensalidades de ${m.nome}`}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{m.nome} ›</span><Num v={m.faturamento} /></span>
              <span className="barra"><i style={{ width: `${(m.faturamento / (r.faturamento || 1)) * 100}%` }} /></span>
              {m.aberto > 0.009 && (
                <span className="pequeno" style={{ display: 'flex', justifyContent: 'flex-end', color: '#C62828', fontWeight: 600 }}>
                  <span>Não pago <Num v={m.aberto} /></span>
                </span>
              )}
            </button>
          ))}
          {r.porModalidade.length === 0 && <div className="suave">Sem dados neste mês.</div>}
        </section>
        <section className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Como o dinheiro entra</h2>
          {([['Dinheiro / Pix / Débito', r.formas.dinheiroPix + r.formas.debito], ['Gympass', r.formas.gympass], ['Cartão de crédito', r.formas.credito]] as [string, number][]).map(([n, v]) => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span><Num v={v} /> <span className="suave pequeno">{Math.round((v / total) * 100)}%</span></span></div>
              <div className="barra"><i style={{ width: `${(v / total) * 100}%` }} /></div>
            </div>
          ))}
          <div className="suave pequeno">Cartão e Gympass deste mês entram no caixa de {nomeComp(proximo(comp))}.</div>
        </section>
      </div>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><h2>Em atraso{r.atrasos.length > 0 && <span className="suave pequeno" style={{ fontWeight: 400 }}> · {r.atrasos.length} · <Num v={r.atrasos.reduce((s, a) => s + a.aberto, 0)} /></span>}</h2><Link to="/mensalidades">Ver todas</Link></div>
        {r.atrasos.length === 0 ? <div className="vazio">Nenhuma mensalidade em atraso.</div> : (
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Aluno</th><th>Modalidade</th><th className="d">Devido</th><th>Venceu</th><th /></tr></thead>
            <tbody>{r.atrasos.slice(0, 8).map((a) => (
              <tr key={a.mensalidade_id}>
                <td><Link to={`/alunos/${a.aluno_id}`}>{a.nome}</Link></td><td>{a.modalidade}</td><td className="d"><Num v={a.aberto} /></td><td>{diaMes(a.vencimento)}</td>
                <td className="d"><span className="acoes-linha">
                  {a.recorrente ? <span className="pequeno suave">cartão recorrente</span> : <BotaoCobrar aluno={a} competencia={comp} valor={a.aberto} vencimento={a.vencimento} />}
                  <Botao pequeno onClick={() => setPagar({ mensalidade_id: a.mensalidade_id, nome: a.nome, descricao: a.modalidade, aberto: a.aberto })}>Registrar pagamento</Botao>
                </span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {contratos && contratos.length > 0 && (
        <section className="cartao">
          <div style={{ padding: '16px 20px' }}><h2>Contratos terminando</h2></div>
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Aluno</th><th>Plano</th><th>Situação</th><th /></tr></thead>
            <tbody>{contratos.map((c) => (
              <tr key={c.id}><td><Link to={`/alunos/${c.aluno_id}`}>{c.nome}</Link></td><td>{c.plano}</td><td>mês {Math.min(c.mes, c.meses ?? c.mes)} de {c.meses}</td>
                <td className="d"><Botao pequeno onClick={async () => { await post(`/contratos/${c.id}/renovar`); toast('Contrato renovado.'); recarregar(); }}>Renovar</Botao></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); }} />}
      {modAberta && <DetalheModalidade linha={modAberta} onFechar={() => setModAberta(null)} onMudou={recarregar} />}
    </>
  );
}

interface LinhaDetalhe extends Contato {
  id: number; aluno_id: number; aluno: string; descricao: string | null; valor: number; pago: number;
  valor_total: number; pago_total: number; fracao: number; vencimento: string | null;
}

function DetalheModalidade({ linha, onFechar, onMudou }: { linha: LinhaModalidade; onFechar: () => void; onMudou: () => void }) {
  const { comp, base } = useApp();
  const { dados, erro, recarregar } = useDados(() => get<LinhaDetalhe[]>(`/modalidades/${linha.id ?? 'sem'}/mensalidades?comp=${comp}`), [linha.id, comp]);
  const [pagar, setPagar] = useState<Devendo | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pagos' | 'naopagos'>('todos');
  const hoje = base?.hoje ?? '';
  const st = (l: LinhaDetalhe) => status({ valor: l.valor_total, pago: l.pago_total, vencimento: l.vencimento }, hoje);
  const pagos = dados?.filter((l) => st(l) === 'pago') ?? [];
  const naoPagos = dados?.filter((l) => st(l) !== 'pago') ?? [];
  const soma = (l: LinhaDetalhe[], f: (x: LinhaDetalhe) => number) => l.reduce((s, x) => s + f(x), 0);
  const lista = filtro === 'pagos' ? pagos : filtro === 'naopagos' ? naoPagos : dados ?? [];
  const rateado = dados?.some((l) => l.fracao < 0.999);
  return (
    <>
    <Modal titulo={`${linha.nome} · ${nomeComp(comp)}`} onFechar={pagar ? () => undefined : onFechar} largo>
      {!dados ? <Carregando erro={erro} /> : (
        <>
          <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="cartao kpi"><div className="rot">Faturamento</div><div className="val num" style={{ fontSize: 22 }}><Num v={soma(dados, (x) => x.valor)} /></div><div className="pequeno suave">{dados.length} mensalidades</div></div>
            <div className="cartao kpi"><div className="rot">Pago</div><div className="val num" style={{ fontSize: 22, color: 'var(--marca-escura)' }}><Num v={soma(dados, (x) => x.pago)} /></div><div className="pequeno suave">{pagos.length} quitadas</div></div>
            <div className={'cartao kpi' + (naoPagos.length ? ' atraso' : '')}><div className="rot">Não pago</div><div className="val num" style={{ fontSize: 22 }}><Num v={soma(dados, (x) => Math.max(0, x.valor - x.pago))} /></div><div className="pequeno suave">{naoPagos.length} em aberto</div></div>
          </div>
          <div className="fichas">
            {([['todos', `Todos · ${dados.length}`], ['pagos', `Pagos · ${pagos.length}`], ['naopagos', `Não pagos · ${naoPagos.length}`]] as const).map(([k, r]) => (
              <button key={k} type="button" className={'ficha' + (filtro === k ? ' ativa' : '')} onClick={() => setFiltro(k)}>{r}</button>
            ))}
          </div>
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Aluno</th><th className="d">Valor</th><th className="d">Pago</th><th>Status</th><th /></tr></thead>
            <tbody>{lista.map((l) => {
              const s = st(l);
              const falta = Math.round((l.valor_total - l.pago_total) * 100) / 100;
              return (
                <tr key={l.id}>
                  <td><Link to={`/alunos/${l.aluno_id}`} onClick={onFechar}>{l.aluno}</Link>{l.fracao < 0.999 && <div className="pequeno suave">{Math.round(l.fracao * 100)}% de <Num v={l.valor_total} /></div>}</td>
                  <td className="d"><Num v={l.valor} /></td><td className="d"><Num v={l.pago} /></td>
                  <td>{s === 'pago' ? <Pilula tipo="ok">Pago</Pilula> : s === 'parcial' ? <Pilula tipo="atraso">Parcial</Pilula> : s === 'atraso' ? <Pilula tipo="atraso">Venceu {diaMes(l.vencimento)}</Pilula> : <Pilula tipo="aberto">A vencer</Pilula>}</td>
                  <td className="d"><span className="acoes-linha">
                    {(s === 'atraso' || s === 'parcial') && !l.recorrente && <BotaoCobrar aluno={{ ...l, nome: l.aluno }} competencia={comp} valor={falta} vencimento={l.vencimento} />}
                    {s !== 'pago' && <Botao pequeno onClick={() => setPagar({ mensalidade_id: l.id, nome: l.aluno, descricao: linha.nome, aberto: falta })}>Registrar</Botao>}
                  </span></td>
                </tr>
              );
            })}</tbody>
            {lista.length > 0 && <tfoot><tr><td>Total</td><td className="d"><Num v={soma(lista, (x) => x.valor)} /></td><td className="d"><Num v={soma(lista, (x) => x.pago)} /></td><td colSpan={2} /></tr></tfoot>}
          </table>
          {lista.length === 0 && <div className="vazio">Nada neste filtro.</div>}</div>
          {rateado && <div className="pequeno suave">Alunos em mais de uma modalidade sem modalidade definida na mensalidade têm o valor dividido pelas aulas de cada turma.</div>}
        </>
      )}
      <Botao onClick={onFechar}>Fechar</Botao>
    </Modal>
    {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); onMudou(); }} />}
    </>
  );
}

const proximo = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

function Kpi({ rot, valor, nota, atraso, destaque }: { rot: string; valor: number; nota: string; atraso?: boolean; destaque?: boolean }) {
  return (
    <div className={'cartao kpi' + (atraso && valor > 0 ? ' atraso alerta' : '')}>
      <div className="rot">{rot}</div>
      <div className="val num">{valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Number.isInteger(valor) ? 0 : 2 })}</div>
      <div className="pequeno" style={{ color: destaque ? 'var(--marca-escura)' : 'var(--suave)', fontWeight: destaque ? 600 : 400 }}>{nota}</div>
    </div>
  );
}

export function SemMes({ comp, onGerado }: { comp: string; onGerado: () => void }) {
  const { toast, recarregar } = useApp();
  const [ocupado, setOcupado] = useState(false);
  async function gerar() {
    setOcupado(true);
    try {
      const r = await post<{ mensalidades: number; despesas: number; contratosFinalizados: number }>('/mes/gerar', { competencia: comp });
      toast(`${r.mensalidades} mensalidades e ${r.despesas} despesas fixas geradas.` +
        (r.contratosFinalizados ? ` ${r.contratosFinalizados} contrato(s) terminaram e não foram copiados: renove na ficha do aluno.` : ''));
      await recarregar();
      onGerado();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setOcupado(false); }
  }
  return (
    <div className="faixa info">
      <span>{nomeComp(comp)} ainda não tem mensalidades. Posso copiar do mês anterior (alunos ativos e contratos vigentes) e criar as despesas fixas.</span>
      <Botao tipo="primario" onClick={gerar} desligado={ocupado}>Gerar {nomeComp(comp, true).toLowerCase()}</Botao>
    </div>
  );
}

function Inicio() {
  const { comp, base } = useApp();
  const { dados: r, erro, recarregar } = usarResumo();
  const { dados: contratos } = useDados(() => get<Contrato2[]>(`/contratos/vencendo?comp=${comp}`), [comp]);
  if (!r) return <Carregando erro={erro} />;
  const pct = r.faturamento ? (r.recebido / r.faturamento) * 100 : 0;
  const nomes = r.atrasos.slice(0, 3).map((a) => a.nome.split(' ')[0]);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div><div className="pequeno suave">{nomeComp(comp)}</div><h1>Olá{base?.config.nome_usuario ? `, ${base.config.nome_usuario}` : ''}</h1></div>
        <Link to="/dashboard" style={{ fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Ver completo</Link>
      </div>
      {r.qtdMensalidades === 0 && <SemMes comp={comp} onGerado={recarregar} />}
      <section className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave">Recebido no mês</span><b style={{ color: 'var(--marca-escura)' }}>{Math.round(pct)}%</b></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="num" style={{ fontSize: 30 }}>{r.recebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span><span className="num suave" style={{ fontSize: 14 }}>de {r.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span></div>
        <div className="barra"><i style={{ width: `${pct}%` }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><div className="pequeno" style={{ color: 'var(--atraso)', fontWeight: 600 }}>Em aberto</div><Num v={r.aberto} /></div>
          <div><div className="pequeno suave">Sobra prevista</div><Num v={r.sobra} /></div>
        </div>
      </section>
      <div className="atalhos">
        <Link className="atalho principal" to="/receber"><Icone nome="receber" tam={26} />Receber pagamento</Link>
        <Link className="atalho" to="/novo-aluno"><Icone nome="aluno" tam={26} cor="var(--marca)" />Novo aluno</Link>
        <Link className="atalho" to="/despesas/nova"><Icone nome="despesa" tam={26} cor="var(--marca)" />Lançar despesa</Link>
        <Link className="atalho" to="/gympass"><Icone nome="ok" tam={26} cor="var(--marca)" />Conferir Gympass</Link>
      </div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Precisa de atenção</h2>
        {r.atrasos.length > 0 && (
          <Link className="aviso-linha" to="/receber">
            <span><b>{r.atrasos.length} mensalidade{r.atrasos.length > 1 ? 's' : ''} em atraso</b><br /><span className="pequeno suave">{nomes.join(', ')}{r.atrasos.length > 3 ? '…' : ''}</span></span>
            <span className="num" style={{ color: 'var(--atraso)', fontWeight: 600 }}>{r.atrasos.reduce((s, a) => s + a.aberto, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
          </Link>
        )}
        {contratos?.map((c) => (
          <Link key={c.id} className="aviso-linha" to={`/alunos/${c.aluno_id}`}>
            <span><b>Contrato de {c.nome.split(' ')[0]} termina</b><br /><span className="pequeno suave">{c.plano} · mês {Math.min(c.mes, c.meses ?? c.mes)} de {c.meses}</span></span>
            <span style={{ fontWeight: 600, color: 'var(--marca-escura)' }}>Renovar</span>
          </Link>
        ))}
        {r.atrasos.length === 0 && r.qtdMensalidades > 0 && <div className="aviso-linha"><span>Nenhuma mensalidade em atraso <Pilula tipo="ok">tudo certo</Pilula></span></div>}
      </section>
    </>
  );
}
