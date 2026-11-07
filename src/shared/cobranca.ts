import { nomeComp } from './comp';
import { brl } from './resumo';

export const MSG_COBRANCA_PADRAO =
  'Olá, {nome}! Tudo bem? Passando para lembrar da mensalidade de {mes} no valor de {valor}, com vencimento em {vencimento}. Se já pagou, por favor desconsidere. Obrigado! {academia}';

export interface Cobravel {
  nome: string;
  telefone?: string | null;
  responsavel?: string | null;
  responsavel_tel?: string | null;
}

/** Número para o WhatsApp: o do responsável quando houver, senão o do aluno. */
export function foneCobranca(a: Cobravel): string | null {
  const bruto = (a.responsavel_tel || a.telefone || '').replace(/\D/g, '');
  if (bruto.length < 10) return null;
  return bruto.startsWith('55') && bruto.length >= 12 ? bruto : '55' + bruto;
}

/** Link wa.me com a mensagem de cobrança já preenchida; null se não houver telefone. */
export function linkCobranca(
  a: Cobravel,
  info: { competencia: string; valor: number; vencimento: string | null },
  modelo: string | undefined,
  academia: string,
): string | null {
  const fone = foneCobranca(a);
  if (!fone) return null;
  const quem = a.responsavel_tel && a.responsavel ? a.responsavel : a.nome;
  const venc = info.vencimento ? info.vencimento.split('-').reverse().slice(0, 2).join('/') : '—';
  const texto = (modelo?.trim() || MSG_COBRANCA_PADRAO)
    .replaceAll('{nome}', quem.split(' ')[0])
    .replaceAll('{aluno}', a.nome)
    .replaceAll('{mes}', nomeComp(info.competencia, true).toLowerCase())
    .replaceAll('{valor}', brl(info.valor, !Number.isInteger(info.valor)))
    .replaceAll('{vencimento}', venc)
    .replaceAll('{academia}', academia)
    .trim();
  return `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`;
}
