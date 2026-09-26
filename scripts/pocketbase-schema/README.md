# Validação descartável do schema PocketBase

O script `validate.sh` cria um `pb_data` temporário, aplica a migration, arranca
PocketBase apenas em `127.0.0.1` com `pb_hooks` como `hooksDir`, cria credenciais exclusivamente descartáveis,
executa testes HTTP de segurança e reverte a migration. O diretório temporário é
removido no fim, mesmo quando um teste falha.

Requisitos: PocketBase 0.40.4, `curl`, `jq` e `sqlite3`.

```sh
./scripts/pocketbase-schema/validate.sh /caminho/para/pocketbase
```

Também é possível definir `POCKETBASE_BIN`, `PB_HOOKS_DIR` e, em caso de
conflito local, `PB_TEST_PORT`:

```sh
POCKETBASE_BIN=/caminho/para/pocketbase PB_TEST_PORT=18092 \
  ./scripts/pocketbase-schema/validate.sh
```

O teste cobre verificação obrigatória de email, criação/leitura do próprio
utilizador, isolamento entre dois utilizadores, update/delete cruzado,
imutabilidade de `owner`, relações de categoria/objetivo/série do mesmo owner,
creates e updates de relações, validações de campos, bypass administrativo de
superutilizador, cascade delete por `owner`, os três índices únicos e reversão
completa.
