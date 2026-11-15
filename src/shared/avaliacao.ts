// Avaliação física: composição corporal por dobras cutâneas, perímetros e índices.
//
// Densidade corporal (DC) por equações generalizadas:
//  - Jackson & Pollock (1978, homens) e Jackson, Pollock & Ward (1980, mulheres), 7 e 3 dobras.
//  - Guedes (1985), 3 dobras, validada em universitários brasileiros.
// % de gordura pela equação de Siri (1961): %G = 495 / DC − 450.
// Peso máximo recomendável = massa magra / (1 − % de gordura alvo).

import type { Avaliacao } from './tipos';

export type Sexo = 'M' | 'F';
export type Protocolo = 'jp7' | 'jp3' | 'guedes';

export const DOBRAS = ['subescapular', 'triceps', 'peitoral', 'axilar', 'suprailiaca', 'abdominal', 'coxa'] as const;
export type Dobra = (typeof DOBRAS)[number];
export const NOME_DOBRA: Record<Dobra, string> = {
  subescapular: 'Subescapular', triceps: 'Tríceps', peitoral: 'Peitoral', axilar: 'Axilar média',
  suprailiaca: 'Supra-ilíaca', abdominal: 'Abdominal', coxa: 'Coxa (femural médio)',
};
export const COMO_MEDIR: Record<Dobra, string> = {
  subescapular: 'Diagonal, 2 cm abaixo do ângulo inferior da escápula.',
  triceps: 'Vertical, face posterior do braço, no ponto médio entre acrômio e olécrano.',
  peitoral: 'Diagonal, entre a axila e o mamilo (homens: 1/2; mulheres: 1/3 a partir da axila).',
  axilar: 'Vertical, na linha axilar média, na altura do processo xifoide.',
  suprailiaca: 'Diagonal, logo acima da crista ilíaca, na linha axilar anterior.',
  abdominal: 'Vertical, 2 cm à direita da cicatriz umbilical.',
  coxa: 'Vertical, face anterior da coxa, no ponto médio entre a prega inguinal e a patela.',
};

export const PERIMETROS = [
  ['pescoco', 'Pescoço'], ['ombro', 'Ombros'], ['torax', 'Tórax'], ['cintura', 'Cintura'], ['abdomen', 'Abdômen'], ['quadril', 'Quadril'],
  ['braco_d', 'Braço direito relaxado'], ['braco_e', 'Braço esquerdo relaxado'],
  ['braco_contraido_d', 'Braço direito contraído'], ['braco_contraido_e', 'Braço esquerdo contraído'],
  ['antebraco_d', 'Antebraço direito'], ['antebraco_e', 'Antebraço esquerdo'],
  ['coxa_d', 'Coxa direita'], ['coxa_e', 'Coxa esquerda'],
  ['panturrilha_d', 'Panturrilha direita'], ['panturrilha_e', 'Panturrilha esquerda'],
] as const;
export type Perimetro = (typeof PERIMETROS)[number][0];
export const NOME_PERIMETRO = Object.fromEntries(PERIMETROS) as Record<Perimetro, string>;

interface DefProtocolo {
  nome: string; fonte: string;
  dobras: Record<Sexo, Dobra[]>;
  idade: Record<Sexo, [number, number]>;
  densidade: (soma: number, idade: number, sexo: Sexo) => number;
}

export const PROTOCOLOS: Record<Protocolo, DefProtocolo> = {
  jp7: {
    nome: 'Pollock 7 dobras', fonte: 'Jackson & Pollock (1978); Jackson, Pollock & Ward (1980)',
    dobras: { M: [...DOBRAS], F: [...DOBRAS] },
    idade: { M: [18, 61], F: [18, 55] },
    densidade: (s, i, sx) => sx === 'M'
      ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * i
      : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * i,
  },
  jp3: {
    nome: 'Pollock 3 dobras', fonte: 'Jackson & Pollock (1978); Jackson, Pollock & Ward (1980)',
    dobras: { M: ['peitoral', 'abdominal', 'coxa'], F: ['triceps', 'suprailiaca', 'coxa'] },
    idade: { M: [18, 61], F: [18, 55] },
    densidade: (s, i, sx) => sx === 'M'
      ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * i
      : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * i,
  },
  guedes: {
    nome: 'Guedes 3 dobras', fonte: 'Guedes (1985), população brasileira',
    dobras: { M: ['triceps', 'suprailiaca', 'abdominal'], F: ['coxa', 'suprailiaca', 'subescapular'] },
    idade: { M: [17, 27], F: [17, 30] },
    densidade: (s, _i, sx) => sx === 'M' ? 1.17136 - 0.06706 * Math.log10(s) : 1.1665 - 0.07063 * Math.log10(s),
  },
};

/** % de gordura alvo padrão para o peso máximo recomendável (limite de "boa forma" do ACE). */
export const ALVO_PADRAO: Record<Sexo, number> = { M: 15, F: 23 };
/** Depois de quantos dias sugerir uma reavaliação. */
export const REAVALIAR_DIAS = 90;

