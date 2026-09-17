# OndeVai

> O seu dinheiro, explicado. Os seus dados, no seu dispositivo.

O OndeVai é uma aplicação web local-first para registar, organizar e analisar despesas pessoais. Funciona inteiramente no browser: não existe backend, conta, sincronização cloud, integração bancária, analytics ou telemetria.

## Funcionalidades do MVP

- Onboarding inicial com explicação do armazenamento local e escolha entre categorias sugeridas ou uma estrutura vazia.
- Criação, edição, eliminação, pesquisa, filtro e ordenação de despesas.
- Valores guardados como cêntimos inteiros e apresentados em EUR com locale `pt-PT`.
- Categorias e subcategorias personalizáveis, ordenáveis e arquiváveis.
- Dashboard mensal e anual com totais, comparação mensal, evolução, distribuição e rankings.
- Alternativas textuais acessíveis para todos os gráficos.
- Exportação integral para JSON e importação por substituição com validação e pré-visualização.
- Substituição atómica das coleções na importação: uma falha mantém os dados anteriores.
- Lembretes de backup e indicação permanente de armazenamento local.
- Interface responsiva, navegável por teclado e com suporte automático para modo claro e escuro.

O projeto não inclui despesas de exemplo nem dados pessoais.

## Requisitos

- Node.js 22.12 ou superior na linha 22, ou uma versão suportada mais recente.
- npm 10 ou superior.

## Instalação e execução

```bash
npm install
npm start
```

A aplicação de desenvolvimento fica disponível em `http://localhost:4200`.

Scripts disponíveis:

```bash
npm start       # servidor de desenvolvimento
npm run build   # build de produção em dist/ondevai
npm test        # testes unitários em execução única
npm run lint    # ESLint para TypeScript e templates Angular
```

## Tecnologia e escolhas

- Angular 21 e TypeScript em modo strict.
- Componentes standalone e rotas lazy por funcionalidade.
- Signals e computed values para estado e valores derivados.
- Reactive Forms nos formulários de despesas, categorias e confirmações.
- Dexie 4 como implementação do IndexedDB.
- Chart.js 4 carregado no bundle, sem recursos ou chamadas externas em runtime.
- Vitest através do runner oficial do Angular e `fake-indexeddb` nos testes de persistência.
- ESLint com as regras TypeScript e de acessibilidade de templates do Angular.

O Angular 21 foi escolhido por ser uma linha estável compatível com o Node 22 disponível. O Chart.js é usado diretamente num componente Angular pequeno para evitar uma camada adicional de integração.

## Arquitetura

```text
src/app/
├── core/
│   ├── backup/          validação, exportação e importação
│   ├── database/        esquema Dexie e versionamento
│   ├── repositories/    interfaces, tokens e implementações IndexedDB
│   ├── services/        regras de aplicação
│   ├── settings/        estado do armazenamento do browser
│   └── stores/          facade global baseada em Signals
├── features/
│   ├── onboarding/
│   ├── dashboard/
│   ├── expenses/
│   ├── categories/
│   └── data-management/
├── models/
├── shared/
│   ├── components/
│   └── utils/           funções financeiras e de datas puras
└── app.routes.ts
```

Fluxo de dados:

```text
Componentes
    ↓
AppStore com Signals
    ↓
Serviços de aplicação
    ↓
Interfaces de repositório
    ↓
Implementações Dexie / IndexedDB
```

Os componentes nunca acedem diretamente ao IndexedDB. Totais, comparações e agrupamentos são calculados em memória por funções puras e não são persistidos.

## IndexedDB

A base de dados chama-se `ondevai` e começa na versão 1. Inclui quatro coleções:

- `expenses`
- `categories`
- `settings`
- `metadata`

O browser recebe um pedido de armazenamento persistente quando a API está disponível. A aplicação continua a funcionar se o browser não suportar ou não conceder esse modo.

Os dados pertencem ao browser e perfil atuais. Fechar ou atualizar a página conserva os registos, mas limpar os dados do site, apagar o perfil ou perder o dispositivo pode removê-los.

## Backups

A exportação cria um ficheiro com o nome `ondevai-backup-AAAA-MM-DD.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-17T18:30:00.000Z",
  "settings": {},
  "categories": [],
  "expenses": []
}
```

O ficheiro inclui todos os anos e ignora os filtros visíveis. Não inclui totais, gráficos ou outros valores derivados.

A importação do MVP funciona apenas por substituição. Antes da confirmação são verificados:

- versão e estrutura do schema;
- tipos e campos obrigatórios;
- IDs duplicados;
- relações entre despesas, categorias e subcategorias;
- datas e valores monetários;
- contagens e intervalo de datas apresentados na pré-visualização.

A escrita das quatro coleções ocorre numa única transação Dexie. Um ficheiro inválido ou uma falha de escrita não altera os dados existentes.

O JSON não está encriptado. Deve ser guardado num local seguro.

## Testes

A suite cobre:

- conversão e formatação monetária;
- totais mensais e anuais;
- comparação com o mês anterior;
- agrupamentos por categoria e subcategoria;
- criação, edição e eliminação de despesas;
- arquivo de categorias sem quebra do histórico;
- validação e rejeição de backups inválidos;
- exportação lógica e reimportação sem perda;
- rollback de uma importação atómica que falha;
- persistência após fechar e reabrir o IndexedDB.

## Privacidade e rede

O bundle não carrega fontes, imagens, scripts ou estilos externos. A aplicação não contém endpoints de dados e não faz pedidos de rede para processar informação financeira. O alojamento serve apenas os ficheiros estáticos do build.

## Limitações atuais

- Sem orçamentos, receitas, património ou despesas recorrentes automáticas.
- Sem importação CSV, anexos ou fotografias de recibos.
- Sem encriptação do ficheiro de backup.
- Sem merge de backups: a importação substitui o conteúdo local.
- Sem contas, perfis múltiplos, partilha ou sincronização entre dispositivos.

## Branches e licença

- `main`: versão estável.
- `dev`: integração do trabalho em desenvolvimento.

A licença do projeto ainda não foi definida. Nenhum ficheiro de licença é incluído.
