# Tasks: Dashboard (tela inicial)

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — `META_SEMANAL_VISITAS` não existe (o `STATUS` da carga e as colunas de `METAS_BU_VENDEDOR` passaram para a 006 e a 007, D-509)
- [ ] **T-002** `[sandbox]` — Nenhuma SF `s360Dashboard*` ou `s360MetaVisitas*` existe; `s360AnalyticsResumo`, `s360AnalyticsEvolucao` (007) e `s360SemanalAtualizacao` (006) já publicadas

## Backend

- [x] **T-010** — `schema-producao/005-dashboard.mjs`: `METAS_BU_VENDEDOR`, `ACOMP_SEMANAL_SYNC_LOG`
- [x] **T-011** — `lib/005-dashboard.mjs`: `ehCoordenador`, `metaSemanal`, `pessoasMeta()`, `vendaNoEscopo`, `metaMensal`, `alertaNoEscopo`, `ULTIMA_CARGA`, com a coluna "trocar quando" em comentário
- [x] **T-012** — `add-005-dashboard.mjs`: DDL de `META_SEMANAL_VISITAS` + carga inicial (16/8); `definitions` das 5 SFs; publica só em `isEntrypoint()`; `package.json` com `publish:005`
- [x] **T-013** — Troca na 003: `metaDe(pessoa, segunda)` em `lib/003-agenda.mjs`; `RESUMO` de `add-003-agenda.mjs` passa `segunda` e conta coordenadores por `ehCoordenador`; smoke da 003 continua verde
- [x] **T-014** — `simulator/seeds/005-dashboard.mjs` (ids 5001+, usuários por `ctx.usuario`)
- [x] **T-015** — `npm run sim:check` sem `FALHOU` (`CHECK_INPUT` não precisou mudar)
- [x] **T-016** — D-509: `s360DashboardMes`, `s360DashboardVendasDiarias`, `vendaNoEscopo`, `metaMensal`, `alertaNoEscopo`, `ULTIMA_CARGA` e `schema-producao/005-dashboard.mjs` saem; `s360DashboardAlertas` usa `alertaVisivel` da 008

## Frontend

- [x] **T-020** — `src/lib/server-functions.ts`: 5 entradas em ordem alfabética, ids 501…505
- [x] **T-021** `[P]` — `src/lib/dashboard.ts` (funções da tabela do plan)
- [x] **T-022** — `pages/DashboardPage.tsx` (`.rota = '/'`) + `pages/dashboard/*.tsx` (saudação e janela de compromissos, Meta semanal, Meta mensal, Vendas diárias, Alertas, Últimas Atividades, Resumo da Semana)
- [x] **T-024** — D-509: card do mês por `s360AnalyticsResumo` (`entradaMes`) + `s360SemanalAtualizacao`; gráfico por `s360AnalyticsEvolucao` (`entradaDiarias`, `diasDaEvolucao`); `server-functions.ts` perde as ids 502 e 503
- [x] **T-023** — `pages/AgendaPage.tsx`: estado inicial por `?modo=DIA&data=`; `pages/dashboard/MetaVisitasConfig.tsx` montado em `ConfiguracoesPage.tsx` (D-508)

## Testes

- [x] **T-080** — smoke `C-002 / RN-002`
- [x] **T-081** — smoke `C-003 / RN-003 / RN-004`
- [x] **T-082** — smoke `C-004`
- [x] **T-083** — smoke `RN-005 / RF-004`
- [x] **T-084** — smoke `C-005 / RN-006 / RN-007`, `C-007`, `RN-006 (recorte)`, `RNT-007`
- [x] **T-085** — smoke `C-008 / RN-009`
- [x] **T-086** — smoke `C-009 / RN-012`
- [x] **T-087** — smoke `C-010 / RN-010`
- [x] **T-088** — smoke `RN-011`, `RF-010`
- [x] **T-090** — smoke `C-004 da 000`: card do mês = Overview do Analytics no período Mês (três escopos); alertas = os 5 altos não lidos mais recentes da tela de Alertas
- [x] **T-089** `[P]` — `tests/dashboard.test.mjs`: C-001, RN-001, C-002, C-012, C-003/C-004 (tela), RN-005, C-005, C-006, C-007, RN-007, RN-008, C-008/RN-009, C-009/RN-012, RN-011, C-011, D-509 (entradas iguais às do Analytics)

## Verificação

- [x] **T-110** — `cd novo/backend && npm test` verde
- [x] **T-111** — `cd novo/frontend && npm test`, `npm run lint` e `npm run build` limpos
- [x] **T-112** — Simulador em porta própria (3155/5155): Dalva em Meu painel, Caetano em Time inteiro e em Vendedor específico, Gil (diretoria) configurando a meta em Configurações; bloco de vendas com falha forçada (C-011); `Abrir agenda completa` abre a Agenda no Dia de hoje
- [x] **T-113** — Verificação manual da spec: 375 px sem rolagem horizontal, tema escuro, `Abrir agenda do dia` na visão Dia de hoje
- [ ] **T-120** `[sandbox]` — Depois de `add-006`, `add-007` e `add-008`: publicar `add-005` (DDL + 3 SFs; apagar `s360DashboardMes` e `s360DashboardVendasDiarias` se a fase 1 chegou a ser publicada), troca da 003 (`add-003`), `add-000-perfil-acesso`, `sync:function-map`; medir "Todos os coordenadores" (RNF-001)

## Dependências

- T-011 → T-012 → T-013 → T-014/T-015 → smoke
- T-020 → T-022; T-021 → T-089
- T-016 → T-024 → T-090 (troca D-509)
- Pendente na 008 (fora desta spec): `AlertasPage` ler o parâmetro `alertaId`
