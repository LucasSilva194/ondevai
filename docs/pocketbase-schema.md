# Schema PocketBase — Onda 1

## Compatibilidade e âmbito

O schema e os hooks foram escritos e validados com **PocketBase 0.40.4**. Esta
onda cria apenas a base declarativa e a segurança inicial: não faz deploy, não
configura PocketHost, não cria contas reais e não substitui o backend Dexie da
aplicação Angular.

PocketBase 0.40 já inclui uma auth collection `users` no bootstrap. A migration
configura essa coleção existente e cria as oito coleções privadas; no rollback,
remove apenas as oito novas coleções e repõe as rules/authRule originais de
`users`, sem substituir os segredos de tokens gerados pela instância.

A migration reversível está em
`pb_migrations/202609250000_initial_schema.js`. As validações HTTP adicionais
estão em `pb_hooks/validation/ownership.pb.js`, com helpers sem estado em
`pb_hooks/validation/ownership.js`. A ordem segura do cascade de utilizador está
em `pb_hooks/validation/user-cascade.pb.js`. PocketBase 0.40.4 não procura
hooks recursivamente; por isso, `pb_hooks/main.pb.js` é o entrypoint mínimo que
carrega os dois ficheiros `*.pb.js` de `validation/`. O teste isolado do Agente
A aponta diretamente `--hooksDir pb_hooks/validation`; o arranque normal usa
`pb_hooks` e o respetivo entrypoint.

## Autenticação

`users` é uma auth collection com password e email como único identificador:

- registo público (`createRule` aberta);
- email obrigatório (campo de sistema da auth collection);
- `authRule: verified = true`, portanto uma conta não recebe token antes de
  confirmar o email;
- listagem e eliminação bloqueadas a clientes (`null`);
- view e update limitados ao próprio record;
- `manageRule` bloqueada;
- sem campos administrativos customizados, utilizadores predefinidos ou
  credenciais na migration.

Pedidos administrativos autenticados por superutilizador ignoram as API rules,
como definido pelo PocketBase, e são explicitamente ignorados pelos hooks. Isto
permite a operação normal do dashboard, migrations e futura manutenção.

## Regras comuns das coleções privadas

Todas as coleções privadas têm uma relação `owner` obrigatória para `users`,
com `maxSelect: 1` e cascade delete. As rules efetivas são:

```text
list/view/delete:
@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id

create:
@request.auth.id != "" && @request.auth.verified = true && @request.body.owner = @request.auth.id

update:
@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id && @request.body.owner:changed = false
```

Em PocketBase 0.40.4, `:changed` é suportado nos campos de `@request.body`. As
rules também funcionam como filtros: uma listagem devolve apenas records do
utilizador, e view/update/delete sem acesso devolvem normalmente 404.

## Coleções

| Coleção | Campos além dos campos de sistema | Índices |
| --- | --- | --- |
| `user_settings` | `owner` relation; `currency` select `EUR`; `locale` select `pt-PT`; `onboardingCompleted` bool; `lastExportAt` date opcional; `changesSinceExport` inteiro >= 0 | unique `owner` |
| `categories` | `owner`; `name` text obrigatório; `color` text `#RRGGBB`; `icon` text opcional; `order` inteiro >= 0; `archived` bool; `subcategories` JSON obrigatório (`[]` representa a lista vazia no domínio) | — |
| `expenses` | `owner`; `date` text `AAAA-MM-DD`; `amountCents` inteiro > 0; `category` relation obrigatória; `subcategoryId` text opcional; `description` text opcional; `recurrence` JSON opcional | — |
| `monthly_incomes` | `owner`; `name` text obrigatório; `kind` select `salary/subsidy/freelance/other`; `amountCents` inteiro > 0; `date` text `AAAA-MM-DD`; `recurrence` JSON opcional | — |
| `savings_goals` | `owner`; `name` text obrigatório; `kind` select `general/reserve/home/car/travel/education/other`; `targetAmountCents` inteiro > 0; `currentAmountCents` inteiro >= 0; `monthlyContributionCents` inteiro >= 0; `targetDate` text opcional `AAAA-MM-DD` | — |
| `savings_transactions` | `owner`; `goal` relation obrigatória com cascade delete; `type` select `opening/deposit/withdrawal`; `amountCents` inteiro > 0; `effectiveDate` text `AAAA-MM-DD`; `note` text opcional | — |
| `monthly_budgets` | `owner`; `month` text `AAAA-MM`; `category` relation obrigatória; `amountCents` inteiro > 0 | unique `owner, month, category` |
| `recurrence_exceptions` | `owner`; `seriesType` select `expense/income`; `seriesId` text obrigatório; `occurrenceDate` text `AAAA-MM-DD`; `action` select `skip/override`; `changes` JSON opcional | unique `owner, seriesType, seriesId, occurrenceDate` |

