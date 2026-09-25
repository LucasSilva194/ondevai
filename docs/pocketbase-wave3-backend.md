# Backend PocketBase — Onda 3

## Ambito e runtime

Este backend implementa as tres rotas da Onda 3 para PocketBase **0.40.4**:

- `POST /api/ondevai/data/replace-all`;
- `POST /api/ondevai/data/clear-all`;
- `POST /api/ondevai/account/delete`.

`pb_hooks/main.pb.js` carrega `routes/wave3.pb.js`. A validacao, fingerprint e
persistencia ficam em modulos CommonJS sem estado sob `pb_hooks/data/`; a
validacao da eliminacao da conta fica em `pb_hooks/account/`.

As APIs JSVM usadas foram confirmadas nas declaracoes geradas pelo binario
0.40.4: `$security.sha256`, `$security.equal`,
`$security.randomStringWithAlphabet`, `Record.validatePassword()`,
`e.app.runInTransaction`, `Record`, `findRecordsByFilter`, `save` e `delete`.
Nao existem chamadas externas, segredos, deploy ou acesso a PocketHost.

## Fronteira de autenticacao

As rotas usam `$apis.requireAuth('users')` e voltam a confirmar no handler que
o token pertence a `users`, que nao e de superutilizador e que o record esta
verificado. O owner e sempre `e.auth.id`.

`replace-all` rejeita campos desconhecidos, incluindo `owner`.
`account/delete` aceita exatamente `password` e `confirmation`, pelo que um
`userId` explicito e rejeitado. `clear-all` ignora qualquer owner no body e
opera exclusivamente sobre a sessao. O dashboard e as APIs administrativas
continuam funcionais pelo bypass nativo de superutilizador; um token de
superutilizador nao e aceite nas rotas publicas OndeVai.

## Collection `data_imports`

A migration `202609250200_wave3_data_imports.js` cria a collection operacional
com:

- relation `owner -> users`, obrigatoria e com cascade delete;
- `idempotencyKey` entre 8 e 200 caracteres;
- `snapshotHash` SHA-256 hex minusculo;
- `mode` (`migrate-empty` ou `replace`);
- `status` fixo `completed`;
- `counts` JSON e `completedAt` date;
- indice unico `owner + idempotencyKey`;
- indice de consulta `owner + snapshotHash`.

Todas as API rules sao `null`. Assim, a Records API publica nao lista nem
altera metadata, mas hooks/migrations e a administracao PocketBase mantem o
acesso interno. `clear-all` preserva a collection. A eliminacao do utilizador
remove-a pelo cascade. O rollback remove apenas `data_imports`.

## Validacao server-side

O backend aceita apenas a forma normalizada de `AppBackup` schema 4 e nunca
confia na validacao Angular. Antes de abrir uma transacao:

- limita o pedido JSON a 20 MiB;
- limita o total a 5 000 records;
- aplica limites de 200 categorias, 2 500 despesas, 500 rendimentos, 250
  objetivos, 1 000 movimentos, 400 orcamentos e 150 excecoes;
- limita cada categoria a 100 subcategorias e respetivo JSON a 64 KiB;
- limita JSON de recorrencia a 4 KiB e de `changes` a 8 KiB;
- rejeita campos desconhecidos e campos obrigatorios em falta;
- limita IDs legados a 200 caracteres, nomes a 80, descricoes a 140, notas a
  180 e icones a 80;
- exige valores monetarios inteiros seguros, positivos onde aplicavel;
- valida datas civis reais, incluindo dias por mes e anos bissextos, meses e
  timestamps ISO-8601 com timezone;
- valida enums, cores hex, settings EUR/pt-PT e booleanos;
- exige IDs unicos por collection, IDs de subcategoria globais unicos e ordens
  de categoria unicas;
- valida frequencia, intervalo, inicio, fim, pausa e estado das recorrencias;
- confirma categorias, subcategorias, goals e series referenciados;
- valida os campos permitidos por tipo de `changes`, incluindo
  `changes.categoryId` e a pertença da subcategoria;
- impede duplicados `month + category` e
  `seriesType + seriesId + occurrenceDate`.

Excecoes `skip` nao aceitam `changes`; `override` exige pelo menos uma
alteracao. Uma excecao tem de referir uma serie recorrente e nao pode anteceder
o inicio da serie.

### Ledger

Cada ledger e ordenado por `effectiveDate`, depois `createdAt` e, em empate,
pela ordem no array do backup. E permitido zero ou um movimento `opening`; se
existir, tem de ser o primeiro. `opening` e `deposit` somam e `withdrawal`
subtrai. Nenhum prefixo pode ter saldo negativo, nenhum calculo pode sair do
intervalo de inteiros seguros e o saldo final tem de ser exatamente
`currentAmountCents`.

## Fingerprint

O algoritmo em `pb_hooks/data/fingerprint.js` replica a Onda 2:

1. substitui `exportedAt` por string vazia;
2. ordena chaves de objetos por `localeCompare(..., 'en')`;
3. omite propriedades `undefined`;
4. preserva a ordem dos arrays;
5. serializa deterministicamente;
6. calcula SHA-256 UTF-8 com `$security.sha256`;
7. compara em tempo constante com `$security.equal`.

