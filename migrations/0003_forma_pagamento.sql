-- Forma de pagamento habitual do aluno (dinheiro, pix, débito, crédito, gympass).
-- Vem marcada ao registrar o pagamento; vazio = Pix.
ALTER TABLE alunos ADD COLUMN forma_pagamento TEXT;
