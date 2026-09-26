# OndeVai

> O seu dinheiro, explicado. Os seus dados, sob o seu controlo.

O OndeVai é uma aplicação web cloud-first para organizar despesas, rendimentos,
orçamentos e objetivos de poupança pessoais. O PocketBase alojado no PocketHost
é a fonte de verdade dos dados. O frontend Angular mantém apenas uma projeção
em memória da conta autenticada e acompanha alterações através de realtime.

O backend de produção está publicado em `https://ondevai.pockethost.io`. O
frontend de produção está preparado para Cloudflare Pages, mas ainda não está
publicado. O repositório não contém credenciais, passwords, tokens, configuração
SMTP ou dados de utilizadores.

## Funcionalidades

- Registo, confirmação de email, login, recuperação de palavra-passe e logout.
- Gestão de conta com pedido de alteração de email, alteração de palavra-passe e eliminação segura da conta.
- Despesas pontuais ou recorrentes, categorias e subcategorias personalizáveis.
- Rendimentos, orçamentos mensais e objetivos de poupança com ledger de movimentos.
- Dashboard mensal e anual, gráficos com alternativas textuais e insights determinísticos.
- Realtime entre sessões PocketBase, com indicação da última sincronização e erros de ligação.
- Exportação integral para JSON.
- Importação manual por substituição atómica, com validação, pré-visualização e confirmação explícita.
- Limpeza atómica dos dados financeiros cloud sem eliminar a conta.
- Migração opcional de dados Dexie criados por versões antigas da aplicação, sem apagar o original.
- Interface responsiva, navegação por teclado, live regions e modo claro/escuro.

O projeto não inclui dados de exemplo, contas predefinidas, analytics ou telemetria.

## Requisitos

- Node.js 22.12 ou superior na linha 22, ou uma versão suportada mais recente.
- npm 10 ou superior.
- PocketBase 0.40.4 para executar e validar o backend localmente.
- `curl`, `jq` e `sqlite3` para os validadores descartáveis.

## Desenvolvimento local

Instale as dependências e execute o frontend:

```bash
npm install
npm start
```

Por omissão, o frontend fica em `http://localhost:4200` e usa uma instância
PocketBase descartável em `http://127.0.0.1:8090`. Este ambiente existe apenas
para desenvolvimento e testes; não substitui nem sincroniza com produção.

Arranque o PocketBase local com as migrations e hooks do repositório:

```bash
/caminho/pocketbase migrate up \
  --dir /caminho/para/pb_data \
  --migrationsDir /caminho/OndeVai/pb_migrations \
  --hooksDir /caminho/OndeVai/pb_hooks

/caminho/pocketbase serve \
  --dir /caminho/para/pb_data \
  --migrationsDir /caminho/OndeVai/pb_migrations \
  --hooksDir /caminho/OndeVai/pb_hooks
```

Não aponte testes, validadores ou desenvolvimento local para a instância de
produção. Os scripts de validação criam uma base temporária e credenciais
descartáveis.

Scripts npm:

```bash
npm start
npm run lint
npm test
npm run build
```

## Configuração do PocketBase

O SDK oficial recebe a origem através do `InjectionToken` `POCKETBASE_URL`,
definido em `src/app/core/pocketbase/pocketbase.client.ts`.
`src/environments/environment.ts` aponta o desenvolvimento para
`http://127.0.0.1:8090`; o build de produção substitui esse ficheiro por
`src/environments/environment.production.ts` e usa
`https://ondevai.pockethost.io`.

A URL do PocketBase é pública e pode estar no bundle. Credenciais, passwords,
tokens e chaves nunca devem ser adicionados aos ficheiros de ambiente do
frontend.

Não existem variáveis de ambiente secretas necessárias ao frontend. Antes de
publicar o frontend ainda é necessário:

- configurar SMTP e URLs de confirmação/recuperação fora do repositório;
- manter migrations e hooks validados na versão PocketBase usada pelo serviço;
- rever CORS, backups operacionais e monitorização da infraestrutura.

## Arquitetura

```text
Componentes Angular standalone
            ↓
AppStore (projeção em memória com Angular Signals)
            ↓
Serviços de aplicação
            ↓
Repositórios PocketBase
            ↓
SDK PocketBase + realtime
            ↓
PocketBase 0.40.4 no PocketHost
  records · rules · hooks · endpoints transacionais
```

Áreas principais:

```text
src/app/core/auth/          sessão e autenticação
src/app/core/backup/        exportação, validação e fingerprint SHA-256
src/app/core/migration/     migração opcional dos dados legados Dexie
src/app/core/pocketbase/    cliente, contratos, mappers e erros
src/app/core/realtime/      subscrições e isolamento por utilizador
src/app/core/repositories/  persistência cloud e adaptador legado Dexie
src/app/core/stores/        projeção em memória do estado remoto
src/app/features/account/   gestão e eliminação da conta
pb_migrations/              schema e alterações reversíveis
pb_hooks/                   validações e endpoints server-side
scripts/                    validadores locais descartáveis
```

O caminho normal de leitura e escrita usa sempre PocketBase. Dexie não recebe
novos dados e só é consultado para detetar e migrar informação criada pela
versão antiga da aplicação.

As operações que precisam de atomicidade — movimentos de poupança, bulks,
importação, limpeza integral e eliminação de conta — passam por endpoints
server-side. O cliente nunca implementa substituições ou limpezas com eliminações
coleção a coleção.

## Autenticação e conta

A auth collection chama-se `users` e usa email/password. O email tem de ser verificado para aceder aos dados financeiros. Alterações de email usam o fluxo oficial de confirmação do PocketBase; alterações de palavra-passe exigem a password atual e renovam a sessão com a nova credencial.

