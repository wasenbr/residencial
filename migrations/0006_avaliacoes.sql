-- Avaliação física (composição corporal por dobras cutâneas, perímetros e sinais vitais).

-- Sexo do aluno: as equações de densidade corporal são diferentes para homens e mulheres.
ALTER TABLE alunos ADD COLUMN sexo TEXT CHECK (sexo IN ('M', 'F'));

-- Cada avaliação guarda as medidas brutas; os resultados (densidade, % de gordura,
-- massas, índices) são calculados em src/shared/avaliacao.ts.
-- Sexo e idade ficam guardados para a avaliação antiga não mudar se o cadastro mudar.
CREATE TABLE avaliacoes (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                      -- AAAA-MM-DD
  avaliador TEXT,
  sexo TEXT NOT NULL CHECK (sexo IN ('M', 'F')),
  idade INTEGER NOT NULL,
  peso REAL,                               -- kg
  estatura REAL,                           -- cm
  protocolo TEXT NOT NULL DEFAULT 'jp7' CHECK (protocolo IN ('jp7', 'jp3', 'guedes')),
  alvo_gordura REAL,                       -- % de gordura alvo para o peso máximo recomendável
  dobras TEXT NOT NULL DEFAULT '{}',       -- JSON { local: [m1, m2, m3] } em mm
  perimetros TEXT NOT NULL DEFAULT '{}',   -- JSON { local: cm }
  pa_sistolica INTEGER,
  pa_diastolica INTEGER,
  fc_repouso INTEGER,
  laudo TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX avaliacoes_aluno ON avaliacoes (aluno_id, data);
