import { useEffect, useState } from 'react';
import { post, put } from '../api';
import type { Config, DespesaFixa, Plano, Professor } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Modal, Num, Topo } from '../ui';

export function Configuracoes() {
  const { base, recarregar, toast } = useApp();
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => { if (base) setCfg(base.config); }, [base]);
  const [novoPlano, setNovoPlano] = useState(false);
  const [novoProf, setNovoProf] = useState(false);
  const [novaFixa, setNovaFixa] = useState(false);
  if (!base || !cfg) return <Carregando />;
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });

  async function salvar() {
    try { await put('/config', cfg); toast('Configurações salvas.'); await recarregar(); } catch (e) { toast(String((e as Error).message), true); }
  }
  async function atualizar(fn: () => Promise<unknown>) {
    try { await fn(); await recarregar(); } catch (e) { toast(String((e as Error).message), true); }
  }
  const planosFreq = base.planos.filter((p) => p.categoria === 'frequencia');

  return (
    <>
      <Topo titulo="Configurações" sub="Um reajuste vale a partir de agora e não muda meses já lançados.">
        <Botao tipo="primario" onClick={salvar}>Salvar alterações</Botao>
      </Topo>

      <section className="cartao pad form">
        <h2>Geral</h2>
        <div className="linha-campos">
          <Campo rotulo="Nome da academia"><input value={cfg.nome_academia} onChange={(e) => set('nome_academia', e.target.value)} /></Campo>
          <Campo rotulo="Seu nome (saudação no celular)"><input value={cfg.nome_usuario} onChange={(e) => set('nome_usuario', e.target.value)} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Dia de vencimento"><input type="number" min={1} max={28} value={cfg.dia_vencimento} onChange={(e) => set('dia_vencimento', Number(e.target.value))} /></Campo>
          <Campo rotulo="Desconto família (R$)"><input type="number" min={0} value={cfg.desconto_familia} onChange={(e) => set('desconto_familia', Number(e.target.value))} /></Campo>
          <Campo rotulo="Cartão entra no caixa"><select value={cfg.cartao_caixa} onChange={(e) => set('cartao_caixa', e.target.value as Config['cartao_caixa'])}><option value="seguinte">No mês seguinte</option><option value="mesmo">No mesmo mês</option></select></Campo>
          <Campo rotulo="Avisar fim de contrato"><select value={cfg.aviso_contrato_dias} onChange={(e) => set('aviso_contrato_dias', Number(e.target.value))}><option value={30}>30 dias antes</option><option value={15}>15 dias antes</option></select></Campo>
        </div>
      </section>

      <section className="cartao pad form">
        <h2>Gympass: valor estimado por frequência</h2>
        <div className="linha-campos">
          {([2, 3, 5] as const).map((n) => (
            <Campo key={n} rotulo={`Gympass ${n}x (R$)`}><input type="number" min={0} value={cfg[`gympass_${n}x`]} onChange={(e) => set(`gympass_${n}x`, Number(e.target.value))} /></Campo>
          ))}
        </div>
      </section>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}><h2>Planos</h2><Botao pequeno onClick={() => setNovoPlano(true)}>Adicionar</Botao></div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Plano</th><th>Categoria</th><th>Período</th><th className="d">Valor</th></tr></thead>
          <tbody>{base.planos.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.categoria}</td><td>{p.periodo}</td>
              <td className="d"><input className="entrada" style={{ width: 110, textAlign: 'right' }} type="number" defaultValue={p.valor} onBlur={(e) => Number(e.target.value) !== p.valor && atualizar(() => put(`/planos/${p.id}`, { valor: Number(e.target.value) }))} aria-label={`Valor de ${p.nome}`} /></td></tr>
          ))}</tbody>
        </table>
        {planosFreq.length === 0 && <div className="vazio">Cadastre os planos por frequência (2x, 3x, 5x…) para sugerir o valor ao cadastrar alunos.</div>}</div>
      </section>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}><h2>Professores e funcionários</h2><Botao pequeno onClick={() => setNovoProf(true)}>Adicionar</Botao></div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Nome</th><th>Função</th><th>Regra</th><th className="d">Valor</th></tr></thead>
          <tbody>{base.professores.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.funcao ?? '—'}</td>
              <td><select className="entrada sel" value={p.regra} onChange={(e) => atualizar(() => put(`/professores/${p.id}`, { ...p, regra: e.target.value }))} aria-label={`Regra de ${p.nome}`}>
                <option value="percentual">% do recebido</option><option value="fixo">Valor fixo</option><option value="nenhum">Sem repasse</option></select></td>
              <td className="d">{p.regra === 'nenhum' ? '—' : <input className="entrada" style={{ width: 110, textAlign: 'right' }} type="number" defaultValue={p.valor} onBlur={(e) => Number(e.target.value) !== p.valor && atualizar(() => put(`/professores/${p.id}`, { ...p, valor: Number(e.target.value) }))} aria-label={`Valor de ${p.nome}`} />}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}><h2>Despesas fixas</h2><Botao pequeno onClick={() => setNovaFixa(true)}>Adicionar</Botao></div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Despesa</th><th>Dia</th><th className="d">Valor</th><th /></tr></thead>
          <tbody>{base.despesasFixas.map((d) => (
            <tr key={d.id}><td>{d.descricao}</td><td>{d.dia ?? '—'}</td>
              <td className="d">{d.valor != null ? <Num v={d.valor} /> : <span className="suave">varia</span>}</td>
              <td className="d"><button className="link" onClick={() => atualizar(() => put(`/despesas-fixas/${d.id}`, { ...d, ativo: 0 }))}>Remover</button></td></tr>
          ))}</tbody>
        </table></div>
      </section>

      {novoPlano && <NovoPlano onFechar={() => setNovoPlano(false)} onSalvo={async () => { setNovoPlano(false); await recarregar(); }} />}
      {novoProf && <NovoProfessor onFechar={() => setNovoProf(false)} onSalvo={async () => { setNovoProf(false); await recarregar(); }} />}
      {novaFixa && <NovaFixa onFechar={() => setNovaFixa(false)} onSalvo={async () => { setNovaFixa(false); await recarregar(); }} />}
    </>
  );
}

