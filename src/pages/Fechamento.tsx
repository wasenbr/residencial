import { useState } from 'react';
import { get, post } from '../api';
import { nomeComp, somarMeses } from '../shared/comp';
import type { Resumo } from '../shared/resumo';
import { useApp } from '../store';
import { Botao, Carregando, Modal, Num, SeletorMes, Topo, useDados } from '../ui';

type ResumoMes = Resumo & { fechadoEm: string | null };

export function Fechamento() {
  const { comp, toast, recarregar: recBase } = useApp();
  const { dados: r, erro, recarregar } = useDados(() => get<ResumoMes>(`/resumo?comp=${comp}`), [comp]);
  const [confirmar, setConfirmar] = useState(false);
  if (!r) return <Carregando erro={erro} />;
  const fechado = !!r.fechadoEm;
  const prox = nomeComp(somarMeses(comp, 1), true).toLowerCase();
  const ant = nomeComp(somarMeses(comp, -1), true).toLowerCase();

  async function fechar() {
    try { await post('/fechar', { competencia: comp }); toast(`${nomeComp(comp)} fechado.`); setConfirmar(false); recarregar(); await recBase(); } catch (e) { toast(String((e as Error).message), true); }
  }
  async function reabrir() {
    try { await post('/reabrir', { competencia: comp }); toast('Mês reaberto.'); recarregar(); await recBase(); } catch (e) { toast(String((e as Error).message), true); }
  }
  const tot = r.porModalidade.reduce((s, m) => ({ n: s.n + m.matriculas, f: s.f + m.faturamento, r: s.r + m.recebido, a: s.a + m.aberto }), { n: 0, f: 0, r: 0, a: 0 });
  const situacaoGympass = { real: 'repasse real', estimado: 'estimado, falta o real', planilha: 'valor da planilha', nenhum: '' }[r.caixa.gympassAnteriorSituacao];

  return (
    <>
      <Topo titulo={`Fechamento · ${nomeComp(comp)}`} sub={fechado ? `Fechado em ${new Date(r.fechadoEm!).toLocaleDateString('pt-BR')} · lançamentos travados` : 'Aberto · fechar trava os lançamentos do mês'}>
        <SeletorMes />
        <a className="btn" href={`/api/exportar?comp=${comp}&formato=csv`}>Exportar CSV</a>
        <a className="btn" href={`/api/exportar?comp=${comp}&formato=json`} target="_blank" rel="noreferrer">JSON</a>
        {fechado ? <Botao onClick={reabrir}>Reabrir mês</Botao> : <Botao tipo="primario" onClick={() => setConfirmar(true)}>Fechar {nomeComp(comp, true).toLowerCase()}</Botao>}
      </Topo>

      {r.aberto > 0 && <div className="faixa"><span><b>Competência:</b> <Num v={r.aberto} /> ficaram em aberto em {nomeComp(comp, true).toLowerCase()}.</span></div>}

      <section className="cartao tabela-wrap">
        <table className="tbl">
          <thead><tr><th>Modalidade</th><th className="d">Matrículas</th><th className="d">Faturamento</th><th className="d">Recebido</th><th className="d">Em aberto</th></tr></thead>
          <tbody>{r.porModalidade.map((m) => (
            <tr key={m.id ?? 'x'}><td>{m.nome}</td><td className="d num">{m.matriculas}</td><td className="d"><Num v={m.faturamento} /></td><td className="d"><Num v={m.recebido} /></td><td className="d">{m.aberto > 0 ? <Num v={m.aberto} /> : '—'}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="d num">{tot.n}</td><td className="d"><Num v={tot.f} /></td><td className="d"><Num v={tot.r} /></td><td className="d"><Num v={tot.a} /></td></tr></tfoot>
        </table>
      </section>

      <div className="grade2">
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Caixa: sobram <Num v={r.sobra} /> em {nomeComp(comp, true).toLowerCase()}</h2>
          <Lin r={`Dinheiro e Pix recebidos em ${nomeComp(comp, true).toLowerCase()}`} v={r.caixa.dinheiroMes} />
          <Lin r={`+ Cartão de crédito de ${ant}`} v={r.caixa.creditoAnterior} />
          <Lin r={`+ Gympass de ${ant} (${situacaoGympass || 'sem lançamentos'})`} v={r.caixa.gympassAnterior} />
          <Lin r="Caixa do mês" v={r.caixa.total} forte />
          <Lin r="− Despesas" v={r.despesas.total} />
          <Lin r="Sobra" v={r.sobra} forte />
          <div className="pequeno suave" style={{ marginTop: 8 }}>Valores em aberto não entram no caixa: só conta o que foi recebido.</div>
        </section>
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Repasses e salário calculados</h2>
          {r.despesas.pessoal.map((p, i) => <Lin key={i} r={`${p.nome} · ${p.descricao}`} v={p.valor} />)}
          {r.despesas.pessoal.length === 0 && <div className="suave">Nenhum repasse configurado.</div>}
          <Lin r="Total pessoal" v={r.despesas.totalPessoal} forte />
          <h2 style={{ margin: '20px 0 8px' }}>Contas</h2>
          <Lin r="Aluguel, INSS, contador e demais" v={r.despesas.contas} />
          {r.despesas.retiradas > 0 && <Lin r="Retiradas da dona (fora das despesas)" v={r.despesas.retiradas} />}
        </section>
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Entra no caixa de {prox}</h2>
          <Lin r={`Cartão de ${nomeComp(comp, true).toLowerCase()}`} v={r.proximoCaixa.credito} />
          <Lin r={`Gympass de ${nomeComp(comp, true).toLowerCase()} (estimado)`} v={r.proximoCaixa.gympassEstimado} />
        </section>
      </div>

      {confirmar && (
        <Modal titulo={`Fechar ${nomeComp(comp)}?`} onFechar={() => setConfirmar(false)}>
          <p style={{ margin: 0 }}>Depois de fechado, não dá para lançar nem alterar pagamentos, mensalidades e despesas deste mês, a menos que você reabra. Há <Num v={r.aberto} /> em aberto.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={() => setConfirmar(false)}>Cancelar</Botao><Botao tipo="primario" onClick={fechar}>Fechar mês</Botao></div>
        </Modal>
      )}
    </>
  );
}

function Lin({ r, v, forte }: { r: string; v: number; forte?: boolean }) {
  return <div className={'resumo-linha' + (forte ? ' forte' : '')}><span>{r}</span><Num v={v} /></div>;
}
