import { useState } from 'react';
import { get } from '../api';
import { nomeComp } from '../shared/comp';
import { useApp } from '../store';
import { Carregando, Num, Topo, brl, useDados } from '../ui';

interface Mes {
  competencia: string; temDados: boolean; fechado: boolean;
  alunos: number; novos: number | null; saidas: number | null;
  faturamento: number; recebido: number; aberto: number; atrasado: number;
  caixa: number; despesas: number; sobra: number; ticket: number; inadimplencia: number;
  porModalidade: Record<string, number>;
}

const COR = { marca: 'var(--marca)', azul: 'var(--azul)', atraso: 'var(--atraso)', suave: 'var(--suave)' };
const rotMes = (c: string) => `${nomeComp(c, true).slice(0, 3).toLowerCase()}/${c.slice(2, 4)}`;
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

interface Serie { nome: string; cor: string; valores: (number | null)[]; tracejada?: boolean }

const L = 56, R = 16, T = 12, B = 28, W = 720, H = 240;

function escala(max: number, min: number) {
  const span = max - min || 1;
  const passo = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const bases = [1, 2, 2.5, 5, 10].map((b) => b * passo);
  const p = bases.find((b) => span / b <= 5) ?? passo * 10;
  const lo = Math.floor(min / p) * p, hi = Math.ceil(max / p) * p;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + p / 2; v += p) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi: hi === lo ? lo + p : hi, ticks };
}

/** Eixo, grade leve e dica ao passar o mouse, comuns aos dois gráficos. */
function Quadro({ meses, series, fmt, tipo, minZero = true }: {
  meses: Mes[]; series: Serie[]; fmt: (n: number) => string; tipo: 'linha' | 'barra'; minZero?: boolean;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v != null);
  const { lo, hi, ticks } = escala(Math.max(0, ...todos), minZero ? Math.min(0, ...todos) : Math.min(...todos, 0));
  const n = meses.length;
  const x = (i: number) => L + ((W - L - R) * (i + 0.5)) / n;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const larg = Math.min(26, ((W - L - R) / n) * 0.7 / series.length);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setSel(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--borda-forte)' : 'var(--linha)'} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--suave)">{fmt(t)}</text>
          </g>
        ))}
        {meses.map((m, i) => (
          <text key={m.competencia} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--suave)">{rotMes(m.competencia)}</text>
        ))}
        {tipo === 'barra' && series.map((s, k) => s.valores.map((v, i) => v == null ? null : (
          <rect key={`${k}-${i}`} x={x(i) - (larg * series.length) / 2 + k * larg + 1} width={Math.max(2, larg - 2)}
            y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={3}
            fill={s.cor} opacity={sel == null || sel === i ? 1 : 0.45} />
        )))}
        {tipo === 'linha' && series.map((s) => {
          const trechos: string[] = [];
          let atual = '';
          s.valores.forEach((v, i) => {
            if (v == null) { if (atual) trechos.push(atual); atual = ''; return; }
            atual += `${atual ? 'L' : 'M'}${x(i)},${y(v)}`;
          });
          if (atual) trechos.push(atual);
          return (
            <g key={s.nome}>
              {trechos.map((d, i) => <path key={i} d={d} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.tracejada ? '5 4' : undefined} />)}
              {s.valores.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={sel === i ? 5 : 3} fill={s.cor} stroke="var(--cartao)" strokeWidth="2" />)}
            </g>
          );
        })}
        {sel != null && <line x1={x(sel)} x2={x(sel)} y1={T} y2={H - B} stroke="var(--borda-forte)" strokeDasharray="3 3" />}
        {meses.map((m, i) => (
          <rect key={m.competencia} x={x(i) - (W - L - R) / n / 2} y={T} width={(W - L - R) / n} height={H - T - B}
            fill="transparent" onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} onClick={() => setSel(i)} />
        ))}
      </svg>
      {sel != null && (
        <div className="cartao" style={{ position: 'absolute', top: 0, left: `${(x(sel) / W) * 100}%`, transform: `translateX(${sel > n / 2 ? '-105%' : '5%'})`, padding: '8px 12px', pointerEvents: 'none', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,.12)', zIndex: 2, minWidth: 150 }}>
          <b>{nomeComp(meses[sel].competencia)}</b>
          {!meses[sel].temDados && <div className="suave">Sem dados</div>}
          {meses[sel].temDados && series.map((s) => (
            <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.cor, marginRight: 6 }} />{s.nome}</span>
              <span className="num">{s.valores[sel] == null ? '—' : fmt(s.valores[sel]!)}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
          {series.map((s) => <span key={s.nome}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.cor, marginRight: 6 }} />{s.nome}</span>)}
        </div>
      )}
    </div>
  );
}

