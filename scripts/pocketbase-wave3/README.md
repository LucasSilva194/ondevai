# Validacao local — PocketBase Onda 3

Executar a bateria completa numa instancia local descartavel:

```sh
./scripts/pocketbase-wave3/validate.sh /caminho/para/pocketbase
```

O executavel tem de ser PocketBase 0.40.4. O script nunca contacta PocketHost,
cria apenas utilizadores e credenciais efemeros sob `mktemp` e remove o
diretorio ao terminar. `PB_TEST_PORT` permite mudar a porta local.

Sem o binario, os testes puros e de sintaxe continuam disponiveis:

```sh
node scripts/pocketbase-wave3/test-helpers.js
node --check pb_hooks/data/validation.js
node --check pb_hooks/data/operations.js
bash -n scripts/pocketbase-wave3/validate.sh
```
