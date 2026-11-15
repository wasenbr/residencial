import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api';
import { tempoDesde } from '../components/Avaliacao';
import { diasEntre, REAVALIAR_DIAS } from '../shared/avaliacao';
import type { Aluno } from '../shared/tipos';
import { useApp } from '../store';
import { Carregando, Pilula, useDados } from '../ui';

type Ultima = { aluno_id: number; data: string; total: number };

// Atalho do celular: escolher o aluno e cair direto na captura da nova avaliação.
export function Avaliar() {
  const { comp, base } = useApp();
  const nav = useNavigate();
  const { dados, erro } = useDados(async () => {
    const [alunos, ultimas] = await Promise.all([get<Aluno[]>(`/alunos?comp=${comp}`), get<Ultima[]>('/avaliacoes/ultimas')]);
    return { alunos, ultimas: new Map(ultimas.map((u) => [u.aluno_id, u])) };
  }, [comp]);
  const [busca, setBusca] = useState('');
  if (!dados || !base) return <Carregando erro={erro} />;
  const termo = busca.trim().toLowerCase();
  const lista = dados.alunos.filter((a) => a.ativo && (!termo || a.nome.toLowerCase().includes(termo)));
  return (
    <>
      <div><h1>Avaliação física</h1><div className="suave">Escolha o aluno para começar.</div></div>
      <input className="entrada" placeholder="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aluno" autoFocus />
      <div className="lista-cartoes">
        {lista.map((a) => {
          const u = dados.ultimas.get(a.id);
          const dias = u ? diasEntre(u.data, base.hoje) : null;
          return (
            <button key={a.id} className="item-lista" onClick={() => nav(`/alunos/${a.id}/avaliacoes/nova`)}>
              <span><b>{a.nome}</b><div className="pequeno suave">{u ? `${u.total} ${u.total === 1 ? 'avaliação' : 'avaliações'} · última ${tempoDesde(dias!)}` : 'Primeira avaliação'}</div></span>
              {dias !== null && dias >= REAVALIAR_DIAS && <Pilula tipo="aberto">Reavaliar</Pilula>}
            </button>
          );
        })}
        {lista.length === 0 && <div className="vazio">Nenhum aluno ativo encontrado.<br /><Link to="/novo-aluno">Cadastrar novo aluno</Link></div>}
      </div>
    </>
  );
}