Os campos monetários usam NumberField com `onlyInt: true`; não existem valores
decimais. As datas civis e meses são texto para não sofrerem conversões de fuso
horário. Os padrões verificam a estrutura e os intervalos de mês/dia, mas não
fazem validação calendárica completa (por exemplo, não distinguem 30 de 31 dias).

## Relações e hooks

As relations `category` e `goal` têm integridade referencial normal do
PocketBase. O hook acrescenta a regra de negócio que uma relation tem de
pertencer ao mesmo `owner` do record:

- `expenses.category` → `categories`;
- `monthly_budgets.category` → `categories`;
- `savings_transactions.goal` → `savings_goals`;
- `recurrence_exceptions.seriesId` → `expenses` quando `seriesType=expense`, ou
  → `monthly_incomes` quando `seriesType=income`.

Nos creates e updates via Records API, o hook confirma ainda que o auth record é
um `users` verificado e coincide com `owner`. Em updates compara o owner final
com `record.original()`. View e delete também voltam a confirmar o owner. Os
batch requests normais disparam estes mesmos hooks CRUD e usam a app
transacional fornecida no evento.

Os erros são deliberadamente genéricos (`Operação não autorizada` ou
`Referência inválida`) para não expor a existência de records de outro
utilizador. Os hooks usam apenas globals e APIs JSVM do PocketBase. O `require`
local é a API CommonJS incorporada do JSVM (necessária devido ao scope isolado
de cada handler); não são usados módulos nem APIs Node.js.

## Cascade deletes

- A eliminação administrativa/futura de um `users` apaga todos os seus records
  privados. Todas as relations `owner` têm `cascadeDelete`; adicionalmente, um
  model hook apaga primeiro dependentes numa ordem topológica, porque categories
  e goals ainda podem ter relations obrigatórias quando o cascade nativo visita
  as coleções numa ordem diferente. Isto não abre a API de delete de `users`.
- A eliminação de um `savings_goals` apaga os respetivos
  `savings_transactions`.
- As relations de `expenses` e `monthly_budgets` para `categories` não usam
  cascade delete; enquanto existirem dependentes, a integridade relacional
  impede a remoção da categoria.
- `recurrence_exceptions.seriesId` é texto e, por isso, não tem cascade delete.

## Aplicar e reverter

Com o executável PocketBase na raiz do projeto:

```sh
./pocketbase migrate up
./pocketbase serve
```

Quando o binário ou os diretórios estão noutro local:

```sh
/caminho/pocketbase migrate up \
  --dir /caminho/pb_data \
  --migrationsDir /caminho/OndeVai/pb_migrations \
  --hooksDir /caminho/OndeVai/pb_hooks
```

Para reverter esta única migration (operação destrutiva que remove as oito
coleções privadas e os seus dados, mantendo `users`):

```sh
./pocketbase migrate down 1
```

Deve ser feito backup e o servidor deve ser parado/reiniciado quando migrations
são aplicadas manualmente. Não se deve executar `down` numa instância com dados
que se pretendam preservar.

## Validação local

O teste descartável requer `curl`, `jq` e `sqlite3`:

```sh
./scripts/pocketbase-schema/validate.sh /caminho/para/pocketbase
```

O script usa um `pb_data` temporário e o entrypoint normal `pb_hooks/main.pb.js`,
cria duas contas e um superutilizador exclusivamente descartáveis, valida
isolamento, owner/relações/índices e executa `migrate down`. Não contacta
PocketHost nem persiste as credenciais. `PB_HOOKS_DIR` permite validar
explicitamente outro diretório de hooks quando necessário.

## Limitações conhecidas

- Os schemas internos dos JSON (`subcategories`, recorrências e `changes`) são
  validados/mapeados pelo frontend nesta onda; PocketBase limita-se a validar
  JSON válido.
- `savings_goals.currentAmountCents` é um cache temporário por compatibilidade.
  O ledger é a fonte conceptual de verdade; a atualização atómica do cache será
  responsabilidade de um endpoint server-side futuro.
- Não existem ainda endpoints financeiros atómicos, importação transacional,
  realtime, migração de IndexedDB, gestão de conta ou eliminação de utilizador.
- Como `recurrence_exceptions.seriesId` é texto polimórfico, a integridade e o
  ownership dependem do hook; uma eliminação da série não apaga exceções nesta
  onda.
- O hook protege as Records APIs incorporadas (incluindo batch). Escritas
  internas adicionadas no futuro através de jobs/hooks Go/JS devem manter as
  mesmas invariantes explicitamente, porque não têm contexto HTTP.
- Antes de produção/PocketHost, deve repetir-se a validação na versão exata do
  servidor gerido e confirmar SMTP/URLs de email sem guardar segredos no repo.
- O deploy tem de incluir o diretório `pb_hooks` completo: `main.pb.js` é
  necessário porque PocketBase não descobre os ficheiros de `validation/`
  recursivamente.
