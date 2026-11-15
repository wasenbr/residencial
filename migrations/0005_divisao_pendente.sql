-- Divisão da mensalidade por modalidade que vale a partir de um mês ainda não gerado
-- (ex.: o mês atual já foi pago). O "Gerar mês" aplica e apaga.
CREATE TABLE divisoes_pendentes (
  aluno_id INTEGER PRIMARY KEY REFERENCES alunos(id) ON DELETE CASCADE,
  a_partir TEXT NOT NULL,
  partes TEXT NOT NULL
);
