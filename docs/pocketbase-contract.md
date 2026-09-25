# Contrato PocketBase — Onda 1

Este documento fixa o contrato partilhado da primeira onda da migração. A aplicação continua a usar os providers Dexie nesta fase; o cliente PocketBase, a autenticação e os novos repositórios ficam disponíveis para integração posterior.

## Limites da onda

- Não alterar `app.config.ts`, `app.routes.ts`, `AppStore`, os serviços de aplicação, os modelos de domínio nem as interfaces dos repositórios.
- Não substituir os providers Dexie, remover Dexie, ativar realtime, migrar dados locais, fazer deploy ou guardar credenciais.
- Não implementar importação remota parcial nem apresentar operações financeiras read-modify-write como atómicas.
- IDs, rotas, providers e endpoints que exigem integração são preparados e documentados, mas só serão ativados no Checkpoint C1 ou na Onda 2.

## Cliente e configuração

- O SDK oficial é `pocketbase`.
- `src/app/core/pocketbase/pocketbase.client.ts` exporta uma classe injetável `PocketBaseClientService` com `public readonly client: PocketBase`.
- A URL é fornecida por um `InjectionToken`/configuração injetável. O valor seguro por omissão para desenvolvimento e testes é uma origem local (`http://127.0.0.1:8090`), nunca uma URL PocketHost de produção.
- Os testes podem substituir a configuração ou o próprio serviço. Toda a aplicação partilha esta única instância; `AuthService` não cria outra.
- Não existem tokens, utilizadores predefinidos, credenciais administrativas nem operações de superutilizador no frontend.

## Identidade, datas e dinheiro

- O domínio mantém `id: string`. Um ID novo destinado a PocketBase contém exatamente 15 caracteres alfanuméricos ASCII; não se usa `crypto.randomUUID()` como ID de record PocketBase.
- UUIDs atuais permanecem inalterados nesta onda e só serão convertidos pela futura migração de dados.
- Datas civis são strings `AAAA-MM-DD`; meses são strings `AAAA-MM`. Mappers não passam estes valores por `Date`.
- `created`/`updated` do PocketBase são normalizados para ISO em `createdAt`/`updatedAt`. Valores opcionais vazios tornam-se `undefined` quando o domínio o exige.
- Dinheiro permanece um inteiro seguro em cêntimos. O schema exige inteiros e os limites mínimos indicados abaixo.

## Autenticação

A coleção auth chama-se `users` e usa email/password. Email é obrigatório, verificação é obrigatória e o registo público é permitido. Listagem não é pública; view/update limitam-se ao próprio utilizador; delete fica bloqueado. Não há campos administrativos editáveis pelo utilizador.

`AuthService` reutiliza `PocketBaseClientService.client.authStore`, valida a sessão com `authRefresh()` ao arrancar e limpa o auth store apenas quando o token é inválido. Falhas temporárias de rede preservam a sessão local. A API pública é:

- `initialize()`
- `register(email, password, passwordConfirm)`
- `login(email, password)`
- `logout()`
- `refreshSession()`
- `requestVerification()`
- `requestPasswordReset(email)`
- `confirmPasswordReset(token, password, passwordConfirm)`
- sinais readonly `user`, `authenticated`, `loading` e `error`

Os guards `authGuard`, `guestGuard` e, se usado, `verifiedGuard` são exportáveis, mas não ligados às rotas globais nesta onda.

## Coleções e campos

Todas as coleções abaixo são privadas e têm `owner`, relação obrigatória para `users` com cascade delete.

