# Contrato PocketBase — Onda 2

Este documento fixa o contrato de integração da segunda onda. O PocketBase 0.40.4 é o backend ativo para sessões autenticadas e verificadas. Dexie permanece instalado e a base `ondevai` é usada apenas para detetar e preparar a migração de dados legados; esta onda não apaga dados locais nem faz deploy.

## Configuração e autenticação

- O SDK partilhado recebe a origem através do `InjectionToken` `POCKETBASE_URL`. O valor por omissão é `http://127.0.0.1:8090`; a futura URL PocketHost será fornecida no bootstrap/configuração do ambiente, sem credenciais nem URL privada no bundle.
- O arranque chama primeiro `AuthService.initialize()`. Só uma sessão autenticada e verificada pode carregar coleções privadas e iniciar realtime.
- Um token rejeitado com 401/403 é limpo e as rotas privadas encaminham para `/entrar`. Uma falha temporária de rede preserva a sessão local e nunca apaga dados já apresentados.
- As rotas `/entrar`, `/registar`, `/recuperar-password` e `/repor-password` são públicas para visitantes. `/confirmar-email` também permanece acessível sem sessão para aceitar callbacks por token. As rotas de dados exigem `authGuard` e `verifiedGuard`.
- Login/troca de utilizador: parar subscrições anteriores, limpar estado visível, carregar o snapshot do utilizador atual, aplicar eventos enfileirados, iniciar o estado normal de realtime e só depois detetar dados Dexie.
- Logout: parar realtime, limpar o `AppStore`, limpar o auth store e navegar para `/entrar`. O IndexedDB não é apagado.

## Identidade de records

Todo record novo criado para PocketBase usa um ID aleatório de 15 caracteres `[a-z0-9]`, incluindo categorias, despesas, rendimentos, objetivos, movimentos, orçamentos e exceções de recorrência. IDs de subcategorias são valores internos ao JSON e continuam a poder ser UUIDs ou IDs legados.

Categorias sugeridas recebem novos IDs PocketBase quando são persistidas. Os IDs estáticos do catálogo servem apenas para apresentação. A operação só corre quando a conta não tem categorias e o bulk server-side é atómico, impedindo duplicação numa repetição normal do onboarding.

Exceções de recorrência são semanticamente únicas por `owner + seriesType + seriesId + occurrenceDate`. O cliente procura essa chave e atualiza o record encontrado; só cria um record com ID novo quando recebe 404. Outros erros são propagados.

## Endpoints transacionais

Todos os endpoints exigem um utilizador `users` autenticado e verificado, derivam `owner` de `e.auth.id`, rejeitam um owner explícito divergente, validam IDs/ownership dentro de `e.app.runInTransaction(...)` e fazem todas as leituras e escritas através de `txApp`. Erros não revelam records de outro utilizador.

### Poupanças

`POST /api/ondevai/savings/goals/create`

```json
{ "owner": "USER_ID", "goal": { "id": "PB_ID", "owner": "USER_ID", "name": "Reserva", "kind": "reserve", "targetAmountCents": 100000, "currentAmountCents": 1000, "monthlyContributionCents": 100, "targetDate": "2027-01-01" }, "opening": { "id": "PB_ID", "owner": "USER_ID", "goal": "GOAL_ID", "type": "opening", "amountCents": 1000, "effectiveDate": "2026-09-25", "note": "Saldo inicial" } }
```

Cria goal e opening em conjunto. Sem opening, o saldo tem de ser zero; com opening, goal, tipo e valor têm de coincidir. Responde com o record `savings_goals` criado.

`POST /api/ondevai/savings/goals/update`

Recebe `{ owner, goal, adjustment? }`. Sem adjustment o saldo não muda; com adjustment o saldo final corresponde ao saldo anterior mais o valor assinado, nunca abaixo de zero. Responde com o goal atualizado.

`POST /api/ondevai/savings/transactions/create` e `POST /api/ondevai/savings/transactions/update`

Recebem `{ owner, transaction }`. Create aplica o valor assinado ao goal. Update reverte o movimento anterior, não permite mudar de goal e aplica o novo valor. Ambos respondem com o goal atualizado.

