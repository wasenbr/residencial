import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api';
import { calcular, PROTOCOLOS, REAVALIAR_DIAS, type Classe, type Medidas, type Resultado } from '../shared/avaliacao';
import type { Aluno, Avaliacao } from '../shared/tipos';
import { escala } from '../pages/Historico';
import { Botao, Carregando, dataBR, useDados } from '../ui';

// ---------- Formatação ----------
export const f1 = (n: number | null | undefined, casas = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const medidasDe = (a: Avaliacao): Medidas => ({
  sexo: a.sexo, idade: a.idade, peso: a.peso, estatura: a.estatura, protocolo: a.protocolo, alvo_gordura: a.alvo_gordura,
  dobras: a.dobras, perimetros: a.perimetros, pa_sistolica: a.pa_sistolica, pa_diastolica: a.pa_diastolica,
});

export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);
export function tempoDesde(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 45) return `há ${dias} dias`;
  const meses = Math.round(dias / 30.4);
  return meses < 12 ? `há ${meses} meses` : `há ${f1(dias / 365, 1)} anos`;
}
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function Selo({ c }: { c?: Classe }) {
  if (!c) return null;
  const tipo = c.tom === 'ok' ? 'ok' : c.tom === 'atencao' ? 'atencao' : 'atraso';
  return <span className={'pilula ' + tipo}>{c.rotulo}</span>;
}

/** Variação entre duas avaliações. `bom` diz se subir é bom (1), ruim (-1) ou neutro (0). */
export function Delta({ atual, antes, bom, un, casas = 1 }: { atual: number | null; antes: number | null; bom: 1 | -1 | 0; un: string; casas?: number }) {
  if (atual == null || antes == null) return null;
  const d = atual - antes;
  if (Math.abs(d) < Math.pow(10, -casas) / 2) return <span className="pequeno suave">sem mudança</span>;
  const cor = bom === 0 ? 'var(--suave)' : (d > 0) === (bom === 1) ? 'var(--marca-escura)' : 'var(--atraso)';
  return <span className="pequeno" style={{ color: cor, fontWeight: 600 }}>{d > 0 ? '▲ +' : '▼ −'}{f1(Math.abs(d), casas)}{un}</span>;
}

// ---------- Gráfico de evolução (eixo de tempo real: avaliações não são mensais) ----------
interface Serie { nome: string; cor: string; valores: (number | null)[]; tracejada?: boolean }
const L = 44, R = 14, T = 12, B = 28;

