# Gestão do estúdio

Sistema que substitui a planilha “Fechamento <mês>”: alunos, turmas, mensalidades, Gympass, despesas e fechamento do mês, no computador e no celular. Roda no Cloudflare Pages com banco D1 (SQLite gerenciado), sem servidor para manter.

## O que ele faz melhor que a planilha

- **Competência separada de caixa.** O faturamento é do mês da mensalidade; o dinheiro só entra no caixa quando chega. Cartão de crédito e Gympass entram no mês seguinte, e o fechamento mostra isso (a planilha somava o que estava em aberto como recebido).
- **Pagamento parcial** deixa saldo em aberto; atrasos aparecem sozinhos depois do vencimento.
- **Gympass:** estimado no mês, com conciliação contra o repasse real no mês seguinte.
- **Repasses e salários calculados** (porcentagem do recebido ou valor fixo) a partir das regras em Configurações.
- **Fechar o mês** trava os lançamentos, e dá para reabrir. Exporta CSV e JSON.
- **Cadastro único de alunos:** o mesmo aluno em várias turmas é uma pessoa só, e nomes parecidos (“Susete” × “Suseti”) são sugeridos para unificar.
- **Contratos** semestrais e anuais, com aviso de renovação.
- **Celular:** início, receber pagamento, novo aluno e lançar despesa.
- **Importa as planilhas antigas**, mês a mês, e mostra uma conferência com a aba Fechamento de cada uma.

## Colocar no ar (Cloudflare)

1. Crie o banco: `npx wrangler d1 create residencial` e copie o `database_id` para `wrangler.toml`.
2. Crie as tabelas: `npx wrangler d1 migrations apply residencial --remote`.
3. No painel da Cloudflare, em Workers & Pages, crie um projeto Pages ligado a este repositório:
   - comando de build: `npm run build`
   - pasta de saída: `dist`
   - o binding `DB` do D1 vem do `wrangler.toml`.
4. **Login:** em Zero Trust > Access > Applications, proteja o domínio do projeto (`*.pages.dev` ou o seu) com uma política que libere só os e-mails das pessoas autorizadas. O sistema não tem tela de senha: o acesso é todo pelo Cloudflare Access (gratuito até 50 pessoas).
5. Abra o sistema, vá em **Importar planilha** e envie as planilhas de cada mês. Depois ajuste nome, planos e regras em **Configurações**.

No celular, abra o endereço no navegador e use “Adicionar à tela inicial” para instalar como app.

## Desenvolvimento

```
npm install
npm run db:local          # cria as tabelas no D1 local
npm run build
npx wrangler pages dev dist --port 8788
npm test                  # leitor da planilha, importador, caixa e fechamento
npm run typecheck
```

Estrutura: `functions/api` (API, Hono), `src/server` (rotas), `src/shared` (cálculos compartilhados), `src/import` (leitura e gravação das planilhas), `src/pages` (telas), `migrations` (SQL do D1).

## Como a importação lê a planilha

- Cada aba de modalidade vira uma modalidade, e cada bloco lado a lado vira uma turma (nome e horário saem do título do bloco).
- Cada linha com nome vira uma mensalidade, com as formas de pagamento (dinheiro, Gympass, débito, crédito) lidas das colunas. Marcado “pago” sem forma é tratado como dinheiro, com aviso.
- Linhas sem pagamento e sem valor usam o preço da aba “Alunos”, se existir.
- Textos como “pago 5/6” ou “pago 11/12” criam contratos semestral e anual.
- A aba Fechamento dá as contas fixas, o cartão e o Gympass do mês anterior, e serve de conferência.
- Reimportar o mesmo mês substitui os dados daquele mês (a menos que esteja fechado).
