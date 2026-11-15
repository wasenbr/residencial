// Captura da avaliação física pelo celular: um passo por tela, teclado numérico próprio (grande,
// igual no Android e no iPhone, sem cobrir a tela), sequência de dobras em rodízio com 3ª medida
// só quando as duas primeiras divergem, ditado por voz (as mãos estão no adipômetro), referência
// da avaliação anterior, tela sempre acesa e rascunho salvo a cada toque.
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
  ALVO_PADRAO, COMO_MEDIR, DOBRAS, f1, mediaDobra, NOME_DOBRA, PERIMETROS, precisaTerceira, PROTOCOLOS,
  type Dobra, type Perimetro, type Protocolo, type Resultado, type Sexo,
} from '../shared/avaliacao';
import { interpretarFala } from '../shared/fala';
import type { Aluno, Avaliacao } from '../shared/tipos';
import { Botao, dataBR } from '../ui';
import { Delta, Selo } from '../components/Avaliacao';
import { gerarLaudo, n, Resultados, type Anterior, type Form, type Trio } from './AvaliacaoForm';

type Etapa = 'dados' | 'dobras' | 'perimetros' | 'saude' | 'resultado';
const ETAPAS: [Etapa, string][] = [['dados', 'Dados'], ['dobras', 'Dobras'], ['perimetros', 'Perímetros'], ['saude', 'Saúde'], ['resultado', 'Resultado']];
const ESSENCIAIS: Perimetro[] = ['cintura', 'abdomen', 'quadril'];

