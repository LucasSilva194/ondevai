# Testes PocketBase — Onda 3

Esta suite usa apenas uma instância PocketBase 0.40.4 e um `pb_data` criados em
diretório temporário. Não contacta PocketHost, não usa produção e remove o
diretório que ela própria criou ao terminar.

Execução completa:

```sh
./scripts/pocketbase-wave3-tests/validate.sh /caminho/para/pocketbase
```

No ambiente de desenvolvimento usado na Onda 3:

```sh
./scripts/pocketbase-wave3-tests/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase
```

A suite valida autenticação/verificação, isolamento entre contas, conversão de
IDs e relações, `changes.categoryId`, datas e dinheiro, ledger, atomicidade face
a payload inválido, idempotência sequencial e concorrente, conflito de keys,
`migrate-empty`, `replace`, `clear-all`, preservação de metadata, eliminação da
conta, mensagens de erro seguras, limites de profundidade/tamanho e rollback da
migration. Os testes Angular cobrem a normalização frontend de backups v1–v4.
