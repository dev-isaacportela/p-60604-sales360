# Regras do sistema novo (`novo/`)

- Trabalhe só em `novo/` para o sistema novo; `frontend/` e `backend/` da raiz são o antigo e não são tocados.
- Build em `novo/frontend` (`npm run build`); scripts e testes de backend em `novo/backend` (`npm test`).
- SF nova: prefixo `s360`, SQL com `:VAR_USER` e o guarda `SEM_BLOQUEIO` de `novo/backend/lib/guardas.mjs`; nome no `server-functions.ts` do frontend.
- Toda spec nova: definitions em `add-NNN-*.mjs` (acrescentar em `simulator/config.mjs` PUBLISH_ORDER/DDL_SOURCES), tabelas de produção lidas em `schema-producao.mjs`, seed e um `teste()` por C/RN no `smoke.mjs`.
- `add-*.mjs` só roda no sandbox; depois dele, `add-000-perfil-acesso.mjs`.
