# Tasks: Analytics, comparativo e redistribuição de metas

**Plan:** `plan.md` · **Data:** 2026-11-03

> `[P]` = paralelizável. `[sandbox]` = só no sandbox da plataforma.

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — Códigos reais de `INTG_BUSINESS_UNIT.CODE`, `INTG_REGION.CODE` ("Outros Estados") e `INTG_ACTIVITY_SEGMENT.CODE`; `FILIAL.UF` preenchida; `JSON_TABLE` + duas instruções numa SF SQL; nenhuma SF `s360Analytics*`/`s360Metas*` existe
- [ ] **T-003** `[sandbox]` — Medir o Analytics de um coordenador em "Time inteiro" × "Último ano" (RNFT-002) e o `Salvar` de 30 vendedores (RNF-003)

## Backend

- [ ] **T-010** — `schema-producao/007-metas.mjs`: `METAS_BU_VENDEDOR`, `METAS_BU_VENDEDOR_RAMO_UF`, `METAS_BU`, `INTG_BUSINESS_UNIT`, `INTG_REGION`, `INTG_ACTIVITY_SEGMENT`, `INTG_MONTHLY_BILLING_TARGET`
- [ ] **T-011** — `lib/007-analytics.mjs`: `LINHAS`, `META_DO_ESCOPO`, `UNIDADE_DO_DEPTO`, filtros de lista
- [ ] **T-012** — `lib/007-regras.mjs`: `metaRecebida` (RN-010), sem import
- [ ] **T-013** — `add-007-analytics.mjs`: as 13 SFs; `package.json` `publish:007`
- [ ] **T-014** — `simulator/seeds/007-analytics.mjs` (ids 7001+, usuários por `ctx.usuario`)
- [ ] **T-015** — `config.mjs` `CHECK_INPUT` (linha da 007); `npm run sim:check` sem `FALHOU`

## Frontend

- [ ] **T-020** — `server-functions.ts`: 13 entradas `analytics*`/`metas*` (ids 701–713, ordem alfabética)
- [ ] **T-021** `[P]` — `src/lib/analytics.ts`, `src/lib/metas.ts`, `src/lib/comparativo.ts`
- [ ] **T-022** — `pages/analytics/graficos.tsx` (barras e evolução)
- [ ] **T-023** — `AnalyticsPage.tsx`: filtros, `Buscar`, abas por perfil
- [ ] **T-024** — `pages/analytics/Overview.tsx`, `Clientes.tsx`, `Produtos.tsx`
- [ ] **T-025** — `pages/analytics/Metas.tsx` (inclui ramos/UF RF-017, insights e exportar RF-021)
- [ ] **T-026** — `pages/analytics/Modular.tsx` + exportação
- [ ] **T-027** — `ComparativoPage.tsx` (Semanal | Mensal) e `pages/comparativo/Mensal.tsx` + PDF

## Testes

- [ ] **T-080** — smoke: C-001, C-003, C-004, C-005, RN-006, RN-008, RN-009, RF-006
- [ ] **T-081** — smoke: C-006, C-007, RN-010 (unidade), C-008
- [ ] **T-082** — smoke: C-009, C-011, C-013 (gravação de ramos), C-014
- [ ] **T-083** — smoke: C-015 (SF)
- [ ] **T-084** `[P]` — `tests/analytics.test.mjs`: C-001, C-002, C-017, RN-006, RF-001, RF-022, RF-023
- [ ] **T-085** `[P]` — `tests/metas.test.mjs`: C-009, C-010, C-012, C-013, RN-013, RN-014, RF-021
- [ ] **T-086** `[P]` — `tests/comparativo.test.mjs`: C-015, C-016

## Verificação

- [ ] **T-110** — `cd novo/backend && npm test` verde
- [ ] **T-111** — `cd novo/frontend && npm test`, `npm run lint`, `npm run build`
- [ ] **T-112** — No simulador (porta própria): Amélia em `/analytics` (5 blocos, Buscar, Modular, exportar), Caio na aba Metas (ratear, salvar, erro), Gil em leitura, `/comparativo` → Mensal e PDF
- [ ] **T-113** — Verificação manual: RF-019 (confirmação), PDF legível, 360 px e tema escuro
- [ ] **T-114** `[sandbox]` — Publicar `add-007` + `add-000-perfil-acesso`, `sync:function-map`; T-003

## Dependências

```
T-001 ─────────────────────────────────────┐
T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-080…T-083 → T-110
T-020 → T-021 → T-022 → T-023 → T-024…T-027 → T-084…T-086 → T-111
(006 T-013 antes de T-027: o Mensal usa s360SemanalMatriz)
T-110 + T-111 → T-112 → T-113 → T-114
```

## Rastreabilidade

| Requisito | Tasks | Teste |
|---|---|---|
| RF-001 / RF-002 / RN-001 / RN-002 | T-021, T-023 | T-080, T-084 |
| RF-003 / RN-003..005 | T-011, T-013, T-024 | T-080, T-084 |
| RF-004 / RN-006 | T-013, T-022, T-024 | T-080, T-084 |
| RF-005 / RF-010 / RN-008 | T-013, T-024 | T-080 |
| RF-006 | T-013, T-024 | T-080 |
| RF-007 / RN-007 | T-013, T-024 | T-080 |
| RF-008 / RN-009 | T-013, T-024 | T-080 |
| RF-009 | T-013, T-024 | T-080 |
| RF-011 / RN-016 | T-013, T-026 | T-083, T-086 |
| RF-012 / RN-017 | T-027 | T-086 |
| RF-013..016, RF-018..020 / RN-010, RN-011, RN-013..015, RN-018, RN-019 | T-012, T-013, T-021, T-025 | T-081, T-082, T-085 |
| RF-022 | T-021, T-024 | T-084 |
| RF-017 / RN-012 / C-013 | T-013, T-021, T-025 | T-082, T-085 |
| RF-021 | T-021, T-025 | T-085 |
| RF-023 | T-011, T-021, T-024 | T-084 |
| RNF-001..003 | T-013 | T-114 |
