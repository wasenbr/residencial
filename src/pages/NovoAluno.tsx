import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Num, Topo } from '../ui';
import { nomeComp } from '../shared/comp';

export function NovoAluno() {
  const { base, comp, toast, recarregar } = useApp();
  const nav = useNavigate();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [menor, setMenor] = useState(false);
  const [resp, setResp] = useState('');
  const [respTel, setRespTel] = useState('');
  const [origem, setOrigem] = useState<'particular' | 'gympass'>('particular');
  const [turmas, setTurmas] = useState<number[]>([]);
  const [planoId, setPlanoId] = useState<number | 'manual'>('manual');
  const [valor, setValor] = useState('');
  const [familia, setFamilia] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<{ id: number; mensalidadeId: number | null; valor: number } | null>(null);

  const selecionadas = useMemo(() => base?.turmas.filter((t) => turmas.includes(t.id)) ?? [], [base, turmas]);
  if (!base) return <Carregando />;
  const aulas = selecionadas.reduce((s, t) => s + t.aulas_semana, 0);
  const planosFreq = base.planos.filter((p) => p.categoria === 'frequencia' && p.periodo === 'mensal');
  const sugerido = planosFreq.find((p) => p.aulas_semana === aulas);
  const v = Number(valor.replace(',', '.'));
  const desconto = familia.trim() ? base.config.desconto_familia : 0;

  function escolherPlano(id: number | 'manual') {
    setPlanoId(id);
    if (id !== 'manual') {
      const p = base!.planos.find((x) => x.id === id);
      if (p) setValor(String(p.valor));
    }
  }
  const final = Math.max(0, (v || 0) - desconto);

  async function salvar() {
    setSalvando(true);
    try {
      const modalidades = new Set(selecionadas.map((t) => t.modalidade_id));
      const plano = base!.planos.find((p) => p.id === planoId);
      const r = await post<{ id: number; mensalidadeId: number | null }>('/alunos', {
        nome, telefone: tel || undefined, origem, familia: familia || undefined,
        responsavel: menor ? resp || undefined : undefined, responsavel_tel: menor ? respTel || undefined : undefined,
        turmas, valor: origem === 'particular' && final > 0 ? final : undefined, plano: plano?.nome, periodo: plano?.periodo ?? 'mensal', competencia: comp,
        modalidade_id: modalidades.size === 1 ? [...modalidades][0] : undefined,
      });
      await recarregar();
      setFeito({ ...r, valor: final });
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', true); } finally { setSalvando(false); }
  }

  if (feito) {
    return (
      <>
        <div className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', alignItems: 'center' }}>
          <h1 style={{ fontSize: 22 }}>Aluno cadastrado</h1>
          <div>{nome}{feito.valor > 0 ? <> · <Num v={feito.valor} /></> : ''}.{feito.mensalidadeId ? ' A primeira mensalidade já está em Receber.' : ''}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {feito.mensalidadeId && <Link className="btn primario" to="/receber">Receber agora</Link>}
            <Botao onClick={() => { setFeito(null); setNome(''); setTel(''); setTurmas([]); setValor(''); setFamilia(''); setResp(''); setRespTel(''); setMenor(false); }}>Cadastrar outro</Botao>
            <Botao onClick={() => nav(`/alunos/${feito.id}`)}>Abrir ficha</Botao>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topo titulo="Novo aluno" sub={`Mensalidade começa em ${nomeComp(comp)}`} />
      <div className="form" style={{ maxWidth: 640 }}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" /></Campo>
        <Campo rotulo="WhatsApp"><input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}><input type="checkbox" checked={menor} onChange={(e) => setMenor(e.target.checked)} style={{ width: 20, height: 20 }} /> Menor de 18 anos</label>
        {menor && <div className="linha-campos"><Campo rotulo="Nome do responsável"><input value={resp} onChange={(e) => setResp(e.target.value)} /></Campo><Campo rotulo="WhatsApp do responsável"><input inputMode="tel" value={respTel} onChange={(e) => setRespTel(e.target.value)} /></Campo></div>}
        <div>
          <div className="campo" style={{ marginBottom: 8 }}>Origem</div>
          <div className="fichas">{(['particular', 'gympass'] as const).map((o) => <button key={o} type="button" className={'ficha' + (origem === o ? ' ativa' : '')} onClick={() => setOrigem(o)}>{o === 'particular' ? 'Particular' : 'Gympass'}</button>)}</div>
        </div>
        <div>
          <div className="campo" style={{ marginBottom: 8 }}>Turmas</div>
          <div className="lista-cartoes">
            {base.turmas.map((t) => {
              const ativa = turmas.includes(t.id);
              const cheia = !!t.vagas && t.ocupadas >= t.vagas;
              return (
                <button key={t.id} type="button" className={'chip-turma' + (ativa ? ' ativa' : '')} onClick={() => setTurmas(ativa ? turmas.filter((x) => x !== t.id) : [...turmas, t.id])} aria-pressed={ativa}>
                  <b>{t.nome}</b><div className="pequeno suave">{t.dias ?? ''} · {t.aulas_semana} aulas · {cheia ? 'sem vaga' : t.vagas ? `${t.vagas - t.ocupadas} vagas` : `${t.ocupadas} alunos`}</div>
                </button>
              );
            })}
          </div>
        </div>
        {origem === 'particular' && (
          <>
            {planosFreq.length > 0 && (
              <Campo rotulo="Plano">
                <select value={planoId} onChange={(e) => escolherPlano(e.target.value === 'manual' ? 'manual' : Number(e.target.value))}>
                  <option value="manual">Valor combinado</option>
                  {base.planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.periodo} · R$ {p.valor}</option>)}
                </select>
                {sugerido && planoId === 'manual' && <span className="pequeno" style={{ color: 'var(--marca-escura)' }}>{aulas} aulas por semana → {sugerido.nome} (R$ {sugerido.valor}) <button type="button" className="link" onClick={() => escolherPlano(sugerido.id)}>usar</button></span>}
              </Campo>
            )}
            <Campo rotulo="Mensalidade (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
            <Campo rotulo={`Grupo familiar (desconto de R$ ${base.config.desconto_familia})`}><input value={familia} onChange={(e) => setFamilia(e.target.value)} placeholder="Ex.: Família Glória" /></Campo>
          </>
        )}
        <div className="cartao pad">
          <div className="resumo-linha forte"><span>{origem === 'gympass' ? 'Aluno Gympass' : 'Mensalidade'}</span><span>{origem === 'gympass' ? 'sem cobrança direta' : <Num v={final} />}</span></div>
          {desconto > 0 && v > 0 && <div className="pequeno suave">Inclui desconto família de R$ {desconto}.</div>}
        </div>
        <Botao tipo="primario" onClick={salvar} desligado={!nome.trim() || salvando || (origem === 'particular' && valor !== '' && !(v >= 0))}>Cadastrar aluno</Botao>
      </div>
    </>
  );
}