function NovoPlano({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Partial<Plano>>({ nome: '', categoria: 'frequencia', aulas_semana: 3, periodo: 'mensal', valor: 0 });
  return (
    <Modal titulo="Novo plano" onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="3x por semana" /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Categoria"><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as Plano['categoria'] })}><option value="frequencia">Frequência</option><option value="personal">Personal</option><option value="fixo">Valor fixo</option></select></Campo>
          <Campo rotulo="Aulas por semana"><input type="number" value={f.aulas_semana ?? ''} onChange={(e) => setF({ ...f, aulas_semana: Number(e.target.value) })} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Período"><select value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value as Plano['periodo'] })}><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></Campo>
          <Campo rotulo="Valor mensal (R$)"><input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} /></Campo>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" desligado={!f.nome} onClick={async () => { try { await post('/planos', f); onSalvo(); } catch (e) { toast(String((e as Error).message), true); } }}>Adicionar</Botao></div>
    </Modal>
  );
}

function NovoProfessor({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { base, toast } = useApp();
  const [f, setF] = useState<Partial<Professor>>({ nome: '', funcao: '', regra: 'percentual', valor: 60, modalidade_id: null });
  return (
    <Modal titulo="Novo professor ou funcionário" onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Função"><input value={f.funcao ?? ''} onChange={(e) => setF({ ...f, funcao: e.target.value })} /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Regra"><select value={f.regra} onChange={(e) => setF({ ...f, regra: e.target.value as Professor['regra'] })}><option value="percentual">% do recebido</option><option value="fixo">Valor fixo</option><option value="nenhum">Sem repasse</option></select></Campo>
          <Campo rotulo={f.regra === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'}><input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} /></Campo>
        </div>
        {f.regra === 'percentual' && <Campo rotulo="Modalidade"><select value={f.modalidade_id ?? ''} onChange={(e) => setF({ ...f, modalidade_id: Number(e.target.value) || null })}><option value="">Escolha</option>{base?.modalidades.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" desligado={!f.nome} onClick={async () => { try { await post('/professores', f); onSalvo(); } catch (e) { toast(String((e as Error).message), true); } }}>Adicionar</Botao></div>
    </Modal>
  );
}

function NovaFixa({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Partial<DespesaFixa>>({ descricao: '', dia: 10, valor: null });
  return (
    <Modal titulo="Nova despesa fixa" onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Dia do vencimento"><input type="number" min={1} max={31} value={f.dia ?? ''} onChange={(e) => setF({ ...f, dia: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Valor (vazio se varia)"><input type="number" value={f.valor ?? ''} onChange={(e) => setF({ ...f, valor: e.target.value === '' ? null : Number(e.target.value) })} /></Campo>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" desligado={!f.descricao} onClick={async () => { try { await post('/despesas-fixas', f); onSalvo(); } catch (e) { toast(String((e as Error).message), true); } }}>Adicionar</Botao></div>
    </Modal>
  );
}