const vibrar = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* sem vibração */ } };
const pref = (k: string, padrao: string) => { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } };
const guardarPref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export function CapturaCelular(p: {
  aluno: Aluno; f: Form; setF: Dispatch<SetStateAction<Form>>; r: Resultado | null; anterior: Anterior; ultima: Avaliacao | null;
  salva: boolean; salvando: boolean; onSalvar: () => void; onFormCompleto: () => void; pdf: ReactNode; whats: string | null;
  recuperado: string | null; onDescartar: () => void; onExcluir?: () => void; modalExcluir: ReactNode;
}) {
  const { aluno, f, setF, r, salva } = p;
  const [etapa, setEtapaEstado] = useState<Etapa>(salva ? 'resultado' : 'dados');
  const [voz, setVozEstado] = useState(() => pref('aval-voz', '0') === '1');
  const setVoz = (v: boolean) => { guardarPref('aval-voz', v ? '1' : '0'); setVozEstado(v); };
  const setEtapa = (e: Etapa) => { setEtapaEstado(e); window.scrollTo({ top: 0 }); };

  // Tela inteira para a captura: some a barra de abas do celular.
  useEffect(() => { document.body.classList.add('captura'); return () => document.body.classList.remove('captura'); }, []);
  // Tela sempre acesa enquanto mede (o avaliador está com as mãos ocupadas).
  useEffect(() => {
    if (etapa !== 'dobras' && etapa !== 'perimetros') return;
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* sem suporte */ } };
    void pedir();
    const vis = () => { if (document.visibilityState === 'visible') void pedir(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => undefined); };
  }, [etapa]);

  const feito: Record<Etapa, boolean> = {
    dados: !!f.sexo && !!n(f.idade) && !!n(f.peso),
    dobras: DOBRAS.some((d) => f.dobras[d].some((v) => v.trim())),
    perimetros: PERIMETROS.some(([k]) => f.perimetros[k].trim()),
    saude: !!(f.pas || f.fc),
    resultado: salva,
  };
  const podeMedir = !!f.sexo && !!n(f.idade);

  return (
    <div className="cap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Link to={`/alunos/${aluno.id}`} style={{ fontWeight: 600 }}>← {aluno.nome.split(' ')[0]}</Link>
        <button className="link pequeno" onClick={p.onFormCompleto}>Formulário completo</button>
      </div>
      <div>
        <h1 style={{ fontSize: 22 }}>{salva ? `Avaliação de ${dataBR(f.data)}` : 'Nova avaliação'}</h1>
        <div className="suave pequeno">{aluno.nome}</div>
      </div>
      <nav className="cap-passos" aria-label="Etapas">
        {ETAPAS.map(([e, rot]) => (
          <button key={e} className={(etapa === e ? 'ativo ' : '') + (feito[e] ? 'feito' : '')} onClick={() => (e === 'dados' || podeMedir) && setEtapa(e)} aria-current={etapa === e ? 'step' : undefined}>{rot}</button>
        ))}
      </nav>
      {p.recuperado && etapa === 'dados' && (
        <div className="faixa info" style={{ fontSize: 14 }}>
          <span>Continuando o rascunho de {new Date(p.recuperado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</span>
          <Botao pequeno onClick={p.onDescartar}>Começar de novo</Botao>
        </div>
      )}

      {etapa === 'dados' && <EtapaDados {...p} onContinuar={() => setEtapa('dobras')} />}
      {etapa === 'dobras' && <EtapaDobras f={f} setF={setF} ultima={p.ultima} voz={voz} setVoz={setVoz} onVoltar={() => setEtapa('dados')} onFim={() => setEtapa('perimetros')} />}
      {etapa === 'perimetros' && <EtapaPerimetros f={f} setF={setF} ultima={p.ultima} voz={voz} setVoz={setVoz} onVoltar={() => setEtapa('dobras')} onFim={() => setEtapa('saude')} />}
      {etapa === 'saude' && <EtapaSaude f={f} setF={setF} onVoltar={() => setEtapa('perimetros')} onFim={() => setEtapa('resultado')} />}
      {etapa === 'resultado' && (
        <EtapaResultado {...p} r={r} />
      )}
      {p.modalExcluir}
    </div>
  );
}

// ---------- 1. Dados ----------
function EtapaDados({ aluno, f, setF, ultima, onContinuar }: { aluno: Aluno; f: Form; setF: Dispatch<SetStateAction<Form>>; ultima: Avaliacao | null; onContinuar: () => void }) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const sexo = f.sexo || null;
  const pontos = (pr: Protocolo) => sexo ? (PROTOCOLOS[pr].dobras[sexo].length === 7 ? 'as 7 dobras' : PROTOCOLOS[pr].dobras[sexo].map((d) => NOME_DOBRA[d].split(' (')[0].toLowerCase()).join(', ')) : '';
  return (
    <>
      <section className="cap-card form">
        <div>
          <div className="campo" style={{ marginBottom: 6 }}>Sexo</div>
          <div className="cap-opcoes">
            {([['F', 'Feminino'], ['M', 'Masculino']] as [Sexo, string][]).map(([v, rot]) => (
              <button key={v} className={'ficha' + (f.sexo === v ? ' ativa' : '')} onClick={() => set('sexo', v)}>{rot}</button>
            ))}
          </div>
        </div>
        <div className="linha-campos cap-2">
          <label className="campo">Peso (kg)<input className="cap-grande" inputMode="decimal" value={f.peso} onChange={(e) => set('peso', e.target.value)} placeholder={ultima?.peso ? f1(ultima.peso) : ''} />
            {ultima?.peso != null && <span className="pequeno suave">Última: {f1(ultima.peso)} kg</span>}</label>
          <label className="campo">Estatura (cm)<input className="cap-grande" inputMode="decimal" value={f.estatura} onChange={(e) => set('estatura', e.target.value)} placeholder="168" /></label>
        </div>
        <div className="linha-campos cap-2">
          <label className="campo">Idade<input inputMode="numeric" value={f.idade} onChange={(e) => set('idade', e.target.value)} />
            {aluno.nascimento && <span className="pequeno suave">Pelo nascimento</span>}</label>
          <label className="campo">Data<input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></label>
        </div>
      </section>

      <section className="cap-card form">
        <div>
          <div className="campo" style={{ marginBottom: 6 }}>Protocolo</div>
          <div className="lista-cartoes">
            {(Object.keys(PROTOCOLOS) as Protocolo[]).map((pr) => (
              <button key={pr} className={'chip-turma' + (f.protocolo === pr ? ' ativa' : '')} onClick={() => set('protocolo', pr)}>
                <b>{PROTOCOLOS[pr].nome}</b>{sexo && <div className="pequeno suave">{pontos(pr)}</div>}
              </button>
            ))}
          </div>
        </div>
        <label className="campo">% de gordura alvo
          <select value={f.alvo || ''} onChange={(e) => set('alvo', e.target.value)}>
            <option value="">Padrão ({sexo ? ALVO_PADRAO[sexo] : '15 ou 23'}%)</option>
            {Array.from({ length: 26 }, (_, i) => i + 10).map((v) => <option key={v} value={String(v)}>{v}%</option>)}
          </select>
        </label>
        <label className="campo">Avaliado por<input value={f.avaliador} onChange={(e) => set('avaliador', e.target.value)} /></label>
      </section>

      <button className="btn primario cap-avancar" disabled={!f.sexo || !n(f.idade)} onClick={onContinuar}>
        {!f.sexo ? 'Escolha o sexo para continuar' : !n(f.idade) ? 'Informe a idade para continuar' : 'Medir as dobras →'}
      </button>
    </>
  );
}

