# Tasks: Acesso, perfis, menu, configurações do usuário e tema

**Plan:** `plan.md` · **Data:** 2026-10-30

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

> Roteiro e prompt para o sandbox: [`roteiro-sandbox.md`](roteiro-sandbox.md).

- [ ] **T-001** `[sandbox]` — Ler a estrutura real de `USUARIO_PREFERENCIAS`, `USUARIO_BLOQUEIO`, `USUARIO_CARGO` (qual dos dois DDLs prevaleceu, L-04) e `INT_USER` com `listTablesMitra`; registrar no `plan.md` e corrigir `schema-producao/001-acesso.mjs` se divergir
- [ ] **T-002** `[sandbox]` — Confirmar como publicar um segundo frontend no projeto 60604 (ou num projeto só de hospedagem) e registrar a saída escolhida no `plan.md` (Riscos, linha 1)
- [ ] **T-003** `[sandbox]` — Confirmar que não existe SF com prefixo `s360` no projeto (`listServerFunctionsMitra`)
- [ ] **T-004** `[sandbox]` — Extrair a lista de quem tem `FUNCIONARIOS.STATUS = 'FERIAS'` ou `ID_SUBSTITUTO` preenchido (nome, substituto) e entregar à coordenação para recadastro (decisão A10) → `docs/specs/001-acesso-e-perfis/ferias-a-recadastrar.md`

## Esqueleto do sistema novo

- [x] **T-010** — Criar `novo/README.md` (o que é, como rodar, relação com o antigo) e acrescentar ao `CLAUDE.md`/`AGENTS.md` as regras de `novo/`: build em `novo/frontend`, scripts em `novo/backend`, prefixo `s360`, antigo intocado → `novo/README.md`, `CLAUDE.md`, `AGENTS.md` — *feito: regras em `novo/CLAUDE.md` (o `CLAUDE.md` da raiz é gerado pelo sistema e o `AGENTS.md` é de outro projeto; não foram tocados)*
- [x] **T-011** — `.gitignore` com `novo/backend/simulator/data/`, `novo/**/node_modules/`, `novo/**/dist/`, `novo/**/.env`; `.env.example` dos dois lados (do kit) → raiz, `novo/backend/.env.example`, `novo/frontend/.env.example`
- [x] **T-012** — `.claude/launch.json` com "s360-simulador" (porta 3105) e "s360-frontend" (porta 5175)

## Backend

- [x] **T-020** — `novo/backend/package.json` do kit (`mitra-sdk ^1.0.64`; scripts `publish:000`, `publish:001`, `sync:function-map`, `sim`, `sim:seed`, `sim:check`, `sim:smoke`, `test`) e `npm install` — *scripts: `publish:001` e `publish:perfil` (rodar nessa ordem)*
- [x] **T-021** — `novo/backend/schema-producao/001-acesso.mjs`: `CREATE TABLE IF NOT EXISTS` de `USUARIO_CARGO`, `USUARIO_PREFERENCIAS`, `USUARIO_BLOQUEIO`, `COORDENADORES`, `FERIAS_VENDEDOR`, `VENDEDOR_RCA`, `BU_VENDEDOR`, `TAREFAS`, `ALERTAS_INTELIGENTES`, copiados de `modelo-de-dados.md`; um template literal por tabela; cabeçalho dizendo que não é publicado
- [x] **T-022** — `novo/backend/lib/guardas.mjs`: `semBloqueio`, `temPapel(...papeis)`, `coordenadorAtivo`, `papeisDoUsuario` (união de `USUARIO_PAPEL` e `USUARIO_CARGO`) — *feito: `SEM_BLOQUEIO`, `temPapel`, `COORDENADOR_ATIVO`; a união de papéis ficou na SF de sessão, único uso*
- [x] **T-023** — `novo/backend/add-000-perfil-acesso.mjs`: acrescenta as SFs `s360*` e as tabelas lidas ao perfil `Operacao Comercial` (id 1), lendo as listas atuais antes e nunca substituindo
- [x] **T-024** — `novo/backend/add-001-acesso.mjs`: `CREATE TABLE IF NOT EXISTS USUARIO_PAPEL` + carga inicial idempotente a partir de `USUARIO_CARGO`; `definitions` de `s360SessaoObter`, `s360ContadoresObter`, `s360FeriasMinhasObter`, `s360ConfiguracoesGarantir`, `s360ConfiguracoesSalvar` (contratos do plan); publica só em `isEntrypoint()`
- [x] **T-025** — Copiar `sync-server-function-map.mjs` do kit apontando para `novo/frontend/src/lib/server-functions.ts`

## Simulador