O fingerprint e calculado sobre o backup reconstruido pelo validador, nao
sobre dados arbitrarios do browser. Um mismatch e rejeitado antes da
transacao. O helper local compara a mesma representacao com o SHA-256 do Node.

## IDs e reescrita de relacoes

Cada collection recebe um mapa independente `ID legado -> ID PocketBase`.
Todos os IDs sao regenerados como 15 caracteres `[a-z0-9]`, mesmo que o ID de
origem ja seja valido. Antes do delete, cada candidato e verificado contra os
records existentes da respetiva collection e contra os IDs ja preparados para
o mesmo lote.

Sao reescritos:

- `expenses.category`;
- `monthly_budgets.category`;
- `savings_transactions.goal`;
- `recurrence_exceptions.seriesId`, conforme `seriesType`;
- `recurrence_exceptions.changes.categoryId`.

IDs de subcategoria permanecem intactos porque fazem parte do JSON da
categoria. Todos os mapas sao preparados dentro da mesma transacao e todas as
relacoes foram validadas antes de qualquer delete.

## Atomicidade e modos

`migrate-empty` e o modo por omissao. Dentro da transacao, depois de resolver
idempotencia, confirma que as sete collections financeiras do owner nao tem
records. Um `user_settings` isolado nao bloqueia a migracao. Se existirem dados
financeiros, responde conflito sem apagar nada.

`replace` permite a substituicao explicita. Em ambos os modos, a ordem e:

1. delete de excecoes, movimentos, orcamentos, despesas, rendimentos, goals,
   categorias e settings;
2. insert de categorias, despesas, rendimentos, goals, movimentos, orcamentos,
   excecoes e settings;
3. insert final de `data_imports` com `status=completed`.

Leituras de decisao, geracao/verificacao de IDs, deletes, inserts e metadata
usam a app recebida por uma unica `runInTransaction`. Qualquer erro reverte o
estado anterior.

`clear-all` reutiliza a mesma ordem de delete numa unica transacao, incluindo
`user_settings`, mas preserva `users` e `data_imports`. Responde `204`.

## Idempotencia e concorrencia

A consulta `owner + idempotencyKey` ocorre dentro da transacao antes de
qualquer delete:

- hash e modo iguais devolvem `already_imported` e as contagens guardadas;
- hash ou modo diferente devolve `409`;
- uma key nova so e marcada `completed` depois de todas as escritas.

O indice unico e a serializacao de writers SQLite cobrem chamadas concorrentes.
Assim, duas chamadas simultaneas com a mesma key produzem uma importacao e um
`already_imported`; uma resposta perdida pode ser repetida sem duplicar dados.
`clear-all` preserva a metadata, por isso uma key ja concluida continua a ser
idempotente mesmo depois da limpeza.

## Eliminacao da conta

`account/delete` exige a frase exata `APAGAR CONTA` e valida a password no
record `users` obtido pela app transacional com `Record.validatePassword()`.
Password ausente/incorreta usa a mensagem generica
`Nao foi possivel confirmar as credenciais.`.

O handler elimina apenas esse record `users`. O hook de cascade existente
remove os records privados na ordem topologica; a relation de `data_imports`
remove metadata. Antes do commit, o handler confirma que nao sobrou nenhum
record com aquele owner nas oito collections privadas nem em `data_imports`.
Uma falha reverte a eliminacao. Outro utilizador nao e afetado e o token antigo
deixa de autenticar depois do sucesso.

## Timestamps

Datas financeiras (`date`, `effectiveDate`, `occurrenceDate`, `month` e
`targetDate`) e `lastExportAt` sao preservadas. `createdAt` e `updatedAt` do
backup sao validados e usados para a verificacao cronologica/fingerprint, mas
nao sao forcados nos system autodate fields.

PocketBase 0.40.4 documenta esses campos como automaticos e atualizados em
create/update. Alterar `setRaw` ou o schema temporariamente seria fragil e
afetaria hooks/validacao; por isso os records importados recebem novos
`created`/`updated` tecnicos no commit. Esta limitacao nao altera nenhuma data
financeira do dominio.

## Validacao local descartavel

Executar:

```sh
./scripts/pocketbase-wave3/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase
```

O wrapper valida sintaxe e helpers e executa a suite HTTP sob
`scripts/pocketbase-wave3-tests/`. A suite usa `mktemp`, uma porta loopback e
credenciais `.invalid`, termina o processo e remove `pb_data` no fim. Cobre:

- schema 4, UUIDs/IDs estaticos e remapeamento de todas as relacoes;
- `changes.categoryId`, recorrencias, subcategorias e datas reais;
- ledger valido, inconsistente e temporariamente negativo;
- duplicados, orfaos, hash incorreto e limites;
- `migrate-empty`, `replace`, rollback e isolamento entre owners;
- retry sequencial, concorrencia, conflito de key e metadata preservada;
- `clear-all`, password/confirmacao, account cascade e token invalidado;
- auth ausente/nao verificada, superuser administrativo e mensagens seguras;
- migration up e rollback de `data_imports`.

O teste e exclusivamente local. Nao faz deploy, nao usa credenciais reais e
nao contacta servicos externos.
