# Regras do sistema novo (`novo/`)

- Trabalhe só em `novo/` para o sistema novo; `frontend/` e `backend/` da raiz são o antigo e não são tocados.
- Build em `novo/frontend` (`npm run build`); scripts e testes de backend em `novo/backend` (`npm test`).
- SF nova: prefixo `s360`, SQL com `:VAR_USER` e o guarda `SEM_BLOQUEIO` de `novo/backend/lib/guardas.mjs`.
- `add-*.mjs` só roda no sandbox; depois dele, `add-000-perfil-acesso.mjs`. Nada do `mitra-sdk` roda desta máquina.
- Processo por spec: `plan.md` + `tasks.md` em `docs/specs/NNN-*/`, aprovação do usuário, depois código. A spec é o contrato; mudou regra, muda a spec antes.

## Um arquivo por spec (desenvolvimento em paralelo)

Várias specs são construídas ao mesmo tempo, cada uma no seu branch. Para o
merge não conflitar, cada spec só **cria** arquivos com o seu número; o
esqueleto descobre todos sozinho:

| O quê | Onde (spec NNN) | Descoberto por |
|---|---|---|
| SFs e tabelas novas | `novo/backend/add-NNN-*.mjs` (exporta `definitions`) | `simulator/config.mjs` (PUBLISH_ORDER, DDL_SOURCES) |
| Tabelas de produção que a spec lê | `novo/backend/schema-producao/NNN-*.mjs` | `simulator/config.mjs` |
| Dados do simulador | `novo/backend/simulator/seeds/NNN-*.mjs` (exporta `semear(ctx)`) | `simulator/seed.mjs` |
| Testes do backend | `novo/backend/simulator/smoke/NNN-*.mjs` (export default async) | `simulator/smoke.mjs` |
| Fragmentos SQL próprios | `novo/backend/lib/NNN-*.mjs` | import direto |
| Telas | `novo/frontend/src/pages/*Page.tsx`: `export default` com `.rota = '/caminho'` | `src/App.tsx` (glob) |
| Regras puras e testes de tela | `novo/frontend/src/lib/<domínio>.ts` + `tests/<domínio>.test.mjs` | `npm test` |

Regras que evitam conflito:
- **Uma tabela, um arquivo de schema.** Antes de declarar tabela, procure em `schema-producao/` e nos `add-*.mjs`. Já existe: use, não redeclare. Base comum (filial, BU, seção, clientes, carteira) em `000-base.mjs`; as da 001 em `001-acesso.mjs`.
- **Ids nos seeds:** cliente e demais registros com id escolhido usam a faixa da spec, NNN×1000+n (spec 002: 2001, 2002…; spec 009: 9001…). Assim dois seeds nunca disputam o mesmo id. Filial, BU, seção, clientes e carteira (`CLIENTES`, `EQUIPE_CLIENTE`) estão declarados em `000-base.mjs`; os dados de clientes e carteira de cada spec vão no seed dela.
- **Usuários:** os 11 de `simulator/seed.mjs` (ids 1..11, `ID.ANA` etc.) são de todos e não mudam. Usuário extra entra pelo `ctx.usuario(nome, email)` no seed da spec; no smoke, ache o id pelo e-mail.
- **Arquivos compartilhados** — mexa o mínimo, sempre com edição pontual, nunca reescrevendo o arquivo:
  - `novo/frontend/src/lib/server-functions.ts`: entradas em ordem alfabética da chave; id do simulador na faixa NNN×100+n.
  - `novo/frontend/src/lib/menu.ts`: as rotas já estão todas em `ROTAS`; só mude se a spec mudar permissão de tela.
  - `novo/backend/lib/guardas.mjs`, `simulator/*.mjs` do kit, `App.tsx`, `Layout.tsx`, `components/page.tsx`: só se a spec exigir, e diga no relatório o que mudou.
  - `docs/specs/README.md` e as specs de outros números: não edite; anote no relatório o que precisa mudar lá.
- **Smoke de uma spec só:** `npm run sim:smoke -- NNN`. Cada arquivo roda num banco temporário próprio.
- **Servidores:** as portas 3105 (simulador) e 5175 (app) são da sessão principal. Numa sessão paralela, para ver a tela, use outra porta: `SIMULATOR_PORT=31NN SIMULATOR_DB_PATH=<tmp> npm run sim` e `VITE_MITRA_BASE_URL=http://localhost:31NN npx vite --port 51NN`.
- **Worktree novo:** rode `npm install` em `novo/backend` e `novo/frontend` antes dos testes.
- **Commit:** em português, `tipo: descrição`, sem trailer de agente. Nunca adicione `backend/migrations/`, `backend/migrations.yaml` nem `uploads/`.