- [x] **T-030** — Copiar `assets/backend/simulator/` para `novo/backend/simulator/`; `config.mjs` (label, `SEED` 60604, porta 3105, `PUBLISH_ORDER`, `DDL_SOURCES`, `CHECK_INPUT` do plan)
- [x] **T-031** — `seed.mjs`: os 11 usuários e dados da tabela de seed do plan (papéis, RCA, escopos, preferências, tarefas, alertas, férias, bloqueio)
- [x] **T-032** — `mysql-dialect.mjs`: shim de `UPDATE A JOIN B SET ...` em transação (tudo ou nada) e conferir `GROUP_CONCAT(DISTINCT ... SEPARATOR)`
- [x] **T-033** — `npm run sim:seed && npm run sim:check` sem `FALHOU`

## Frontend

- [x] **T-040** — `npm create vite@latest novo/frontend -- --template react-ts`; Tailwind 4 (`@tailwindcss/vite`), `react-router-dom`, `lucide-react`, `mitra-interactions-sdk@1.0.64`; `vite.config.ts` com `base: './'`, alias `@` e porta 5175; script `"test": "node --test \"tests/**/*.test.mjs\""`
- [x] **T-041** — Instalar o design system com `/benenutri:design` (modo Instalar) em `novo/frontend`: tokens claro/escuro em `index.css`, fontes, logo, primitivos e `docs/design.md`
- [x] **T-042** `[P]` — `src/lib/` do kit: `mitra-auth.ts` (`SIMULADOR_URL` na porta 3105), `mitra-api.ts`, `formato.ts` (+ `hojeBrasilia`, `agoraBrasilia`), `server-functions.ts` com as 5 SFs `s360*`
- [x] **T-043** `[P]` — `src/lib/sessao.ts`, `menu.ts`, `login.ts`, `perfil.ts`, `contadores.ts` com as funções da tabela do plan (só regra pura, sem React)
- [x] **T-044** `[P]` — `src/lib/tema.ts` (decisões puras) + invólucro de DOM/`postMessage`; `iniciarTema()` chamado em `main.tsx` antes do React (RNF-003)
- [x] **T-045** — `App.tsx`: rotas, guarda de sessão (RN-001, C-002), contexto de sessão (`s360SessaoObter` + `s360ContadoresObter` com `Promise.allSettled`), saída por bloqueio (C-006), destino após login (RN-004), `AcessoRestrito` por `podeAbrir` (RN-015)
- [x] **T-046** — `Layout` com `Menu` por seção, contadores, recarga a cada 5 min e no evento `s360:contadores`, `BarraSuperior` (marca, tema, configurações, avatar com iniciais) e ☰ no celular
- [x] **T-047** — `LoginPage` (Google, Microsoft, e-mail/senha, `Esqueci minha senha`, aviso de bloqueio; formulário do simulador em `MODO_LOCAL`) e `RecuperarSenhaPage` — *feito como um cartão só com três passos (§10.1 do design); `/recuperar-senha` abre no passo de recuperação*
- [x] **T-048** — `ConfiguracoesPage`: cards, selo e textos de férias (`s360FeriasMinhasObter`), edição e salvar (`Garantir` → `Salvar`), opções de página inicial por permissão; espaço reservado para o bloco Google Agenda (spec 003)
- [x] **T-049** `[P]` — `AcessoRestrito` e `EmConstrucao` (placeholder das rotas do menu ainda sem spec construída)

## Testes

Uma task por linha da seção Testes do plan.

- [x] **T-080** — `teste('C-006: usuário bloqueado ...')` em `smoke.mjs`: Fábio → `BLOQUEADO = 1`; contadores 0 linhas; salvar 0 afetadas; desbloqueado → contadores voltam
- [x] **T-081** — `teste('RN-005: papéis somam tabela nova e legada')` em `smoke.mjs`: Paulo → GESTOR + COORDENADOR; Tânia → ADMIN
- [x] **T-082** — `teste('RN-006: coordenador só com cadastro ativo')` em `smoke.mjs`: Rita 0, Gil 1
- [x] **T-083** — `teste('C-009: contadores')` em `smoke.mjs`: Ana 3 → 2 após concluir; alertas 4
- [x] **T-084** — `teste('dialeto: UPDATE JOIN é tudo ou nada')` em `smoke.mjs`: falha na segunda atribuição não altera nenhuma tabela
- [x] **T-085** — `teste('C-011: página inicial sem permissão é recusada')` em `smoke.mjs`: Carla `/painel-gestao` → 0 afetadas
- [x] **T-086** — `teste('C-012: férias do titular')` em `smoke.mjs`: Ana em 30/10 FUTURA, 05/11 ATIVA, 16/11 nenhuma
- [x] **T-087** — `teste('RN-012: substituto vê quem cobre')` em `smoke.mjs`: Bruno em 05/11 → SUBSTITUTO/ATIVA com Ana Souza
- [x] **T-088** — `teste('C-013: salvar é tudo ou nada')` em `smoke.mjs`: Garantir cria 1; valor inválido → 0 e nome inalterado; válido → 1 e 4 campos; Garantir não duplica
- [x] **T-089** — `teste('RN-010: nome acima de 120 é recusado')` em `smoke.mjs`: 121 caracteres → 0 afetadas
- [x] **T-090** — `teste('C-015: usuário sem configuração')` em `smoke.mjs`: Fernando `CONFIGURADO = 0`; Gil isento
- [x] **T-091** `[P]` — `tests/sessao.test.mjs`: C-001/RN-004, C-002, C-010, RN-013, C-015/RN-017, RN-001
- [x] **T-092** `[P]` — `tests/login.test.mjs`: C-003/RN-002, C-004/RF-002, RN-003, C-005
- [x] **T-093** `[P]` — `tests/menu.test.mjs`: C-007/RN-005, RN-005 (permissões de tela), C-008/RN-015, C-011/RN-011, RN-011 (telas canceladas)
- [x] **T-094** `[P]` — `tests/perfil.test.mjs`: C-012/RN-012, RN-012 (substituto), RN-010
- [x] **T-095** `[P]` — `tests/tema.test.mjs`: C-014/RN-009, RN-009 (ordem)
- [x] **T-096** `[P]` — `tests/contadores.test.mjs`: RN-007
- [x] **T-097** `[P]` — `tests/formato.test.mjs` (kit) + `hojeBrasilia`/`agoraBrasilia` em 30/10/2026 23:30 de Brasília

