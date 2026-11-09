import { useState } from 'react';
import { post, put } from '../api';
import { linkCobranca, type Cobravel } from '../shared/cobranca';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Botao, Campo, Modal, dinheiro } from '../ui';

/** Botão que abre o WhatsApp com a mensagem de cobrança pronta. Some se o aluno não tem telefone. */
export function BotaoCobrar({ aluno, competencia, valor, vencimento }: {
  aluno: Cobravel; competencia: string; valor: number; vencimento: string | null;
}) {
  const { base } = useApp();
  const link = linkCobranca(aluno, { competencia, valor, vencimento }, base?.config.msg_cobranca, base?.config.nome_academia ?? '');
  if (!link) return <span className="pequeno suave" title="Cadastre o WhatsApp na ficha do aluno">sem WhatsApp</span>;
  return <a className="btn peq whats" href={link} target="_blank" rel="noreferrer" title="Abrir o WhatsApp com a mensagem de cobrança">Cobrar</a>;
}

export interface MensalidadeEditavel {
  id: number; nome: string; competencia: string; descricao: string; valor: number; contrato: boolean;
}

/** Divide a mensalidade do mês entre modalidades (ex.: 150 = 70 Zumba + 80 Funcional). */
export function DividirModal({ alunoId, nome, competencia, total, modalidadeIds, onFechar, onSalvo }: {
  alunoId: number; nome: string; competencia: string; total: number; modalidadeIds: number[]; onFechar: () => void; onSalvo: () => void;
}) {
  const { base, toast, recarregar } = useApp();
  const mods = (base?.modalidades ?? []).filter((m) => modalidadeIds.length > 1 ? modalidadeIds.includes(m.id) : true);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [propagar, setPropagar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const num = (s: string | undefined) => Number((s ?? '').replace(',', '.')) || 0;
  const partes = mods.map((m) => ({ modalidade_id: m.id, valor: num(valores[m.id]) })).filter((p) => p.valor > 0);
  const soma = partes.reduce((s, p) => s + p.valor, 0);
  const valido = partes.length >= 2;
  const diferenca = Math.round((soma - total) * 100) / 100;

  async function salvar() {
    setSalvando(true);
    try {
      await post(`/alunos/${alunoId}/dividir`, { competencia, partes, propagar });
      toast('Mensalidade dividida.');
      await recarregar();
      onSalvo();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo="Dividir por modalidade" onFechar={onFechar}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{nome}</div>
        <div className="suave pequeno">{nomeComp(competencia)} · hoje <span className="num">{dinheiro(total)}</span> em uma mensalidade só</div>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (valido) void salvar(); }}>
        {mods.map((m, i) => (
          <Campo key={m.id} rotulo={`${m.nome} (R$)`}>
            <input inputMode="decimal" value={valores[m.id] ?? ''} onChange={(e) => setValores({ ...valores, [m.id]: e.target.value })} autoFocus={i === 0} />
          </Campo>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <input type="checkbox" checked={propagar} onChange={(e) => setPropagar(e.target.checked)} style={{ width: 20, height: 20 }} />
          Aplicar também aos próximos meses
        </label>
      </form>
      <div className="suave pequeno">
        Total: <span className="num">{dinheiro(soma)}</span>
        {valido && Math.abs(diferenca) > 0.009 && <> · {diferenca > 0 ? 'mais' : 'menos'} <span className="num">{dinheiro(Math.abs(diferenca))}</span> que o valor de hoje (o valor do aluno vai mudar)</>}
        {valido && Math.abs(diferenca) <= 0.009 && ' · confere com o valor de hoje'}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={salvar} desligado={!valido || salvando}>Dividir</Botao>
      </div>
    </Modal>
  );
}

/** Altera o valor de uma mensalidade e, se pedido, dos meses seguintes. */
export function AlterarValorModal({ item, onFechar, onSalvo }: { item: MensalidadeEditavel; onFechar: () => void; onSalvo: () => void }) {
  const { toast, recarregar } = useApp();
  const [valor, setValor] = useState(String(item.valor).replace('.', ','));
  const [propagar, setPropagar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const v = Number(valor.replace(',', '.'));
  const valido = valor.trim() !== '' && Number.isFinite(v) && v >= 0 && Math.abs(v - item.valor) > 0.009;

  async function salvar() {
    setSalvando(true);
    try {
      await put(`/mensalidades/${item.id}`, { valor: v, propagar });
      toast('Mensalidade alterada.');
      await recarregar();
      onSalvo();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo="Alterar mensalidade" onFechar={onFechar}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{item.nome}</div>
        <div className="suave pequeno">{[item.descricao, nomeComp(item.competencia)].filter(Boolean).join(' · ')} · hoje <span className="num">{dinheiro(item.valor)}</span></div>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (valido) void salvar(); }}>
        <Campo rotulo="Novo valor (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <input type="checkbox" checked={propagar} onChange={(e) => setPropagar(e.target.checked)} style={{ width: 20, height: 20 }} />
          Aplicar também aos próximos meses{item.contrato ? ' e ao contrato' : ''}
        </label>
      </form>
      <div className="suave pequeno">
        {propagar
          ? 'Os meses seguintes já gerados que ainda estavam com o valor antigo mudam junto, e os próximos que forem gerados seguem o novo valor.'
          : 'Só este mês muda. Como os meses novos são copiados do anterior, o próximo mês também sairá com este valor.'}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={salvar} desligado={!valido || salvando}>Salvar</Botao>
      </div>
    </Modal>
  );
}