export function GraficoEvolucao({ datas, series, un, casas = 1 }: { datas: string[]; series: Serie[]; un: string; casas?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const [W, setW] = useState(560);
  const H = 240;
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ler = () => setW(Math.max(260, Math.round(el.clientWidth)));
    ler();
    const ro = new ResizeObserver(ler);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v != null);
  if (!todos.length) return <div className="vazio">Sem dados para este indicador.</div>;
  const min = Math.min(...todos), max = Math.max(...todos);
  const folga = (max - min) * 0.15 || Math.max(1, max * 0.05);
  const { lo, hi, ticks } = escala(max + folga, Math.max(0, min - folga));
  const tempos = datas.map((d) => Date.parse(d));
  const t0 = tempos[0], t1 = tempos[tempos.length - 1];
  const x = (i: number) => (t1 === t0 ? (L + W - R) / 2 : L + ((W - L - R) * (tempos[i] - t0)) / (t1 - t0));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  // Rótulos de data sem sobrepor: pula os que ficam a menos de 52px do último desenhado.
  const rotulos: number[] = [];
  datas.forEach((_, i) => { if (!rotulos.length || x(i) - x(rotulos[rotulos.length - 1]) >= 52) rotulos.push(i); });
  if (rotulos[rotulos.length - 1] !== datas.length - 1 && datas.length > 1) { if (x(datas.length - 1) - x(rotulos[rotulos.length - 1]) < 52) rotulos.pop(); rotulos.push(datas.length - 1); }
  const limites = datas.map((_, i) => [i === 0 ? L : (x(i - 1) + x(i)) / 2, i === datas.length - 1 ? W - R : (x(i) + x(i + 1)) / 2]);

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Evolução: ${series.map((s) => s.nome).join(', ')}`}
        style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setSel(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--linha)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--suave)">{f1(t, Number.isInteger(t) ? 0 : 1)}</text>
          </g>
        ))}
        {rotulos.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--suave)">{dataBR(datas[i])}</text>)}
        {sel != null && <line x1={x(sel)} x2={x(sel)} y1={T} y2={H - B} stroke="var(--borda-forte)" strokeDasharray="3 3" />}
        {series.map((s) => {
          const pts = s.valores.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return (
            <g key={s.nome}>
              {pts.length > 1 && <path d={'M' + pts.join('L')} fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.tracejada ? '5 4' : undefined} />}
              {s.valores.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={sel === i ? 5.5 : 3.5} fill={s.cor} stroke="var(--cartao)" strokeWidth="2" />)}
            </g>
          );
        })}
        {limites.map(([a, b], i) => (
          <rect key={i} x={a} y={T} width={Math.max(1, b - a)} height={H - T - B} fill="transparent"
            onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} onClick={() => setSel(i)} />
        ))}
      </svg>
      {sel != null && (
        <div className="cartao" style={{ position: 'absolute', top: 0, left: `${(x(sel) / W) * 100}%`, transform: `translateX(${x(sel) > W / 2 ? '-105%' : '5%'})`, padding: '8px 12px', pointerEvents: 'none', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,.12)', zIndex: 2, minWidth: 150 }}>
          <b>{dataBR(datas[sel])}</b>
          {series.map((s) => (
            <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.cor, marginRight: 6 }} />{s.nome}</span>
              <span className="num">{s.valores[sel] == null ? '—' : `${f1(s.valores[sel], casas)}${un}`}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
          {series.map((s) => <span key={s.nome}><i style={{ display: 'inline-block', width: 10, height: s.tracejada ? 3 : 10, verticalAlign: 'middle', borderRadius: 2, background: s.cor, marginRight: 6 }} />{s.nome}</span>)}
        </div>
      )}
    </div>
  );
}

// ---------- Seção na ficha do aluno ----------
type Item = { a: Avaliacao; r: Resultado };
const COR = { magra: '#0F6E5C', gorda: '#8F3605', peso: '#2F4A73', extra: '#7A5C12' };

const INDICADORES: { id: string; nome: string; un: string; casas?: number; series: (it: Item[]) => Serie[] }[] = [
  { id: 'composicao', nome: 'Composição', un: ' kg', series: (it) => [
    { nome: 'Massa magra', cor: COR.magra, valores: it.map((i) => i.r.massaMagra) },
    { nome: 'Massa gorda', cor: COR.gorda, valores: it.map((i) => i.r.massaGorda) },
  ] },
  { id: 'gordura', nome: '% de gordura', un: '%', series: (it) => [{ nome: '% de gordura', cor: COR.gorda, valores: it.map((i) => i.r.gordura) }] },
  { id: 'peso', nome: 'Peso', un: ' kg', series: (it) => [
    { nome: 'Peso', cor: COR.peso, valores: it.map((i) => i.a.peso) },
    { nome: 'Peso máximo recomendável', cor: COR.peso, tracejada: true, valores: it.map((i) => i.r.pesoMaximo) },
  ] },
  { id: 'perimetros', nome: 'Cintura e quadril', un: ' cm', series: (it) => [
    { nome: 'Cintura', cor: COR.gorda, valores: it.map((i) => i.a.perimetros.cintura ?? null) },
    { nome: 'Abdômen', cor: COR.extra, valores: it.map((i) => i.a.perimetros.abdomen ?? null) },
    { nome: 'Quadril', cor: COR.peso, valores: it.map((i) => i.a.perimetros.quadril ?? null) },
  ] },
  { id: 'dobras', nome: 'Soma das 7 dobras', un: ' mm', series: (it) => [{ nome: 'Soma das 7 dobras', cor: COR.extra, valores: it.map((i) => i.r.soma7) }] },
  { id: 'imc', nome: 'IMC', un: '', series: (it) => [{ nome: 'IMC', cor: COR.peso, valores: it.map((i) => i.r.imc) }] },
];

export function AvaliacaoSecao({ aluno }: { aluno: Aluno }) {
  const nav = useNavigate();
  const { dados, erro } = useDados(() => get<Avaliacao[]>(`/alunos/${aluno.id}/avaliacoes`), [aluno.id]);
  const [ind, setInd] = useState('composicao');
  const nova = () => nav(`/alunos/${aluno.id}/avaliacoes/nova`);
  const cab = (extra?: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div><h2>Avaliação física</h2>{extra}</div>
      <Botao pequeno tipo="primario" onClick={nova}>Nova avaliação</Botao>
    </div>
  );
  if (!dados) return <section className="cartao pad">{cab()}<Carregando erro={erro} /></section>;
  if (!dados.length) {
    return (
      <section className="cartao pad">
        {cab()}
        <p className="suave" style={{ margin: '12px 0 0' }}>Nenhuma avaliação ainda. Lance peso, estatura, dobras cutâneas e perímetros: o sistema calcula % de gordura, massa magra, peso recomendável e acompanha a evolução a cada reavaliação.</p>
      </section>
    );
  }
  const itens: Item[] = dados.map((a) => ({ a, r: calcular(medidasDe(a)) }));
  const ult = itens[itens.length - 1], ant = itens.length > 1 ? itens[itens.length - 2] : null, pri = itens[0];
  const dias = diasEntre(ult.a.data, hojeISO());
  const disponiveis = INDICADORES.filter((i) => i.series(itens).some((s) => s.valores.some((v) => v != null)));
  const atual = disponiveis.find((i) => i.id === ind) ?? disponiveis[0];

  const kpis: { rot: string; v: number | null; un: string; du?: string; bom: 1 | -1 | 0; antes: (it: Item) => number | null; classe?: Classe }[] = [
    { rot: 'Peso', v: ult.a.peso, un: ' kg', bom: 0, antes: (i) => i.a.peso },
    { rot: '% de gordura', v: ult.r.gordura, un: '%', du: ' p.p.', bom: -1, antes: (i) => i.r.gordura, classe: ult.r.classes.gordura },
    { rot: 'Massa magra', v: ult.r.massaMagra, un: ' kg', bom: 1, antes: (i) => i.r.massaMagra },
    { rot: 'Massa gorda', v: ult.r.massaGorda, un: ' kg', bom: -1, antes: (i) => i.r.massaGorda },
    { rot: 'IMC', v: ult.r.imc, un: '', bom: 0, antes: (i) => i.r.imc, classe: ult.r.classes.imc },
    { rot: 'Cintura', v: ult.a.perimetros.cintura ?? null, un: ' cm', bom: -1, antes: (i) => i.a.perimetros.cintura ?? null, classe: ult.r.classes.cintura },
  ];

  return (
    <section className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {cab(
        <div className="pequeno suave" style={{ marginTop: 2 }}>
          {itens.length} {itens.length === 1 ? 'avaliação' : 'avaliações'} · última em {dataBR(ult.a.data)} ({tempoDesde(dias)})
          {dias >= REAVALIAR_DIAS && <> · <span className="pilula aberto">Hora de reavaliar</span></>}
        </div>,
      )}

      <div className="aval-kpis">
        {kpis.filter((k) => k.v != null).map((k) => (
          <div key={k.rot} className="aval-kpi">
            <div className="pequeno suave">{k.rot}</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{f1(k.v)}<span style={{ fontSize: 14 }}>{k.un}</span></div>
            {k.classe && <Selo c={k.classe} />}
            {ant && <div><Delta atual={k.v} antes={k.antes(ant)} bom={k.bom} un={k.du ?? k.un} /> <span className="pequeno suave">vs. anterior</span></div>}
          </div>
        ))}
      </div>

      {itens.length > 1 && pri.r.massaGorda != null && ult.r.massaGorda != null && pri.r.massaMagra != null && ult.r.massaMagra != null && (
        <div className="faixa info">
          Desde a 1ª avaliação ({dataBR(pri.a.data)}): {frase(ult.r.massaGorda - pri.r.massaGorda, 'de gordura')} e {frase(ult.r.massaMagra - pri.r.massaMagra, 'de massa magra')}.
        </div>
      )}

      {itens.length > 1 && atual ? (
        <div>
          <div className="fichas" style={{ marginBottom: 12 }}>
            {disponiveis.map((i) => <button key={i.id} className={'ficha' + (i.id === atual.id ? ' ativa' : '')} onClick={() => setInd(i.id)}>{i.nome}</button>)}
          </div>
          <GraficoEvolucao datas={itens.map((i) => i.a.data)} series={atual.series(itens)} un={atual.un} casas={atual.casas} />
        </div>
      ) : <div className="suave pequeno">O gráfico de evolução aparece a partir da segunda avaliação.</div>}

      <div className="tabela-wrap"><table className="tbl">
        <thead><tr><th>Data</th><th className="d">Peso</th><th className="d">% gordura</th><th className="d esconde-cel">M. magra</th><th className="d esconde-cel">M. gorda</th><th className="d esconde-cel">IMC</th><th className="d esconde-cel">Cintura</th><th className="esconde-cel">Protocolo</th></tr></thead>
        <tbody>{[...itens].reverse().map(({ a, r }) => (
          <tr key={a.id} className="clicavel" onClick={() => nav(`/alunos/${aluno.id}/avaliacoes/${a.id}`)}>
            <td><Link to={`/alunos/${aluno.id}/avaliacoes/${a.id}`} onClick={(e) => e.stopPropagation()}>{dataBR(a.data)}</Link></td>
            <td className="d num">{f1(a.peso)}</td><td className="d num">{f1(r.gordura)}</td>
            <td className="d num esconde-cel">{f1(r.massaMagra)}</td><td className="d num esconde-cel">{f1(r.massaGorda)}</td>
            <td className="d num esconde-cel">{f1(r.imc)}</td><td className="d num esconde-cel">{f1(a.perimetros.cintura)}</td>
            <td className="esconde-cel pequeno suave">{PROTOCOLOS[a.protocolo].nome}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

export function frase(d: number, oque: string): string {
  if (Math.abs(d) < 0.05) return `manteve a ${oque.replace(/^de /, '')}`;
  return `${d > 0 ? 'ganhou' : 'perdeu'} ${f1(Math.abs(d))} kg ${oque}`;
}
