# OndeVai

> O seu dinheiro, explicado. Os seus dados, sob o seu controlo.

O OndeVai é uma aplicação web para organizar despesas, rendimentos, orçamentos e objetivos de poupança pessoais. Uma conta autenticada e com email verificado guarda os dados num backend PocketBase; o frontend Angular mantém o estado em memória e recebe atualizações em tempo real.

Esta versão prepara a migração para PocketHost, mas não inclui um deploy de produção, credenciais reais, SMTP ou DNS configurados.

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
- Deteção e migração opcional dos dados Dexie da versão local, sem apagar o original.
- Interface responsiva, navegação por teclado, live regions e modo claro/escuro.

O projeto não inclui dados de exemplo, contas predefinidas, analytics ou telemetria.

## Requisitos

- Node.js 22.12 ou superior na linha 22, ou uma versão suportada mais recente.
- npm 10 ou superior.
- PocketBase 0.40.4 para desenvolvimento e validação do backend.
- `curl`, `jq` e `sqlite3` para os validadores descartáveis.

## Desenvolvimento local

Instale as dependências e execute o frontend:

```bash
npm install
npm start
```

Por omissão, o frontend fica em `http://localhost:4200` e usa PocketBase em `http://127.0.0.1:8090`.

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

Não use uma instância de produção nos testes. Os scripts de validação criam uma base temporária e credenciais descartáveis.

Scripts npm:

```bash
npm start
npm run lint
npm test
npm run build
```

## Configuração do PocketBase

O SDK oficial recebe a origem através do `InjectionToken` `POCKETBASE_URL`, definido em `src/app/core/pocketbase/pocketbase.client.ts`. O valor seguro por omissão é `http://127.0.0.1:8090`. Para outro ambiente, forneça o token no bootstrap/configuração desse ambiente; não coloque tokens, passwords ou chaves no bundle.

Não existem variáveis de ambiente secretas necessárias ao frontend. Antes de um lançamento real ainda é necessário:

- fornecer a origem PocketHost do ambiente;
- configurar SMTP e URLs de confirmação/recuperação fora do repositório;
- aplicar e validar migrations e hooks na versão exata do serviço;
- rever CORS, backups operacionais e monitorização da infraestrutura.

## Arquitetura

```text
Componentes standalone
        ↓
AppStore (Angular Signals)
        ↓
Serviços de aplicação
        ↓
Interfaces de repositório
        ↓
PocketBaseDataRepository / repositórios PocketBase
        ↓
PocketBase 0.40.4 (records, hooks, endpoints transacionais e realtime)
```

Áreas principais:

```text
src/app/core/auth/          sessão e autenticação
src/app/core/backup/        exportação, validação e fingerprint SHA-256
src/app/core/migration/     leitura e migração opcional dos dados Dexie
src/app/core/pocketbase/    cliente, contratos, mappers e erros
src/app/core/realtime/      subscrições e isolamento por utilizador
src/app/core/repositories/  interfaces e implementações PocketBase/Dexie
src/app/core/stores/        estado da aplicação
src/app/features/account/   gestão e eliminação da conta
pb_migrations/              schema e alterações reversíveis
pb_hooks/                   validações e endpoints server-side
scripts/                    validadores locais descartáveis
```

As operações que precisam de atomicidade — movimentos de poupança, bulks, importação, clear-all e eliminação de conta — passam por endpoints server-side. O cliente nunca implementa replace/clear com deletes coleção a coleção.

## Autenticação e conta

A auth collection chama-se `users` e usa email/password. O email tem de ser verificado para aceder aos dados financeiros. Alterações de email usam o fluxo oficial de confirmação do PocketBase; alterações de palavra-passe exigem a password atual e renovam a sessão com a nova credencial.

O endpoint `POST /api/ondevai/account/delete` exige a password atual e a frase exata `APAGAR CONTA`. O backend deriva sempre o utilizador da sessão. Depois do sucesso, o frontend para o realtime, limpa o `AppStore` e o auth store e regressa ao login.

## Sincronização e comportamento offline

O carregamento inicial obtém um snapshot remoto e aplica eventos realtime que tenham chegado durante esse carregamento. Eventos são filtrados pelo owner e aplicados de forma idempotente. Importações e limpeza recarregam o snapshot sem criar subscrições duplicadas.

Não existe sincronização offline bidirecional nem fila de escritas. Sem ligação:

- o app shell e dados já existentes em memória podem continuar visíveis;
- não se garante que a leitura esteja atualizada;
- novas alterações não são prometidas como guardadas;
- a aplicação tenta restabelecer a ligação.

O service worker guarda apenas os assets da aplicação, não constitui um cache financeiro offline.

## Backups, importação e migração local

A exportação cria `ondevai-backup-AAAA-MM-DD.json` no schema 4. O ficheiro inclui settings, categorias, despesas, rendimentos, objetivos, ledger, orçamentos e exceções de recorrência. Não inclui tokens nem valores derivados dos gráficos.

Backups schema 1, 2 e 3 são migrados para schema 4 e validados no frontend. A importação manual usa o modo `replace`: valida o conteúdo novamente no servidor, confirma o hash, converte IDs legados, reescreve relações e substitui os dados financeiros numa transação. Uma falha preserva o snapshot anterior.

A migração de dados Dexie usa o modo `migrate-empty`: só é aceite quando a conta não contém dados financeiros. A tentativa usa fingerprint SHA-256 e chave de idempotência, aceita retries e nunca substitui silenciosamente uma conta existente. O IndexedDB antigo não é apagado automaticamente, nem depois de sucesso, logout, clear-all ou eliminação da conta.

O JSON exportado não é encriptado. Deve ser guardado num local seguro.

## Privacidade

Os dados financeiros são enviados para o PocketBase configurado e associados à conta autenticada. As rules, os hooks e os endpoints reforçam isolamento por utilizador. Isso não significa encriptação ponta-a-ponta, anonimato ou impossibilidade de acesso administrativo à infraestrutura.

O OndeVai não integra contas bancárias e não adiciona analytics ou telemetria. Backups automáticos de PocketHost não estão configurados por este repositório.

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

## Limitações atuais

- Não existe deploy PocketHost concluído nesta tarefa.
- SMTP, DNS, URLs públicas e backups operacionais ainda exigem configuração humana.
- Sem fila offline ou merge bidirecional.
- Sem OAuth, importação CSV, anexos ou fotografias de recibos.
- Sem encriptação ponta-a-ponta e sem encriptação do ficheiro JSON.
- A importação é por substituição, não por merge.
- Dexie permanece apenas para detetar e migrar dados locais antigos; não é a fonte ativa dos dados cloud.

## Branches e licença

- `main`: versão estável.
- `dev`: integração de trabalho em desenvolvimento.

A licença ainda não foi definida; não existe ficheiro de licença no repositório.
