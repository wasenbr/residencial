import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { nomeComp, diffMeses } from '../shared/comp';
import type { Aluno, Contrato, Turma } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Carregando, FORMA_ROTULO, Modal, Num, Pilula, Topo, useDados } from '../ui';
import { PagarModal, type Devendo } from '../components/Pagar';

interface Ficha {
  aluno: Aluno;
  turmas: (Turma & { modalidade: string })[];
  contratos: Contrato[];
  mensalidades: { id: number; competencia: string; modalidade: string | null; descricao: string | null; valor: number; pago: number; formas: string | null; vencimento: string | null; cancelada: number }[];
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
  if (!dados) return <Carregando erro={erro} />;
  const { aluno, turmas, contratos, mensalidades, familia } = dados;
  const contrato = contratos.find((c) => !c.encerrado_em) ?? null;
  const mesDoContrato = contrato?.meses ? diffMeses(contrato.inicio, comp) + 1 : null;
  const doMes = mensalidades.filter((m) => m.competencia === comp && !m.cancelada);
  const devidoMes = doMes.reduce((s, m) => s + m.valor, 0);
  const pagoMes = doMes.reduce((s, m) => s + m.pago, 0);
  const aulas = turmas.reduce((s, t) => s + t.aulas_semana, 0);

  async function acao(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); atualizar(); await recarregar(); } catch (e) { toast(String((e as Error).message), true); }
  }

  return (
    <>
      <div><Link to="/alunos" style={{ fontWeight: 600 }}>← Alunos</Link></div>
      <Topo titulo={aluno.nome} sub={<>{aluno.ativo ? <Pilula tipo="ok">Ativo</Pilula> : <Pilula tipo="aberto">Inativo</Pilula>} <Pilula tipo="info">{aluno.origem === 'gympass' ? 'Gympass' : 'Particular'}</Pilula></>}>
        {aluno.telefone && <a className="btn" href={`https://wa.me/55${aluno.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        <Botao onClick={() => setEditando(true)}>Editar</Botao>
        <Botao tipo={aluno.ativo ? 'perigo' : 'padrao'} onClick={() => acao(() => put(`/alunos/${aluno.id}`, { ativo: aluno.ativo ? 0 : 1 }), aluno.ativo ? 'Aluno inativado.' : 'Aluno reativado.')}>{aluno.ativo ? 'Inativar' : 'Reativar'}</Botao>
      </Topo>

      <div className="grade2">
        <section className="cartao pad">
          <h2 style={{ marginBottom: 8 }}>Contrato</h2>
          {contrato ? (
            <>
              <Linha r="Plano" v={`${contrato.plano} · ${contrato.periodo}`} />
              <Linha r="Mensalidade" v={<Num v={contrato.valor_mensal} />} />
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
                <td className="d">{falta > 0.009 && <Botao pequeno onClick={() => setPagar({ mensalidade_id: m.id, nome: aluno.nome, descricao: `${m.modalidade ?? ''} ${nomeComp(m.competencia)}`.trim(), aberto: falta })}>Registrar</Botao>}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {mensalidades.length === 0 && <div className="vazio">Nenhuma mensalidade ainda.</div>}</div>
      </section>

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
  const set = (k: keyof Aluno, v: string) => setF({ ...f, [k]: v });
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
        <Campo rotulo="Observações"><textarea value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" onClick={salvar}>Salvar</Botao></div>
    </Modal>
  );
}
