-- Pagamento adiantado e planos com qualquer duração.

-- Mensalidade lançada antes de o mês ser gerado (pagamento adiantado).
-- Não conta como "mês gerado": gerar o mês continua disponível e pula
-- quem já tem a mensalidade.
ALTER TABLE mensalidades ADD COLUMN adiantado INTEGER NOT NULL DEFAULT 0;

-- Duração do plano em meses (1 = mensal, 3 = trimestral, 13...).
-- A coluna periodo continua como rótulo legado.
ALTER TABLE planos ADD COLUMN meses INTEGER NOT NULL DEFAULT 1;

UPDATE planos SET meses = CASE periodo WHEN 'semestral' THEN 6 WHEN 'anual' THEN 12 ELSE 1 END;
