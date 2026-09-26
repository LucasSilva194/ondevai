# Validacao transacional PocketBase

`validate.sh` cria um `pb_data` temporario, aplica todas as migrations, arranca
PocketBase apenas em `127.0.0.1`, cria dois utilizadores e um superutilizador
descartaveis e exercita os endpoints da Onda 2. O diretorio temporario e
removido no fim, mesmo se um teste falhar.

Requisitos: PocketBase **0.40.4**, `curl`, `jq`, `sqlite3` e Node.js.

```sh
./scripts/pocketbase-transactions/validate.sh /caminho/para/pocketbase
```

Tambem podem ser definidos `POCKETBASE_BIN`, `PB_HOOKS_DIR` e
`PB_TEST_PORT`. O script nunca contacta PocketHost nem uma instancia remota.

Os testes cobrem criacao/edicao/eliminacao de objetivos e movimentos,
invariantes de saldo, ownership, concorrencia, rollback, bloqueio da Records
API financeira, bypass administrativo, bulks atomicos, repeticao do onboarding,
eliminacao de series/excecoes e rollback da migration de rules.
