import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import {
  ALVO_PADRAO, calcular, COMO_MEDIR, DOBRAS, estaturaCm, idadeEm, NOME_DOBRA, NOME_PERIMETRO, PERIMETROS, PROTOCOLOS,
  type Dobra, type Medidas, type Perimetro, type Protocolo, type Resultado, type Sexo,
} from '../shared/avaliacao';
import type { Aluno, Avaliacao } from '../shared/tipos';
import { useApp } from '../store';
import { Botao, Campo, Carregando, Modal, Topo, dataBR, useDados } from '../ui';
import { Delta, f1, frase, medidasDe, Selo } from '../components/Avaliacao';

type Trio = [string, string, string];
interface Form {
  data: string; avaliador: string; sexo: Sexo | ''; idade: string; peso: string; estatura: string;
  protocolo: Protocolo; alvo: string; dobras: Record<Dobra, Trio>; perimetros: Record<Perimetro, string>;
  pas: string; pad: string; fc: string; laudo: string;
}

const s = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const n = (t: string): number | null => { const v = Number(t.trim().replace(',', '.')); return t.trim() === '' || !Number.isFinite(v) ? null : v; };
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const vazioDobras = () => Object.fromEntries(DOBRAS.map((d) => [d, ['', '', '']])) as Record<Dobra, Trio>;
const vazioPerim = () => Object.fromEntries(PERIMETROS.map(([k]) => [k, ''])) as Record<Perimetro, string>;

function formDe(a: Avaliacao): Form {
  const dobras = vazioDobras();
  for (const d of DOBRAS) { const v = a.dobras[d] ?? []; dobras[d] = [s(v[0]), s(v[1]), s(v[2])]; }
  const perimetros = vazioPerim();
  for (const [k] of PERIMETROS) perimetros[k] = s(a.perimetros[k]);
  return {
    data: a.data, avaliador: a.avaliador ?? '', sexo: a.sexo, idade: String(a.idade), peso: s(a.peso), estatura: s(a.estatura),
    protocolo: a.protocolo, alvo: s(a.alvo_gordura), dobras, perimetros, pas: s(a.pa_sistolica), pad: s(a.pa_diastolica), fc: s(a.fc_repouso), laudo: a.laudo ?? '',
  };
}

function medidasDoForm(f: Form): Medidas | null {
  if (!f.sexo) return null;
  return {
    sexo: f.sexo, idade: n(f.idade) ?? 0, peso: n(f.peso), estatura: estaturaCm(n(f.estatura)), protocolo: f.protocolo, alvo_gordura: n(f.alvo),
    dobras: Object.fromEntries(DOBRAS.map((d) => [d, f.dobras[d].map(n)])),
    perimetros: Object.fromEntries(PERIMETROS.map(([k]) => [k, n(f.perimetros[k])])),
    pa_sistolica: n(f.pas), pa_diastolica: n(f.pad),
  };
}

export function AvaliacaoForm() {
  const { id, aid } = useParams();
  const nova = aid === 'nova';
  const { dados, erro } = useDados(async () => {
    const [ficha, lista] = await Promise.all([get<{ aluno: Aluno }>(`/alunos/${id}`), get<Avaliacao[]>(`/alunos/${id}/avaliacoes`)]);
    return { aluno: ficha.aluno, lista };
  }, [id, aid]);
  if (!dados) return <Carregando erro={erro} />;
  const atual = nova ? null : dados.lista.find((a) => String(a.id) === aid) ?? null;
  if (!nova && !atual) return <Carregando erro="Avaliação não encontrada." />;
  return <Editor key={aid} aluno={dados.aluno} lista={dados.lista} atual={atual} />;
}

