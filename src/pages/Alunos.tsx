import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { parecidos } from '../shared/nomes';
import type { Aluno, Contrato } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Carregando, Num, Pilula, SeletorMes, Topo, useDados } from '../ui';
import { nomeComp, diffMeses } from '../shared/comp';

type Linha = Aluno & { turmas: { id: number; nome: string }[]; contrato: Contrato | null; devido: number; pago: number };
type Filtro = 'ativos' | 'particulares' | 'gympass' | 'criancas' | 'inativos';

export function Alunos() {
  const { comp, toast, recarregar } = useApp();
  const nav = useNavigate();
  const { dados, erro, recarregar: atualizar } = useDados(() => get<Linha[]>(`/alunos?comp=${comp}`), [comp]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [ignoradas, setIgnoradas] = useState<string[]>([]);

  const duplicata = useMemo(() => {
    if (!dados) return null;
    const ativos = dados.filter((a) => a.ativo);
    for (let i = 0; i < ativos.length; i++) {
      for (let j = i + 1; j < ativos.length; j++) {
        const x = ativos[i], y = ativos[j];
        const id = `${x.id}-${y.id}`;
        if (ignoradas.includes(id)) continue;
        const mesmaTurma = x.turmas.some((t) => y.turmas.some((u) => u.id === t.id));
        if (parecidos(x.nome, y.nome) && (mesmaTurma || x.turmas.length === 0 || y.turmas.length === 0 || true)) return { x, y, id };
      }
    }
    return null;
  }, [dados, ignoradas]);

  if (!dados) return <Carregando erro={erro} />;
  const ativos = dados.filter((a) => a.ativo);
  const lista = dados.filter((a) => {
    if (filtro === 'inativos') return !a.ativo;
    if (!a.ativo) return false;
    if (filtro === 'particulares') return a.origem === 'particular';
    if (filtro === 'gympass') return a.origem === 'gympass';
    if (filtro === 'criancas') return !!a.responsavel;
    return true;
  }).filter((a) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase()));
  const matriculas = ativos.reduce((s, a) => s + a.turmas.length, 0);
  const conta = (f: Filtro) => dados.filter((a) => (f === 'inativos' ? !a.ativo : a.ativo && (f === 'ativos' || (f === 'particulares' ? a.origem === 'particular' : f === 'gympass' ? a.origem === 'gympass' : !!a.responsavel)))).length;

  async function unificar(destino: number, origem: number) {
    try { await post('/alunos/unificar', { destino, origem }); toast('Cadastros unificados.'); atualizar(); await recarregar(); } catch (e) { toast(String((e as Error).message), true); }
  }

  const fichas: [Filtro, string][] = [['ativos', 'Ativos'], ['particulares', 'Particulares'], ['gympass', 'Gympass'], ['criancas', 'Crianças'], ['inativos', 'Inativos']];
  return (
    <>
      <Topo titulo="Alunos" sub={`${ativos.length} ativos · ${matriculas} matrículas em turmas`}>
        <SeletorMes />
        <Link className="btn primario" to="/novo-aluno">Novo aluno</Link>
      </Topo>
      {duplicata && (
        <div className="faixa">
          <span>Possível duplicata: <b>“{duplicata.x.nome}”</b> e <b>“{duplicata.y.nome}”</b> têm nomes parecidos{duplicata.x.turmas.some((t) => duplicata.y.turmas.some((u) => u.id === t.id)) ? ' e a mesma turma' : ''}.</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Botao pequeno onClick={() => unificar(duplicata.x.id, duplicata.y.id)}>Unificar em “{duplicata.x.nome}”</Botao>
            <Botao pequeno onClick={() => unificar(duplicata.y.id, duplicata.x.id)}>Unificar em “{duplicata.y.nome}”</Botao>
            <Botao pequeno onClick={() => setIgnoradas([...ignoradas, duplicata.id])}>São pessoas diferentes</Botao>
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="entrada" style={{ maxWidth: 320 }} placeholder="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aluno" />
        <div className="fichas">{fichas.map(([k, r]) => <button key={k} className={'ficha' + (filtro === k ? ' ativa' : '')} onClick={() => setFiltro(k)}>{r} · {conta(k)}</button>)}</div>
      </div>
      <section className="cartao tabela-wrap">
        <table className="tbl">
          <thead><tr><th>Aluno</th><th>Turmas</th><th className="esconde-cel">Contrato</th><th className="esconde-cel">Origem</th><th>{nomeComp(comp, true)}</th></tr></thead>
          <tbody>
            {lista.map((a) => {
              const aberto = a.devido - a.pago;
              const mesContrato = a.contrato?.meses ? diffMeses(a.contrato.inicio, comp) + 1 : null;
              return (
                <tr key={a.id} className="clicavel" onClick={() => nav(`/alunos/${a.id}`)}>
                  <td><b>{a.nome}</b>{a.responsavel && <div className="pequeno suave">resp. {a.responsavel}</div>}</td>
                  <td>{a.turmas.length ? a.turmas.map((t) => t.nome).join(', ') : <span className="suave">—</span>}</td>
                  <td className="esconde-cel">{a.contrato ? `${a.contrato.plano}${mesContrato ? ` · mês ${mesContrato} de ${a.contrato.meses}` : ''}` : 'Mensal'}</td>
                  <td className="esconde-cel">{a.origem === 'gympass' ? 'Gympass' : 'Particular'}</td>
                  <td>{a.devido === 0 ? <span className="suave">—</span> : aberto > 0.009 ? (a.pago > 0 ? <Pilula tipo="atraso">Saldo <Num v={aberto} /></Pilula> : <Pilula tipo="atraso">Em aberto</Pilula>) : <Pilula tipo="ok">Pago</Pilula>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <div className="vazio">Nenhum aluno encontrado.</div>}
      </section>
    </>
  );
}
