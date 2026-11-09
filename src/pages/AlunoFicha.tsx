import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { nomeComp, diffMeses, rotuloMeses, somarMeses } from '../shared/comp';
import type { Aluno, Contrato, Turma } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Carregando, FORMA_ROTULO, Modal, Num, Pilula, Topo, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';
import { AdiantadoModal, TrocarPlanoModal } from '../components/Adiantado';
import { AlterarValorModal, DividirModal, type MensalidadeEditavel } from '../components/Cobranca';

interface Ficha {
  aluno: Aluno;
  turmas: (Turma & { modalidade: string })[];
  contratos: Contrato[];
  mensalidades: { id: number; contrato_id: number | null; competencia: string; modalidade: string | null; descricao: string | null; valor: number; pago: number; formas: string | null; vencimento: string | null; cancelada: number; adiantado: number }[];
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
  const [adiantado, setAdiantado] = useState(false);
  const [alterar, setAlterar] = useState<MensalidadeEditavel | null>(null);
  const [lancar, setLancar] = useState(false);
  const [trocarPlano, setTrocarPlano] = useState(false);
  const [dividir, setDividir] = useState(false);
  if (!dados) return <Carregando erro={erro} />;
  const { aluno, turmas, contratos, mensalidades, familia } = dados;
  const contrato = contratos.find((c) => !c.encerrado_em) ?? null;
  const mesDoContrato = contrato?.meses ? diffMeses(contrato.inicio, comp) + 1 : null;
  const fechados = base?.fechados ?? [];
  const doMes = mensalidades.filter((m) => m.competencia === comp && !m.cancelada);
  const devidoMes = doMes.reduce((s, m) => s + m.valor, 0);
  const pagoMes = doMes.reduce((s, m) => s + m.pago, 0);
  const aulas = turmas.reduce((s, t) => s + t.aulas_semana, 0);
  const ativas = mensalidades.filter((m) => !m.cancelada);
  const quitada = (c: string) => { const ms = ativas.filter((m) => m.competencia === c); return ms.length > 0 && ms.every((m) => m.valor - m.pago <= 0.009); };
  // Último mês futuro já pago e primeiro mês ainda não pago (sugestão para o próximo adiantado).
  const pagoAte = ativas.filter((m) => m.competencia > comp && m.valor - m.pago <= 0.009).map((m) => m.competencia).sort().pop() ?? null;
  let proximoAPagar = comp;
  while (quitada(proximoAPagar)) proximoAPagar = somarMeses(proximoAPagar, 1);
  const valorRecente = ativas.find((m) => m.competencia <= comp)?.valor ?? null;
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
          <Linha r="Paga" v={aluno.origem === 'gympass' ? 'Pelo Gympass' : aluno.forma_pagamento ? `Particular · ${FORMA_ROTULO[aluno.forma_pagamento] ?? aluno.forma_pagamento}` : 'Particular'} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
            <Botao pequeno tipo="primario" onClick={() => setTrocarPlano(true)}>Trocar plano</Botao>
            {doMes.length === 1 && <Botao pequeno onClick={() => setAlterar(editavel(doMes[0]))}>Alterar valor</Botao>}
            {doMes.length === 1 && aluno.origem === 'particular' && doMes[0].pago === 0 && <Botao pequeno onClick={() => setDividir(true)}>Dividir por modalidade</Botao>}
            {doMes.length > 1 && <span className="pequeno suave">Para alterar, use “Alterar” em cada linha de Pagamentos.</span>}
            {doMes.length === 0 && aluno.origem === 'particular' && <Botao pequeno onClick={() => setLancar(true)}>Lançar mensalidade de {nomeComp(comp, true).toLowerCase()}</Botao>}
          </div>
          {contrato ? (
            <>
              <Linha r="Plano" v={`${contrato.plano} · ${rotuloMeses(contrato.meses)}`} />
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
          {pagoAte && <div style={{ marginTop: 12 }}><Pilula tipo="ok">Pago até {nomeComp(pagoAte)}</Pilula></div>}
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
          <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="suave pequeno">{nomeComp(comp)}: <Num v={pagoMes} /> de <Num v={devidoMes} /></span>
            {aluno.origem === 'particular' && <Botao pequeno onClick={() => setAdiantado(true)}>Pagar adiantado</Botao>}
          </span>
        </div>
        <div className="tabela-wrap"><table className="tbl">
          <thead><tr><th>Competência</th><th>Descrição</th><th className="d">Valor</th><th className="esconde-cel">Forma</th><th>Status</th><th /></tr></thead>
          <tbody>{mensalidades.filter((m) => !m.cancelada).map((m) => {
            const falta = m.valor - m.pago;
            return (
              <tr key={m.id}>
                <td>{nomeComp(m.competencia)}</td><td>{m.modalidade ?? m.descricao ?? '—'}</td><td className="d"><Num v={m.valor} /></td>
                <td className="esconde-cel">{m.formas ? m.formas.split(',').map((f) => FORMA_ROTULO[f] ?? f).join(', ') : '—'}</td>
                <td>{m.adiantado ? <><Pilula tipo="info">Adiantado</Pilula> </> : null}{falta <= 0.009 ? <Pilula tipo="ok">Pago</Pilula> : m.pago > 0 ? <Pilula tipo="atraso">Falta <Num v={falta} /></Pilula> : <Pilula tipo="atraso">Em aberto</Pilula>}</td>
                <td className="d"><span className="acoes-linha">
                  {!fechados.includes(m.competencia) && <button className="link" onClick={() => setAlterar(editavel(m))}>Alterar</button>}
                  {falta > 0.009 && <Botao pequeno onClick={() => setPagar({ mensalidade_id: m.id, nome: aluno.nome, descricao: `${m.modalidade ?? ''} ${nomeComp(m.competencia)}`.trim(), aberto: falta, forma: aluno.forma_pagamento })}>Registrar</Botao>}
                </span></td>
              </tr>
            );
          })}</tbody>
        </table>
        {mensalidades.length === 0 && <div className="vazio">Nenhuma mensalidade ainda.</div>}</div>
      </section>

      {adiantado && (
        <AdiantadoModal alunoId={aluno.id} nome={aluno.nome} inicioSugerido={proximoAPagar} contratoAtual={contrato}
          onFechar={() => setAdiantado(false)} onSalvo={() => { setAdiantado(false); atualizar(); void recarregar(); }} />
      )}
      {trocarPlano && (
        <TrocarPlanoModal aluno={aluno} aulasSemana={aulas} valorAtual={valorRecente} contratoAtual={contrato} inicioSugerido={comp}
          onFechar={() => setTrocarPlano(false)} onSalvo={() => { setTrocarPlano(false); atualizar(); void recarregar(); }} />
      )}
      {dividir && doMes.length === 1 && (
        <DividirModal alunoId={aluno.id} nome={aluno.nome} competencia={comp} total={doMes[0].valor} modalidadeIds={[...new Set(turmas.map((t) => t.modalidade_id))]}
          onFechar={() => setDividir(false)} onSalvo={() => { setDividir(false); atualizar(); }} />
      )}
      {alterar && <AlterarValorModal item={alterar} onFechar={() => setAlterar(null)} onSalvo={() => { setAlterar(null); atualizar(); }} />}
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
