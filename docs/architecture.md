# Arquitetura — WCKD

## Visão geral

```
┌──────────────── WebView2 (interface) ────────────────┐      ┌────────────── Processo Rust ──────────────┐
│ React 19 + TypeScript + Tailwind 4 + Rough.js        │      │ Tauri 2                                    │
│  pages/        telas (carregadas sob demanda)        │ IPC  │  commands.rs   camada fina, async          │
│  components/   UI, modal de lançamento, gráficos     │◄────►│  services/     regras de negócio (testadas)│
│  lib/api.ts    wrappers tipados das commands         │      │  db.rs         SQLite + migrações          │
│  lib/store.ts  revisão global + useQuery + toasts    │      │  period.rs     meses/datas                 │
│  types/        contratos espelhados do Rust          │      │  fmt.rs        formatação pt-BR (mensagens)│
└──────────────────────────────────────────────────────┘      └──────────────┬─────────────────────────────┘
                                                                              │ rusqlite (SQLite embutido)
                                                               %LOCALAPPDATA%\com.wckd.app\wckd.db
```

## Decisões

| Decisão | Motivo |
|---|---|
| **rusqlite** (`bundled`) em vez de SQLx | App local com um único usuário: dispensa pool assíncrono e checagem de SQL em tempo de compilação. O SQLite vai compilado dentro do `.exe`, sem DLL externa e com versão fixa. |
| Conexão única em `Mutex` | As operações levam microssegundos. Uma conexão só evita problemas de concorrência e de WAL. |
| Commands `async` | No Tauri 2, commands síncronas rodam na thread principal. As `async` rodam no pool de threads e nunca travam a janela. |
| Centavos em `i64` | Precisão exata, sem dependência de biblioteca decimal. |
| Migrações em `PRAGMA user_version` | Os arquivos `migrations/NNNN_*.sql` são embutidos com `include_str!` e aplicados em transação. Não precisa de dependência extra. |
| Diálogos de arquivo abertos pelo Rust | O frontend não precisa de permissão de sistema de arquivos. A capability usa só `core:default`. |
| Estado do frontend sem biblioteca | Uma "revisão" global é incrementada após cada alteração, e `useQuery` recarrega os dados da tela atual. Assim todos os indicadores são atualizados depois de qualquer edição ou exclusão. |
| Sem roteador | A navegação é uma store com a página atual. As páginas, exceto o Dashboard, carregam com `lazy()`. |
| Gráficos próprios com Rough.js | Pizza, barras e linhas são desenhados à mão (`src/components/charts.tsx`) a partir do gerador do Rough.js (~9 KB), no lugar do Recharts (~420 KB). Cada traço usa uma semente fixa, então o desenho não "treme" de novo a cada renderização. As cores são variáveis CSS: trocar o tema não exige redesenhar. |
| Tema claro/escuro | Os tokens ficam em `src/styles/index.css` (`:root` e `.dark`). A preferência é salva no banco (`settings.theme`), com cópia em `localStorage` para o tema certo aparecer já no primeiro desenho da tela. O Rust também ajusta a cor de fundo da janela ao abrir. |
| Fontes embutidas (Comic Neue, Permanent Marker) | Vêm do `@fontsource` e entram no build. Nada é baixado em tempo de execução. |
| Instalador NSIS por usuário | Não exige administrador. Atualizações substituem só a pasta de instalação. O banco fica em `%LOCALAPPDATA%`. |

## Fluxo de uma alteração

1. O usuário salva o modal. `mutate(() => api.createTransaction(input))` é chamado.
2. A command `create_transaction` chama `services::transactions::create`, que valida a entrada e faz o `INSERT`.
3. Em caso de sucesso, `invalidate()` incrementa a revisão, todas as consultas montadas recarregam e aparece o toast.
4. Em caso de erro, o `AppError` volta como `{ kind, message }` e a mensagem em português aparece no toast.

## Banco de dados

As tabelas são `settings`, `categories`, `transactions`, `recurring_expenses`, `installment_plans` e `budgets`.
O detalhamento está em `src-tauri/migrations/0001_initial.sql`.

- **Índices:**
  - `transactions(date)`, `(kind, date)` e `(category_id, date)`.
  - Índices únicos parciais para o pagamento de cada vencimento recorrente e para o número de cada parcela.
- **Gatilhos:** o tipo da transação precisa ser igual ao tipo da categoria.
- **Pragmas:** `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`.

### Como adicionar uma migração

1. Crie `src-tauri/migrations/0002_descricao.sql`.
2. Adicione `include_str!("../migrations/0002_descricao.sql")` ao final de `MIGRATIONS` em `src-tauri/src/db.rs`.
3. **Nunca edite uma migração já publicada.** Bancos existentes e backups antigos dependem dela.
   Backups com versão de schema menor são migrados automaticamente ao serem restaurados.

## Backup

- **Exportar:** grava uma cópia consistente do banco com `VACUUM INTO` (num arquivo temporário),
  valida essa cópia e só então a move para o destino.
- **Restaurar:**
  1. Valida o arquivo: abre somente leitura e verifica `integrity_check`, a versão do schema, as tabelas obrigatórias e `foreign_key_check`.
  2. Mostra um resumo e pede confirmação.
  3. Salva uma cópia de segurança do banco atual em `%LOCALAPPDATA%\com.wckd.app\backups\antes-da-restauracao-*.wckd`.
  4. Copia o backup para dentro do banco com a API de backup do SQLite e roda as migrações pendentes.

## Testes

| Camada | Comando | Cobertura |
|---|---|---|
| Rust | `cd src-tauri && cargo test` | Saldo, totais, taxa de economia, virada de ano, análises, parcelamentos, recorrências, orçamentos, categorias, integridade (FK, unicidade), migrações, persistência ao reabrir, backup e restauração, CSV |
| Frontend | `npm test` | Conversão e formatação monetária, validações, filtros, navegação de período, modal de lançamento (validação e envio), carregamento, erro e recarga de dados |
