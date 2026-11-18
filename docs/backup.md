# Backup do banco

Duas camadas:

1. **Time Travel do D1**: automático, no nível gratuito volta a qualquer minuto dos últimos **7 dias**.
2. **Export semanal**: `.github/workflows/backup.yml` roda toda segunda, criptografa e guarda por **90 dias** em Actions → Backup.

## Voltar no tempo (últimos 7 dias)

```sh
npx wrangler d1 time-travel restore residencial --timestamp=2026-11-18T10:00:00-03:00
```

Substitui o banco inteiro pelo estado daquele momento. O comando mostra um bookmark para desfazer.

## Restaurar um backup semanal

```sh
gh run download <id-da-execução> -n backup-<número>
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in residencial-AAAA-MM-DD.sql.gz.enc -out backup.sql.gz -pass pass:'<BACKUP_SENHA>'
gunzip backup.sql.gz
```

Teste primeiro no banco local (apague `.wrangler/state` antes, para começar vazio):

```sh
npx wrangler d1 execute residencial --local --file backup.sql
```

Em produção, o export recria as tabelas, então o banco remoto precisa estar vazio antes de `--remote --file backup.sql`.

## Configuração (uma vez)

- Token em dash.cloudflare.com → Perfil → API Tokens, com permissão **Account → D1 → Edit** (só para este backup; o export não funciona com permissão de leitura).
- `gh secret set CLOUDFLARE_API_TOKEN`
- `gh secret set CLOUDFLARE_ACCOUNT_ID`
- `openssl rand -base64 32` gera a chave; `gh secret set BACKUP_SENHA` com ela. Use chave aleatória, nunca uma senha inventada: o repositório é público e qualquer pessoa logada no GitHub baixa o arquivo criptografado. Guarde a chave fora do GitHub: sem ela o backup não abre.
