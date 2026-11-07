import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { nomeComp, diffMeses, somarMeses } from '../shared/comp';
import type { Aluno, Contrato, Turma } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Carregando, FORMA_ROTULO, Modal, Num, Pilula, Topo, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';
import { AlterarValorModal, type MensalidadeEditavel } from '../components/Cobranca';

interface Ficha {
  aluno: Aluno;
  turmas: (Turma & { modalidade: string })[];
  contratos: Contrato[];
  mensalidades: { id: number; contrato_id: number | null; competencia: string; modalidade: string | null; descricao: string | null; valor: number; pago: number; formas: string | null; vencimento: string | null; cancelada: number }[];
  familia: { id: number; nome: string }[];
}

export function AlunoFicha() {
  const { id } = useParams();
  const nav = useNavigate();
  const { base, comp, toast, recarregar } = useApp();
  const { dados, erro, recarregar: atualizar } = useDados(() => get<Ficha>(`/alunos/${id}`), [id]);
  const [editando, setEditando] = useState(false);
  const [pagar, setPagar] = useState<Devendo | null>(null);
  const [matricular, setMatricular] = useState(false);
  const [perguntaInativar, setPerguntaInativar] = useState(false);
  const [alterar, setAlterar] = useState<MensalidadeEditavel | null>(null);
  const [lancar, setLancar] = useState(false);
  const [trocarPlano, setTrocarPlano] = useState(false);
  if (!dados) return <Carregando erro={erro} />;
  const { aluno, turmas, contratos, mensalidades, familia } = dados;
  const contrato = contratos.find((c) => !c.encerrado_em) ?? null;
  const mesDoContrato = contrato?.meses ? diffMeses(contrato.inicio, comp) + 1 : null;
  const fechados = base?.fechados ?? [];
  const doMes = mensalidades.filter((m) => m.competencia === comp && !m.cancelada);
  const devidoMes = doMes.reduce((s, m) => s + m.valor, 0);
  const pagoMes = doMes.reduce((s, m) => s + m.pago, 0);
  const aulas = turmas.reduce((s, t) => s + t.aulas_semana, 0);
  const editavel = (m: Ficha['mensalidades'][number]): MensalidadeEditavel => ({
    id: m.id, nome: aluno.nome, competencia: m.competencia, descricao: m.modalidade ?? m.descricao ?? '', valor: m.valor,
    contrato: m.contrato_id != null,
  });

  async function acao(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); atualizar(); await recarregar(); } catch (e) { toast(String((e as Error).message), true); }
  }

  return (
    <>
      <div><Link to="/alunos" style={{ fontWeight: 600 }}>← Alunos</Link></div>
      <Topo titulo={aluno.nome} sub={<>{aluno.ativo ? <Pilula tipo="ok">Ativo</Pilula> : <Pilula tipo="aberto">Inativo</Pilula>} <Pilula tipo="info">{aluno.origem === 'gympass' ? 'Gympass' : 'Particular'}</Pilula>{!!aluno.recorrente && <> <Pilula tipo="info">Cartão recorrente</Pilula></>}</>}>
        {aluno.telefone && <a className="btn" href={`https://wa.me/55${aluno.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        <Botao onClick={() => setEditando(true)}>Editar</Botao>
        <Botao tipo={aluno.ativo ? 'perigo' : 'padrao'} onClick={() => acao(() => put(`/alunos/${aluno.id}`, { ativo: aluno.ativo ? 0 : 1 }), aluno.ativo ? 'Aluno inativado.' : 'Aluno reativado.')}>{aluno.ativo ? 'Inativar' : 'Reativar'}</Botao>
      </Topo>

      <div className="grade2">
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Mensalidade e contrato</h2>
          <Linha r={`Mensalidade de ${nomeComp(comp, true).toLowerCase()}`} v={doMes.length ? <Num v={devidoMes} /> : '—'} />
          <Linha r="Cobrança" v={aluno.recorrente ? 'Cartão recorrente (cai sozinho)' : 'Manual'} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
            <Botao pequeno tipo="primario" onClick={() => setTrocarPlano(true)}>Trocar plano</Botao>
            {doMes.length === 1 && <Botao pequeno onClick={() => setAlterar(editavel(doMes[0]))}>Alterar valor</Botao>}
            {doMes.length > 1 && <span className="pequeno suave">Para alterar, use “Alterar” em cada linha de Pagamentos.</span>}
            {doMes.length === 0 && aluno.origem === 'particular' && <Botao pequeno onClick={() => setLancar(true)}>Lançar mensalidade de {nomeComp(comp, true).toLowerCase()}</Botao>}
          </div>
          {contrato ? (
            <>
              <Linha r="Plano" v={contrato.plano.toLowerCase() === contrato.periodo ? contrato.plano : `${contrato.plano} · ${contrato.periodo}`} />
              <Linha r="Valor do contrato" v={<Num v={contrato.valor_mensal} />} />
              <Linha r="Início" v={nomeComp(contrato.inicio)} />
              {mesDoContrato && contrato.meses && <Linha r="Mês" v={`${Math.min(mesDoContrato, contrato.meses)} de ${contrato.meses}${mesDoContrato >= contrato.meses ? ' · termina neste mês' : ''}`} />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <Botao pequeno onClick={() => acao(() => post(`/contratos/${contrato.id}/renovar`), 'Contrato renovado.')}>Renovar contrato</Botao>
                <Botao pequeno tipo="perigo" onClick={() => acao(() => post(`/contratos/${contrato.id}/encerrar`), 'Contrato encerrado.')}>Encerrar</Botao>
              </div>
              <div className="pequeno suave" style={{ marginTop: 8 }}>Sem multa por cancelamento. Encerrar cancela as mensalidades futuras.</div>
            </>
          ) : <div className="suave">Plano mensal, sem prazo de fidelidade.</div>}
        </section>

        <section className="cartao pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><h2>Turmas</h2><Botao pequeno onClick={() => setMatricular(true)}>Matricular em turma</Botao></div>
          {turmas.length === 0 && <div className="suave">Sem turmas.</div>}
          {turmas.map((t) => (
            <div key={t.id} className="resumo-linha"><span><b>{t.nome}</b><div className="pequeno suave">{t.dias ?? t.modalidade} · {t.aulas_semana} aulas</div></span>
              <button className="link" onClick={async () => {
                const ultima = turmas.length === 1 && !!aluno.ativo;
                await acao(() => del(`/alunos/${aluno.id}/turmas/${t.id}`), 'Matrícula removida.');
                if (ultima) setPerguntaInativar(true);
              }}>Remover</button></div>
          ))}
          {turmas.length > 0 && <div className="resumo-linha forte"><span>Total semanal</span><span>{aulas} aulas</span></div>}
        </section>

        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Dados pessoais</h2>
          <Linha r="Telefone (WhatsApp)" v={aluno.telefone || '—'} />
          <Linha r="Nascimento" v={aluno.nascimento || '—'} />
          <Linha r="Responsável" v={aluno.responsavel ? `${aluno.responsavel}${aluno.responsavel_tel ? ' · ' + aluno.responsavel_tel : ''}` : '—'} />
          <Linha r="Grupo familiar" v={aluno.familia ? <>{aluno.familia}{familia.length > 0 && <> ({familia.map((f) => <Link key={f.id} to={`/alunos/${f.id}`}> {f.nome}</Link>)})</>}</> : 'Nenhum'} />
          <Linha r="Observações" v={aluno.observacoes || '—'} />
        </section>
      </div>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2>Pagamentos</h2>
          <span className="suave pequeno">{nomeComp(comp)}: <Num v={pagoMes} /> de <Num v={devidoMes} /></span>
        </div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Competência</th><th>Descrição</th><th className="d">Valor</th><th className="esconde-cel">Forma</th><th>Status</th><th /></tr></thead>
          <tbody>{mensalidades.filter((m) => !m.cancelada).map((m) => {
            const falta = m.valor - m.pago;
            return (
              <tr key={m.id}>
                <td>{nomeComp(m.competencia)}</td><td>{m.modalidade ?? m.descricao ?? '—'}</td><td className="d"><Num v={m.valor} /></td>
                <td className="esconde-cel">{m.formas ? m.formas.split(',').map((f) => FORMA_ROTULO[f] ?? f).join(', ') : '—'}</td>
                <td>{falta <= 0.009 ? <Pilula tipo="ok">Pago</Pilula> : m.pago > 0 ? <Pilula tipo="atraso">Falta <Num v={falta} /></Pilula> : <Pilula tipo="atraso">Em aberto</Pilula>}</td>
                <td className="d"><span className="acoes-linha">
                  {!fechados.includes(m.competencia) && <button className="link" onClick={() => setAlterar(editavel(m))}>Alterar</button>}
                  {falta > 0.009 && <Botao pequeno onClick={() => setPagar({ mensalidade_id: m.id, nome: aluno.nome, descricao: `${m.modalidade ?? ''} ${nomeComp(m.competencia)}`.trim(), aberto: falta })}>Registrar</Botao>}
                </span></td>
              </tr>
            );
          })}</tbody>
        </table>
        {mensalidades.length === 0 && <div className="vazio">Nenhuma mensalidade ainda.</div>}</div>
      </section>

      {alterar && <AlterarValorModal item={alterar} onFechar={() => setAlterar(null)} onSalvo={() => { setAlterar(null); atualizar(); }} />}
      {trocarPlano && <TrocarPlano aluno={aluno} atual={contrato} valorAtual={devidoMes || contrato?.valor_mensal || 0} onFechar={() => setTrocarPlano(false)} onSalvo={() => { setTrocarPlano(false); atualizar(); }} />}
      {lancar && <LancarMensalidade alunoId={aluno.id} nome={aluno.nome} sugestao={contrato?.valor_mensal ?? mensalidades.find((m) => !m.cancelada)?.valor ?? 0} onFechar={() => setLancar(false)} onSalvo={() => { setLancar(false); atualizar(); void recarregar(); }} />}
      {pagar && <PagarModal item={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); atualizar(); }} />}
      {editando && <EditarAluno aluno={aluno} onFechar={() => setEditando(false)} onSalvo={() => { setEditando(false); atualizar(); void recarregar(); }} />}
      {perguntaInativar && (
        <Modal titulo="Aluno sem turma" onFechar={() => setPerguntaInativar(false)}>
          <p style={{ margin: 0 }}>{aluno.nome} não está mais em nenhuma turma. Se continuar ativo, a mensalidade será copiada de novo no próximo mês. Inativar o aluno agora?</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Botao onClick={() => setPerguntaInativar(false)}>Manter ativo</Botao>
            <Botao tipo="primario" onClick={async () => { setPerguntaInativar(false); await acao(() => put(`/alunos/${aluno.id}`, { ativo: 0 }), 'Aluno inativado.'); }}>Inativar</Botao>
          </div>
        </Modal>
      )}
      {matricular && base && (
        <Modal titulo="Matricular em turma" onFechar={() => setMatricular(false)}>
          <div className="lista-cartoes">
            {base.turmas.filter((t) => !turmas.some((x) => x.id === t.id)).map((t) => (
              <button key={t.id} className="item-lista" onClick={async () => { await acao(() => post(`/alunos/${aluno.id}/turmas`, { turma_id: t.id }), 'Matriculado.'); setMatricular(false); }}>
                <span><b>{t.nome}</b><div className="pequeno suave">{base.modalidades.find((m) => m.id === t.modalidade_id)?.nome} · {t.aulas_semana} aulas</div></span>
                <span className="pequeno suave">{t.vagas ? `${t.ocupadas}/${t.vagas}` : `${t.ocupadas} alunos`}</span>
              </button>
            ))}
          </div>
          <Botao onClick={() => setMatricular(false)}>Fechar</Botao>
        </Modal>
      )}
      <div><Botao pequeno onClick={() => nav('/alunos')}>Voltar</Botao></div>
    </>
  );
}

function Linha({ r, v }: { r: string; v: React.ReactNode }) {
  return <div className="resumo-linha"><span className="suave">{r}</span><span style={{ textAlign: 'right' }}>{v}</span></div>;
}

function EditarAluno({ aluno, onFechar, onSalvo }: { aluno: Aluno; onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ ...aluno });
  const set = (k: keyof Aluno, v: string | number) => setF({ ...f, [k]: v });
  async function salvar() {
    try { await put(`/alunos/${aluno.id}`, f); toast('Dados salvos.'); onSalvo(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <Modal titulo="Editar aluno" onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Telefone (WhatsApp)"><input inputMode="tel" value={f.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} /></Campo>
          <Campo rotulo="Nascimento"><input type="date" value={f.nascimento ?? ''} onChange={(e) => set('nascimento', e.target.value)} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Responsável"><input value={f.responsavel ?? ''} onChange={(e) => set('responsavel', e.target.value)} /></Campo>
          <Campo rotulo="WhatsApp do responsável"><input inputMode="tel" value={f.responsavel_tel ?? ''} onChange={(e) => set('responsavel_tel', e.target.value)} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Grupo familiar"><input value={f.familia ?? ''} onChange={(e) => set('familia', e.target.value)} /></Campo>
          <Campo rotulo="Origem"><select value={f.origem} onChange={(e) => set('origem', e.target.value)}><option value="particular">Particular</option><option value="gympass">Gympass</option></select></Campo>
        </div>
        {f.origem === 'particular' && <Recorrente valor={!!f.recorrente} onChange={(v) => set('recorrente', v ? 1 : 0)} />}
        <Campo rotulo="Observações"><textarea value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" onClick={salvar}>Salvar</Botao></div>
    </Modal>
  );
}

export function Recorrente({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
      <span>Cobrança recorrente no cartão<div className="pequeno suave">A mensalidade cai sozinha todo mês: o aluno não entra na lista de cobrança e o pagamento é baixado em lote em Mensalidades.</div></span>
    </label>
  );
}

function LancarMensalidade({ alunoId, nome, sugestao, onFechar, onSalvo }: { alunoId: number; nome: string; sugestao: number; onFechar: () => void; onSalvo: () => void }) {
  const { comp, toast } = useApp();
  const [valor, setValor] = useState(sugestao ? String(sugestao).replace('.', ',') : '');
  const v = Number(valor.replace(',', '.'));
  async function salvar() {
    try { await post('/mensalidades', { aluno_id: alunoId, competencia: comp, valor: v }); toast('Mensalidade lançada.'); onSalvo(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <Modal titulo={`Mensalidade de ${nomeComp(comp).toLowerCase()}`} onFechar={onFechar}>
      <div style={{ fontWeight: 600 }}>{nome}</div>
      <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>
      <div className="suave pequeno">Daqui em diante, os meses novos copiam este valor.</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" onClick={salvar} desligado={!(v > 0)}>Lançar</Botao></div>
    </Modal>
  );
}

type Periodo = 'mensal' | 'semestral' | 'anual';
const MESES_PERIODO: Record<Periodo, number | null> = { mensal: null, semestral: 6, anual: 12 };

function TrocarPlano({ aluno, atual, valorAtual, onFechar, onSalvo }: { aluno: Aluno; atual: Contrato | null; valorAtual: number; onFechar: () => void; onSalvo: () => void }) {
  const { base, comp, toast, recarregar } = useApp();
  const meses = [...new Set([...(base?.competencias ?? []), comp])].filter((c) => !base?.fechados.includes(c)).sort();
  const [periodo, setPeriodo] = useState<Periodo>(atual?.periodo === 'semestral' ? 'anual' : atual?.periodo === 'anual' ? 'mensal' : 'anual');
  const [planoId, setPlanoId] = useState<number | 'manual'>('manual');
  const [valor, setValor] = useState(valorAtual ? String(valorAtual).replace('.', ',') : '');
  const [inicio, setInicio] = useState(meses.includes(comp) ? comp : meses[meses.length - 1] ?? comp);
  const [particular, setParticular] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const planos = base?.planos.filter((p) => p.periodo === periodo) ?? [];
  const v = Number(valor.replace(',', '.'));
  const n = MESES_PERIODO[periodo];

  function escolherPeriodo(p: Periodo) { setPeriodo(p); setPlanoId('manual'); }
  function escolherPlano(id: number | 'manual') {
    setPlanoId(id);
    const p = base?.planos.find((x) => x.id === id);
    if (p) setValor(String(p.valor).replace('.', ','));
  }
  async function salvar() {
    setSalvando(true);
    try {
      const plano = base?.planos.find((p) => p.id === planoId);
      await post(`/alunos/${aluno.id}/plano`, { periodo, valor: v, inicio, plano: plano?.nome, particular: aluno.origem === 'gympass' && particular });
      toast('Plano trocado.');
      await recarregar();
      onSalvo();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo="Trocar plano" onFechar={onFechar}>
      <div className="suave pequeno">{aluno.nome} · hoje: {atual ? `${atual.plano} (${atual.periodo})` : 'mensal, sem contrato'}</div>
      <div>
        <div className="campo" style={{ marginBottom: 8 }}>Novo plano</div>
        <div className="fichas" role="radiogroup" aria-label="Período">
          {(['mensal', 'semestral', 'anual'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={periodo === p} className={'ficha' + (periodo === p ? ' ativa' : '')} onClick={() => escolherPeriodo(p)}>
              {p === 'mensal' ? 'Mensal' : p === 'semestral' ? 'Semestral (6 meses)' : 'Anual (12 meses)'}
            </button>
          ))}
        </div>
      </div>
      {planos.length > 0 && (
        <Campo rotulo="Plano cadastrado">
          <select value={planoId} onChange={(e) => escolherPlano(e.target.value === 'manual' ? 'manual' : Number(e.target.value))}>
            <option value="manual">Valor combinado</option>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · R$ {p.valor}</option>)}
          </select>
        </Campo>
      )}
      <div className="linha-campos">
        <Campo rotulo="Valor por mês (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        <Campo rotulo="A partir de">
          <select value={inicio} onChange={(e) => setInicio(e.target.value)}>
            {meses.map((c) => <option key={c} value={c}>{nomeComp(c)}</option>)}
          </select>
        </Campo>
      </div>
      {aluno.origem === 'gympass' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <input type="checkbox" checked={particular} onChange={(e) => setParticular(e.target.checked)} style={{ width: 20, height: 20 }} />
          Deixa de ser Gympass e passa a particular
        </label>
      )}
      <div className="cartao pad pequeno" style={{ background: 'var(--marca-clara)', border: 0 }}>
        {v > 0 ? (n
          ? <>Mensalidade de <b><Num v={v} /></b> por mês, de {nomeComp(inicio)} a {nomeComp(somarMeses(inicio, n - 1))} ({n} meses, total <Num v={v * n} />). No fim, a ficha avisa para renovar.</>
          : <>Mensalidade de <b><Num v={v} /></b> por mês a partir de {nomeComp(inicio)}, sem prazo.</>)
          : 'Informe o valor por mês.'}
        {atual && <> O contrato atual ({atual.plano}) é encerrado.</>}
        <div className="suave" style={{ marginTop: 6 }}>Pagamentos já feitos continuam valendo. A forma de pagamento (dinheiro, Pix, cartão) é escolhida a cada pagamento.</div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao tipo="primario" onClick={salvar} desligado={!(v > 0) || !inicio || salvando}>Trocar plano</Botao>
      </div>
    </Modal>
  );
}