O endpoint `POST /api/ondevai/account/delete` exige a password atual e a frase exata `APAGAR CONTA`. O backend deriva sempre o utilizador da sessão. Depois do sucesso, o frontend para o realtime, limpa o `AppStore` e o auth store e regressa ao login.

## Modelo cloud-first e conectividade

Depois da autenticação, o carregamento inicial obtém um snapshot do PocketBase e
aplica eventos realtime que tenham chegado durante esse carregamento. Os eventos
são filtrados pelo owner e aplicados de forma idempotente. Importações e limpezas
recarregam o snapshot sem criar subscrições duplicadas.

Não existe base financeira local ativa, sincronização offline bidirecional nem
fila de escritas. Sem ligação:

- o app shell e dados já existentes em memória podem continuar visíveis;
- não se garante que a leitura esteja atualizada;
- novas alterações não são guardadas localmente para envio posterior;
- a aplicação tenta restabelecer a ligação.

O service worker guarda apenas os assets da aplicação. Não guarda uma cópia
offline da conta nem transforma o browser numa segunda fonte de verdade.

## Exportação, importação e migração legada

A exportação cria `ondevai-backup-AAAA-MM-DD.json` no schema 4. O ficheiro inclui settings, categorias, despesas, rendimentos, objetivos, ledger, orçamentos e exceções de recorrência. Não inclui tokens nem valores derivados dos gráficos.

Backups schema 1, 2 e 3 são migrados para schema 4 e validados no frontend. A importação manual usa o modo `replace`: valida o conteúdo novamente no servidor, confirma o hash, converte IDs legados, reescreve relações e substitui os dados financeiros numa transação. Uma falha preserva o snapshot anterior.

A migração de dados Dexie destina-se exclusivamente a utilizadores da versão
antiga e usa o modo `migrate-empty`: só é aceite quando a conta cloud não contém
dados financeiros. A tentativa usa fingerprint SHA-256 e chave de idempotência,
aceita retries e nunca substitui silenciosamente uma conta existente. O
IndexedDB antigo não é apagado automaticamente, nem depois de sucesso, logout,
limpeza integral ou eliminação da conta.

O JSON exportado não é encriptado. Deve ser guardado num local seguro.

## Privacidade

Os dados financeiros são armazenados no PocketBase alojado no PocketHost e
associados à conta autenticada. Rules, hooks e endpoints reforçam o isolamento
por utilizador. Isto não significa encriptação ponta-a-ponta, anonimato ou
impossibilidade de acesso administrativo à infraestrutura.

O OndeVai não integra contas bancárias e não adiciona analytics ou telemetria.
Backups operacionais do PocketHost são configuração de infraestrutura e não são
definidos por este repositório.

## Migrations, hooks e validação

As migrations são incrementais; migrations já aplicadas não devem ser alteradas retroativamente. `pb_hooks/main.pb.js` carrega as validações e rotas porque o PocketBase não descobre hooks recursivamente.

Validação local, quando existe um binário PocketBase 0.40.4:

```bash
./scripts/pocketbase-schema/validate.sh /caminho/pocketbase
./scripts/pocketbase-transactions/validate.sh /caminho/pocketbase
./scripts/pocketbase-wave3/validate.sh /caminho/pocketbase
```

Os scripts usam `pb_data` temporário. Nunca aponte estes comandos a dados que queira preservar.

## Testes

A suite Angular cobre autenticação, guards, sessão, mappers, repositórios, realtime, CRUD financeiro, recorrências, cálculos, backups, fingerprint, migração Dexie e os fluxos de conta/dados. Execute:

```bash
npm run lint
npm test
npm run build
git diff --check
```

Os testes do frontend usam mocks ou `fake-indexeddb`. A validação real de transações, rules e hooks requer a instância PocketBase local descartável.

## Deploy

### Backend

O backend está publicado na instância PocketHost `ondevai`. O repositório está
ligado a essa instância através de `.phioconfig`. Com Node.js 24 ou superior e o
`phio` autenticado, hooks e migrations podem ser sincronizados com:

```bash
phio deploy
```

`phio` não envia `pb_data` por omissão. Migrations já aplicadas são imutáveis:
qualquer alteração de schema deve ser entregue numa migration nova e validada
localmente antes do deploy.

Existe uma única instância PocketHost para a aplicação. As branches `dev` e
`main` representam etapas do fluxo Git e não ambientes PocketBase distintos. O
backend local descrito acima é descartável e nunca deve conter dados de produção.

### Frontend

O frontend está preparado para Cloudflare Pages com:

```text
Build command: npm ci && npm run build
Output directory: dist/ondevai/browser
```

`public/_redirects` inclui o fallback de SPA necessário para abrir diretamente
rotas como `/entrar` e `/visao-geral`. O build publicado comunica diretamente
com `https://ondevai.pockethost.io`.

## Limitações atuais

- O frontend Cloudflare Pages ainda não está publicado.
- O domínio público do frontend e o DNS ainda não estão definidos.
- SMTP e URLs públicas de confirmação/recuperação de email ainda exigem configuração.
- A política de backups, restauro e monitorização do PocketHost ainda tem de ser definida.
- Sem base financeira offline, fila de escritas ou merge bidirecional.
- Sem OAuth, importação CSV, anexos ou fotografias de recibos.
- Sem encriptação ponta-a-ponta e sem encriptação do ficheiro JSON.
- A importação é por substituição, não por merge.
- Dexie permanece apenas para migrar dados de versões antigas; não participa no fluxo normal da aplicação.

## Branches e licença

- `main`: versão estável.
- `dev`: integração de trabalho em desenvolvimento.

A licença ainda não foi definida; não existe ficheiro de licença no repositório.
