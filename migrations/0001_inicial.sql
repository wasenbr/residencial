-- Estrutura inicial do sistema de gestão do estúdio.
-- Competências são sempre 'AAAA-MM'. Datas são 'AAAA-MM-DD'. Valores em reais.

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT INTO config (chave, valor) VALUES
  ('nome_academia', 'Minha academia'),
  ('nome_usuario', ''),
  ('dia_vencimento', '10'),
  ('desconto_familia', '20'),
  ('cartao_caixa', 'seguinte'),      -- 'seguinte' ou 'mesmo': quando o crédito entra no caixa
  ('aviso_contrato_dias', '30'),
  ('gympass_2x', '80'),
  ('gympass_3x', '100'),
  ('gympass_5x', '130');

CREATE TABLE modalidades (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE professores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  funcao TEXT,
  regra TEXT NOT NULL DEFAULT 'nenhum' CHECK (regra IN ('percentual', 'fixo', 'nenhum')),
  valor REAL NOT NULL DEFAULT 0,          -- % para 'percentual', R$ para 'fixo'
  modalidade_id INTEGER REFERENCES modalidades(id),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE turmas (
  id INTEGER PRIMARY KEY,
  modalidade_id INTEGER NOT NULL REFERENCES modalidades(id),
  nome TEXT NOT NULL,
  dias TEXT,
  horario TEXT,
  aulas_semana INTEGER NOT NULL DEFAULT 1,
  vagas INTEGER,
  professor_id INTEGER REFERENCES professores(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (modalidade_id, nome)
);

CREATE TABLE planos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'frequencia' CHECK (categoria IN ('frequencia', 'personal', 'fixo')),
  aulas_semana INTEGER,
  periodo TEXT NOT NULL DEFAULT 'mensal' CHECK (periodo IN ('mensal', 'semestral', 'anual')),
  valor REAL NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE alunos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  chave TEXT,                              -- nome normalizado, usado pela importação
  telefone TEXT,
  nascimento TEXT,
  responsavel TEXT,
  responsavel_tel TEXT,
  familia TEXT,
  origem TEXT NOT NULL DEFAULT 'particular' CHECK (origem IN ('particular', 'gympass')),
  ativo INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX alunos_chave ON alunos (chave);

CREATE TABLE matriculas (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  inicio TEXT,
  UNIQUE (aluno_id, turma_id)
);

CREATE TABLE contratos (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  plano TEXT NOT NULL,
  periodo TEXT NOT NULL DEFAULT 'mensal' CHECK (periodo IN ('mensal', 'semestral', 'anual')),
  valor_mensal REAL NOT NULL,
  desconto REAL NOT NULL DEFAULT 0,
  inicio TEXT NOT NULL,                    -- competência do primeiro mês
  meses INTEGER,                           -- duração; vazio = sem prazo
  encerrado_em TEXT
);

CREATE TABLE mensalidades (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  contrato_id INTEGER REFERENCES contratos(id) ON DELETE SET NULL,
  competencia TEXT NOT NULL,
  modalidade_id INTEGER REFERENCES modalidades(id), -- vazio = rateado pelas turmas do aluno
  descricao TEXT,
  valor REAL NOT NULL,
  vencimento TEXT,
  observacao TEXT,
  cancelada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX mensalidades_comp ON mensalidades (competencia);
CREATE INDEX mensalidades_aluno ON mensalidades (aluno_id);

CREATE TABLE pagamentos (
  id INTEGER PRIMARY KEY,
  mensalidade_id INTEGER NOT NULL REFERENCES mensalidades(id) ON DELETE CASCADE,
  valor REAL NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('dinheiro', 'pix', 'debito', 'credito', 'gympass')),
  data TEXT NOT NULL,
  caixa TEXT NOT NULL,                     -- competência em que o dinheiro entra no caixa
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX pagamentos_mens ON pagamentos (mensalidade_id);
CREATE INDEX pagamentos_caixa ON pagamentos (caixa);

CREATE TABLE despesas_fixas (
  id INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  dia INTEGER,
  valor REAL,                              -- vazio = valor muda todo mês (luz, água)
  categoria TEXT NOT NULL DEFAULT 'Contas',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE despesas (
  id INTEGER PRIMARY KEY,
  competencia TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Outros',
  tipo TEXT NOT NULL DEFAULT 'variavel' CHECK (tipo IN ('fixa', 'variavel', 'pessoal', 'retirada')),
  valor REAL NOT NULL DEFAULT 0,
  vencimento TEXT,
  pago_em TEXT,
  despesa_fixa_id INTEGER REFERENCES despesas_fixas(id) ON DELETE SET NULL,
  professor_id INTEGER REFERENCES professores(id) ON DELETE SET NULL
);
CREATE INDEX despesas_comp ON despesas (competencia);

CREATE TABLE gympass_repasses (
  competencia TEXT PRIMARY KEY,            -- competência do uso; o dinheiro chega no mês seguinte
  real REAL NOT NULL,
  recebido_em TEXT,
  justificativa TEXT
);

-- Valores que vieram da planilha e que pertencem a meses ainda não migrados
-- (ex.: cartão e Gympass do mês anterior). Só entram no caixa enquanto o mês
-- anterior não existir no sistema.
CREATE TABLE saldos_importados (
  competencia TEXT NOT NULL,
  chave TEXT NOT NULL CHECK (chave IN ('credito_anterior', 'gympass_anterior')),
  valor REAL NOT NULL,
  PRIMARY KEY (competencia, chave)
);

CREATE TABLE fechamentos (
  competencia TEXT PRIMARY KEY,
  fechado_em TEXT NOT NULL,
  resumo TEXT NOT NULL                     -- JSON do resumo no momento do fechamento
);

CREATE TABLE importacoes (
  id INTEGER PRIMARY KEY,
  competencia TEXT NOT NULL,
  arquivo TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  relatorio TEXT NOT NULL                  -- JSON com avisos e conferência
);