const curto = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(n)));
const comDados = (meses: Mes[], f: (m: Mes) => number) => meses.map((m) => (m.temDados ? f(m) : null));

function Variacao({ atual, antes, inverso, fmt }: { atual: number; antes: number | null; inverso?: boolean; fmt: (n: number) => string }) {
  if (antes == null) return <span className="suave pequeno">sem mês anterior para comparar</span>;
  const d = atual - antes;
  if (Math.abs(d) < 0.005) return <span className="suave pequeno">igual ao mês anterior</span>;
  const bom = inverso ? d < 0 : d > 0;
  return <span className="pequeno" style={{ color: bom ? 'var(--marca-escura)' : 'var(--atraso)', fontWeight: 600 }}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))} vs. mês anterior</span>;
}

export function Historico() {
  const { comp } = useApp();
  const { dados, erro } = useDados(() => get<Mes[]>(`/historico?comp=${comp}&meses=12`), [comp]);
  const [tabela, setTabela] = useState(false);
  if (!dados) return <Carregando erro={erro} />;
  const meses = dados;
  const ult = meses[meses.length - 1];
  const ant = meses.length > 1 && meses[meses.length - 2].temDados ? meses[meses.length - 2] : null;
  const ativos = meses.filter((m) => m.temDados);
  const media = (f: (m: Mes) => number) => (ativos.length ? ativos.reduce((s, m) => s + f(m), 0) / ativos.length : 0);
  const mods = [...new Set(meses.flatMap((m) => Object.keys(m.porModalidade)))];
  const totalMod = (nome: string) => meses.reduce((s, m) => s + (m.porModalidade[nome] ?? 0), 0);
  mods.sort((a, b) => totalMod(b) - totalMod(a));
  const maxMod = Math.max(1, ...mods.map(totalMod));

  const kpis: { rot: string; valor: string; extra: React.ReactNode; atraso?: boolean }[] = [
    { rot: 'Faturamento', valor: brl(ult.faturamento), extra: <Variacao atual={ult.faturamento} antes={ant?.faturamento ?? null} fmt={(n) => brl(n)} /> },
    { rot: 'Sobra do mês', valor: brl(ult.sobra), extra: <Variacao atual={ult.sobra} antes={ant?.sobra ?? null} fmt={(n) => brl(n)} /> },
    { rot: 'Alunos pagantes', valor: String(ult.alunos), extra: <Variacao atual={ult.alunos} antes={ant?.alunos ?? null} fmt={(n) => String(n)} /> },
    { rot: 'Inadimplência', valor: pct(ult.inadimplencia), atraso: true, extra: <Variacao atual={ult.inadimplencia} antes={ant?.inadimplencia ?? null} inverso fmt={pct} /> },
    { rot: 'Ticket médio', valor: brl(ult.ticket), extra: <Variacao atual={ult.ticket} antes={ant?.ticket ?? null} fmt={(n) => brl(n)} /> },
  ];

  return (
    <>
      <Topo titulo="Últimos 12 meses" sub={`${rotMes(meses[0].competencia)} a ${rotMes(ult.competencia)} · mês de referência: ${nomeComp(ult.competencia)}`} />

      <div className="grade">
        {kpis.map((k) => (
          <div key={k.rot} className={'cartao kpi' + (k.atraso && ult.inadimplencia > 0 ? ' atraso' : '')}>
            <div className="rot">{k.rot}</div>
            <div className="val num">{k.valor}</div>
            {k.extra}
          </div>
        ))}
      </div>

      <div className="grade2">
        <section className="cartao pad" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ marginBottom: 4 }}>Faturamento, caixa e despesas</h2>
          <div className="suave pequeno" style={{ marginBottom: 12 }}>Faturamento é o que foi cobrado no mês; caixa é o que realmente entrou (cartão e Gympass chegam no mês seguinte).</div>
          <Quadro meses={meses} tipo="linha" fmt={curto} series={[
            { nome: 'Faturamento', cor: COR.azul, valores: comDados(meses, (m) => m.faturamento) },
            { nome: 'Caixa', cor: COR.marca, valores: comDados(meses, (m) => m.caixa) },
            { nome: 'Despesas', cor: COR.atraso, valores: comDados(meses, (m) => m.despesas), tracejada: true },
          ]} />
        </section>

        <section className="cartao pad">
          <h2 style={{ marginBottom: 4 }}>Sobra do mês</h2>
          <div className="suave pequeno" style={{ marginBottom: 12 }}>Caixa menos despesas. Média: <Num v={media((m) => m.sobra)} />.</div>
          <Quadro meses={meses} tipo="barra" fmt={curto} series={[{ nome: 'Sobra', cor: COR.marca, valores: comDados(meses, (m) => m.sobra) }]} />
        </section>

        <section className="cartao pad">
          <h2 style={{ marginBottom: 4 }}>Alunos pagantes</h2>
          <div className="suave pequeno" style={{ marginBottom: 12 }}>Média: {Math.round(media((m) => m.alunos))} alunos por mês.</div>
          <Quadro meses={meses} tipo="barra" fmt={(n) => String(Math.round(n))} series={[{ nome: 'Alunos', cor: COR.azul, valores: comDados(meses, (m) => m.alunos) }]} />
        </section>

        <section className="cartao pad">
          <h2 style={{ marginBottom: 4 }}>Inadimplência</h2>
          <div className="suave pequeno" style={{ marginBottom: 12 }}>Parte do faturamento que não foi paga. Média: {pct(media((m) => m.inadimplencia))}.</div>
          <Quadro meses={meses} tipo="linha" fmt={pct} series={[{ nome: 'Inadimplência', cor: COR.atraso, valores: comDados(meses, (m) => m.inadimplencia) }]} />
        </section>

        <section className="cartao pad">
          <h2 style={{ marginBottom: 4 }}>Entradas e saídas de alunos</h2>
          <div className="suave pequeno" style={{ marginBottom: 12 }}>Novos = primeira mensalidade no mês. Saídas = pagou no mês anterior e não neste.</div>
          <Quadro meses={meses} tipo="barra" fmt={(n) => String(Math.round(n))} series={[
            { nome: 'Novos', cor: COR.marca, valores: meses.map((m) => m.novos) },
            { nome: 'Saídas', cor: COR.atraso, valores: meses.map((m) => m.saidas) },
          ]} />
        </section>
      </div>

      <section className="cartao pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Faturamento por modalidade (12 meses)</h2>
        {mods.map((nome) => (
          <div key={nome} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{nome}</span><Num v={totalMod(nome)} /></div>
            <div className="barra"><i style={{ width: `${(totalMod(nome) / maxMod) * 100}%` }} /></div>
          </div>
        ))}
        {mods.length === 0 && <div className="suave">Sem dados nos últimos 12 meses.</div>}
      </section>

      <section className="cartao">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Tabela mês a mês</h2>
          <button className="link" onClick={() => setTabela(!tabela)}>{tabela ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        {tabela && (
          <div className="tabela-wrap"><table className="tbl">
            <thead><tr><th>Mês</th><th className="d">Alunos</th><th className="d">Faturamento</th><th className="d">Recebido</th><th className="d">Em aberto</th><th className="d">Caixa</th><th className="d">Despesas</th><th className="d">Sobra</th><th className="d">Inadimpl.</th></tr></thead>
            <tbody>{[...meses].reverse().map((m) => (
              <tr key={m.competencia} style={m.temDados ? undefined : { color: 'var(--suave)' }}>
                <td>{nomeComp(m.competencia)}{m.fechado ? ' · fechado' : ''}</td>
                {m.temDados ? <>
                  <td className="d">{m.alunos}</td><td className="d"><Num v={m.faturamento} /></td><td className="d"><Num v={m.recebido} /></td>
                  <td className="d"><Num v={m.aberto} /></td><td className="d"><Num v={m.caixa} /></td><td className="d"><Num v={m.despesas} /></td>
                  <td className="d"><Num v={m.sobra} /></td><td className="d">{pct(m.inadimplencia)}</td>
                </> : <td colSpan={8}>Sem dados</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
