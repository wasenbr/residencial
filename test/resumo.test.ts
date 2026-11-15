import { expect, test } from 'vitest';
import { calcularResumo, type DadosResumo } from '../src/shared/resumo';
import type { Config, Matricula, Mensalidade, Turma } from '../src/shared/tipos';

const turma = (id: number, modalidade_id: number, ativo = 1): Turma => ({
  id, modalidade_id, nome: `T${id}`, dias: null, horario: null, aulas_semana: 2, vagas: null, professor_id: null, ativo,
});
const mens = (id: number, aluno_id: number, modalidade_id: number | null, valor = 100, cancelada = 0): Mensalidade => ({
  id, aluno_id, contrato_id: null, competencia: '2026-11', modalidade_id, descricao: null, valor, vencimento: '2026-11-10',
  observacao: null, cancelada, adiantado: 0,
});
let mid = 0;
const mat = (aluno_id: number, turma_id: number): Matricula => ({ id: ++mid, aluno_id, turma_id, inicio: null });

function dados(p: Partial<DadosResumo>): DadosResumo {
  return {
    competencia: '2026-11', hoje: '2026-11-15', config: { dia_vencimento: 10, cartao_caixa: 'seguinte' } as Config,
    modalidades: [{ id: 3, nome: 'Spinning', ordem: 1 }, { id: 5, nome: 'Step', ordem: 2 }],
    professores: [], turmas: [], matriculas: [], alunos: [], mensalidades: [], pagamentos: [], pagamentosCaixa: [],
    pagamentosCaixaSeguinte: [], gympassAnteriorEstimado: null, repasseAnterior: null, mesAnteriorExiste: false,
    saldosImportados: [], despesas: [], ...p,
  };
}

test('Dashboard conta matrículas por turma, como a tela Turmas', () => {
  const r = calcularResumo(dados({
    turmas: [turma(7, 3), turma(8, 3), turma(9, 3, 0), turma(20, 5)],
    alunos: [1, 2, 3, 4, 5, 6].map((id) => ({ id, nome: `A${id}`, ativo: id === 6 ? 0 : 1, origem: 'particular' })),
    matriculas: [
      mat(1, 7), mat(1, 8),     // nas duas turmas de Spinning: 2 matrículas
      mat(2, 7), mat(2, 9),     // turma 9 inativa: só 1
      mat(3, 7), mat(3, 20),    // mensalidade sem modalidade, rateada entre Spinning e Step
      mat(4, 8),                // mensalidade cancelada: não conta
      mat(6, 7),                // aluno inativo: não conta
    ],
    mensalidades: [
      mens(1, 1, 3), mens(2, 2, 3), mens(3, 3, null), mens(4, 4, 3, 100, 1),
      mens(5, 5, 3),            // sem turma de Spinning: conta 1
      mens(6, 6, 3, 50),        // inativo: fora da contagem, mas o valor fica no faturamento
    ],
  }));
  const sp = r.porModalidade.find((m) => m.nome === 'Spinning')!;
  expect(sp.alunos).toBe(4);
  expect(sp.matriculasTurmas).toBe(5);
  expect(sp.faturamento).toBe(400);
  expect(r.porModalidade.find((m) => m.nome === 'Step')!.matriculasTurmas).toBe(1);
});
