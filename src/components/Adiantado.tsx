import { useState } from 'react';
import { post } from '../api';
import { dividirValor, nomeComp, rotuloMeses, somarMeses } from '../shared/comp';
import type { Aluno, Contrato } from '../shared/tipos';
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

type FormaPart = 'dinheiro' | 'pix' | 'debito' | 'credito';

/** Troca o plano de pagamento de um aluno que já existe (particular ↔ Gympass, valor, forma, contrato). */
export function TrocarPlanoModal({ aluno, aulasSemana, valorAtual, contratoAtual, inicioSugerido, onFechar, onSalvo }: {
  aluno: Aluno; aulasSemana: number; valorAtual: number | null; contratoAtual: Contrato | null; inicioSugerido: string;
  onFechar: () => void; onSalvo: () => void;
}) {
  const { base, toast } = useApp();
  const cfg = base?.config;
  const estimativaGympass = !cfg ? 0 : aulasSemana >= 5 ? cfg.gympass_5x : aulasSemana >= 3 ? cfg.gympass_3x : cfg.gympass_2x;
  const [origem, setOrigem] = useState<'particular' | 'gympass'>(aluno.origem);
  const [planoId, setPlanoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(valorAtual ? String(valorAtual).replace('.', ',') : '');
  const [meses, setMeses] = useState(contratoAtual?.meses ?? 1);
  const [forma, setForma] = useState<FormaPart>(aluno.forma_pagamento && aluno.forma_pagamento !== 'gympass' ? aluno.forma_pagamento : 'pix');
  const [manter, setManter] = useState<'manter' | 'encerrar'>('manter');
  const [aPartir, setAPartir] = useState(inicioSugerido);
  const [salvando, setSalvando] = useState(false);
  const planos = base?.planos ?? [];

  function escolherOrigem(o: 'particular' | 'gympass') {
    setOrigem(o);
    if (o === 'gympass') { setValor(String(estimativaGympass).replace('.', ',')); setMeses(1); setPlanoId(''); }
    else setValor(valorAtual && aluno.origem === 'particular' ? String(valorAtual).replace('.', ',') : '');
  }
  function escolherPlano(id: string) {
    setPlanoId(id);
    const p = planos.find((x) => String(x.id) === id);
    if (!p) { setMeses(1); return; }
    setDescricao(p.nome); setValor(String(p.valor).replace('.', ',')); setMeses(p.meses ?? 1);
  }

  const v = numero(valor);
  const valido = v > 0 && /^\d{4}-\d{2}$/.test(aPartir);
  const modo: 'manter' | 'encerrar' | 'novo' = origem === 'gympass' ? 'encerrar' : meses > 1 ? 'novo' : contratoAtual ? manter : 'manter';

  async function salvar() {
    setSalvando(true);
    try {
      const r = await post<{ alteradas: number; mantidas: number; criada: boolean }>(`/alunos/${aluno.id}/plano`, {
        origem, valor: v, forma_pagamento: origem === 'gympass' ? 'gympass' : forma, descricao: descricao.trim() || undefined,
        a_partir: aPartir, contrato: modo, meses: modo === 'novo' ? meses : undefined,
      });
      toast(`Plano trocado a partir de ${nomeComp(aPartir)}.` + (r.mantidas ? ` ${r.mantidas} mensalidade(s) já paga(s) ou de outra modalidade ficaram como estavam.` : ''));
      onSalvo();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo="Trocar plano de pagamento" onFechar={onFechar}>
      <div style={{ fontWeight: 600, fontSize: 17 }}>{aluno.nome}</div>
      <div className="form">
        <div>
          <div className="suave pequeno" style={{ marginBottom: 8, fontWeight: 500 }}>Como o aluno paga</div>
          <div className="fichas" role="radiogroup" aria-label="Tipo de aluno">
            {(['particular', 'gympass'] as const).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={origem === o} className={'ficha' + (origem === o ? ' ativa' : '')} onClick={() => escolherOrigem(o)}>{o === 'particular' ? 'Particular (paga ao estúdio)' : 'Gympass'}</button>
            ))}
          </div>
        </div>
        {origem === 'particular' ? (
          <>
            {planos.length > 0 && (
              <Campo rotulo="Plano">
                <select value={planoId} onChange={(e) => escolherPlano(e.target.value)}>
                  <option value="">Valor combinado</option>
                  {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {rotuloMeses(p.meses)} · R$ {p.valor}</option>)}
                </select>
              </Campo>
            )}
            <div className="linha-campos">
              <Campo rotulo="Mensalidade (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
              <Campo rotulo="Descrição (opcional)"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Pilates 3x" /></Campo>
            </div>
            <div>
              <div className="suave pequeno" style={{ marginBottom: 8, fontWeight: 500 }}>Forma de pagamento habitual</div>
              <div className="fichas" role="radiogroup" aria-label="Forma de pagamento habitual">
                {OPCOES.map(([k, r]) => (
                  <button key={k} type="button" role="radio" aria-checked={forma === k} className={'ficha' + (forma === k ? ' ativa' : '')} onClick={() => setForma(k)}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="suave pequeno" style={{ marginBottom: 8, fontWeight: 500 }}>Duração</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="fichas" role="radiogroup" aria-label="Duração do plano">
                  {[1, 3, 6, 12].map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={meses === m} className={'ficha' + (meses === m ? ' ativa' : '')} onClick={() => setMeses(m)}>{rotuloMeses(m)}</button>
                  ))}
                </div>
                <input className="entrada" type="number" min={1} max={60} value={meses} onChange={(e) => setMeses(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} aria-label="Duração em meses" style={{ width: 80 }} />
                <span className="pequeno suave">meses</span>
              </div>
            </div>
            {meses <= 1 && contratoAtual && (
              <Campo rotulo="Contrato atual">
                <select value={manter} onChange={(e) => setManter(e.target.value as 'manter' | 'encerrar')}>
                  <option value="manter">Manter ({contratoAtual.plano})</option>
                  <option value="encerrar">Encerrar e passar a mensal</option>
                </select>
              </Campo>
            )}
          </>
        ) : (
          <Campo rotulo="Valor estimado do Gympass por mês (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        )}
        <Campo rotulo="A partir de"><input type="month" value={aPartir} onChange={(e) => setAPartir(e.target.value)} /></Campo>
      </div>
      <div className="cartao pad pequeno" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {origem === 'gympass'
          ? <div>Passa a contar no Gympass com <span className="num">{dinheiro(v || 0)}</span> estimados por mês ({aulasSemana || 2}x por semana na tabela de Configurações). Ao receber, a forma já vem como Gympass.{contratoAtual && ' O contrato atual é encerrado.'}</div>
          : <div>Mensalidade de <span className="num">{dinheiro(v || 0)}</span>, paga em {OPCOES.find(([k]) => k === forma)?.[1].toLowerCase()}.{modo === 'novo' && ` Cria um contrato ${rotuloMeses(meses).toLowerCase()} (até ${nomeComp(somarMeses(aPartir, meses - 1))}).`}{modo === 'encerrar' && ' O contrato atual é encerrado.'}</div>}
        <div className="suave">As mensalidades em aberto de {nomeComp(aPartir)} em diante mudam; as já pagas ficam como estão. Os próximos meses gerados seguem o plano novo.</div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={salvar} desligado={!valido || salvando}>Trocar plano</Botao>
      </div>
    </Modal>
  );
}
