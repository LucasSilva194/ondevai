# Relatório de testes — PocketBase Onda 3

Data: 2026-09-25
Alvo validado: PocketBase 0.40.4 local descartável
Binário usado: `/tmp/ondevai-pocketbase-0.40.4/pocketbase`

## Resultado executivo

A suite específica da Onda 3 passou contra uma instância real PocketBase
0.40.4, com `pb_data` temporário e sem qualquer contacto com PocketHost ou
produção. A regressão Angular também passou: 31 ficheiros e 173 testes.

Não ficou aberta nenhuma vulnerabilidade crítica ou alta. A suite encontrou
uma regressão alta nas contagens da resposta idempotente; o backend foi
corrigido e o teste de regressão passou. O coordenador corrigiu também o falso
negativo médio dos validadores antigos, que agora retiram explicitamente a
migration da Onda 3 antes de verificarem os rollbacks das Ondas 2 e 1.

## Artefactos criados pelo Agente C

- `src/app/core/backup/pocketbase-wave3.integration.spec.ts`
- `scripts/pocketbase-wave3-tests/fixtures.js`
- `scripts/pocketbase-wave3-tests/test-helpers.js`
- `scripts/pocketbase-wave3-tests/test-atomicity.js`
- `scripts/pocketbase-wave3-tests/integration.js`
- `scripts/pocketbase-wave3-tests/validate.sh`
- `scripts/pocketbase-wave3-tests/README.md`
- `docs/pocketbase-wave3-test-report.md`

Nenhum ficheiro de produção, migration, hook, configuração ou `package*.json`
foi alterado pelo Agente C.

## Execuções finais

| Comando | Resultado |
| --- | --- |
| `npm run lint` | passou, zero warnings |
| `npm test` | passou, 31 ficheiros / 173 testes |
| `npm run build` | passou; dois warnings de budget CSS |
| `git diff --check` | passou |
| `node scripts/pocketbase-wave3-tests/test-helpers.js` | passou |
| `node scripts/pocketbase-wave3-tests/test-atomicity.js` | passou |
| `./scripts/pocketbase-wave3-tests/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase` | passou, incluindo rollback da migration da Onda 3 |
| `./scripts/pocketbase-schema/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase` | passou, incluindo rollbacks das Ondas 3, 2 e 1 após correção do coordenador |
| `./scripts/pocketbase-transactions/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase` | passou, incluindo rollback explícito da Onda 3 e verificação das rules da Onda 2 |

A baseline anterior às edições também estava verde: lint, build,
`git diff --check` e 24 ficheiros / 133 testes.

## Cobertura da Onda 3

### Importação e contrato de backup

- Backups frontend v1, v2 e v3 normalizados para schema v4.
- Backup v4 completo e round-trip de campos opcionais.
- Payload backend exclusivamente v4.
- IDs UUID, IDs estáticos sugeridos e IDs já no formato PocketBase.
- Geração de IDs PocketBase novos com 15 caracteres.
- Reescrita de `expenses.category`, `monthly_budgets.category`,
  `savings_transactions.goal`, `recurrence_exceptions.seriesId` e
  `recurrence_exceptions.changes.categoryId`.
- Preservação de IDs de subcategoria internos ao JSON.
- Settings, `lastExportAt`, datas civis, meses, recorrências, exceções e
  cêntimos inteiros seguros.
- Fingerprint frontend/backend equivalente, determinístico e independente de
  `exportedAt`.
- Ledger válido, saldo final inconsistente, saldo intermédio negativo e
  aberturas inválidas.
- Duplicados por coleção, orçamento semântico duplicado e exceção semântica
  duplicada.

### Atomicidade e isolamento

- Fault injection antes do commit durante o segundo delete, terceiro insert e
  criação de `data_imports`.
- Em todos os casos, snapshot anterior integral e ausência de metadata parcial.
- Payload inválido contra PocketBase real não altera os dados anteriores.
- Replace e clear de A não alteram B.
- `clear-all` deriva o owner da sessão, preserva o utilizador e preserva
  `data_imports`.
- Eliminação de A preserva B e remove auth record, dados e metadata de A.
- Rollback real da migration da Onda 3 remove apenas `data_imports`.

O fault injection de save/delete é feito num executor transacional simulado
que implementa a API usada pelo helper. Não foi adicionado um interruptor de
falha aos hooks de produção. O comportamento real de rollback também é
exercitado através de pedidos inválidos e das transações dos validadores
anteriores.

### Idempotência e concorrência

- Retry sequencial após sucesso devolve `already_imported` e as mesmas counts.
- Duas chamadas concorrentes com a mesma key/hash resultam em exatamente um
  `imported` e um `already_imported`, sem duplicação.
- Mesma key com hash diferente é conflito.
- Mesmo hash com key diferente e modo `replace` é uma nova importação.
- `migrate-empty` aceita conta vazia e rejeita conta com dados.
- `clear-all` seguido de retry da importação concluída mantém a conta vazia e
  devolve `already_imported`, conforme a metadata preservada.

