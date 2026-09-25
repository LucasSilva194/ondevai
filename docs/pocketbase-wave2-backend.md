# Backend transacional PocketBase — Onda 2

## Ambito e compatibilidade

Este backend foi escrito para **PocketBase 0.40.4** e usa exclusivamente APIs
JSVM dessa versao: `routerAdd`, `$apis.requireAuth`, `e.requestInfo()`,
`e.app.runInTransaction`, `Record`, `txApp.findRecordsByFilter`, `txApp.save`
e `txApp.delete`.

O entrypoint `pb_hooks/main.pb.js` carrega `routes/wave2.pb.js`; os helpers sem
estado ficam em `pb_hooks/transactions/common.js`. Nenhum endpoint usa `$app`
dentro de uma transacao. `/api/ondevai/data/replace-all` e
`/api/ondevai/data/clear-all` continuam deliberadamente por implementar.

## Fronteira de autenticacao

Todas as rotas abaixo aceitam apenas tokens da auth collection `users`, exigem
um record verificado e derivam `owner` de `e.auth`. Um `owner` explicito no
pedido ou num record tem de coincidir com esse utilizador; nunca e usado como
fonte de autoridade.

IDs de records sao validados como 15 caracteres `[a-z0-9]`. As pesquisas
internas confirmam ownership e devolvem o mesmo erro para record inexistente ou
pertencente a outro utilizador. As respostas de erro sao mensagens seguras em
portugues e nao incluem erros SQLite, tokens ou detalhes internos.

Tokens de superutilizador nao sao aceites nas rotas publicas. O dashboard e as
migrations mantem a administracao legitima atraves do bypass nativo das API
rules e das APIs internas do PocketBase.

## Endpoints

### Poupancas

- `POST /api/ondevai/savings/goals/create`: valida o goal e, quando existe, o
  movimento `opening`; cria ambos atomicamente e devolve o goal.
- `POST /api/ondevai/savings/goals/update`: atualiza metadados sem alterar o
  saldo ou exige um `adjustment` `deposit/withdrawal` que explique exatamente a
  diferenca; devolve o goal.
- `POST /api/ondevai/savings/transactions/create`: calcula o valor assinado,
  impede saldo negativo, cria o movimento e atualiza o goal; devolve o goal.
- `POST /api/ondevai/savings/transactions/update`: nao permite mudar de goal,
  reverte o efeito anterior, aplica o novo e atualiza movimento e saldo;
  devolve o goal.
- `POST /api/ondevai/savings/transactions/delete`: reverte o efeito, impede
  saldo negativo, elimina o movimento e devolve o goal.
- `POST /api/ondevai/savings/goals/delete`: elimina primeiro todos os movimentos
  do goal e depois o goal, na mesma transacao; devolve `204`.

As transacoes SQLite serializam os writers. Como cada handler volta a ler o
saldo dentro da propria transacao, duas escritas concorrentes no mesmo goal nao
fazem read-modify-write sobre um snapshot do cliente nem perdem atualizacoes.

### Categorias, orcamentos e series

- `POST /api/ondevai/categories/bulk-upsert`: aceita no maximo 200 categorias,
  valida IDs, owners, campos, subcategorias, IDs e ordens repetidas. A lista e
  completa: quando ja existem categorias, todas elas tem de estar presentes.
  Esta regra torna uma repeticao do onboarding com novos IDs uma falha integral
  em vez de criar duplicados. Devolve os records pela ordem do pedido.
- `POST /api/ondevai/budgets/bulk-upsert`: aceita no maximo 500 orcamentos,
  valida a categoria do mesmo owner, IDs e chaves `month + category` repetidas,
  e impede conflito com o indice unico existente. Devolve os records pela ordem
  do pedido.
- `POST /api/ondevai/series/delete`: aceita `expense` ou `income`, confirma a
  serie do owner, elimina todas as respetivas `recurrence_exceptions` e depois a
  serie, devolvendo `204`.

Os bulks validam todo o pedido antes de guardar e todas as escritas continuam
dentro da mesma `runInTransaction`; uma validacao ou save falhado reverte o
conjunto completo.

## Migration de protecao

`pb_migrations/202609250100_lock_savings_writes.js` define `createRule`,
`updateRule` e `deleteRule` como `null` em `savings_goals` e
`savings_transactions`. `listRule` e `viewRule` permanecem limitadas ao owner.

O rollback repoe exatamente as rules de create/update/delete da migration
inicial, incluindo autenticacao verificada e owner imutavel. A migration nao
altera campos, indices ou outras collections.

## Validacao local descartavel

O teste completo requer PocketBase 0.40.4, `curl`, `jq`, `sqlite3` e Node.js:

```sh
./scripts/pocketbase-transactions/validate.sh /caminho/para/pocketbase
```

O script usa uma porta local configuravel (`PB_TEST_PORT`, por omissao 18093) e
um `pb_data` criado por `mktemp`. Cria apenas credenciais descartaveis, nunca
contacta PocketHost, termina o servidor e remove o diretorio no fim. Tambem
aceita `POCKETBASE_BIN` e `PB_HOOKS_DIR`.

A bateria cobre goals sem/com opening, inconsistencias, depositos,
levantamentos, edicoes, deletes, saldos negativos, update de goal, cascade de
goal, ownership cruzado, duas escritas concorrentes, rollback quando o segundo
save falha, bloqueio financeiro direto, administracao por superutilizador,
atomicidade dos dois bulks, repeticao do onboarding, eliminacao de serie e
excecoes e rollback das API rules.

Sem o executavel PocketBase, ainda e possivel validar os helpers e a sintaxe:

```sh
node scripts/pocketbase-transactions/test-helpers.js
node --check pb_hooks/transactions/common.js
node --check pb_hooks/routes/wave2.pb.js
bash -n scripts/pocketbase-transactions/validate.sh
```

## Limitacoes mantidas

- Nao existe importacao `replace-all`, `clear-all`, eliminacao de conta ou
  deploy PocketHost nesta onda.
- Os endpoints nao fazem chamadas externas nem atualizam automaticamente
  `user_settings.changesSinceExport`; esse comportamento permanece no cliente.
- Datas civis mantem a mesma validacao estrutural do schema inicial; por
  exemplo, o backend nao distingue 30 de 31 dias.
- JSON de subcategorias e validado apenas nos campos usados pelo dominio. JSON
  de recorrencia e excecoes continua sob as validacoes ja existentes.
