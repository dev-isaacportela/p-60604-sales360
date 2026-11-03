# Tasks: Acompanhamento semanal (visão do vendedor + carga do ERP)

**Plan:** `plan.md` · **Data:** 2026-11-03

> `[P]` = paralelizável. `[sandbox]` = só no sandbox da plataforma.

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — Colunas e tipos reais de `PEDIDOS_SEMANAIS_SYNC_RAW` (inclui `VENDEDOR_ID`), `ACOMP_SEMANAL_SYNC_LOG`, `ACOMP_SEMANAL_SYNC_ERRO_ATUAL`; se `CLIENTES.ID = WINTHOR_CODCLI` em todas as linhas; como o cron chama uma SF JAVASCRIPT (`:VAR_USER` resolvido? fuso do `cronExpression`); corrigir `schema-producao/006-semanal.mjs` e o plan
- [ ] **T-002** `[sandbox]` — Agendamento do Data Loader `DEVOLUCOES_TOTVS` passa a de hora em hora (RF-011); nenhuma SF `s360Semanal*` existe

## Backend

- [ ] **T-010** — `schema-producao/006-semanal.mjs`: `PEDIDOS_SEMANAIS_SYNC_RAW`, `PEDIDOS_SEMANAIS_SYNC`, `ACOMP_SEMANAL_SYNC_LOG`, `ACOMP_SEMANAL_SYNC_ERRO_ATUAL`
- [ ] **T-011** — `lib/006-regras.mjs`: `semanasDoMes`, `bw`, `statusPorBw`, `periodoReferencia`, `valorMedio`, `curvaLinha`, `montarMatriz` (células, fechamentos, agregação Equipe), `movimentoItem`, `montarDetalhe`
- [ ] **T-012** — `lib/006-carga.mjs`: `PASSOS` (SQL da carga, RN-013..016) e mensagens
- [ ] **T-013** — `add-006-semanal.mjs`: as 6 SFs (carga sem cron, P-1) (prelúdio JS da 002); `package.json` `publish:006`
- [ ] **T-014** — `simulator/seeds/006-semanal.mjs` (ids 6001+, usuários por `ctx.usuario`)
- [ ] **T-015** — `npm run sim:check` sem `FALHOU`

## Frontend

- [ ] **T-020** — `server-functions.ts`: `semanalAtualizacao`, `semanalDetalhe`, `semanalMatriz`, `semanalErros`, `semanalProdutos` (ids 601–605, ordem alfabética); `package.json`: `exceljs`
- [ ] **T-021** `[P]` — `src/lib/semanal.ts` (funções da tabela do plan)
- [ ] **T-022** — `pages/comparativo/Semanal.tsx`: filtros, cards, atualização, matriz com coluna fixa, TOTAL, exportar
- [ ] **T-023** — `pages/comparativo/DetalheCliente.tsx`: semanas, itens, pedidos, Sazonalidade
- [ ] **T-024** — painel "Erros de ingestão" (ADMIN) na visão Semanal (RF-017)

## Testes

- [ ] **T-080** — C-001 / RN-004 · **T-081** — C-002 · **T-082** — C-003 / RN-005 · **T-083** — C-004 / RN-003
- [ ] **T-084** — C-005 / RN-008 · **T-085** — RN-008 (limites) · **T-086** — C-018 / RN-007 · **T-087** — RN-006
- [ ] **T-088** — C-007 / RN-001 · **T-089** — C-008 / RN-002 · **T-090** — RN-002 (escopo duplo) · **T-091** — RN-010 · **T-092** — RN-009
- [ ] **T-093** — C-009 / RN-011
- [ ] **T-094** — carga: C-012, C-013 / RN-016, C-014 / RN-015, C-019 / RN-013, RN-013, RN-014, RN-017, RF-011, RF-017 (só ADMIN lê os erros)
- [ ] **T-095** `[P]` — `tests/semanal.test.mjs`: C-001 (rótulos), C-003 (filtro), C-002 (cards), C-010 / RN-012 (planilha), RF-010

## Verificação

- [ ] **T-110** — `cd novo/backend && npm test` verde
- [ ] **T-111** — `cd novo/frontend && npm test`, `npm run lint`, `npm run build`
- [ ] **T-112** — No simulador (porta própria): Alice, Bernardo e Cecília em `/comparativo` → Semanal; detalhe de Alfa; exportar
- [ ] **T-113** — Verificação manual: 360 px com coluna fixa; tema escuro (B/W e status); planilha no Excel
- [ ] **T-114** `[sandbox]` — Publicar `add-006` + `add-000-perfil-acesso`, `sync:function-map`; na troca: agendar a carga e desligar a 107 (P-1); medir RNF-001/002 (T-003)

## Dependências

```
T-001, T-002 ──────────────────────────────┐
T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-080…T-094 → T-110
T-020 → T-021 → T-022 → T-023 → T-095 → T-111
T-110 + T-111 → T-112 → T-113 → T-114
```

## Rastreabilidade

| Requisito | Tasks | Teste |
|---|---|---|
| RF-001..005 / RN-001..010 | T-011, T-013, T-021, T-022 | T-080…T-092, T-095 |
| RF-006 / RN-011 | T-011, T-013, T-023 | T-093 |
| RF-007 / RN-012 | T-013, T-021, T-022 | T-095 |
| RF-010 | T-013, T-022 | T-094, T-095 |
| RF-011..013 / RN-013..017 | T-012, T-013 | T-094 |
| RNF-001..003 | T-013 | T-114 |
