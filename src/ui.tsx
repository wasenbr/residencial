import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MESES, nomeComp, somarMeses } from './shared/comp';
import { brl } from './shared/resumo';
import { useApp } from './store';

export { brl };
export const dinheiro = (n: number) => brl(n, !Number.isInteger(n));

export function Num({ v, centavos }: { v: number; centavos?: boolean }) {
  return <span className="num">{centavos ? brl(v, true) : dinheiro(v)}</span>;
}

export function Pilula({ tipo, children }: { tipo: 'ok' | 'atraso' | 'aberto' | 'info'; children: ReactNode }) {
  return <span className={'pilula ' + tipo}>{children}</span>;
}

export function Botao({ children, onClick, tipo = 'padrao', pequeno, desligado, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tipo?: 'padrao' | 'primario' | 'perigo'; pequeno?: boolean; desligado?: boolean; type?: 'button' | 'submit';
}) {
  const cls = ['btn', tipo === 'primario' && 'primario', tipo === 'perigo' && 'perigo', pequeno && 'peq'].filter(Boolean).join(' ');
  return <button type={type} className={cls} onClick={onClick} disabled={desligado}>{children}</button>;
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="campo">{rotulo}{children}</label>;
}

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);
  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2 style={{ fontSize: 20 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function SeletorMes() {
  const { base, comp, setComp } = useApp();
  if (!base) return null;
  const todas = new Set([...base.competencias, base.compAtual, comp]);
  const lista = [...todas].sort().reverse();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--suave)' }}>
      Mês
      <select className="entrada sel" value={comp} onChange={(e) => setComp(e.target.value)} aria-label="Mês">
        {lista.map((c) => <option key={c} value={c}>{nomeComp(c)}{base.fechados.includes(c) ? ' · fechado' : ''}</option>)}
      </select>
    </label>
  );
}

export function Topo({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="topo">
      <div><h1>{titulo}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="acoes">{children}</div>
    </div>
  );
}

const icones: Record<string, ReactNode> = {
  inicio: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  receber: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  aluno: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M19 8v6M16 11h6" /></>,
  despesa: <><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  ok: <path d="M4 12l5 5L20 6" />,
};
export function Icone({ nome, cor = 'currentColor', tam = 22 }: { nome: keyof typeof icones; cor?: string; tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icones[nome]}</svg>;
}

export function Abas() {
  const itens: [string, string, keyof typeof icones][] = [['/', 'Início', 'inicio'], ['/receber', 'Receber', 'receber'], ['/novo-aluno', 'Novo aluno', 'aluno'], ['/despesas', 'Despesas', 'despesa']];
  return (
    <nav className="abas" aria-label="Navegação">
      {itens.map(([to, rot, ic]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'ativo' : '')}><Icone nome={ic} />{rot}</NavLink>
      ))}
    </nav>
  );
}

export function Menu() {
  const { base } = useApp();
  const itens: [string, string][] = [['/', 'Dashboard'], ['/alunos', 'Alunos'], ['/turmas', 'Turmas'], ['/mensalidades', 'Mensalidades'], ['/gympass', 'Gympass'], ['/despesas', 'Despesas'], ['/fechamento', 'Fechamento'], ['/importar', 'Importar planilha'], ['/configuracoes', 'Configurações']];
  return (
    <nav className="menu" aria-label="Menu principal">
      <div className="marca">{base?.config.nome_academia || 'Minha academia'}</div>
      {itens.map(([to, rot]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'ativo' : '')}>{rot}</NavLink>)}
      <div className="rodape">{MESES[new Date().getMonth()]} {new Date().getFullYear()}</div>
    </nav>
  );
}

export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]): { dados: T | null; erro: string | null; recarregar: () => void } {
  const { versao } = useApp();
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    carregar().then((d) => { if (vivo) { setDados(d); setErro(null); } }).catch((e) => vivo && setErro(String(e.message ?? e)));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n, versao]);
  return { dados, erro, recarregar: () => setN((x) => x + 1) };
}

export function Carregando({ erro }: { erro?: string | null }) {
  return <div className="vazio">{erro ? <span style={{ color: 'var(--atraso)' }}>{erro}</span> : 'Carregando…'}</div>;
}

export const mesAnterior = (c: string) => nomeComp(somarMeses(c, -1));
export const mesSeguinte = (c: string) => nomeComp(somarMeses(c, 1));

export function useLargura(corte = 860): boolean {
  const [estreito, setEstreito] = useState(() => window.innerWidth <= corte);
  useEffect(() => {
    const h = () => setEstreito(window.innerWidth <= corte);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [corte]);
  return estreito;
}

export function dataBR(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}${a ? '/' + a.slice(2) : ''}`;
}
export function diaMes(d: string | null | undefined): string {
  if (!d) return '—';
  const [, m, dia] = d.split('-');
  return `${dia}/${m}`;
}
export const FORMA_ROTULO: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', gympass: 'Gympass' };
