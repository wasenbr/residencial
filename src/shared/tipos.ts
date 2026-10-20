export type Forma = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'gympass';
export const FORMAS: Forma[] = ['dinheiro', 'pix', 'debito', 'credito', 'gympass'];
export const NOME_FORMA: Record<Forma, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  gympass: 'Gympass',
};

export interface Config {
  nome_academia: string;
  nome_usuario: string;
  dia_vencimento: number;
  desconto_familia: number;
  cartao_caixa: 'seguinte' | 'mesmo';
  aviso_contrato_dias: number;
  gympass_2x: number;
  gympass_3x: number;
  gympass_5x: number;
}

export interface Modalidade { id: number; nome: string; ordem: number }

export interface Professor {
  id: number; nome: string; funcao: string | null;
  regra: 'percentual' | 'fixo' | 'nenhum'; valor: number;
  modalidade_id: number | null; ativo: number;
}

export interface Turma {
  id: number; modalidade_id: number; nome: string; dias: string | null; horario: string | null;
  aulas_semana: number; vagas: number | null; professor_id: number | null; ativo: number;
}

export interface Plano {
  id: number; nome: string; categoria: 'frequencia' | 'personal' | 'fixo';
  aulas_semana: number | null; periodo: 'mensal' | 'semestral' | 'anual'; valor: number; ativo: number;
}

export interface Aluno {
  id: number; nome: string; chave: string | null; telefone: string | null; nascimento: string | null;
  responsavel: string | null; responsavel_tel: string | null; familia: string | null;
  origem: 'particular' | 'gympass'; ativo: number; observacoes: string | null; criado_em: string;
}

export interface Matricula { id: number; aluno_id: number; turma_id: number; inicio: string | null }

export interface Contrato {
  id: number; aluno_id: number; plano: string; periodo: 'mensal' | 'semestral' | 'anual';
  valor_mensal: number; desconto: number; inicio: string; meses: number | null; encerrado_em: string | null;
}

export interface Mensalidade {
  id: number; aluno_id: number; contrato_id: number | null; competencia: string;
  modalidade_id: number | null; descricao: string | null; valor: number; vencimento: string | null;
  observacao: string | null; cancelada: number;
}

export interface Pagamento {
  id: number; mensalidade_id: number; valor: number; forma: Forma; data: string; caixa: string;
}

export interface Despesa {
  id: number; competencia: string; descricao: string; categoria: string;
  tipo: 'fixa' | 'variavel' | 'pessoal' | 'retirada'; valor: number; vencimento: string | null;
  pago_em: string | null; despesa_fixa_id: number | null; professor_id: number | null;
}

export interface DespesaFixa {
  id: number; descricao: string; dia: number | null; valor: number | null; categoria: string; ativo: number;
}

export interface GympassRepasse { competencia: string; real: number; recebido_em: string | null; justificativa: string | null }