### Segurança

- Sem autenticação, token inválido, email não confirmado e token de
  superutilizador nas rotas públicas.
- Metadata `data_imports` inacessível ao utilizador normal.
- Relações órfãs/forjadas para categoria, goal e `changes.categoryId`.
- Datas impossíveis, dinheiro fracionário/inseguro, IDs e chaves semânticas
  duplicadas.
- JSON profundo/desconhecido, strings acima do limite e pedido acima de 20 MiB
  no validador server-side.
- Password errada, confirmação errada e `userId` extra em account/delete.
- Token da conta eliminada deixa de autorizar pedidos.
- Mensagens de erro verificadas contra exposição de SQL, stack, runtime e token.

### Conta, UX e regressão

A suite Angular final cobre, diretamente ou através dos testes existentes:

- logout pelo shell, ordem de limpeza de store/realtime/auth e navegação;
- preservação de Dexie no logout, migração, importação, clear e account delete;
- email da conta, alteração de email/password e respetivas validações;
- confirmação de eliminação de conta;
- importação manual, erro/rollback visual e recarregamento do snapshot;
- clear-all e regresso ao onboarding sem terminar a sessão;
- texto offline sem promessa de escrita local;
- onboarding sem afirmações local-only;
- guards das rotas privadas e rota `/conta`;
- CRUD de despesas, categorias, rendimentos, orçamentos, recorrências e
  poupanças;
- exportação/reimportação e cálculos financeiros;
- realtime unitário e um fluxo SSE real entre dois clientes durante replace.

Não foi introduzida uma framework E2E de browser. Os fluxos visuais usam testes
de componente; a fronteira server-side usa PocketBase real e HTTP/SSE.

## Findings

### W3-T01 — Resolvido — Alta — counts incorretas em `already_imported`

**Reprodução:** executar duas importações concorrentes com o mesmo owner,
`idempotencyKey`, hash e modo. Quando o retry concluía em segundo lugar,
devolvia `already_imported` com `counts.categories = 0`, apesar de existirem
duas categorias importadas.

**Esperado:** `already_imported` devolve exatamente as counts calculadas para o
backup validado e confirmado pelo SHA-256.

**Observado inicialmente:** todas as counts eram zero porque o JSONField
`data_imports.counts` não era exposto pelo JSVM como objeto JavaScript simples.

**Ficheiro provável:** `pb_hooks/data/operations.js`, normalização das counts do
record de idempotência.

**Teste:** `scripts/pocketbase-wave3-tests/integration.js`, retries sequencial e
concorrente.

**Estado:** corrigido pelo Agente A usando as counts novamente calculadas pelo
validador server-side depois de confirmar o hash. Regressão verde em PocketBase
0.40.4.

### W3-T02 — Resolvido — Média — validadores antigos assumiam Onda 2 como última migration

**Reprodução:** executar qualquer dos comandos:

```sh
./scripts/pocketbase-schema/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase
./scripts/pocketbase-transactions/validate.sh /tmp/ondevai-pocketbase-0.40.4/pocketbase
```

Ambos passam os testes funcionais. No fim executam `migrate down 1`, que agora
remove `202609250200_wave3_data_imports.js`; de seguida afirmam que as rules da
Onda 2 foram revertidas e falham.

**Esperado:** o teste reconhece/reverte primeiro a migration da Onda 3 e só
depois valida o rollback da Onda 2, ou isola explicitamente o conjunto de
migrations pretendido.

**Observado:** falso negativo `rollback ... não repôs createRule`.

**Ficheiros prováveis:** `scripts/pocketbase-schema/validate.sh` perto das linhas
304–313 e `scripts/pocketbase-transactions/validate.sh` perto das linhas
412–420.

**Estado:** corrigido pelo coordenador. Ambos os scripts revertem primeiro a
Onda 3, confirmam a remoção de `data_imports` e só depois validam os rollbacks
que lhes pertencem. Os dois validadores voltaram a passar integralmente com
PocketBase 0.40.4.

### W3-T03 — Aberto — Baixa — budgets CSS excedidos

O build production passa, mas reporta:

- `dashboard.component.css`: 10,55 kB para budget de 8 kB;
- `app-shell.component.css`: 10,35 kB para budget de 8 kB.

O dashboard já excedia o budget na baseline. O shell também já tinha warning e
aumentou com a UI da conta. Não bloqueia a release candidate, mas deve ser
reduzido ou ter o budget revisto conscientemente.

## Conclusão

Os endpoints e fluxos principais da Onda 3 estão cobertos e verdes em
PocketBase 0.40.4 descartável. A única falha funcional encontrada pela suite
foi corrigida e ganhou teste de regressão. O falso negativo dos scripts de
rollback também foi resolvido. Restam apenas warnings não bloqueantes de
tamanho CSS.
