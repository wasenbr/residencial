import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import type { Contrato } from '../shared/tipos';
import { nomeComp } from '../shared/comp';
import type { Resumo } from '../shared/resumo';
import { useApp } from '../store';
import { Botao, Carregando, Icone, Num, Pilula, SeletorMes, Topo, useDados, useLargura, diaMes } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';

type Contrato2 = Contrato & { nome: string; mes: number };
type ResumoMes = Resumo & { fechadoEm: string | null };

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
  if (!r) return <Carregando erro={erro} />;
  const pct = r.faturamento ? Math.round((r.recebido / r.faturamento) * 100) : 0;
  const total = r.formas.dinheiroPix + r.formas.credito + r.formas.gympass + r.formas.debito || 1;
  return (
    <>
      <Topo titulo="Dashboard" sub={`${r.alunosAtivos} alunos ativos · ${r.qtdMensalidades} mensalidades em ${nomeComp(comp)}`}>
        <SeletorMes />
        <Link className="btn" to="/historico">Últimos 12 meses</Link>
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
            <div key={m.id ?? 'x'} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{m.nome}</span><Num v={m.faturamento} /></div>
              <div className="barra"><i style={{ width: `${(m.faturamento / (r.faturamento || 1)) * 100}%` }} /></div>
            </div>
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
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}><h2>Em atraso</h2><Link to="/mensalidades">Ver todas</Link></div>
        {r.atrasos.length === 0 ? <div className="vazio">Nenhuma mensalidade em atraso.</div> : (
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Aluno</th><th>Modalidade</th><th className="d">Devido</th><th>Venceu</th><th /></tr></thead>
            <tbody>{r.atrasos.slice(0, 8).map((a) => (
              <tr key={a.mensalidade_id}>
                <td>{a.nome}</td><td>{a.modalidade}</td><td className="d"><Num v={a.aberto} /></td><td>{diaMes(a.vencimento)}</td>
                <td className="d"><Botao pequeno onClick={() => setPagar({ mensalidade_id: a.mensalidade_id, nome: a.nome, descricao: a.modalidade, aberto: a.aberto })}>Registrar pagamento</Botao></td>
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
