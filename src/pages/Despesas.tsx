import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { del, get, post, put } from '../api';
import type { Despesa } from '../shared/tipos';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Modal, Num, SeletorMes, Topo, diaMes, useDados } from '../ui';
import { SemMes } from './Dashboard';

const CATEGORIAS = ['Manutenção', 'Contas', 'Material', 'Serviços', 'Outros'];

export function Despesas() {
  const { comp, toast, recarregar: recBase } = useApp();
  const { dados, erro, recarregar } = useDados(() => get<Despesa[]>(`/despesas?comp=${comp}`), [comp]);
  const [modal, setModal] = useState(false);
  const [editar, setEditar] = useState<Despesa | null>(null);
  if (!dados) return <Carregando erro={erro} />;
  const contas = dados;
  const total = contas.reduce((s, d) => s + d.valor, 0);
  const pago = contas.filter((d) => d.pago_em).reduce((s, d) => s + d.valor, 0);
  const semValor = contas.filter((d) => d.valor === 0).map((d) => d.descricao);
  const fixas = contas.filter((d) => d.tipo === 'fixa');
  const demais = contas.filter((d) => d.tipo !== 'fixa');
  const soma = (l: Despesa[]) => l.reduce((s, d) => s + d.valor, 0);
  const grupos = ([['Despesas fixas', 'todo mês, geradas no dia 1', fixas], ['Demais despesas', 'variáveis e pessoal', demais]] as const).filter(([, , l]) => l.length > 0);

  async function marcar(d: Despesa) {
    try { await put(`/despesas/${d.id}`, { pago: !d.pago_em }); recarregar(); await recBase(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <>
      <Topo titulo={`Despesas · ${nomeComp(comp)}`} sub="Fixas geradas no dia 1 · repasses calculados no fechamento">
        <SeletorMes />
        <Botao tipo="primario" onClick={() => setModal(true)}>Nova despesa</Botao>
      </Topo>
      {dados.length === 0 && <SemMes comp={comp} onGerado={recarregar} />}
      <div className="grade">
        <div className="cartao kpi"><div className="rot">Total do mês</div><div className="val num"><Num v={total} /></div>{semValor.length > 0 && <div className="pequeno suave">sem {semValor.join(', ').toLowerCase()}</div>}</div>
        <div className="cartao kpi"><div className="rot">Fixas</div><div className="val num"><Num v={soma(fixas)} /></div><div className="pequeno suave">demais <Num v={soma(demais)} /></div></div>
        <div className="cartao kpi"><div className="rot">Pago</div><div className="val num"><Num v={pago} /></div></div>
        <div className="cartao kpi"><div className="rot">A pagar</div><div className="val num"><Num v={total - pago} /></div></div>
      </div>
      <section className="cartao tabela-wrap">
        <table className="tbl">
          <thead><tr><th>Paga</th><th>Despesa</th><th className="esconde-cel">Tipo</th><th>Vence</th><th className="d">Valor</th><th /></tr></thead>
          {grupos.map(([titulo, sub, lista]) => (
          <tbody key={titulo}>
            <tr><td colSpan={6} style={{ background: titulo === 'Despesas fixas' ? 'var(--marca-clara)' : 'var(--fundo)', color: titulo === 'Despesas fixas' ? 'var(--marca-escura)' : undefined, fontWeight: 600 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{titulo} <span className="pequeno suave" style={{ fontWeight: 400 }}>· {sub}</span></span><Num v={soma(lista)} /></span>
            </td></tr>
            {lista.map((d) => (
            <tr key={d.id}>
              <td><input type="checkbox" checked={!!d.pago_em} onChange={() => marcar(d)} style={{ width: 22, height: 22 }} aria-label={`Marcar ${d.descricao} como paga`} /></td>
              <td><b>{d.descricao}</b><div className="pequeno suave">{d.categoria}</div></td>
              <td className="esconde-cel">{d.tipo === 'fixa' ? 'Fixa' : d.tipo === 'pessoal' ? 'Pessoal' : 'Variável'}</td>
              <td>{diaMes(d.vencimento)}</td>
              <td className="d">{d.valor === 0 ? <button className="link" onClick={() => setEditar(d)}>Informar valor</button> : <Num v={d.valor} />}</td>
              <td className="d"><button className="link" onClick={() => setEditar(d)}>Editar</button></td>
            </tr>
            ))}
          </tbody>
          ))}
        </table>
        {contas.length === 0 && <div className="vazio">Nenhuma despesa.</div>}
      </section>
      {(modal || editar) && (
        <FormDespesa comp={comp} existente={editar} onFechar={() => { setModal(false); setEditar(null); }} onSalva={async () => { setModal(false); setEditar(null); recarregar(); await recBase(); }} />
      )}
    </>
  );
}

function FormDespesa({ comp, existente, onFechar, onSalva }: { comp: string; existente: Despesa | null; onFechar: () => void; onSalva: () => void }) {
  const { toast, base } = useApp();
  const [desc, setDesc] = useState(existente?.descricao ?? '');
  const [valor, setValor] = useState(existente ? String(existente.valor).replace('.', ',') : '');
  const [cat, setCat] = useState(existente?.categoria ?? 'Manutenção');
  const [data, setData] = useState(existente?.vencimento ?? base?.hoje ?? '');
  const [paga, setPaga] = useState(!!existente?.pago_em);
  const v = Number(valor.replace(',', '.'));
  async function salvar() {
    try {
      if (existente) await put(`/despesas/${existente.id}`, { valor: v, descricao: desc, vencimento: data || null, pago: paga });
      else await post('/despesas', { competencia: comp, descricao: desc, categoria: cat, tipo: 'variavel', valor: v, vencimento: data || undefined, pago: paga });
      toast('Lançamento salvo.');
      onSalva();
    } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <Modal titulo={existente ? 'Editar despesa' : 'Nova despesa'} onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Descrição"><input value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        {!existente && <Campo rotulo="Categoria"><select value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></Campo>}
        <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}><input type="checkbox" checked={paga} onChange={(e) => setPaga(e.target.checked)} style={{ width: 20, height: 20 }} /> Já está paga</label>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        {existente && <Botao tipo="perigo" onClick={async () => { await del(`/despesas/${existente.id}`); toast('Despesa excluída.'); onSalva(); }}>Excluir</Botao>}
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={salvar} desligado={!desc.trim() || !(v >= 0)}>Salvar</Botao>
      </div>
    </Modal>
  );
}

// Celular: atalho "Lançar despesa" abre direto o formulário.
export function DespesaNova() {
  const { comp, recarregar } = useApp();
  const nav = useNavigate();
  return (
    <>
      <Topo titulo="Nova despesa" sub={<Link to="/despesas">Ver todas as despesas</Link>} />
      <FormDespesa comp={comp} existente={null} onFechar={() => nav('/')} onSalva={async () => { await recarregar(); nav('/despesas'); }} />
    </>
  );
}
