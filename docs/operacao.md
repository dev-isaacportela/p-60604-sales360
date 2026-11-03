# Operação e Desenvolvimento

> Parte da [documentação do projeto](README.md). Veja também: [Arquitetura](arquitetura.md) · [Pendências](pendencias.md)

## Setup do frontend

```bash
cd frontend
npm install
npm run dev      # desenvolvimento
npm run build    # tsc -b && vite build  ← SEMPRE rodar de frontend/, nunca da raiz
npm run test     # Vitest
npm run lint     # ESLint 9 flat config
```

Variáveis de ambiente ([.env.example](../frontend/.env.example) — auto-populadas pelo servidor, não hardcodar):

| Variável | Uso |
|---|---|
| `VITE_MITRA_AUTH_URL` | URL de autenticação Mitra |
| `VITE_MITRA_PROJECT_ID` | Id numérico do projeto no Mitra |

## Setup do backend

`backend/` não tem servidor — são scripts one-shot + MCP. Variáveis (`backend/.env`, auto-populado):

| Variável | Uso |
|---|---|
| `MITRA_BASE_URL` / `MITRA_BASE_URL_INTEGRATIONS` | Endpoints da plataforma |
| `MITRA_TOKEN` | Token de serviço |
| `MITRA_PROJECT_ID` / `MITRA_WORKSPACE_ID` | Identificação do projeto |
| `MCP_PORT`, `MCP_HTTP_AUTH_TOKEN`, `MCP_ALLOWED_ORIGIN`, `MCP_ENABLE_MUTATIONS` | Só para o MCP HTTP ([README-mcp.md](../backend/README-mcp.md)) |

MCP server (consulta read-only ao banco/SFs do projeto):

```bash
cd backend
npm run mcp        # stdio
npm run mcp:http   # HTTP
```

## Taxonomia dos scripts `.mjs`

~265 scripts em [`backend/`](../backend/); o prefixo indica a intenção:

| Prefixo | Significado |
|---|---|
| `add-*` | Nova feature/tabela/SF |
| `update-*` | Altera SF existente |
| `fix-*` / `hotfix-*` | Correção |
| `diagnostico-*` / `debug-*` | Investigação (não altera estado) |
| `validar-*` / `validate-*` | Verificação pós-mudança |
| `sanear-*` / `repair-*` / `corrigir-*` | Correção de dados |
| `import-*` / `migrar-*` / `extrair-*` | Carga TOTVS/Winthor |
| `schedule-*` | Agendamento de cron |
| `seed-*` / `sync-*` / `apply-*` | Seed, sincronização, aplicação em lote |

Utilidades: [sf-versionar.mjs](../backend/sf-versionar.mjs) tira snapshot de SFs para `backend/sf-versions/`; `*.sf.js` guardam o fonte de SFs JAVASCRIPT.

## Ambiente DEV — identidade dos usuários

O banco do DEV foi clonado com os dados reais (clientes, carteiras, vendas), mas esse dado está amarrado aos **IDs de usuário antigos** (5–50). Quem loga no DEV são usuários **novos**, com IDs diferentes:

| Login do DEV | `INT_USER.ID` no DEV | ID legado com o mesmo e-mail |
|---|---|---|
| `ti@benenutri.com` | 54 | 5 |
| `lucas.rabelo@benenutri.com` | 59 | — |
| `ana.sousa@mitralab.io` | 53 | 6 |

Consequência: sem vínculo explícito, **toda tela abre vazia no DEV** — `USUARIO_CARGO`, `BU_VENDEDOR`, `EQUIPE_CLIENTE` e `VENDEDOR_RCA` apontam para os IDs antigos. Não é bug de tela.

[seed-dev-usuarios-validacao.mjs](../backend/seed-dev-usuarios-validacao.mjs) resolve isso. É **puramente aditivo**: a carteira montada usa apenas clientes que não pertencem a nenhum vendedor e um RCA sem usuário vinculado, então não há carteira duplicada nem dupla contagem de faturamento. Reversão em [seed-dev-usuarios-validacao-reverter.sql](../backend/seed-dev-usuarios-validacao-reverter.sql).

> O seed **não gera migration** (nenhuma chamada usa `generateMigration`) — é massa de validação do DEV e não deve subir no promote.

Ao criar um novo login no DEV, rode o seed novamente (ou replique o mesmo conjunto de vínculos) para o novo `INT_USER.ID`.

## Migrations (regras críticas)

Definidas no [CLAUDE.md](../CLAUDE.md):

- História **append-only**: nunca editar/renumerar/fundir migration aplicada; correção é sempre migration nova.
- `backend/migrations/` e `backend/migrations.yaml` são **gerenciados exclusivamente pelo sistema** (materializados após o turno do agente) — nunca criar/editar/commitar manualmente.
- `mergeBaseline` só com ordem explícita do usuário.
- Estado conhecido: 118 migrations no yaml; 3 declaradas sem arquivo em disco (082–084) — ver [pendências](pendencias.md).

## Fluxo de colaboração (SYNC/SHARE)

Repo compartilhado entre agentes/colaboradores via git (`github.com/mitra-agent-projects/p-45654`, baseline `main`, branch de trabalho por usuário). Todo turno de agente:

1. **SYNC** — `git fetch origin && git merge origin/main --no-edit` antes de qualquer coisa; avaliar o diff recebido.
2. Trabalho (backend → frontend → build).
3. **SHARE** — 1 commit ao fim do turno, merge da branch de usuário em `main` e `git push origin main`.

Conflito de merge → sempre perguntar ao usuário (linguagem de negócio); nunca `--force`, nunca rebase. Detalhes completos no [CLAUDE.md](../CLAUDE.md).

## Auditoria da documentação

O agente [`revisor-docs`](../.claude/agents/revisor-docs.md) audita se os docs de `docs/` refletem o código atual (rotas × `App.tsx`, SFs × `useMitra.ts`, tabelas × `backend/*.mjs`, links). É somente leitura e devolve um relatório de divergências. Rode após features relevantes ou peça "revise a documentação" numa sessão do Claude Code.

## Testes

3 suítes existentes (Vitest):

- [smartSearch.test.ts](../frontend/src/lib/smartSearch.test.ts) — busca fuzzy (normalização, stopwords pt-BR, Levenshtein).
- [historicoClientes.utils.test.ts](../frontend/src/pages/historicoClientes.utils.test.ts) — paginação/filtros/race-conditions do histórico.
- [HistoricoClientesPage.integration.test.tsx](../frontend/src/pages/HistoricoClientesPage.integration.test.tsx) — integração da página de histórico.

Cobertura baixa para o tamanho da base — registrado em [pendencias.md](pendencias.md).
