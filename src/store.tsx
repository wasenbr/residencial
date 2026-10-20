import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Config, Modalidade, Plano, Professor, Turma, DespesaFixa } from './shared/tipos';
import { get } from './api';
import { compAtual } from './shared/comp';

export interface TurmaComVagas extends Turma { ocupadas: number }

export interface Base {
  config: Config;
  modalidades: Modalidade[];
  turmas: TurmaComVagas[];
  professores: Professor[];
  planos: Plano[];
  despesasFixas: DespesaFixa[];
  competencias: string[];
  fechados: string[];
  hoje: string;
  compAtual: string;
}

interface Ctx {
  base: Base | null;
  erro: string | null;
  comp: string;
  setComp: (c: string) => void;
  recarregar: () => Promise<void>;
  versao: number;
  toast: (msg: string, erro?: boolean) => void;
}

const Contexto = createContext<Ctx>(null as never);
export const useApp = () => useContext(Contexto);

export function Provedor({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comp, setCompEstado] = useState<string>(() => localStorage.getItem('comp') ?? compAtual());
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<{ msg: string; erro: boolean } | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setBase(await get<Base>('/bootstrap'));
      setErro(null);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const setComp = (c: string) => { localStorage.setItem('comp', c); setCompEstado(c); };
  const toast = useCallback((msg: string, erro = false) => {
    setAviso({ msg, erro });
    setTimeout(() => setAviso(null), 3500);
  }, []);

  const valor = useMemo(() => ({ base, erro, comp, setComp, recarregar, versao, toast }), [base, erro, comp, recarregar, versao, toast]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {aviso && <div className={'toast' + (aviso.erro ? ' erro' : '')} role="status">{aviso.msg}</div>}
    </Contexto.Provider>
  );
}