// ---------- 2. Dobras ----------
type Pos = { d: Dobra; i: number };

function EtapaDobras({ f, setF, ultima, voz, setVoz, onVoltar, onFim }: {
  f: Form; setF: Dispatch<SetStateAction<Form>>; ultima: Avaliacao | null; voz: boolean; setVoz: (v: boolean) => void; onVoltar: () => void; onFim: () => void;
}) {
  const sexo = f.sexo as Sexo;
  const usadas = PROTOCOLOS[f.protocolo].dobras[sexo];
  // Medir as 7 quando o protocolo pede, quando a última avaliação teve as 7 ou quando já há dobra extra digitada.
  const [todas, setTodas] = useState(() => usadas.length === 7 || DOBRAS.filter((d) => ultima?.dobras[d]?.some((v) => v != null)).length === 7
    || DOBRAS.some((d) => !usadas.includes(d) && f.dobras[d].some((v) => v.trim())));
  const [modo, setModoEstado] = useState(() => pref('aval-modo', 'rodizio') as 'rodizio' | 'ponto');
  const setModo = (m: 'rodizio' | 'ponto') => { guardarPref('aval-modo', m); setModoEstado(m); };
  const pontos = todas ? [...DOBRAS] : DOBRAS.filter((d) => usadas.includes(d));

  // 3ª medida só quando as duas primeiras diferem mais de 5% (ou se já foi digitada).
  const precisa3 = (d: Dobra) => precisaTerceira(n(f.dobras[d][0]), n(f.dobras[d][1])) || !!f.dobras[d][2].trim();
  const seq: Pos[] = modo === 'rodizio'
    ? [...pontos.map((d) => ({ d, i: 0 })), ...pontos.map((d) => ({ d, i: 1 })), ...pontos.filter(precisa3).map((d) => ({ d, i: 2 }))]
    : pontos.flatMap((d) => [{ d, i: 0 }, { d, i: 1 }, ...(precisa3(d) ? [{ d, i: 2 }] : [])]);
  const vazio = (x: Pos) => !f.dobras[x.d][x.i].trim();
  const [pos, setPos] = useState<Pos>(() => seq.find(vazio) ?? seq[0]);
  let idx = seq.findIndex((x) => x.d === pos.d && x.i === pos.i);
  if (idx < 0) idx = Math.max(0, seq.findIndex(vazio));
  const atual = seq[idx];

  const setValor = (v: string) => setF((x) => {
    const t = [...x.dobras[atual.d]] as Trio; t[atual.i] = v;
    return { ...x, dobras: { ...x.dobras, [atual.d]: t } };
  });
  const valor = f.dobras[atual.d][atual.i];
  const ref = mediaDobra(ultima?.dobras[atual.d]);
  const outras = f.dobras[atual.d].map(n).filter((v, i) => i !== atual.i && v != null) as number[];
  const v = n(valor);
  let aviso: string | null = null;
  if (v != null && (v < 2 || v > 80)) aviso = 'Valor fora do comum para uma dobra cutânea. Confira.';
  else if (v != null && ref != null && Math.abs(v - ref) / ref > 0.35) aviso = `Bem diferente da última avaliação (${f1(ref)} mm). Confira a medida.`;
  else if (v != null && atual.i === 1 && precisaTerceira(n(f.dobras[atual.d][0]), v)) aviso = 'Diferença de mais de 5% para a 1ª medida: vou pedir uma 3ª.';
  const dispersa3 = atual.i === 2;

  const proximo = () => { vibrar(); if (idx + 1 >= seq.length) onFim(); else setPos(seq[idx + 1]); };
  const voltar = () => { if (idx > 0) setPos(seq[idx - 1]); else onVoltar(); };
  const feitas = seq.filter((x) => !vazio(x)).length;

  return (
    <>
      <div className="cap-opcoes">
        <button className={'ficha' + (modo === 'rodizio' ? ' ativa' : '')} onClick={() => setModo('rodizio')}>Rodízio</button>
        <button className={'ficha' + (modo === 'ponto' ? ' ativa' : '')} onClick={() => setModo('ponto')}>Ponto a ponto</button>
        {usadas.length < 7 && <button className={'ficha' + (todas ? ' ativa' : '')} onClick={() => setTodas(!todas)}>{todas ? 'Medindo as 7' : 'Medir as 7'}</button>}
      </div>
      <Coletor
        chave={`${atual.d}-${atual.i}`} titulo={NOME_DOBRA[atual.d]}
        sub={dispersa3 ? '3ª medida · as duas primeiras diferem mais de 5%' : `${atual.i + 1}ª medida${modo === 'rodizio' ? ` · rodada ${atual.i + 1}` : ''}`}
        dica={COMO_MEDIR[atual.d]} unidade="mm" valor={valor} setValor={setValor}
        ref_={ref != null ? `Última avaliação: ${f1(ref)} mm` : null}
        outras={outras.length ? `Nesta: ${outras.map((x) => f1(x)).join(' · ')} mm` : null}
        aviso={aviso} progresso={[feitas, seq.length]}
        onProximo={proximo} onVoltar={voltar} ultimo={idx + 1 >= seq.length} voz={voz} setVoz={setVoz}
      />
      <section className="cap-card" style={{ padding: 8 }}>
        <table className="tbl cap-tabela">
          <thead><tr><th>Ponto</th><th className="d">1ª</th><th className="d">2ª</th><th className="d">3ª</th><th className="d">Média</th></tr></thead>
          <tbody>{pontos.map((d) => (
            <tr key={d}>
              <td>{NOME_DOBRA[d].split(' (')[0]}</td>
              {[0, 1, 2].map((i) => {
                const naSeq = seq.some((x) => x.d === d && x.i === i);
                const sel = atual.d === d && atual.i === i;
                return (
                  <td key={i} className="d">
                    {naSeq ? <button className={'cap-celula' + (sel ? ' sel' : '')} onClick={() => setPos({ d, i })}>{f.dobras[d][i] || '·'}</button> : <span className="suave">—</span>}
                  </td>
                );
              })}
              <td className="d num" style={{ fontWeight: 600 }}>{f1(mediaDobra(f.dobras[d].map(n)))}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}

// ---------- 3. Perímetros ----------
function EtapaPerimetros({ f, setF, ultima, voz, setVoz, onVoltar, onFim }: {
  f: Form; setF: Dispatch<SetStateAction<Form>>; ultima: Avaliacao | null; voz: boolean; setVoz: (v: boolean) => void; onVoltar: () => void; onFim: () => void;
}) {
  // Por padrão, os mesmos perímetros da última avaliação (para comparar) + cintura, abdômen e quadril.
  const [escolhidos, setEscolhidos] = useState<Perimetro[]>(() => PERIMETROS.map(([k]) => k).filter((k) =>
    ESSENCIAIS.includes(k) || ultima?.perimetros[k] != null || !!f.perimetros[k].trim()));
  const [escolher, setEscolher] = useState(false);
  const [i, setI] = useState(() => Math.max(0, escolhidos.findIndex((k) => !f.perimetros[k].trim())));
  const lista = PERIMETROS.filter(([k]) => escolhidos.includes(k));
  const idx = Math.min(i, lista.length - 1);
  if (!lista.length || escolher) {
    return (
      <>
        <section className="cap-card">
          <h2 style={{ marginBottom: 4 }}>Quais perímetros medir?</h2>
          <div className="pequeno suave" style={{ marginBottom: 12 }}>Os marcados serão pedidos um a um.</div>
          <div className="fichas">
            {PERIMETROS.map(([k, nome]) => (
              <button key={k} className={'ficha' + (escolhidos.includes(k) ? ' ativa' : '')}
                onClick={() => setEscolhidos(escolhidos.includes(k) ? escolhidos.filter((x) => x !== k) : [...escolhidos, k])}>{nome}</button>
            ))}
          </div>
        </section>
        <div className="cap-acoes">
          <button className="btn" onClick={onFim}>Pular</button>
          <button className="btn primario" disabled={!escolhidos.length} onClick={() => { setEscolher(false); setI(0); }}>Medir {escolhidos.length}</button>
        </div>
      </>
    );
  }
  const [k, nome] = lista[idx];
  const valor = f.perimetros[k];
  const ref = ultima?.perimetros[k] ?? null;
  const v = n(valor);
  const aviso = v != null && (v < 15 || v > 250) ? 'Valor fora do comum para um perímetro. Confira.'
    : v != null && ref != null && Math.abs(v - ref) / ref > 0.15 ? `Bem diferente da última avaliação (${f1(ref)} cm). Confira a medida.` : null;
  const feitas = lista.filter(([x]) => f.perimetros[x].trim()).length;
  return (
    <>
      <div className="cap-opcoes"><button className="ficha" onClick={() => setEscolher(true)}>Escolher perímetros ({lista.length})</button></div>
      <Coletor chave={k} titulo={nome} sub={`${idx + 1} de ${lista.length}`} unidade="cm" valor={valor}
        setValor={(t) => setF((x) => ({ ...x, perimetros: { ...x.perimetros, [k]: t } }))}
        ref_={ref != null ? `Última avaliação: ${f1(ref)} cm` : null} aviso={aviso} progresso={[feitas, lista.length]}
        onProximo={() => { vibrar(); if (idx + 1 >= lista.length) onFim(); else setI(idx + 1); }}
        onVoltar={() => (idx > 0 ? setI(idx - 1) : onVoltar())} ultimo={idx + 1 >= lista.length} voz={voz} setVoz={setVoz} />
      <section className="cap-card" style={{ padding: 8 }}>
        <table className="tbl cap-tabela"><tbody>{lista.map(([x, rot], j) => (
          <tr key={x}><td>{rot}</td><td className="d"><button className={'cap-celula' + (j === idx ? ' sel' : '')} onClick={() => setI(j)}>{f.perimetros[x] || '·'}</button></td></tr>
        ))}</tbody></table>
      </section>
    </>
  );
}

// ---------- 4. Saúde ----------
function EtapaSaude({ f, setF, onVoltar, onFim }: { f: Form; setF: Dispatch<SetStateAction<Form>>; onVoltar: () => void; onFim: () => void }) {
  const set = (k: 'pas' | 'pad' | 'fc', v: string) => setF((x) => ({ ...x, [k]: v.replace(/\D/g, '') }));
  return (
    <>
      <section className="cap-card form">
        <h2>Pressão arterial</h2>
        <div className="linha-campos cap-2">
          <label className="campo">Sistólica<input className="cap-grande" inputMode="numeric" placeholder="120" value={f.pas} onChange={(e) => set('pas', e.target.value)} /></label>
          <label className="campo">Diastólica<input className="cap-grande" inputMode="numeric" placeholder="80" value={f.pad} onChange={(e) => set('pad', e.target.value)} /></label>
        </div>
        <label className="campo">Frequência cardíaca de repouso (bpm)<input className="cap-grande" inputMode="numeric" value={f.fc} onChange={(e) => set('fc', e.target.value)} /></label>
        <div className="pequeno suave">Opcional. Meça sentado, depois de 5 minutos em repouso.</div>
      </section>
      <div className="cap-acoes">
        <button className="btn" onClick={onVoltar}>← Voltar</button>
        <button className="btn primario" onClick={onFim}>{f.pas || f.fc ? 'Ver resultado →' : 'Pular e ver resultado →'}</button>
      </div>
    </>
  );
}

// ---------- 5. Resultado ----------
function EtapaResultado({ aluno, f, setF, r, anterior, salva, salvando, onSalvar, pdf, whats, onExcluir }: {
  aluno: Aluno; f: Form; setF: Dispatch<SetStateAction<Form>>; r: Resultado | null; anterior: Anterior; salva: boolean; salvando: boolean;
  onSalvar: () => void; pdf: ReactNode; whats: string | null; onExcluir?: () => void;
}) {
  const peso = n(f.peso);
  return (
    <>
      {r?.gordura != null && (
        <section className="cap-card cap-destaque">
          <div className="pequeno" style={{ opacity: 0.85 }}>Gordura corporal</div>
          <div className="num" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{f1(r.gordura)}%</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Selo c={r.classes.gordura} />{anterior && <Delta atual={r.gordura} antes={anterior.r.gordura} bom={-1} un=" p.p." />}</div>
          <div className="cap-mini">
            <div><span>Massa magra</span><b className="num">{f1(r.massaMagra)} kg</b>{anterior && <Delta atual={r.massaMagra} antes={anterior.r.massaMagra} bom={1} un=" kg" />}</div>
            <div><span>Massa gorda</span><b className="num">{f1(r.massaGorda)} kg</b>{anterior && <Delta atual={r.massaGorda} antes={anterior.r.massaGorda} bom={-1} un=" kg" />}</div>
            <div><span>Peso</span><b className="num">{f1(peso)} kg</b>{anterior && <Delta atual={peso} antes={anterior.a.peso} bom={0} un=" kg" />}</div>
          </div>
        </section>
      )}
      {salva && (
        <div className="cap-acoes" style={{ gridTemplateColumns: '1fr' }}>
          <div className="cap-pdf">{pdf}</div>
          {whats && <a className="btn whats" href={whats} target="_blank" rel="noreferrer">Resumo em texto no WhatsApp</a>}
        </div>
      )}
      <section className="cap-card"><Resultados f={f} r={r} anterior={anterior} /></section>
      <section className="cap-card form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2>Laudo</h2>
          {r?.gordura != null && <Botao pequeno onClick={() => setF((x) => ({ ...x, laudo: gerarLaudo(aluno.nome, f, r, anterior) }))}>Sugerir texto</Botao>}
        </div>
        <textarea className="entrada" style={{ minHeight: 120, padding: '10px 12px' }} value={f.laudo} onChange={(e) => setF((x) => ({ ...x, laudo: e.target.value }))} placeholder="Observações, orientações e metas." />
      </section>
      <button className="btn primario cap-avancar" disabled={salvando || !f.sexo || !n(f.idade)} onClick={onSalvar}>
        {salvando ? 'Salvando…' : salva ? 'Salvar alterações' : 'Salvar avaliação'}
      </button>
      {onExcluir && <button className="btn perigo" onClick={onExcluir}>Excluir avaliação</button>}
    </>
  );
}

// ---------- Coletor: um valor por tela, teclado próprio e ditado ----------
function Coletor(p: {
  chave: string; titulo: string; sub: string; dica?: string; unidade: 'mm' | 'cm'; valor: string; setValor: (v: string) => void;
  ref_: string | null; outras?: string | null; aviso: string | null; progresso: [number, number];
  onProximo: () => void; onVoltar: () => void; ultimo: boolean; voz: boolean; setVoz: (v: boolean) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const atual = useRef(p);
  atual.current = p;
  const suportaVoz = !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  useEffect(() => { setMsg(null); }, [p.chave]);

  // Ditado: escuta um valor por campo; número preenche e avança; "voltar" e "pular" navegam.
  useEffect(() => {
    if (!p.voz || !suportaVoz) return;
    const w = window as unknown as Record<string, new () => Reconhecedor>;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    let ativo = true, rec: Reconhecedor | null = null;
    const ouvir = () => {
      if (!ativo) return;
      let entendeu = false;
      rec = new SR();
      rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 4; rec.continuous = false;
      rec.onresult = (e) => {
        const alts = Array.from(e.results[0] as ArrayLike<{ transcript: string }>).map((a) => a.transcript);
        const fala = alts.map(interpretarFala).find((x) => x.tipo !== 'nada');
        if (!fala) { setMsg(`Não entendi “${alts[0] ?? ''}”. Fale de novo.`); return; }
        entendeu = true;
        if (fala.tipo === 'numero') {
          atual.current.setValor(String(fala.valor).replace('.', ','));
          setMsg(null);
          setTimeout(() => { if (ativo) atual.current.onProximo(); }, 450);
        } else if (fala.tipo === 'voltar') atual.current.onVoltar();
        else atual.current.onProximo();
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { ativo = false; atual.current.setVoz(false); setMsg('O navegador não liberou o microfone.'); }
      };
      rec.onend = () => { setOuvindo(false); if (ativo && !entendeu) setTimeout(ouvir, 250); };
      try { rec.start(); setOuvindo(true); } catch { /* já ouvindo */ }
    };
    ouvir();
    return () => { ativo = false; try { rec?.abort(); } catch { /* nada */ } setOuvindo(false); };
  }, [p.voz, p.chave, suportaVoz]);

  const digitar = (t: string) => {
    vibrar(6);
    const v = p.valor;
    if (t === '⌫') return p.setValor(v.slice(0, -1));
    if (t === ',') return p.setValor(v.includes(',') ? v : (v || '0') + ',');
    if (v.includes(',') && v.split(',')[1].length >= 1) return; // uma casa decimal basta
    if (v.replace(',', '').length >= 4) return;
    p.setValor(v === '0' ? t : v + t);
  };
  const [feitas, total] = p.progresso;

  return (
    <section className="cap-card cap-coletor">
      <div className="barra" style={{ height: 6 }}><i style={{ width: `${(feitas / Math.max(1, total)) * 100}%` }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{p.titulo}</div>
          <div className="pequeno suave">{p.sub}</div>
        </div>
        {suportaVoz && (
          <button className={'cap-mic' + (p.voz ? ' ligado' : '')} onClick={() => p.setVoz(!p.voz)} aria-pressed={p.voz} aria-label={p.voz ? 'Desligar ditado' : 'Ditar por voz'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {p.voz ? (ouvindo ? 'Ouvindo…' : 'Ditado') : 'Ditar'}
          </button>
        )}
      </div>
      {p.dica && <div className="pequeno suave">{p.dica}</div>}
      <div className={'cap-valor num' + (p.valor ? '' : ' vazio')} aria-live="polite">{p.valor || '0'}<span>{p.unidade}</span></div>
      <div className="pequeno suave" style={{ textAlign: 'center', minHeight: 18 }}>{[p.ref_, p.outras].filter(Boolean).join(' · ')}</div>
      {(p.aviso || msg) && <div className="faixa" style={{ fontSize: 14, padding: '10px 12px' }}>{msg ?? p.aviso}</div>}
      {p.voz && <div className="pequeno suave" style={{ textAlign: 'center' }}>Fale o valor (ex.: “dezoito vírgula cinco”), “voltar” ou “pular”.</div>}
      <div className="teclado" role="group" aria-label="Teclado numérico">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((t) => (
          <button key={t} onClick={() => digitar(t)} aria-label={t === '⌫' ? 'Apagar' : t === ',' ? 'Vírgula' : t}>{t}</button>
        ))}
      </div>
      <div className="cap-acoes">
        <button className="btn" onClick={p.onVoltar}>← Voltar</button>
        <button className="btn primario" onClick={p.onProximo}>{!p.valor ? 'Pular' : p.ultimo ? 'Concluir ✓' : 'Próximo →'}</button>
      </div>
    </section>
  );
}

interface Reconhecedor {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void; abort: () => void;
}
