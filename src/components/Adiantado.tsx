import { useState } from 'react';
import { post } from '../api';
import { dividirValor, nomeComp, rotuloMeses, somarMeses } from '../shared/comp';
import type { Contrato } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Modal, dinheiro } from '../ui';

type Forma = 'dinheiro' | 'pix' | 'debito' | 'credito';
const OPCOES: [Forma, string][] = [['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['debito', 'Débito'], ['credito', 'Cartão de crédito']];
const ATALHOS = [3, 6, 12, 13];

const numero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

/** Pagamento de vários meses de uma vez: cria as mensalidades já pagas e o contrato do período. */
export function AdiantadoModal({ alunoId, nome, inicioSugerido, contratoAtual, onFechar, onSalvo }: {
  alunoId: number; nome: string; inicioSugerido: string; contratoAtual: Contrato | null;
  onFechar: () => void; onSalvo: () => void;
}) {
  const { base, toast } = useApp();
  const [inicio, setInicio] = useState(inicioSugerido);
  const [meses, setMeses] = useState('3');
  const [total, setTotal] = useState('');
  const [forma, setForma] = useState<Forma>('pix');
  const [data, setData] = useState(base?.hoje ?? new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState('');
  const [contrato, setContrato] = useState<'novo' | 'atual'>('novo');
  const [salvando, setSalvando] = useState(false);

  const n = Number(meses);
  const t = numero(total);
  const valido = Number.isInteger(n) && n >= 2 && n <= 36 && t > 0 && /^\d{4}-\d{2}$/.test(inicio);
  const parcelas = valido ? dividirValor(t, n) : [];
  const ate = valido ? somarMeses(inicio, n - 1) : null;
  const mesCaixa = forma === 'credito' && base?.config.cartao_caixa === 'seguinte' ? somarMeses(data.slice(0, 7), 1) : data.slice(0, 7);

  async function confirmar() {
    setSalvando(true);
    try {
      await post(`/alunos/${alunoId}/adiantado`, {
        inicio, meses: n, valor_total: t, forma, data, descricao: descricao.trim() || undefined,
        contrato: contratoAtual ? contrato : 'novo',
      });
      toast(`${nome}: ${n} meses pagos, de ${nomeComp(inicio)} a ${nomeComp(ate!)}.`);
      onSalvo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível registrar.', true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Pagamento adiantado" onFechar={onFechar}>
      <div style={{ fontWeight: 600, fontSize: 17 }}>{nome}</div>
      <div className="form">
        <div className="linha-campos">
          <Campo rotulo="Primeiro mês pago"><input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
          <Campo rotulo="Quantos meses"><input type="number" min={2} max={36} value={meses} onChange={(e) => setMeses(e.target.value)} /></Campo>
        </div>
        <div className="fichas" role="group" aria-label="Atalhos de meses">
          {ATALHOS.map((m) => <button key={m} type="button" className={'ficha' + (n === m ? ' ativa' : '')} onClick={() => setMeses(String(m))}>{rotuloMeses(m)}</button>)}
        </div>
        <Campo rotulo="Valor total recebido (R$)"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Ex.: 600,00" autoFocus /></Campo>
        <div>
          <div className="suave pequeno" style={{ marginBottom: 8, fontWeight: 500 }}>Forma de pagamento</div>
          <div className="fichas" role="radiogroup" aria-label="Forma de pagamento">
            {OPCOES.map(([k, r]) => (
              <button key={k} type="button" role="radio" aria-checked={forma === k} className={'ficha' + (forma === k ? ' ativa' : '')} onClick={() => setForma(k)}>{r}</button>
            ))}
          </div>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Data do pagamento"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
          <Campo rotulo="Descrição (opcional)"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Plano trimestral" /></Campo>
        </div>
        {contratoAtual && (
          <Campo rotulo="Contrato">
            <select value={contrato} onChange={(e) => setContrato(e.target.value as 'novo' | 'atual')}>
              <option value="novo">Novo contrato de {valido ? rotuloMeses(n).toLowerCase() : 'N meses'} (encerra o atual)</option>
              <option value="atual">Manter o contrato atual ({contratoAtual.plano})</option>
            </select>
          </Campo>
        )}
      </div>
      {valido && (
        <div className="cartao pad pequeno" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div><b>{nomeComp(inicio)} a {nomeComp(ate!)}</b>: {parcelas[0] === parcelas[n - 1]
            ? <>{n} × <span className="num">{dinheiro(parcelas[0])}</span></>
            : <>{n - 1} × <span className="num">{dinheiro(parcelas[0])}</span> + <span className="num">{dinheiro(parcelas[n - 1])}</span></>} no faturamento de cada mês.</div>
          <div><span className="num">{dinheiro(t)}</span> entram no caixa de {nomeComp(mesCaixa)}.</div>
          {(!contratoAtual || contrato === 'novo') && <div className="suave">No fim do período o contrato aparece em “Contratos terminando” para renovar ou receber de novo.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={confirmar} desligado={!valido || salvando}>Registrar pagamento</Botao>
      </div>
    </Modal>
  );
}

/** Contrato novo (qualquer duração) para um aluno que já está cadastrado. */
export function NovoContratoModal({ alunoId, inicioSugerido, valorSugerido, onFechar, onSalvo }: {
  alunoId: number; inicioSugerido: string; valorSugerido: number | null; onFechar: () => void; onSalvo: () => void;
}) {
  const { base, toast } = useApp();
  const planos = (base?.planos ?? []).filter((p) => (p.meses ?? 1) > 1);
  const [plano, setPlano] = useState('');
  const [meses, setMeses] = useState('12');
  const [valor, setValor] = useState(valorSugerido ? String(valorSugerido).replace('.', ',') : '');
  const [inicio, setInicio] = useState(inicioSugerido);
  const n = Number(meses);
  const v = numero(valor);
  const valido = Number.isInteger(n) && n >= 1 && n <= 60 && v > 0 && /^\d{4}-\d{2}$/.test(inicio);

  function escolher(id: string) {
    const p = planos.find((x) => String(x.id) === id);
    if (!p) return;
    setPlano(p.nome); setMeses(String(p.meses)); setValor(String(p.valor).replace('.', ','));
  }

  async function salvar() {
    try {
      await post(`/alunos/${alunoId}/contratos`, { plano: plano.trim() || undefined, valor_mensal: v, meses: n, inicio });
      toast('Contrato criado.');
      onSalvo();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); }
  }

  return (
    <Modal titulo="Novo contrato" onFechar={onFechar}>
      <div className="form">
        {planos.length > 0 && (
          <Campo rotulo="Plano cadastrado">
            <select defaultValue="" onChange={(e) => escolher(e.target.value)}>
              <option value="">Escolher…</option>
              {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {rotuloMeses(p.meses)} · R$ {p.valor}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Nome do plano"><input value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Ex.: Plano 13 meses" /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Duração (meses)"><input type="number" min={1} max={60} value={meses} onChange={(e) => setMeses(e.target.value)} /></Campo>
          <Campo rotulo="Valor mensal (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Começa em"><input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
      </div>
      <div className="suave pequeno">
        O mês de início precisa já ter a mensalidade do aluno; ela passa a ter o valor do contrato e os meses seguintes copiam dela.
        {valido && ` Termina em ${nomeComp(somarMeses(inicio, n - 1))}.`}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" desligado={!valido} onClick={salvar}>Criar contrato</Botao>
      </div>
    </Modal>
  );
}