`POST /api/ondevai/savings/transactions/delete`

Recebe `{ "id": "TRANSACTION_ID", "owner": "USER_ID" }`, reverte o efeito sem permitir saldo negativo, elimina o movimento e responde com o goal atualizado.

`POST /api/ondevai/savings/goals/delete`

Recebe `{ "id": "GOAL_ID", "owner": "USER_ID" }`, elimina movimentos e goal atomicamente e responde sem conteúdo.

Escritas diretas pela Records API em `savings_goals` e `savings_transactions` ficam bloqueadas para clientes; list/view continuam filtrados pelo owner. Administração legítima do PocketBase continua disponível.

### Operações bulk e séries

`POST /api/ondevai/categories/bulk-upsert`

Recebe `{ owner, categories: CategoryRecordData[] }`, com limite server-side. Valida IDs, owner, campos e IDs repetidos, cria/atualiza tudo numa transação e responde com `CategoryRecord[]`.

`POST /api/ondevai/budgets/bulk-upsert`

Recebe `{ owner, budgets: BudgetRecordData[] }`. Valida IDs, owner das categorias, duplicados e a chave única `owner + month + category`, executa uma transação e responde com `BudgetRecord[]`.

`POST /api/ondevai/series/delete`

Recebe `{ "seriesType": "expense" | "income", "seriesId": "PB_ID" }`. Confirma ownership, apaga todas as `recurrence_exceptions` da série e a própria série na mesma transação. Responde sem conteúdo.

## Contrato realtime

São subscritas as collections `user_settings`, `categories`, `expenses`, `monthly_incomes`, `savings_goals`, `savings_transactions`, `monthly_budgets` e `recurrence_exceptions`.

Cada evento tem a forma do SDK PocketBase `{ action: "create" | "update" | "delete", record }`. O record é mapeado pelos mappers existentes. Eventos com `record.owner` diferente do utilizador atual são ignorados. Create/update fazem upsert por ID; delete remove por ID. Eventos locais repetidos por SSE são idempotentes.

As subscrições começam antes ou durante o snapshot. Eventos recebidos enquanto o snapshot está em curso ficam numa fila e são aplicados depois do snapshot, pela ordem recebida. Logout/troca de conta cancela todas as subscrições e invalida a fila. Reconexões não abrem subscrições duplicadas; uma desconexão temporária atualiza o erro de ligação sem limpar dados.

## Migração local

Estados públicos: `checking`, `none`, `available`, `preparing`, `ready`, `uploading`, `completed` e `failed`.

- Há dados significativos quando existe pelo menos uma categoria, despesa, rendimento, objetivo, movimento, orçamento ou exceção. Settings isolados não ativam a migração.
- O snapshot é um `AppBackup` schema 4, lido diretamente de `OndeVaiDatabase`, com ordenação determinística e validado por `validateBackup`. IDs e relações legados não são convertidos no frontend.
- A tentativa guarda apenas `{ idempotencyKey, snapshotHash, userId, createdAt }` em metadata local. O hash Web Crypto usa uma representação normalizada que exclui a variação de `exportedAt`. A mesma combinação user/hash reutiliza a key.
- O upload futuro usa `POST /api/ondevai/data/replace-all` com `{ idempotencyKey, snapshotHash, backup }` e espera `{ status: "imported" | "already_imported", counts }`.
- 404/501 significam endpoint ainda indisponível, não sucesso. Não há fallback por coleção e nenhum resultado, sucesso ou falha, elimina dados financeiros do Dexie.

## Limitações mantidas

- `/api/ondevai/data/replace-all` e `/api/ondevai/data/clear-all` continuam deliberadamente por implementar e devem falhar de forma explícita.
- Não existe sincronização offline bidirecional nem escrita offline.
- Não há eliminação de conta, atualização completa da interface de privacidade, credenciais reais, deploy PocketHost ou alteração de produção.
- A execução contra PocketBase requer uma instância local descartável 0.40.4; os testes unitários com mocks não substituem essa validação de integração.