## Verificação

- [x] **T-100** — `cd novo/backend && npm test` verde (`sim:check` + `sim:smoke`)
- [x] **T-101** — `cd novo/frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [x] **T-102** — No simulador: entrar como Ana (C-001 cai na Agenda), Carla (C-011 cai no Dashboard), Fábio (C-006 volta ao login com a mensagem), Gil (C-007, menu); Configurações de Ana em 30/10 (C-012)
- [ ] **T-103** — Verificação manual da spec: menu em 360 px com ☰; barra superior sem busca, sino e ajuda; nenhuma janela de novidades; abrir em escuro sem piscar; login e Configurações em tema escuro sem cor quebrada; F5 mantém a sessão (RNF-001); endereço sem token após o login (RNF-002) — *parcial em 03/11: claro e escuro no login, menu e Configurações conferidos; falta 360 px com ☰, F5 e endereço sem token*
- [ ] **T-104** — Contagem de consultas na abertura ≤ 3 no `/health` do simulador (RNF-004) — *medido em 03/11: 4 chamadas no `npm run dev` por causa do StrictMode, que duplica efeitos só em desenvolvimento; no build são as 2 do plano. Falta conferir no build publicado*
- [ ] **T-105** `[sandbox]` — Publicar `add-000` e `add-001`, `sync:function-map`, build do frontend novo no destino de T-002; validar salvar Configurações com um usuário business (risco `UPDATE ... JOIN`)

## Dependências

```
T-001, T-002, T-003 ─┐
T-010 → T-011 → T-012 │
T-020 → T-021 → T-022 → T-023 → T-024 → T-025
T-024 → T-030 → T-031 → T-032 → T-033 → T-080…T-090 → T-100
T-040 → T-041 → T-042 → T-043/T-044 [P] → T-045 → T-046 → T-047/T-048/T-049
T-043/T-044 → T-091…T-097 [P] → T-101
T-100 + T-101 → T-102 → T-103 → T-104 → T-105 (exige T-001, T-002, T-003)
T-004 independente
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001, C-003 | T-042, T-045, T-047 | T-091, T-092 |
| RF-002 / C-004 | T-047 | T-092 |
| RF-003 / C-005, RN-003 | T-047 | T-092 |
| RF-004 / C-002, C-011, RN-001, RN-004 | T-045 | T-091, T-093, T-085 |
| RF-005 / C-006, RN-016 | T-022, T-024, T-045 | T-080 |
| RF-006 / C-007, RN-005, RN-006 | T-022, T-024, T-043, T-046 | T-081, T-082, T-093 |
| RF-007 / C-009, RN-007, RN-008 | T-024, T-046 | T-083, T-096 |
| RF-008 / C-008, RN-015 | T-045, T-049 | T-093 |
| RF-009 / C-013, RN-010, RN-014 | T-024, T-032, T-048 | T-084, T-088, T-089, T-094 |
| RF-010 / C-010, RN-011 | T-024, T-045 | T-085, T-091, T-093 |
| RF-011 / C-012, RN-012 | T-024, T-048 | T-086, T-087, T-094 |
| RF-012 / C-014, RN-009 | T-041, T-044 | T-095 |
| RF-013 / RN-010, RN-013 | T-046 | T-091, T-094 |
| RF-014 / C-015, RN-017 | T-024, T-045 | T-090, T-091 |
| RF-015 | T-048 (espaço reservado; conteúdo na spec 003) | spec 003 |
| RN-002 | T-047 | T-092 |
| RNF-001, RNF-002 | T-042 | T-103 |
| RNF-003 | T-044 | T-103 |
| RNF-004 | T-045 | T-104 |
| Decisão A10 (férias antigas) | T-004 | — |
