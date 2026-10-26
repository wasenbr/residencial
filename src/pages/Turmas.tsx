import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, put } from '../api';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Modal, Pilula, Topo, useDados } from '../ui';

export function Turmas() {
  const { base, recarregar, toast } = useApp();
  const [aberta, setAberta] = useState<number | null>(null);
  const [nova, setNova] = useState(false);
  const [renomear, setRenomear] = useState<{ id: number; nome: string } | null>(null);
  if (!base) return <Carregando />;
  const semVaga = base.turmas.filter((t) => t.vagas && t.ocupadas >= t.vagas).length;
  return (
    <>
      <Topo titulo="Turmas" sub={`${base.turmas.length} turmas em ${base.modalidades.length} modalidades${semVaga ? ` · ${semVaga} sem vaga` : ''}`}>
        <Botao tipo="primario" onClick={() => setNova(true)}>Nova turma</Botao>
      </Topo>
      {base.modalidades.map((m) => {
        const ts = base.turmas.filter((t) => t.modalidade_id === m.id);
        if (!ts.length) return null;
        return (
          <section key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2>{m.nome} <span className="suave pequeno" style={{ fontWeight: 400 }}>· {ts.reduce((s, t) => s + t.ocupadas, 0)} matrículas</span></h2>
            <div className="grade2">
              {ts.map((t) => {
                const cheia = t.vagas ? t.ocupadas >= t.vagas : false;
                const prof = base.professores.find((p) => p.id === t.professor_id);
                return (
                  <div key={t.id} className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{t.nome}</b>{cheia && <Pilula tipo="atraso">Sem vaga</Pilula>}</div>
                    <div className="pequeno suave">{[t.dias, t.horario].filter(Boolean).join(' · ') || 'Dias e horário não informados'} · {t.aulas_semana} aulas/semana</div>
                    <div>Ocupação <b className="num">{t.ocupadas}{t.vagas ? `/${t.vagas}` : ''}</b>{prof && <span className="suave pequeno"> · {prof.nome}</span>}</div>
                    {t.vagas ? <div className="barra"><i style={{ width: `${Math.min(100, (t.ocupadas / t.vagas) * 100)}%` }} /></div> : null}
                    <div style={{ display: 'flex', gap: 16 }}><button className="link" onClick={() => setAberta(t.id)}>Ver alunos</button><button className="link" onClick={() => setRenomear({ id: t.id, nome: t.nome })}>Renomear</button></div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {aberta != null && <AlunosDaTurma id={aberta} nome={base.turmas.find((t) => t.id === aberta)?.nome ?? ''} onFechar={() => setAberta(null)} />}
      {renomear && (
        <RenomearTurma turma={renomear} onFechar={() => setRenomear(null)} onSalva={async () => { setRenomear(null); toast('Turma renomeada.'); await recarregar(); }} />
      )}
      {nova && (
        <NovaTurma onFechar={() => setNova(false)} onSalva={async () => { setNova(false); toast('Turma criada.'); await recarregar(); }} />
      )}
    </>
  );
}

function AlunosDaTurma({ id, nome, onFechar }: { id: number; nome: string; onFechar: () => void }) {
  const { dados } = useDados(() => get<{ id: number; nome: string; ativo: number }[]>(`/turmas/${id}/alunos`), [id]);
  return (
    <Modal titulo={nome} onFechar={onFechar}>
      {!dados ? <Carregando /> : dados.length === 0 ? <div className="vazio">Sem alunos.</div> : (
        <div>{dados.map((a) => <div key={a.id} className="resumo-linha"><Link to={`/alunos/${a.id}`} onClick={onFechar}>{a.nome}</Link>{!a.ativo && <Pilula tipo="aberto">Inativo</Pilula>}</div>)}</div>
      )}
      <Botao onClick={onFechar}>Fechar</Botao>
    </Modal>
  );
}

function RenomearTurma({ turma, onFechar, onSalva }: { turma: { id: number; nome: string }; onFechar: () => void; onSalva: () => void }) {
  const { toast } = useApp();
  const [nome, setNome] = useState(turma.nome);
  const valido = nome.trim() !== '' && nome.trim() !== turma.nome;
  async function salvar() {
    if (!valido) return;
    try { await put(`/turmas/${turma.id}`, { nome: nome.trim() }); onSalva(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <Modal titulo="Renomear turma" onFechar={onFechar}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <Campo rotulo="Nome"><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      </form>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" onClick={salvar} desligado={!valido}>Salvar</Botao></div>
    </Modal>
  );
}

function NovaTurma({ onFechar, onSalva }: { onFechar: () => void; onSalva: () => void }) {
  const { base, toast } = useApp();
  const [f, setF] = useState({ modalidade_id: base?.modalidades[0]?.id ?? 0, nome: '', dias: '', horario: '', aulas_semana: 3, vagas: '' });
  async function salvar() {
    try { await post('/turmas', { ...f, vagas: f.vagas ? Number(f.vagas) : null }); onSalva(); } catch (e) { toast(String((e as Error).message), true); }
  }
  return (
    <Modal titulo="Nova turma" onFechar={onFechar}>
      <div className="form">
        <Campo rotulo="Modalidade"><select value={f.modalidade_id} onChange={(e) => setF({ ...f, modalidade_id: Number(e.target.value) })}>{base?.modalidades.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Funcional 19:00" /></Campo>
        <div className="linha-campos">
          <Campo rotulo="Dias"><input value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} placeholder="seg, qua, sex" /></Campo>
          <Campo rotulo="Horário"><input value={f.horario} onChange={(e) => setF({ ...f, horario: e.target.value })} placeholder="19:00" /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Aulas por semana"><input type="number" min={1} value={f.aulas_semana} onChange={(e) => setF({ ...f, aulas_semana: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Vagas"><input type="number" min={1} value={f.vagas} onChange={(e) => setF({ ...f, vagas: e.target.value })} /></Campo>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Botao onClick={onFechar}>Cancelar</Botao><Botao tipo="primario" onClick={salvar} desligado={!f.nome.trim()}>Criar turma</Botao></div>
    </Modal>
  );
}
