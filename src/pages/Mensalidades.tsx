import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Botao, Carregando, FORMA_ROTULO, Num, Pilula, SeletorMes, Topo, diaMes, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';
import { SemMes } from './Dashboard';

export interface MensalidadeLinha {
  id: number; aluno_id: number; aluno: string; origem: string; modalidade: string | null; descricao: string | null;
  valor: number; pago: number; formas: string | null; vencimento: string | null;
}

type Filtro = 'todas' | 'atraso' | 'parciais' | 'pagas' | 'gympass';

export function status(m: MensalidadeLinha, hoje: string): 'pago' | 'parcial' | 'atraso' | 'aberto' {
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
  if (!dados || !base) return <Carregando erro={erro} />;
  const hoje = base.hoje;
  const st = (m: MensalidadeLinha) => status(m, hoje);
  const recebido = dados.reduce((s, m) => s + m.pago, 0);
  const devido = dados.reduce((s, m) => s + m.valor, 0);
  const cont = {
    todas: dados.length, atraso: dados.filter((m) => st(m) === 'atraso' || st(m) === 'parcial').length,
    parciais: dados.filter((m) => st(m) === 'parcial').length, pagas: dados.filter((m) => st(m) === 'pago').length,
    gympass: dados.filter((m) => m.formas?.includes('gympass')).length,
  };
  const lista = dados.filter((m) => {
    if (filtro === 'atraso' && !(st(m) === 'atraso' || st(m) === 'parcial')) return false;
    if (filtro === 'parciais' && st(m) !== 'parcial') return false;
    if (filtro === 'pagas' && st(m) !== 'pago') return false;
    if (filtro === 'gympass' && !m.formas?.includes('gympass')) return false;
    if (modalidade && m.modalidade !== modalidade) return false;
    if (busca && !m.aluno.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });
  const fichas: [Filtro, string][] = [['todas', 'Todas'], ['atraso', 'Em aberto'], ['parciais', 'Parciais'], ['pagas', 'Pagas'], ['gympass', 'Gympass']];
  return (
    <>
      <Topo titulo={`Mensalidades · ${nomeComp(comp)}`} sub={<>Vencimento dia {base.config.dia_vencimento} · <Num v={recebido} /> recebidos de <Num v={devido} /></>}>
        <SeletorMes />
      </Topo>
      {dados.length === 0 && <SemMes comp={comp} onGerado={recarregar} />}
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
            return (
              <tr key={m.id}>
                <td><Link to={`/alunos/${m.aluno_id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{m.aluno}</Link></td>
                <td className="esconde-cel">{m.modalidade ?? '—'}{m.descricao && m.descricao !== m.modalidade && <div className="pequeno suave">{m.descricao}</div>}</td>
                <td className="d"><Num v={m.valor} /></td><td className="d"><Num v={m.pago} /></td>
                <td className="esconde-cel">{m.formas ? m.formas.split(',').map((f) => FORMA_ROTULO[f] ?? f).join(', ') : '—'}</td>
                <td>{s === 'pago' ? <Pilula tipo="ok">Pago</Pilula> : s === 'parcial' ? <Pilula tipo="atraso">Parcial</Pilula> : s === 'atraso' ? <Pilula tipo="atraso">Venceu {diaMes(m.vencimento)}</Pilula> : <Pilula tipo="aberto">A vencer</Pilula>}</td>
                <td className="d">{s !== 'pago' && <Botao pequeno onClick={() => setPagar({ mensalidade_id: m.id, nome: m.aluno, descricao: m.modalidade ?? m.descricao ?? '', aberto: m.valor - m.pago })}>Registrar pagamento</Botao>}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {lista.length === 0 && dados.length > 0 && <div className="vazio">Nada neste filtro.</div>}
      </section>
      {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); }} />}
    </>
  );
}