| Coleção | Campos adicionais | Índices |
| --- | --- | --- |
| `user_settings` | `currency` select `EUR` obrigatório; `locale` select `pt-PT` obrigatório; `onboardingCompleted` bool; `lastExportAt` opcional; `changesSinceExport` inteiro >= 0 | unique `owner` |
| `categories` | `name` text obrigatório; `color` text obrigatório e hexadecimal; `icon` text opcional; `order` inteiro >= 0; `archived` bool; `subcategories` json | — |
| `expenses` | `date` text `AAAA-MM-DD`; `amountCents` inteiro > 0; `category` relação obrigatória para `categories`; `subcategoryId` text opcional; `description` text opcional; `recurrence` json opcional | — |
| `monthly_incomes` | `name` text obrigatório; `kind` select `salary/subsidy/freelance/other`; `amountCents` inteiro > 0; `date` text `AAAA-MM-DD`; `recurrence` json opcional | — |
| `savings_goals` | `name` text obrigatório; `kind` select `general/reserve/home/car/travel/education/other`; `targetAmountCents` inteiro > 0; `currentAmountCents` inteiro >= 0; `monthlyContributionCents` inteiro >= 0; `targetDate` text opcional `AAAA-MM-DD` | — |
| `savings_transactions` | `goal` relação obrigatória para `savings_goals` com cascade delete; `type` select `opening/deposit/withdrawal`; `amountCents` inteiro > 0; `effectiveDate` text `AAAA-MM-DD`; `note` text opcional | — |
| `monthly_budgets` | `month` text `AAAA-MM`; `category` relação obrigatória para `categories`; `amountCents` inteiro > 0 | unique `owner,month,category` |
| `recurrence_exceptions` | `seriesType` select `expense/income`; `seriesId` text obrigatório; `occurrenceDate` text `AAAA-MM-DD`; `action` select `skip/override`; `changes` json opcional | unique `owner,seriesType,seriesId,occurrenceDate` |

`savings_goals.currentAmountCents` é temporariamente um cache compatível com o domínio atual. O ledger é a fonte conceptual de verdade e uma versão futura manterá o cache apenas no servidor.

## Isolamento e validações server-side

As regras conceptuais das coleções privadas são:

```text
list/view/delete: authenticated && verified && record.owner == auth.id
create:           authenticated && verified && body.owner == auth.id
update:           authenticated && verified && record.owner == auth.id && owner não mudou
```

A migration usa a sintaxe efetivamente suportada pela versão PocketBase validada pelo backend. Hooks server-side reforçam, sem depender dos filtros do cliente:

- utilizador autenticado igual a `owner` e `owner` imutável em update;
- `expenses.category.owner == expenses.owner`;
- `monthly_budgets.category.owner == monthly_budgets.owner`;
- `savings_transactions.goal.owner == savings_transactions.owner`;
- `recurrence_exceptions.seriesId` resolve para uma expense ou monthly income do mesmo owner conforme `seriesType`.

Operações legítimas de superutilizador para administração/migrations são tratadas explicitamente. Os hooks usam apenas APIs disponíveis no JSVM, devolvem erros seguros e são compatíveis com operações normais e futuras operações batch.

## Mapeamento de records

- `expenses.category` ↔ `Expense.categoryId`.
- `savings_transactions.goal` ↔ `SavingsTransaction.goalId`.
- `monthly_budgets.category` ↔ `MonthlyBudget.categoryId`.
- `created`/`updated` ↔ `createdAt`/`updatedAt` nas entidades que têm timestamps no domínio.
- `user_settings` não expõe `id` no modelo `Settings`; o repositório procura o único record do owner.
- JSON de recorrência, exceções e subcategorias é validado/mapeado sem `any`.
- Ordenação equivalente a Dexie: expenses e incomes por date descendente; categories por order ascendente; goals por created ascendente; transactions por effectiveDate descendente; budgets por month descendente.

`put()` conserva a semântica temporária de upsert: tenta determinar se o ID existe e atualiza ou cria com esse ID. Uma resposta 404 durante essa verificação significa “criar”; outras falhas não são convertidas em create. O servidor continua a ser a fronteira de autorização.

## Operações deliberadamente adiadas

- Operações de goal + ledger que exigem atomicidade chamam caminhos centralizados de futuros endpoints e podem ser testadas com mocks; não fazem read-modify-write inseguro no cliente.
- `PocketBaseDataRepository.replaceAll()` e `clearAll()` falham explicitamente enquanto não existir um endpoint transacional remoto. Não apagam coleções sequencialmente.
- O tratamento de erros converte respostas PocketBase 400, 401, 403, 404 e 409, além de falhas de rede, em mensagens de domínio legíveis sem revelar tokens ou detalhes internos.

## Integração posterior

No Checkpoint C1 será necessário configurar a URL real por ambiente, inicializar `AuthService`, adicionar as rotas/guards, trocar os repository providers, adaptar a geração de IDs dos serviços e decidir o fluxo entre login, verificação e onboarding. A Onda 2 implementará migração de dados, importação remota transacional, endpoints financeiros atómicos, realtime e gestão de conta/privacidade.