export interface Medidas {
  sexo: Sexo; idade: number; peso: number | null; estatura: number | null;
  protocolo: Protocolo; alvo_gordura: number | null;
  dobras: Partial<Record<Dobra, (number | null)[]>>;
  perimetros: Partial<Record<Perimetro, number | null>>;
  pa_sistolica?: number | null; pa_diastolica?: number | null;
}

export type Tom = 'ok' | 'atencao' | 'alerta';
export interface Classe { rotulo: string; tom: Tom }

export interface Resultado {
  medias: Partial<Record<Dobra, number>>;
  /** Dobras com só 2 medidas e muito diferentes entre si (falta a 3ª). */
  dispersas: Dobra[];
  /** Dobras que o protocolo usa e ainda não foram medidas. */
  faltam: Dobra[];
  somaProtocolo: number | null;
  soma7: number | null;
  densidade: number | null;
  gordura: number | null;
  massaGorda: number | null;
  massaMagra: number | null;
  alvo: number;
  pesoMaximo: number | null;
  objetivo: number | null;
  imc: number | null;
  rcq: number | null;
  rce: number | null;
  foraDaFaixa: boolean;
  classes: { gordura?: Classe; imc?: Classe; cintura?: Classe; rcq?: Classe; rce?: Classe; pressao?: Classe };
}

const positivo = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Média das medidas preenchidas (aceita 1, 2 ou 3). */
export function mediaDobra(vals: (number | null)[] | undefined): number | null {
  const v = (vals ?? []).filter(positivo);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Diferença maior que 5% entre medidas (e de pelo menos 1 mm): sinal de medida a refazer (ISAK). */
function dispersa(vals: (number | null)[] | undefined): boolean {
  const v = (vals ?? []).filter(positivo);
  if (v.length < 2) return false;
  const max = Math.max(...v), min = Math.min(...v);
  return max - min >= 1 && (max - min) / min > 0.05;
}

export function calcular(m: Medidas): Resultado {
  const p = PROTOCOLOS[m.protocolo];
  const medias: Partial<Record<Dobra, number>> = {};
  const dispersas: Dobra[] = [];
  for (const d of DOBRAS) {
    const media = mediaDobra(m.dobras[d]);
    if (media != null) medias[d] = media;
    // Com 3 medidas o protocolo já foi cumprido (a 3ª existe justamente por causa da divergência).
    const preenchidas = (m.dobras[d] ?? []).filter(positivo).length;
    if (preenchidas === 2 && dispersa(m.dobras[d])) dispersas.push(d);
  }
  const usadas = p.dobras[m.sexo];
  const faltam = usadas.filter((d) => medias[d] == null);
  const somaProtocolo = faltam.length ? null : usadas.reduce((s, d) => s + medias[d]!, 0);
  const soma7 = DOBRAS.every((d) => medias[d] != null) ? DOBRAS.reduce((s, d) => s + medias[d]!, 0) : null;

  let densidade: number | null = null, gordura: number | null = null;
  if (somaProtocolo != null && somaProtocolo > 0 && m.idade > 0) {
    densidade = p.densidade(somaProtocolo, m.idade, m.sexo);
    gordura = Math.max(0, 495 / densidade - 450);
  }
  const peso = positivo(m.peso) ? m.peso : null;
  const massaGorda = peso != null && gordura != null ? (peso * gordura) / 100 : null;
  const massaMagra = peso != null && massaGorda != null ? peso - massaGorda : null;
  const alvo = positivo(m.alvo_gordura) && m.alvo_gordura < 100 ? m.alvo_gordura : ALVO_PADRAO[m.sexo];
  const pesoMaximo = massaMagra != null ? massaMagra / (1 - alvo / 100) : null;
  const objetivo = peso != null && pesoMaximo != null ? Math.max(0, peso - pesoMaximo) : null;

  const est = positivo(m.estatura) ? m.estatura / 100 : null;
  const imc = peso != null && est != null ? peso / (est * est) : null;
  const cintura = m.perimetros.cintura, quadril = m.perimetros.quadril;
  const rcq = positivo(cintura) && positivo(quadril) ? cintura / quadril : null;
  const rce = positivo(cintura) && est != null ? cintura / (est * 100) : null;
  const [ini, fim] = p.idade[m.sexo];

  const classes: Resultado['classes'] = {};
  if (gordura != null) classes.gordura = classeGordura(gordura, m.sexo);
  if (imc != null) classes.imc = classeImc(imc);
  if (positivo(cintura)) classes.cintura = classeCintura(cintura, m.sexo);
  if (rcq != null) classes.rcq = rcq >= (m.sexo === 'M' ? 0.9 : 0.85) ? { rotulo: 'Risco aumentado', tom: 'alerta' } : { rotulo: 'Adequada', tom: 'ok' };
  if (rce != null) classes.rce = rce >= 0.6 ? { rotulo: 'Risco alto', tom: 'alerta' } : rce >= 0.5 ? { rotulo: 'Risco aumentado', tom: 'atencao' } : { rotulo: 'Adequada', tom: 'ok' };
  if (positivo(m.pa_sistolica) && positivo(m.pa_diastolica)) classes.pressao = classePressao(m.pa_sistolica, m.pa_diastolica);

  return {
    medias, dispersas, faltam, somaProtocolo, soma7, densidade, gordura, massaGorda, massaMagra, alvo, pesoMaximo, objetivo,
    imc, rcq, rce, foraDaFaixa: m.idade > 0 && (m.idade < ini || m.idade > fim), classes,
  };
}

/** Faixas do American Council on Exercise. */
export function classeGordura(g: number, sexo: Sexo): Classe {
  const [essencial, atleta, forma, aceitavel] = sexo === 'M' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (g < essencial) return { rotulo: 'Abaixo do essencial', tom: 'atencao' };
  if (g < atleta) return { rotulo: 'Atleta', tom: 'ok' };
  if (g < forma) return { rotulo: 'Boa forma', tom: 'ok' };
  if (g < aceitavel) return { rotulo: 'Aceitável', tom: 'atencao' };
  return { rotulo: 'Obesidade', tom: 'alerta' };
}

/** Organização Mundial da Saúde. */
export function classeImc(imc: number): Classe {
  if (imc < 18.5) return { rotulo: 'Abaixo do peso', tom: 'atencao' };
  if (imc < 25) return { rotulo: 'Peso normal', tom: 'ok' };
  if (imc < 30) return { rotulo: 'Sobrepeso', tom: 'atencao' };
  if (imc < 35) return { rotulo: 'Obesidade grau I', tom: 'alerta' };
  if (imc < 40) return { rotulo: 'Obesidade grau II', tom: 'alerta' };
  return { rotulo: 'Obesidade grau III', tom: 'alerta' };
}

/** Circunferência da cintura, OMS. */
export function classeCintura(c: number, sexo: Sexo): Classe {
  const [aumentado, muito] = sexo === 'M' ? [94, 102] : [80, 88];
  if (c >= muito) return { rotulo: 'Risco muito aumentado', tom: 'alerta' };
  if (c >= aumentado) return { rotulo: 'Risco aumentado', tom: 'atencao' };
  return { rotulo: 'Adequada', tom: 'ok' };
}

/** Diretriz Brasileira de Hipertensão (2020): vale a categoria mais alta entre sistólica e diastólica. */
export function classePressao(sis: number, dia: number): Classe {
  const nivel = (s: number, d: number) => Math.max(
    s >= 180 ? 5 : s >= 160 ? 4 : s >= 140 ? 3 : s >= 130 ? 2 : s >= 120 ? 1 : 0,
    d >= 110 ? 5 : d >= 100 ? 4 : d >= 90 ? 3 : d >= 85 ? 2 : d >= 80 ? 1 : 0,
  );
  const classes: Classe[] = [
    { rotulo: 'Ótima', tom: 'ok' }, { rotulo: 'Normal', tom: 'ok' }, { rotulo: 'Pré-hipertensão', tom: 'atencao' },
    { rotulo: 'Hipertensão estágio 1', tom: 'alerta' }, { rotulo: 'Hipertensão estágio 2', tom: 'alerta' }, { rotulo: 'Hipertensão estágio 3', tom: 'alerta' },
  ];
  return classes[nivel(sis, dia)];
}

/** Idade completa na data (AAAA-MM-DD). */
export function idadeEm(nascimento: string | null | undefined, data: string): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null;
  const [an, mn, dn] = nascimento.split('-').map(Number);
  const [a, m, d] = data.split('-').map(Number);
  const idade = a - an - (m < mn || (m === mn && d < dn) ? 1 : 0);
  return idade >= 0 && idade < 130 ? idade : null;
}

