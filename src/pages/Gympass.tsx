import { useState } from 'react';
import { get, put } from '../api';
import { nomeComp, somarMeses } from '../shared/comp';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Num, Pilula, Topo, useDados } from '../ui';

interface Dados {
  alunos: { id: number; nome: string; mensalidade_id: number; modalidade: string | null; descricao: string | null; estimado: number }[];
  historico: { competencia: string; estimado: number; real: number | null; recebido_em: string | null; justificativa: string | null }[];
  tabela: { aulas: number; valor: number }[];
}

export function Gympass() {
  const { comp, toast, recarregar: recBase } = useApp();
  const { dados, erro, recarregar } = useDados(() => get<Dados>(`/gympass?comp=${comp}`), [comp]);
  const [real, setReal] = useState('');
  const [just, setJust] = useState('');
  if (!dados) return <Carregando erro={erro} />;
  // O repasse que chega agora refere-se ao mês anterior ao selecionado.
  const alvo = somarMeses(comp, -1);
  const linhaAlvo = dados.historico.find((h) => h.competencia === alvo);
  const estimadoAlvo = linhaAlvo?.estimado ?? 0;
  const r = Number(real.replace(',', '.'));
  const dif = Number.isFinite(r) && real !== '' ? r - estimadoAlvo : null;
  const totalMes = dados.alunos.reduce((s, a) => s + a.estimado, 0);

  async function salvar() {
    try { await put(`/gympass/${alvo}`, { real: r, justificativa: just || undefined }); toast('Repasse salvo.'); setReal(''); setJust(''); recarregar(); await recBase(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <>
      <Topo titulo="Gympass" sub="O estimado entra na competência do mês. O repasse real entra no caixa do mês seguinte e precisa bater." />
      <section className="cartao pad form">
        <h2>Conciliar {nomeComp(alvo).toLowerCase()}</h2>
        {estimadoAlvo === 0 && !linhaAlvo?.real ? <div className="suave">Nenhum lançamento Gympass em {nomeComp(alvo)}.</div> : (
          <>
            <div className="grade">
              <div><div className="suave pequeno">Estimado no mês</div><div className="num" style={{ fontSize: 22 }}>{estimadoAlvo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></div>
              <div><div className="suave pequeno">Repasse real recebido</div>{linhaAlvo?.real != null && real === '' ? <div className="num" style={{ fontSize: 22 }}>{linhaAlvo.real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div> : null}</div>
            </div>
            <div className="linha-campos">
              <Campo rotulo="Repasse real (R$)"><input inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} placeholder={linhaAlvo?.real != null ? String(linhaAlvo.real) : ''} /></Campo>
              <Campo rotulo="Justificativa da diferença"><input value={just} onChange={(e) => setJust(e.target.value)} placeholder={linhaAlvo?.justificativa ?? ''} /></Campo>
            </div>
            {dif != null && <div className={dif === 0 ? 'faixa info' : 'faixa'}>{dif === 0 ? 'Bateu com o estimado.' : <>Diferença de <Num v={dif} centavos /> em relação ao estimado.</>}</div>}
            <div><Botao tipo="primario" onClick={salvar} desligado={real === '' || !(r >= 0)}>Salvar repasse</Botao></div>
          </>
        )}
      </section>
      <section className="cartao">
        <div style={{ padding: '16px 20px' }}><h2>Histórico</h2></div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Competência</th><th className="d">Estimado</th><th className="d">Real</th><th>Situação</th></tr></thead>
          <tbody>{dados.historico.map((h) => {
            const futuro = h.competencia >= comp;
            return (
              <tr key={h.competencia}>
                <td>{nomeComp(h.competencia)}</td><td className="d"><Num v={h.estimado} centavos /></td>
                <td className="d">{h.real != null ? <Num v={h.real} centavos /> : '—'}</td>
                <td>{h.real != null ? (Math.abs(h.real - h.estimado) < 0.01 ? <Pilula tipo="ok">Conciliado</Pilula> : <Pilula tipo="atraso">Diferença <Num v={h.real - h.estimado} /></Pilula>) : futuro ? <Pilula tipo="aberto">Chega em {nomeComp(somarMeses(h.competencia, 1), true).toLowerCase()}</Pilula> : <Pilula tipo="atraso">Pendente</Pilula>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
      <div className="grade2">
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Estimativa por frequência</h2>
          {dados.tabela.map((t) => <div key={t.aulas} className="resumo-linha"><span>{t.aulas}x / semana</span><Num v={t.valor} /></div>)}
          <div className="pequeno suave" style={{ marginTop: 8 }}>Altere em Configurações.</div>
        </section>
        <section className="cartao">
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}><h2>Alunos Gympass em {nomeComp(comp, true).toLowerCase()}</h2><span className="num">{totalMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Aluno</th><th>Turma</th><th className="d">Estimado</th></tr></thead>
            <tbody>{dados.alunos.map((a) => <tr key={a.mensalidade_id}><td>{a.nome}</td><td>{a.modalidade ?? a.descricao}</td><td className="d"><Num v={a.estimado} /></td></tr>)}</tbody>
          </table>
          {dados.alunos.length === 0 && <div className="vazio">Nenhum aluno Gympass neste mês.</div>}</div>
        </section>
      </div>
    </>
  );
}
