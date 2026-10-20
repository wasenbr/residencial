import { useState } from 'react';
import { post } from '../api';
import { useApp } from '../store';
import { Botao, Campo, Modal, dinheiro } from '../ui';

export interface Devendo { mensalidade_id: number; nome: string; descricao: string; aberto: number }

type Forma = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'gympass';
const OPCOES: [Forma, string][] = [['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['debito', 'Débito'], ['credito', 'Cartão de crédito'], ['gympass', 'Gympass']];

export function PagarModal({ item, onFechar, onPago }: { item: Devendo; onFechar: () => void; onPago: () => void }) {
  const { toast, recarregar, base } = useApp();
  const [valor, setValor] = useState(String(item.aberto).replace('.', ','));
  const [forma, setForma] = useState<Forma>('pix');
  const [data, setData] = useState(base?.hoje ?? new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);

  const v = Number(valor.replace(',', '.'));
  const valido = v > 0 && Number.isFinite(v);

  async function confirmar() {
    setSalvando(true);
    try {
      await post('/pagamentos', { mensalidade_id: item.mensalidade_id, valor: v, forma, data });
      toast(`Pagamento de ${item.nome} registrado.`);
      await recarregar();
      onPago();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível registrar.', true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Registrar pagamento" onFechar={onFechar}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{item.nome}</div>
        <div className="suave pequeno">{item.descricao} · em aberto <span className="num">{dinheiro(item.aberto)}</span></div>
      </div>
      <Campo rotulo="Valor recebido (R$)">
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
      </Campo>
      <div>
        <div className="suave pequeno" style={{ marginBottom: 8, fontWeight: 500 }}>Forma de pagamento</div>
        <div className="fichas" role="radiogroup" aria-label="Forma de pagamento">
          {OPCOES.map(([k, r]) => (
            <button key={k} type="button" role="radio" aria-checked={forma === k} className={'ficha' + (forma === k ? ' ativa' : '')} onClick={() => setForma(k)}>{r}</button>
          ))}
        </div>
      </div>
      <Campo rotulo="Data do pagamento"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <div className="suave pequeno">
        {forma === 'credito' || forma === 'gympass'
          ? 'Cartão de crédito e Gympass entram no caixa do mês seguinte.'
          : 'Entra no caixa do mês do pagamento.'}
        {valido && v < item.aberto - 0.009 && ' Valor menor que o devido deixa saldo em aberto.'}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={confirmar} desligado={!valido || salvando}>Confirmar pagamento</Botao>
      </div>
    </Modal>
  );
}
