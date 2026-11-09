import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Botao, Campo, Carregando, FORMA_ROTULO, Modal, Num, Pilula, SeletorMes, Topo, diaMes, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';
import { AlterarValorModal, BotaoCobrar, type MensalidadeEditavel } from '../components/Cobranca';
import { SemMes } from './Dashboard';

export interface MensalidadeLinha {
  id: number; aluno_id: number; aluno: string; origem: string; modalidade: string | null; descricao: string | null;
  valor: number; pago: number; formas: string | null; vencimento: string | null; contrato_id: number | null;
  telefone: string | null; responsavel: string | null; responsavel_tel: string | null; recorrente: number;
  adiantado?: number; forma_pagamento?: string | null;
}

type Filtro = 'todas' | 'atraso' | 'parciais' | 'pagas' | 'gympass' | 'recorrentes';

export function status(m: { valor: number; pago: number; vencimento: string | null }, hoje: string): 'pago' | 'parcial' | 'atraso' | 'aberto' {
  const falta = m.valor - m.pago;
  if (falta <= 0.009) return 'pago';
  if (m.pago > 0) return 'parcial';
  return m.vencimento && m.vencimento < hoje ? 'atraso' : 'aberto';
}

export function Mensalidades() {
  const { comp, base } = useApp();
  const { dados, erro, recarregar } = useDados(() => get<MensalidadeLinha[]>(`/mensalidades?comp=${comp}`), [comp]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [modalidade, setModalidade] = useState('');
  const [busca, setBusca] = useState('');
  const [pagar, setPagar] = useState<Devendo | null>(null);
  const [alterar, setAlterar] = useState<MensalidadeEditavel | null>(null);
  const [baixar, setBaixar] = useState(false);
  if (!dados || !base) return <Carregando erro={erro} />;
  const hoje = base.hoje;
  const fechado = base.fechados.includes(comp);
  const st = (m: MensalidadeLinha) => status(m, hoje);
  const recebido = dados.reduce((s, m) => s + m.pago, 0);
  const devido = dados.reduce((s, m) => s + m.valor, 0);
  const recorrentesAbertas = dados.filter((m) => m.recorrente && st(m) !== 'pago');
  const cont = {
    todas: dados.length, atraso: dados.filter((m) => st(m) === 'atraso' || st(m) === 'parcial').length,
    parciais: dados.filter((m) => st(m) === 'parcial').length, pagas: dados.filter((m) => st(m) === 'pago').length,
    gympass: dados.filter((m) => m.formas?.includes('gympass')).length,
    recorrentes: dados.filter((m) => m.recorrente).length,
  };
  const lista = dados.filter((m) => {
    if (filtro === 'atraso' && !(st(m) === 'atraso' || st(m) === 'parcial')) return false;
    if (filtro === 'parciais' && st(m) !== 'parcial') return false;
    if (filtro === 'pagas' && st(m) !== 'pago') return false;
    if (filtro === 'gympass' && !m.formas?.includes('gympass')) return false;
    if (filtro === 'recorrentes' && !m.recorrente) return false;
    if (modalidade && m.modalidade !== modalidade) return false;
    if (busca && !m.aluno.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });
  const totLista = {
    devido: lista.reduce((s, m) => s + m.valor, 0),
    pago: lista.reduce((s, m) => s + m.pago, 0),
  };
  const fichas: [Filtro, string][] = [['todas', 'Todas'], ['atraso', 'Em aberto'], ['parciais', 'Parciais'], ['pagas', 'Pagas'], ['gympass', 'Gympass'], ['recorrentes', 'Recorrentes']];
  return (
    <>
      <Topo titulo={`Mensalidades · ${nomeComp(comp)}`} sub={<>Vencimento dia {base.config.dia_vencimento} · <Num v={recebido} /> recebidos de <Num v={devido} /></>}>
        <SeletorMes />
        {recorrentesAbertas.length > 0 && !fechado && <Botao onClick={() => setBaixar(true)}>Baixar recorrentes · {recorrentesAbertas.length}</Botao>}
      </Topo>
      {!dados.some((m) => !m.adiantado) && <SemMes comp={comp} onGerado={recarregar} />}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="entrada" style={{ maxWidth: 260 }} placeholder="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aluno" />
        <div className="fichas">{fichas.map(([k, r]) => <button key={k} className={'ficha' + (filtro === k ? ' ativa' : '')} onClick={() => setFiltro(k)}>{r} · {cont[k]}</button>)}</div>
        <select className="entrada sel" value={modalidade} onChange={(e) => setModalidade(e.target.value)} aria-label="Modalidade">
          <option value="">Modalidade: todas</option>
          {base.modalidades.map((m) => <option key={m.id}>{m.nome}</option>)}
        </select>
      </div>
      <section className="cartao tabela-wrap">
        <table className="tbl">
          <thead><tr><th>Aluno</th><th className="esconde-cel">Plano</th><th className="d">Devido</th><th className="d">Pago</th><th className="esconde-cel">Forma</th><th>Status</th><th /></tr></thead>
          <tbody>{lista.map((m) => {
            const s = st(m);
            const falta = Math.round((m.valor - m.pago) * 100) / 100;
            return (
              <tr key={m.id}>
                <td><Link to={`/alunos/${m.aluno_id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{m.aluno}</Link>{!!m.recorrente && <div className="pequeno suave">cartão recorrente</div>}</td>
                <td className="esconde-cel">{m.modalidade ?? '—'}{m.descricao && m.descricao !== m.modalidade && <div className="pequeno suave">{m.descricao}</div>}</td>
                <td className="d"><Num v={m.valor} /></td><td className="d"><Num v={m.pago} /></td>
                <td className="esconde-cel">{m.formas ? m.formas.split(',').map((f) => FORMA_ROTULO[f] ?? f).join(', ') : '—'}</td>
                <td>{s === 'pago' ? <Pilula tipo="ok">Pago</Pilula> : s === 'parcial' ? <Pilula tipo="atraso">Parcial</Pilula> : s === 'atraso' ? <Pilula tipo="atraso">Venceu {diaMes(m.vencimento)}</Pilula> : <Pilula tipo="aberto">A vencer</Pilula>}</td>
                <td className="d"><span className="acoes-linha">
                  {!fechado && <button className="link" onClick={() => setAlterar({ id: m.id, nome: m.aluno, competencia: comp, descricao: m.modalidade ?? m.descricao ?? '', valor: m.valor, contrato: m.contrato_id != null })}>Alterar</button>}
                  {(s === 'atraso' || s === 'parcial') && !m.recorrente && <BotaoCobrar aluno={{ ...m, nome: m.aluno }} competencia={comp} valor={falta} vencimento={m.vencimento} />}
                  {s !== 'pago' && <Botao pequeno onClick={() => setPagar({ mensalidade_id: m.id, nome: m.aluno, descricao: m.modalidade ?? m.descricao ?? '', aberto: falta, forma: m.forma_pagamento })}>Registrar pagamento</Botao>}
                </span></td>
              </tr>
            );
          })}</tbody>
          {lista.length > 0 && (
            <tfoot><tr>
              <td>Total · {lista.length} {lista.length === 1 ? 'mensalidade' : 'mensalidades'}</td><td className="esconde-cel" />
              <td className="d"><Num v={totLista.devido} /></td><td className="d"><Num v={totLista.pago} /></td>
              <td className="esconde-cel" />
              <td colSpan={2}>{totLista.devido - totLista.pago > 0.009 ? <span style={{ color: 'var(--atraso)' }}>Em aberto <Num v={totLista.devido - totLista.pago} /></span> : 'Tudo pago'}</td>
            </tr></tfoot>
          )}
        </table>
        {lista.length === 0 && dados.length > 0 && <div className="vazio">Nada neste filtro.</div>}
      </section>
      {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); }} />}
      {alterar && <AlterarValorModal item={alterar} onFechar={() => setAlterar(null)} onSalvo={() => { setAlterar(null); recarregar(); }} />}
      {baixar && <BaixarRecorrentes comp={comp} qtd={recorrentesAbertas.length} total={recorrentesAbertas.reduce((s, m) => s + m.valor - m.pago, 0)} onFechar={() => setBaixar(false)} onFeito={() => { setBaixar(false); recarregar(); }} />}
    </>
  );
}

function BaixarRecorrentes({ comp, qtd, total, onFechar, onFeito }: { comp: string; qtd: number; total: number; onFechar: () => void; onFeito: () => void }) {
  const { base, toast, recarregar } = useApp();
  const [data, setData] = useState(base?.hoje ?? '');
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    setOcupado(true);
    try {
      const r = await post<{ baixadas: number }>('/mensalidades/baixar-recorrentes', { competencia: comp, data });
      toast(`${r.baixadas} mensalidade(s) recorrente(s) baixada(s) no crédito.`);
      await recarregar();
      onFeito();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setOcupado(false); }
  }
  return (
    <Modal titulo="Baixar recorrentes" onFechar={onFechar}>
      <p style={{ margin: 0 }}>Registrar o pagamento de <b>{qtd}</b> mensalidade(s) de alunos com cartão recorrente em {nomeComp(comp).toLowerCase()}, total <Num v={total} />, na forma <b>Cartão de crédito</b>.</p>
      <Campo rotulo="Data do pagamento"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <div className="suave pequeno">Se alguma cobrança no cartão falhou, registre as outras individualmente em vez de usar a baixa em lote.</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={confirmar} desligado={!data || ocupado}>Baixar {qtd}</Botao>
      </div>
    </Modal>
  );
}