/** Estatura digitada em metros (1,72) ou centímetros (172): devolve centímetros. */
export function estaturaCm(v: number | null): number | null {
  if (!positivo(v)) return null;
  return v < 3 ? Math.round(v * 1000) / 10 : v;
}

// ---------- Formatação e textos (tela e PDF) ----------
export const f1 = (n: number | null | undefined, casas = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const medidasDe = (a: Avaliacao): Medidas => ({
  sexo: a.sexo, idade: a.idade, peso: a.peso, estatura: a.estatura, protocolo: a.protocolo, alvo_gordura: a.alvo_gordura,
  dobras: a.dobras, perimetros: a.perimetros, pa_sistolica: a.pa_sistolica, pa_diastolica: a.pa_diastolica,
});

export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);

/** "perdeu 1,8 kg de gordura" / "ganhou 0,6 kg de massa magra" / "manteve a gordura". */
export function frase(d: number, oque: string): string {
  if (Math.abs(d) < 0.05) return `manteve a ${oque.replace(/^de /, '')}`;
  return `${d > 0 ? 'ganhou' : 'perdeu'} ${f1(Math.abs(d))} kg ${oque}`;
}

/** Diferença maior que 5% entre duas medidas (e de pelo menos 1 mm): pede uma 3ª medida. */
export function precisaTerceira(a: number | null, b: number | null): boolean {
  return dispersa([a, b]);
}
