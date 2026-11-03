# Tasks: Carteira de clientes

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — Com `listTablesMitra` e uma amostra de 5 linhas: colunas e tipos de `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS`, `IMP_CLIENTES_TOTVS` (datas DATE ou texto, códigos INT ou texto); valores distintos de `CLIENTES.STATUS` e de `IMP_CLIENTES_TOTVS.RAMO` (grafia de Pessoa Física); versão do MySQL (CTE e funções de janela); se `:VAR_USER` é substituído em `runQueryMitra` dentro de SF JAVASCRIPT chamada por usuário business. Registrar no `plan.md` e corrigir `schema-producao/002-carteira.mjs`
- [ ] **T-002** `[sandbox]` — Confirmar que nenhuma SF `s360Carteira*`, `s360Disponive*`, `s360Historico*`, `s360Titular*`, `s360Relato*`, `s360Prospect*`, `s360Escopo*`, `s360Cliente*` existe

## Backend

- [x] **T-010** — `novo/backend/schema-producao/002-carteira.mjs`: DDL inteiro de `VISITAS`, `RELATOS_CLIENTE`, `CLIENTE_TITULAR_DEPTO`, `COORDENADORES_BU`, `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS`, `PRODUTOS_CUSTOS`, `PROSPECTS`, `PROSPECT_CONTATOS`; `IMP_*` com as colunas usadas, "confirmar no sandbox"
- [x] **T-011** — `novo/backend/lib/002-carteira.mjs`: `cod`, `num`, `semAcento`, `BLOQUEADOS`, `escopoAlvo`, `carteiraVisivel`, `vendaConta`, `vendaDoVendedor`, `candidatos`, `DEPTOS_POR_SECAO`, com comentário de uso (SF SQL e JS)
- [x] **T-012** — `novo/backend/lib/002-regras.mjs`: funções puras sem import — `normalizar`, `casaBusca`/`relevancia` (RN-018), `scoreRanking`, `curvaAuto`, `temperatura`, `classe` (RN-004…RN-008), `queda` (RN-012), `limiteCurva`/`pendente` (RN-006), `montarCarteira` (filtros, ordem, indicadores, página)
- [x] **T-013** — `novo/backend/add-002-carteira.mjs`: `definitions` das 24 SFs do plan (JS montada com o texto de `002-regras.mjs`); `cronExpression` nas duas de titulares; publica só em `isEntrypoint()`; `package.json` com `publish:002`
- [x] **T-014** — `novo/backend/simulator/seeds/002-carteira.mjs`: dados da tabela de seed do plan (ids 2001+; Carlos por `ctx.usuario`)
- [x] **T-015** — `npm run sim:check` sem `FALHOU`; shim novo em `mysql-dialect.mjs` só se faltar algo (com teste e nota no relatório)

## Frontend

- [x] **T-020** — `src/lib/server-functions.ts`: as 24 entradas, em ordem alfabética, ids 201…224
- [x] **T-021** `[P]` — `src/lib/escopo.ts` + `src/components/FiltroEscopo.tsx` (RNT-003)
- [x] **T-022** `[P]` — `src/lib/carteira.ts` e `src/lib/titulares.ts` (funções da tabela do plan)
- [x] **T-023** — `pages/ClientesPage.tsx` (`.rota = '/clientes'`, abas, `?clienteId=`) e `pages/ClienteBuscaPage.tsx` (`.rota = '/clientes/:clienteId'`)
- [x] **T-024** — `pages/clientes/AbaCarteira.tsx`: cards, gráfico por ramo, legenda, filtros, lista, curva, temperatura, ficha, remover, novo prospect, relato
- [x] **T-025** — `pages/clientes/AbaDisponiveis.tsx`
- [x] **T-026** — `pages/clientes/AbaHistorico.tsx`: seletor, filtros, linha do tempo, pedidos, detalhes, última semana
- [x] **T-027** `[P]` — `pages/clientes/AbaProspects.tsx`: espaço reservado da spec 008
- [x] **T-028** — `pages/GestaoTitularesPage.tsx` (`.rota = '/gestao-titulares'`)

## Testes

Uma task por linha da seção Testes do plan. Backend em `simulator/smoke/002-carteira.mjs`.

