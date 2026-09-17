# OndeVai

> O seu dinheiro, explicado. Os seus dados, no seu dispositivo.

OndeVai é uma aplicação web local-first para registar, organizar e analisar
despesas pessoais. A aplicação ajuda a perceber para onde vai o dinheiro ao
longo do mês e do ano, sem enviar os dados financeiros do utilizador para um
servidor.

## Princípios

- **Privado por definição:** despesas, categorias e preferências ficam no browser.
- **Controlo do utilizador:** categorias e subcategorias são totalmente personalizáveis.
- **Portabilidade:** todos os dados podem ser exportados e importados através de JSON.
- **Clareza:** os relatórios destacam a evolução mensal e as categorias com maior peso.
- **Sem conta:** o MVP não exige registo, autenticação ou sincronização cloud.

## MVP

### Visão geral

- Total gasto no mês e no ano.
- Comparação com o mês anterior.
- Evolução mensal das despesas.
- Distribuição por categoria e subcategoria.
- Identificação das categorias com maior despesa.

### Despesas

- Criar, editar e eliminar despesas.
- Registar data, valor, categoria, subcategoria e descrição.
- Pesquisar e filtrar por período, categoria e subcategoria.

### Categorias

- Conjunto inicial de categorias sugeridas.
- Criação, edição, ordenação e arquivo de categorias e subcategorias.
- Personalização de cor e ícone.

### Dados e privacidade

- Armazenamento local com IndexedDB.
- Exportação de todos os dados para um ficheiro JSON.
- Importação de um backup por substituição dos dados locais.
- Informação clara sobre a última exportação.
- Eliminação manual de todos os dados locais.

## Como funcionam os dados

```text
Utilizador regista uma despesa
              ↓
       IndexedDB no browser
              ↓
     Dashboard e relatórios
              ↓
       Exportação para JSON
```

O IndexedDB oferece persistência entre sessões no mesmo browser. O ficheiro
JSON funciona como cópia de segurança e permite transferir os dados para outro
browser ou dispositivo. Não existe sincronização automática.

Os dados locais podem ser perdidos se o utilizador limpar os dados do site,
eliminar o perfil do browser ou perder o dispositivo. Por esse motivo, a
aplicação deve incentivar a criação regular de backups.

## Estrutura prevista dos dados

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-17T18:30:00Z",
  "settings": {
    "currency": "EUR",
    "locale": "pt-PT"
  },
  "categories": [],
  "expenses": []
}
```

Os valores monetários serão guardados em cêntimos para evitar erros de
arredondamento. As despesas referenciam categorias e subcategorias através de
identificadores estáveis, permitindo alterar os seus nomes sem perder o
histórico.

## Onboarding

Na primeira utilização, a aplicação deve explicar que:

1. os dados financeiros ficam apenas no browser;
2. não existe conta nem sincronização cloud;
3. limpar os dados do browser pode apagar a informação;
4. o JSON serve como backup e meio de transferência;
5. o ficheiro exportado não é encriptado e deve ser guardado em segurança.

O utilizador pode começar com as categorias sugeridas ou criar a sua própria
estrutura.

## Fora do primeiro MVP

- Integração com bancos.
- Sincronização cloud.
- Orçamentos e alertas de limites.
- Registo de receitas e património.
- Despesas recorrentes automáticas.
- Vários perfis ou utilização partilhada.
- Importação de CSV.
- Encriptação do ficheiro de backup.

## Desenvolvimento

- `main` — versão estável do projeto.
- `dev` — integração do trabalho em desenvolvimento.

O projeto encontra-se na fase inicial de definição do produto e da arquitetura.

## Licença

A licença do projeto ainda não foi definida.
