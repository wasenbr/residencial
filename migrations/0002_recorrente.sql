-- Alunos com cobrança recorrente no cartão: o pagamento cai sozinho todo mês.
ALTER TABLE alunos ADD COLUMN recorrente INTEGER NOT NULL DEFAULT 0;

-- Mensagem de cobrança pelo WhatsApp. Marcadores: {nome}, {mes}, {valor}, {vencimento}, {academia}.
INSERT OR IGNORE INTO config (chave, valor) VALUES
  ('msg_cobranca', 'Olá, {nome}! Tudo bem? Passando para lembrar da mensalidade de {mes} no valor de {valor}, com vencimento em {vencimento}. Se já pagou, por favor desconsidere. Obrigado! {academia}');