- [x] **T-080** — `C-001 / RN-010`: indicadores de Ana; ticket nulo sem ativos
- [x] **T-081** — `C-002 / RN-006`: pendentes X e Z; 61/62 dias; visita de outro vendedor não conta
- [x] **T-082** — `C-003 / RN-007`: W = 92 Quente
- [x] **T-083** — `C-004 / RN-007`: V = 0 Frio, sem datas
- [x] **T-084** — `RN-007 (bordas)`: limites da tendência; visita agendada não conta
- [x] **T-085** — `C-005 / RN-004 / RN-005`: K 76,0 B; 100 A; 4,0 C; curva manual D em `TEAM`
- [x] **T-086** — `RN-008`: classes e média
- [x] **T-087** — `C-006 / RN-013`: `NOME_AZ` na carteira inteira
- [x] **T-088** — `C-007 / RN-018`: busca inteligente
- [x] **T-089** — `RN-012`: selo Queda e 250 alertas
- [x] **T-090** — `C-008 / RN-019`: disponíveis por escopo e adicionar
- [x] **T-091** — `C-009`: segunda adição recusada
- [x] **T-092** — `C-010`: sem escopo
- [x] **T-093** — `RN-019 (PF)`: Pessoa Física fora
- [x] **T-094** — `C-011 / RN-015`: remover só o próprio vínculo
- [x] **T-095** — `C-012 / RN-001`: cobertura por férias ativas
- [x] **T-096** — `C-013 / RN-002`: titular manual na carteira e nas vendas
- [x] **T-097** — `C-014 / RN-003`: titular automático e recálculo
- [x] **T-098** — `RN-002 (bloqueio)`
- [x] **T-099** — `RN-020`: agrupamento por seção e gestão fora das BUs
- [x] **T-100** — `C-015 / RN-017`: linha do tempo e pedidos de X
- [x] **T-101** — `RN-017 (filtros)`: período vale para todos os registros
- [x] **T-102** — `C-016 / RN-016`: relato avulso
- [x] **T-103** — `RN-014`: ficha só leitura vinda do cadastro
- [x] **T-104** — `C-017 / RN-021`: prospect
- [x] **T-105** — `RNT-003 (servidor)`: modo sem permissão não devolve dado
- [x] **T-106** `[P]` — `tests/carteira.test.mjs`: RN-009, C-006 (página 1), RN-011, C-016, RN-014, C-017, RF-015, RF-018
- [x] **T-107** `[P]` — `tests/escopo.test.mjs`: RNT-003 (cascata, padrão, quem vê o filtro)
- [x] **T-108** `[P]` — `tests/titulares.test.mjs`: RN-020 (tela)

## Verificação

- [x] **T-110** — `cd novo/backend && npm test` verde
- [x] **T-111** — `cd novo/frontend && npm test`, `npm run build` e `npm run lint` limpos
- [x] **T-112** — No simulador (porta própria da sessão): Ana em `/clientes` (cards, filtros, temperatura, adicionar Q), `/clientes/2471`, `/clientes?clienteId=2001`, Carlos em `/gestao-titulares` (feito com outra adição que não Q; o diálogo de temperatura ficou sem abrir no navegador)
- [ ] **T-113** — Verificação manual da spec: 360 px nas 4 abas; legenda, temperatura e Titulares em tema escuro
- [ ] **T-114** `[sandbox]` — Publicar `add-002` e `add-000-perfil-acesso`, `sync:function-map`; medir a carteira de um coordenador no modo Time inteiro (RNF-001/002)

## Dependências

```
T-001, T-002 ─────────────────────────────┐
T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-080…T-105 → T-110
T-020 → T-021/T-022 [P] → T-023 → T-024…T-028
T-021/T-022 → T-106…T-108 [P] → T-111
T-110 + T-111 → T-112 → T-113 → T-114 (exige T-001, T-002)
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001, RN-001 | T-011, T-013, T-021, T-024 | T-080, T-095, T-105, T-107 |
| RF-002 / RN-010 | T-012, T-013, T-024 | T-080 |
| RF-003 / C-006, C-007, RN-013, RN-018 | T-012, T-024 | T-087, T-088, T-106 |
| RF-004 / RN-011, RN-012 | T-012, T-024 | T-089, T-106 |
| RF-005 / C-003, RN-007, RN-009 | T-012, T-024 | T-082, T-083, T-084, T-106 |
| RF-006 / C-002, RN-006 | T-012, T-024 | T-081 |
| RF-007 / C-005, RN-005, RN-014 | T-013, T-024 | T-085, T-103, T-106 |
| RF-008 / C-011, RN-015 | T-013, T-024 | T-094 |
| RF-009 / C-008, C-009, C-010, RN-019 | T-013, T-025 | T-090, T-091, T-092, T-093 |
| RF-010 / C-015, RN-017 | T-013, T-026 | T-100, T-101 |
| RF-011 / C-016, RN-016 | T-013, T-024 | T-102, T-106 |
| RF-012 / C-017, RN-021 | T-013, T-024 | T-104, T-106 |
| RF-013 / C-013, C-014, RN-002, RN-003 | T-011, T-013 | T-096, T-097, T-098 |
| RF-014 / RN-020 | T-013, T-028 | T-099, T-108 |
| RF-015 | T-022, T-023 | T-106 |
| RF-016 | T-022, T-024 | T-113 |
| RF-017 | T-012, T-024 | T-080 (soma das barras = total) |
| RF-018 | T-023, T-027 | T-106 (lista da aba: spec 008) |
| RNF-001, RNF-002 | T-012, T-013 | T-114 |
