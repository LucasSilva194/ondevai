# Contrato PocketBase — Onda 3

Este documento fixa o contrato partilhado da Onda 3. O alvo é PocketBase
0.40.4 numa instância local descartável. Não autoriza deploy, credenciais
reais, remoção de Dexie, sincronização offline bidirecional ou alterações
retroativas às migrations já aplicadas.

## Autenticação e isolamento

As três rotas públicas desta onda aceitam exclusivamente uma sessão válida da
auth collection `users` com `verified = true`. O `owner` é sempre derivado de
`e.auth.id`; nenhum ID de utilizador recebido no body é fonte de autoridade.
Tokens de superutilizador não são aceites por estas rotas. Erros de validação,
autorização, password e conflito não revelam records, SQL, tokens ou detalhes
de outra conta.

## Endpoints

### `POST /api/ondevai/data/replace-all`

Pedido normalizado:

```json
{
  "mode": "migrate-empty",
  "idempotencyKey": "tentativa-opaca",
  "snapshotHash": "sha256-hex",
  "backup": { "schemaVersion": 4 }
}
```

`mode` aceita `migrate-empty` e `replace`. A omissão mantém compatibilidade com
o cliente da Onda 2 e equivale a `migrate-empty`. `migrate-empty` só importa se
as sete coleções financeiras estiverem vazias; um `user_settings` isolado não
conta como dados financeiros. `replace` substitui explicitamente os dados do
próprio utilizador, incluindo settings, sem apagar a conta nem metadata de
idempotência.

Resposta `200`:

```json
{
  "status": "imported",
  "counts": {
    "categories": 0,
    "expenses": 0,
    "monthlyIncomes": 0,
    "savingsGoals": 0,
    "savingsTransactions": 0,
    "monthlyBudgets": 0,
    "recurrenceExceptions": 0
  }
}
```

`status` é `imported` ou `already_imported`. As contagens são calculadas pelo
servidor.

### `POST /api/ondevai/data/clear-all`

Não recebe owner. Apaga atomicamente as sete coleções financeiras e
`user_settings` do utilizador autenticado. Preserva `users`, `data_imports` e
qualquer outro utilizador. Responde `204`; uma falha reverte todos os deletes.

### `POST /api/ondevai/account/delete`

```json
{ "password": "PASSWORD_ATUAL", "confirmation": "APAGAR CONTA" }
```

Exige a frase exata e valida a password atual server-side com a API suportada
pelo PocketBase 0.40.4. Uma password incorreta produz mensagem genérica. O
handler elimina apenas `e.auth` dentro de uma transação; cascades e hooks
removem os dados privados e `data_imports`. Responde `204`. Não recebe
`userId`. Depois do sucesso, o cliente para realtime, limpa AppStore e
authStore e navega para `/entrar`; o IndexedDB legado não é apagado.

## Backup aceite e limites

O servidor aceita somente a representação normalizada `AppBackup` schema 4.
Backups 1–3 são migrados e validados no frontend antes do upload. O backend
aplica limites próprios antes de escrever: pedido até 20 MiB, até 5 000 records
totais e limites por coleção documentados pelo backend; strings e JSON de
recorrência/subcategorias/changes também têm limites finitos. Payloads
demasiado grandes ou profundamente aninhados são rejeitados sem escritas.

São validados tipos, campos obrigatórios, enums, inteiros monetários seguros,
datas civis reais, meses, timestamps ISO quando presentes, unicidade de IDs em
cada coleção, categorias e subcategorias referenciadas, goals e séries,
`changes.categoryId`, unicidade de orçamento e exceção e todas as regras de
recorrência. O servidor recalcula cada ledger: opening/deposit somam,
withdrawal subtrai, o saldo nunca pode ficar negativo na ordem cronológica e o
resultado tem de coincidir com `currentAmountCents`. IDs e relações órfãs são
rejeitados antes da transação de substituição.

## Fingerprint

O hash mantém exatamente a semântica da Onda 2. Primeiro normaliza o backup
schema 4 definindo `exportedAt` como string vazia. Depois serializa
deterministicamente: chaves de objetos ordenadas com locale `en`, propriedades
`undefined` omitidas e ordem dos arrays preservada. O SHA-256 usa UTF-8 e é
representado por 64 caracteres hex minúsculos. O servidor recalcula o hash da
representação que validou e rejeita mismatch. O frontend partilha esta lógica
em `src/app/core/backup/backup-fingerprint.ts`.

## Conversão de IDs

Cada coleção importada recebe um mapa independente `ID antigo -> ID PocketBase`
e IDs novos de 15 caracteres `[a-z0-9]`, mesmo quando o ID de origem já parece
válido. Assim não há colisões com records existentes. São reescritas
`expenses.category`, `monthly_budgets.category`,
`savings_transactions.goal`, `recurrence_exceptions.seriesId` consoante
`seriesType` e `recurrence_exceptions.changes.categoryId`. IDs de
subcategorias, por viverem em JSON, são preservados.

## Ordem e atomicidade

Delete: `recurrence_exceptions`, `savings_transactions`, `monthly_budgets`,
`expenses`, `monthly_incomes`, `savings_goals`, `categories`, `user_settings`.
Insert: `categories`, `expenses`, `monthly_incomes`, `savings_goals`,
`savings_transactions`, `monthly_budgets`, `recurrence_exceptions`,
`user_settings`, seguido de `data_imports`. Todas as leituras de decisão,
deletes, inserts e metadata usam a mesma `runInTransaction` e a app
transacional. Uma falha preserva integralmente o estado anterior.

Datas financeiras (`date`, `effectiveDate`, `occurrenceDate`, `month` e
`targetDate`) e `lastExportAt` válido são preservados. `createdAt`/`updatedAt`
só são preservados se a API interna 0.40.4 o suportar de forma estável; caso
contrário, os timestamps técnicos são recriados e isso deve ser documentado.

## Idempotência

A collection interna `data_imports` tem rules de cliente bloqueadas, relation
owner com cascade delete, os campos `idempotencyKey`, `snapshotHash`, `mode`,
`status=completed`, `counts`, `completedAt`, índice único
`owner + idempotencyKey` e índice `owner + snapshotHash`. `clear-all` não a
apaga e exportações não a incluem.

Dentro da transação, uma key já concluída com o mesmo hash e mode responde
`already_imported`; com conteúdo diferente responde conflito. O record só é
criado após todas as escritas. O índice único serializa retries concorrentes,
impede duplicação e permite repetir uma resposta perdida. A eliminação da conta
remove esta metadata através do cascade.

## Privacidade e offline

Os dados ativos são guardados na conta cloud. A aplicação pode manter em
memória o último snapshot apresentado, mas quando está offline não promete
leituras atuais nem novas escritas. Exportação JSON continua disponível; a
importação manual usa sempre `replace` com confirmação explícita; a migração
Dexie usa `migrate-empty`. Clear-all mantém a sessão e regressa ao onboarding.
Dexie permanece instalado e nenhum destes fluxos apaga automaticamente os
dados locais antigos.