function Editor({ aluno, lista, atual }: { aluno: Aluno; lista: Avaliacao[]; atual: Avaliacao | null }) {
  const nav = useNavigate();
  const { base, toast } = useApp();
  const ultima = lista[lista.length - 1] ?? null;
  const [f, setF] = useState<Form>(() => {
    if (atual) return formDe(atual);
    const data = hoje();
    return {
      data, avaliador: ultima?.avaliador ?? '', sexo: aluno.sexo ?? ultima?.sexo ?? '',
      idade: String(idadeEm(aluno.nascimento, data) ?? ''), peso: '', estatura: s(ultima?.estatura),
      protocolo: ultima?.protocolo ?? 'jp7', alvo: s(ultima?.alvo_gordura), dobras: vazioDobras(), perimetros: vazioPerim(),
      pas: '', pad: '', fc: '', laudo: '',
    };
  });
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [ajuda, setAjuda] = useState<Dobra | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setDobra = (d: Dobra, i: number, v: string) => setF((x) => {
    const t = [...x.dobras[d]] as Trio; t[i] = v;
    return { ...x, dobras: { ...x.dobras, [d]: t } };
  });
  const setData = (data: string) => setF((x) => ({ ...x, data, idade: aluno.nascimento ? String(idadeEm(aluno.nascimento, data) ?? x.idade) : x.idade }));

  const medidas = medidasDoForm(f);
  const r = useMemo(() => (medidas ? calcular(medidas) : null), [JSON.stringify(medidas)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Avaliação anterior a esta (pela data), para comparar.
  const anterior = useMemo(() => {
    const a = [...lista].filter((x) => x.id !== atual?.id && x.data <= f.data).pop() ?? null;
    return a ? { a, r: calcular(medidasDe(a)) } : null;
  }, [lista, atual, f.data]);
  const usadas = f.sexo ? PROTOCOLOS[f.protocolo].dobras[f.sexo] : [...DOBRAS];

  async function salvar() {
    if (!medidas) { toast('Informe o sexo do aluno.', true); return; }
    setSalvando(true);
    const corpo = {
      data: f.data, avaliador: f.avaliador, sexo: f.sexo, idade: n(f.idade), peso: n(f.peso), estatura: estaturaCm(n(f.estatura)),
      protocolo: f.protocolo, alvo_gordura: n(f.alvo), dobras: medidas.dobras, perimetros: medidas.perimetros,
      pa_sistolica: n(f.pas), pa_diastolica: n(f.pad), fc_repouso: n(f.fc), laudo: f.laudo,
    };
    try {
      if (atual) { await put(`/avaliacoes/${atual.id}`, corpo); toast('Avaliação salva.'); nav(`/alunos/${aluno.id}`); }
      else { await post<{ id: number }>(`/alunos/${aluno.id}/avaliacoes`, corpo); toast('Avaliação lançada.'); nav(`/alunos/${aluno.id}`); }
    } catch (e) { toast(String((e as Error).message), true); setSalvando(false); }
  }

  const whats = aluno.telefone && r ? `https://wa.me/55${aluno.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(textoWhats(aluno.nome, f, r, anterior, base?.config.nome_academia))}` : null;

  return (
    <>
      <div className="nao-imprime"><Link to={`/alunos/${aluno.id}`} style={{ fontWeight: 600 }}>← {aluno.nome}</Link></div>
      <Topo titulo={atual ? `Avaliação de ${dataBR(f.data)}` : 'Nova avaliação física'} sub={aluno.nome}>
        {atual && <Botao onClick={() => window.print()}>Imprimir</Botao>}
        {atual && whats && <a className="btn whats" href={whats} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>}
        {atual && <Botao tipo="perigo" onClick={() => setExcluir(true)}>Excluir</Botao>}
      </Topo>

      <div className="aval-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="cartao pad form">
            <h2>Dados</h2>
            <div className="linha-campos">
              <Campo rotulo="Data"><input type="date" value={f.data} onChange={(e) => setData(e.target.value)} /></Campo>
              <Campo rotulo="Avaliado por"><input value={f.avaliador} onChange={(e) => set('avaliador', e.target.value)} /></Campo>
            </div>
            <div className="linha-campos">
              <Campo rotulo="Sexo">
                <select value={f.sexo} onChange={(e) => set('sexo', e.target.value as Sexo | '')}>
                  <option value="">Escolha…</option><option value="F">Feminino</option><option value="M">Masculino</option>
                </select>
              </Campo>
              <Campo rotulo={aluno.nascimento ? 'Idade (pelo nascimento)' : 'Idade'}><input inputMode="numeric" value={f.idade} onChange={(e) => set('idade', e.target.value)} /></Campo>
              <Campo rotulo="Peso (kg)"><input inputMode="decimal" value={f.peso} onChange={(e) => set('peso', e.target.value)} autoFocus={!atual} /></Campo>
              <Campo rotulo="Estatura (cm)"><input inputMode="decimal" value={f.estatura} placeholder="ex.: 168" onChange={(e) => set('estatura', e.target.value)} /></Campo>
            </div>
            <div className="linha-campos">
              <Campo rotulo="Protocolo">
                <select value={f.protocolo} onChange={(e) => set('protocolo', e.target.value as Protocolo)}>
                  {(Object.keys(PROTOCOLOS) as Protocolo[]).map((p) => <option key={p} value={p}>{PROTOCOLOS[p].nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="% de gordura alvo">
                <select value={f.alvo || ''} onChange={(e) => set('alvo', e.target.value)}>
                  <option value="">Padrão ({f.sexo ? ALVO_PADRAO[f.sexo] : '15 ou 23'}%)</option>
                  {Array.from({ length: 26 }, (_, i) => i + 10).map((v) => <option key={v} value={String(v)}>{v}%</option>)}
                </select>
              </Campo>
            </div>
            <div className="pequeno suave">{PROTOCOLOS[f.protocolo].fonte}. Faixa de idade da equação: {f.sexo ? PROTOCOLOS[f.protocolo].idade[f.sexo].join(' a ') : '—'} anos. % de gordura pela equação de Siri.</div>
          </section>

          <section className="cartao pad">
            <h2>Dobras cutâneas (mm)</h2>
            <div className="pequeno suave" style={{ margin: '4px 0 12px' }}>Lado direito, até 3 medidas por ponto: vale a média. Toque no nome para ver onde medir.</div>
            <div className="aval-dobras">
              <span className="pequeno suave">Ponto</span><span className="pequeno suave d">1ª</span><span className="pequeno suave d">2ª</span><span className="pequeno suave d">3ª</span><span className="pequeno suave d">Média</span>
              {DOBRAS.map((d) => {
                const fora = !usadas.includes(d);
                const dispersa = r?.dispersas.includes(d);
                return (
                  <div key={d} className={'aval-linha' + (fora ? ' fora' : '')}>
                    <button type="button" className="link" style={{ textAlign: 'left', fontWeight: fora ? 500 : 600 }} onClick={() => setAjuda(ajuda === d ? null : d)}>{NOME_DOBRA[d]}</button>
                    {[0, 1, 2].map((i) => <input key={i} className="entrada" inputMode="decimal" aria-label={`${NOME_DOBRA[d]}, medida ${i + 1}`} value={f.dobras[d][i]} onChange={(e) => setDobra(d, i, e.target.value)} />)}
                    <span className="num d" style={{ fontWeight: 600, color: dispersa ? 'var(--atraso)' : undefined }} title={dispersa ? 'Medidas com mais de 5% de diferença: vale refazer' : undefined}>{f1(r?.medias[d])}{dispersa ? ' !' : ''}</span>
                    {ajuda === d && <div className="pequeno suave" style={{ gridColumn: '1 / -1' }}>{COMO_MEDIR[d]}</div>}
                  </div>
                );
              })}
              <span style={{ gridColumn: '1 / 5', fontWeight: 600 }}>Soma ({PROTOCOLOS[f.protocolo].nome.toLowerCase()})</span>
              <span className="num d" style={{ fontWeight: 700 }}>{f1(r?.somaProtocolo)}</span>
            </div>
            {f.protocolo !== 'jp7' && <div className="pequeno suave" style={{ marginTop: 8 }}>Os pontos em cinza não entram nesta equação, mas ficam guardados para acompanhar.</div>}
          </section>

          <section className="cartao pad">
            <h2 style={{ marginBottom: 12 }}>Perímetros (cm)</h2>
            <div className="aval-perim">
              {PERIMETROS.map(([k, nome]) => (
                <Campo key={k} rotulo={nome}><input inputMode="decimal" value={f.perimetros[k]} onChange={(e) => set('perimetros', { ...f.perimetros, [k]: e.target.value })} /></Campo>
              ))}
            </div>
          </section>

          <section className="cartao pad form">
            <h2>Pressão arterial e frequência cardíaca</h2>
            <div className="linha-campos">
              <Campo rotulo="Sistólica (mmHg)"><input inputMode="numeric" placeholder="120" value={f.pas} onChange={(e) => set('pas', e.target.value)} /></Campo>
              <Campo rotulo="Diastólica (mmHg)"><input inputMode="numeric" placeholder="80" value={f.pad} onChange={(e) => set('pad', e.target.value)} /></Campo>
              <Campo rotulo="FC de repouso (bpm)"><input inputMode="numeric" value={f.fc} onChange={(e) => set('fc', e.target.value)} /></Campo>
            </div>
          </section>

          <section className="cartao pad form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2>Laudo</h2>
              {r?.gordura != null && <Botao pequeno onClick={() => set('laudo', gerarLaudo(aluno.nome, f, r, anterior))}>Sugerir texto</Botao>}
            </div>
            <textarea className="entrada" style={{ minHeight: 120, padding: '10px 12px' }} value={f.laudo} onChange={(e) => set('laudo', e.target.value)} placeholder="Observações, orientações e metas." />
          </section>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Botao onClick={() => nav(`/alunos/${aluno.id}`)}>Cancelar</Botao>
            <Botao tipo="primario" onClick={salvar} desligado={salvando || !f.sexo || !n(f.idade) || !f.data}>{salvando ? 'Salvando…' : atual ? 'Salvar alterações' : 'Salvar avaliação'}</Botao>
          </div>
        </div>

        <aside className="cartao pad aval-res">
          <Resultados f={f} r={r} anterior={anterior} />
        </aside>
      </div>

      {r && <Impressao aluno={aluno} f={f} r={r} anterior={anterior} academia={base?.config.nome_academia} />}

      {excluir && atual && (
        <Modal titulo="Excluir avaliação" onFechar={() => setExcluir(false)}>
          <p style={{ margin: 0 }}>Excluir a avaliação de {dataBR(atual.data)} de {aluno.nome}? Não dá para desfazer.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Botao onClick={() => setExcluir(false)}>Cancelar</Botao>
            <Botao tipo="perigo" onClick={async () => {
              try { await del(`/avaliacoes/${atual.id}`); toast('Avaliação excluída.'); nav(`/alunos/${aluno.id}`); } catch (e) { toast(String((e as Error).message), true); }
            }}>Excluir</Botao>
          </div>
        </Modal>
      )}
    </>
  );
}

type Anterior = { a: Avaliacao; r: Resultado } | null;

function L({ r, v, extra }: { r: ReactNode; v: ReactNode; extra?: ReactNode }) {
  return (
    <div className="resumo-linha" style={{ padding: '8px 0' }}>
      <span className="suave">{r}</span>
      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}><span className="num" style={{ fontWeight: 600 }}>{v}</span>{extra}</span>
    </div>
  );
}

function Resultados({ f, r, anterior }: { f: Form; r: Resultado | null; anterior: Anterior }) {
  if (!r) return <><h2>Resultado</h2><p className="suave">Escolha o sexo para calcular.</p></>;
  const peso = n(f.peso);
  const ant = anterior?.r;
  const d = (atual: number | null, antes: number | null | undefined, bom: 1 | -1 | 0, un: string) => anterior ? <Delta atual={atual} antes={antes ?? null} bom={bom} un={un} /> : null;
  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Resultado</h2>
      <div className="pequeno suave" style={{ marginBottom: 8 }}>Calculado enquanto você digita{anterior ? ` · comparado com ${dataBR(anterior.a.data)}` : ''}.</div>
      {r.faltam.length > 0 && <div className="faixa" style={{ marginBottom: 8, fontSize: 14 }}>Faltam as dobras: {r.faltam.map((x) => NOME_DOBRA[x]).join(', ')}.</div>}
      {r.foraDaFaixa && <div className="faixa" style={{ marginBottom: 8, fontSize: 14 }}>A idade está fora da faixa validada para {PROTOCOLOS[f.protocolo].nome}: o resultado é uma estimativa menos precisa.</div>}
      {r.dispersas.length > 0 && <div className="faixa" style={{ marginBottom: 8, fontSize: 14 }}>Medidas muito diferentes em {r.dispersas.map((x) => NOME_DOBRA[x]).join(', ')}: vale medir de novo.</div>}
      <L r="% de gordura" v={r.gordura == null ? '—' : `${f1(r.gordura)}%`} extra={<><Selo c={r.classes.gordura} />{d(r.gordura, ant?.gordura, -1, ' p.p.')}</>} />
      <L r="Densidade corporal" v={r.densidade == null ? '—' : `${f1(r.densidade, 4)} g/ml`} />
      <L r="Massa gorda" v={r.massaGorda == null ? '—' : `${f1(r.massaGorda)} kg`} extra={d(r.massaGorda, ant?.massaGorda, -1, ' kg')} />
      <L r="Massa magra" v={r.massaMagra == null ? '—' : `${f1(r.massaMagra)} kg`} extra={d(r.massaMagra, ant?.massaMagra, 1, ' kg')} />
      <L r="Peso" v={peso == null ? '—' : `${f1(peso)} kg`} extra={d(peso, anterior?.a.peso, 0, ' kg')} />
      <L r={`Peso máximo recomendável (${r.alvo}% de gordura)`} v={r.pesoMaximo == null ? '—' : `${f1(r.pesoMaximo)} kg`} />
      <L r="Objetivo de emagrecimento" v={r.objetivo == null ? '—' : r.objetivo < 0.05 ? 'Dentro da meta' : `${f1(r.objetivo)} kg`} />
      <L r="Soma das 7 dobras" v={r.soma7 == null ? '—' : `${f1(r.soma7)} mm`} extra={d(r.soma7, ant?.soma7, -1, ' mm')} />
      <L r="IMC" v={f1(r.imc)} extra={<Selo c={r.classes.imc} />} />
      {r.classes.cintura && <L r="Cintura" v={`${f1(n(f.perimetros.cintura))} cm`} extra={<><Selo c={r.classes.cintura} />{d(n(f.perimetros.cintura), anterior?.a.perimetros.cintura, -1, ' cm')}</>} />}
      {r.rcq != null && <L r="Relação cintura-quadril" v={f1(r.rcq, 2)} extra={<Selo c={r.classes.rcq} />} />}
      {r.rce != null && <L r="Relação cintura-estatura" v={f1(r.rce, 2)} extra={<Selo c={r.classes.rce} />} />}
      {r.classes.pressao && <L r="Pressão arterial" v={`${f.pas}/${f.pad}`} extra={<Selo c={r.classes.pressao} />} />}
    </>
  );
}

// ---------- Textos ----------
function gerarLaudo(nome: string, f: Form, r: Resultado, anterior: Anterior): string {
  const primeiro = nome.split(' ')[0];
  const partes: string[] = [];
  partes.push(`${primeiro} apresenta ${f1(r.gordura)}% de gordura corporal (${r.classes.gordura?.rotulo.toLowerCase()}), com ${f1(r.massaMagra)} kg de massa magra e ${f1(r.massaGorda)} kg de massa gorda.`);
  if (anterior?.r.massaGorda != null && r.massaGorda != null && anterior.r.massaMagra != null && r.massaMagra != null) {
    partes.push(`Em relação à avaliação de ${dataBR(anterior.a.data)}, ${frase(r.massaGorda - anterior.r.massaGorda, 'de gordura')} e ${frase(r.massaMagra - anterior.r.massaMagra, 'de massa magra')}.`);
  }
  if (r.objetivo != null) partes.push(r.objetivo < 0.05 ? `O peso está dentro da meta para ${r.alvo}% de gordura.` : `Para chegar a ${r.alvo}% de gordura, o peso recomendável é de até ${f1(r.pesoMaximo)} kg (reduzir cerca de ${f1(r.objetivo)} kg de gordura, preservando a massa magra).`);
  const riscos = [r.classes.cintura?.tom !== 'ok' && r.classes.cintura ? 'circunferência da cintura' : null, r.classes.rcq?.tom === 'alerta' ? 'relação cintura-quadril' : null].filter(Boolean);
  if (riscos.length) partes.push(`Atenção à ${riscos.join(' e à ')}, indicativo de risco cardiometabólico aumentado.`);
  if (r.classes.pressao && r.classes.pressao.tom !== 'ok') partes.push(`Pressão arterial classificada como ${r.classes.pressao.rotulo.toLowerCase()}: recomenda-se acompanhamento médico.`);
  return partes.join(' ');
}

function textoWhats(nome: string, f: Form, r: Resultado, anterior: Anterior, academia?: string): string {
  const linhas = [`Olá, ${nome.split(' ')[0]}! Segue o resumo da sua avaliação física de ${dataBR(f.data)}:`, ''];
  if (n(f.peso) != null) linhas.push(`• Peso: ${f1(n(f.peso))} kg`);
  if (r.gordura != null) linhas.push(`• Gordura corporal: ${f1(r.gordura)}% (${r.classes.gordura?.rotulo})`);
  if (r.massaMagra != null) linhas.push(`• Massa magra: ${f1(r.massaMagra)} kg`);
  if (r.massaGorda != null) linhas.push(`• Massa gorda: ${f1(r.massaGorda)} kg`);
  if (n(f.perimetros.cintura) != null) linhas.push(`• Cintura: ${f1(n(f.perimetros.cintura))} cm`);
  if (anterior?.r.massaGorda != null && r.massaGorda != null && anterior.r.massaMagra != null && r.massaMagra != null) {
    linhas.push('', `Desde ${dataBR(anterior.a.data)} você ${frase(r.massaGorda - anterior.r.massaGorda, 'de gordura')} e ${frase(r.massaMagra - anterior.r.massaMagra, 'de massa magra')}.`);
  }
  if (academia) linhas.push('', academia);
  return linhas.join('\n');
}

// ---------- Versão para imprimir ----------
function Impressao({ aluno, f, r, anterior, academia }: { aluno: Aluno; f: Form; r: Resultado; anterior: Anterior; academia?: string }) {
  const perims = PERIMETROS.filter(([k]) => n(f.perimetros[k]) != null);
  const linha = (rot: string, v: string, extra?: string) => <tr key={rot}><td>{rot}</td><td className="d num">{v}</td><td>{extra ?? ''}</td></tr>;
  return (
    <div className="impressao">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12 }}>
        <div><div style={{ fontSize: 20, fontWeight: 700 }}>Avaliação física</div><div>{academia}</div></div>
        <div style={{ textAlign: 'right' }}><b>{aluno.nome}</b><div>{dataBR(f.data)} · {f.idade} anos · {f.sexo === 'M' ? 'masculino' : 'feminino'}</div>{f.avaliador && <div>Avaliado por {f.avaliador}</div>}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3>Composição corporal</h3>
          <table className="tbl"><tbody>
            {linha('Peso', `${f1(n(f.peso))} kg`, anterior?.a.peso != null && n(f.peso) != null ? `antes ${f1(anterior.a.peso)}` : '')}
            {linha('Estatura', `${f1(estaturaCm(n(f.estatura)), 0)} cm`)}
            {linha('% de gordura', `${f1(r.gordura)}%`, r.classes.gordura?.rotulo)}
            {linha('Massa gorda', `${f1(r.massaGorda)} kg`, anterior?.r.massaGorda != null ? `antes ${f1(anterior.r.massaGorda)}` : '')}
            {linha('Massa magra', `${f1(r.massaMagra)} kg`, anterior?.r.massaMagra != null ? `antes ${f1(anterior.r.massaMagra)}` : '')}
            {linha(`Peso máximo (${r.alvo}%)`, `${f1(r.pesoMaximo)} kg`)}
            {linha('Objetivo de emagrecimento', r.objetivo == null ? '—' : `${f1(r.objetivo)} kg`)}
            {linha('IMC', f1(r.imc), r.classes.imc?.rotulo)}
            {r.rcq != null && linha('Relação cintura-quadril', f1(r.rcq, 2), r.classes.rcq?.rotulo)}
            {r.classes.pressao && linha('Pressão arterial', `${f.pas}/${f.pad}`, r.classes.pressao.rotulo)}
            {n(f.fc) != null && linha('FC de repouso', `${f.fc} bpm`)}
          </tbody></table>
          <div style={{ fontSize: 11, marginTop: 6 }}>Protocolo: {PROTOCOLOS[f.protocolo].nome} ({PROTOCOLOS[f.protocolo].fonte}); % de gordura por Siri.</div>
        </div>
        <div>
          <h3>Dobras cutâneas (mm)</h3>
          <table className="tbl"><tbody>
            {DOBRAS.filter((d) => r.medias[d] != null).map((d) => linha(NOME_DOBRA[d], f1(r.medias[d])))}
            {r.soma7 != null && linha('Soma das 7', f1(r.soma7))}
          </tbody></table>
          {perims.length > 0 && <>
            <h3>Perímetros (cm)</h3>
            <table className="tbl"><tbody>{perims.map(([k]) => linha(NOME_PERIMETRO[k], f1(n(f.perimetros[k]))))}</tbody></table>
          </>}
        </div>
      </div>
      {f.laudo && <><h3>Laudo</h3><p style={{ whiteSpace: 'pre-wrap' }}>{f.laudo}</p></>}
    </div>
  );
}
