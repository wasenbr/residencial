import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Carregando, Num, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';
import { status, type MensalidadeLinha } from './Mensalidades';

// Versão de celular: lista só o que falta receber.
export function Receber() {
  const { comp, base } = useApp();
  const { dados, erro, recarregar } = useDados(() => get<MensalidadeLinha[]>(`/mensalidades?comp=${comp}`), [comp]);
  const [pagar, setPagar] = useState<Devendo | null>(null);
  const [busca, setBusca] = useState('');
  if (!dados || !base) return <Carregando erro={erro} />;
  const abertas = dados.filter((m) => status(m, base.hoje) !== 'pago' && m.aluno.toLowerCase().includes(busca.toLowerCase()));
  const total = abertas.reduce((s, m) => s + (m.valor - m.pago), 0);
  return (
    <>
      <div><div className="pequeno suave">{nomeComp(comp)}</div><h1>A receber</h1><div className="suave"><Num v={total} /> em aberto</div></div>
      <input className="entrada" placeholder="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aluno" />
      <div className="lista-cartoes">
        {abertas.map((m) => (
          <button key={m.id} className="item-lista" onClick={() => setPagar({ mensalidade_id: m.id, nome: m.aluno, descricao: m.modalidade ?? m.descricao ?? '', aberto: m.valor - m.pago })}>
            <span><b>{m.aluno}</b><div className="pequeno suave">{m.modalidade ?? m.descricao}{m.pago > 0 ? ' · parcial' : ''}</div></span>
            <Num v={m.valor - m.pago} />
          </button>
        ))}
        {abertas.length === 0 && <div className="vazio">Tudo recebido em {nomeComp(comp)}. <br /><Link to="/">Voltar ao início</Link></div>}
      </div>
      {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); }} />}
    </>
  );
}
