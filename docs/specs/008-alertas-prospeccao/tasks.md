# Tasks: Alertas inteligentes, direcionamento semanal e prospecção

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-801** `[sandbox]` — Distintos de `ALERTAS_INTELIGENTES.TIPO_ALERTA`, `PRIORIDADE`, formato de `ID_SECAO`, `PRODUTO_REFERENCIA`, `MES_REFERENCIA`; colunas de `ALERTAS_PROCESSAMENTO`, `ALERTAS_EMAIL_SEMANAL`, `RELATORIO_SEMANAL_COORDENADORES_LOG`, `METAS_BU_VENDEDOR`; `:VAR_USER` numa SF JS agendada; corrigir `schema-producao/008-alertas.mjs` e o plan
- [ ] **T-802** `[sandbox]` — Confirmar que nenhuma SF `s360Alerta*`, `s360Prospec*`, `s360Prospect*`, `s360Direcionamento*`, `s360RelatorioSemanal*` existe

## Backend

- [x] **T-810** — `schema-producao/008-alertas.mjs`: `ALERTAS_PROCESSAMENTO`, `ALERTAS_EMAIL_SEMANAL`, `RELATORIO_SEMANAL_COORDENADORES_LOG`, `METAS_BU_VENDEDOR`
- [x] **T-811** — `lib/008-alertas.mjs`: `alertasVisiveis`, `podeMarcar`, `ALERTAS_MARCAVEIS`, `carteiraDoVendedor`, `podeDirecionar`, `TIPOS_ALERTA`
- [x] **T-812** — `lib/008-regras.mjs`: regras RN-002…007, `gerarAlertas`, `chaveAlerta`/`semDuplicados`, `planoFila`, `semanasOperacionais`, `periodoRelatorio`, `metaProporcional`, `analises`, `linhasResumo`, tendência da prospecção, ciclo e situação dos críticos, `htmlEmail`
- [x] **T-813** — `add-008-alertas.mjs`: as 19 SFs do plan; `cronExpression` nas 3 rotinas; publica só em `isEntrypoint()`; `package.json` com `publish:008`
- [x] **T-814** — `add-001-acesso.mjs`: `s360ContadoresObter` conta `ALERTAS_MARCAVEIS` (edição pontual, D-805)
- [x] **T-815** — `simulator/seeds/008-alertas.mjs`: dados da tabela de seed do plan (ids 8001+, usuários por `ctx.usuario`, filial 4)
- [x] **T-816** — `simulator/config.mjs` `CHECK_INPUT`: chaves novas; `npm run sim:check` sem `FALHOU`

## Frontend

- [x] **T-820** — `src/lib/server-functions.ts`: 16 entradas de tela em ordem alfabética, ids 801…816
- [x] **T-821** `[P]` — `src/lib/alertas.ts` e `src/lib/direcionamento.ts`; `exceljs` no `package.json`
- [x] **T-822** — `pages/AlertasPage.tsx` (`.rota = '/alertas'`), `pages/alertas/AbaAlertas.tsx`, `pages/alertas/Historico.tsx`
- [x] **T-823** — `pages/alertas/AbaProspeccao.tsx`
- [x] **T-824** — `pages/clientes/AbaProspects.tsx` (lista, etapa, contato, conversão, detalhe)
- [x] **T-825** — Agenda (003, pontual): `?clienteId=` abre Nova visita com o cliente; check-out de prospecção com objeções, próximo passo e data
- [x] **T-826** — `pages/DirecionamentoPage.tsx` (`.rota = '/direcionamento-semanal'`) e `pages/direcionamento/*.tsx` (3 abas, semana, exportar, exemplo)

## Testes

Backend em `simulator/smoke/008-alertas.mjs`, uma task por linha da seção Testes do plan.

- [x] **T-850** — `C-001 / RN-010`
- [x] **T-851** — `C-002 / RN-002` (funções + fila)
- [x] **T-852** — `RN-003`, `RN-004`, `RN-005`, `RN-006`, `RN-007` (funções)
- [x] **T-853** — `C-003 / RN-008`
- [x] **T-854** — `C-004 / RN-011`
- [x] **T-855** — `C-005 / RN-011`
- [x] **T-856** — `C-006 / RN-012`
- [x] **T-857** — `C-007 / RN-009`
- [x] **T-858** — `C-008 / RN-013` (SF)
- [x] **T-859** — `C-010 / RN-016`
- [x] **T-860** — `C-011 / RN-017`
- [x] **T-861** — `C-012 / RN-018`
- [x] **T-862** — `C-013 / RN-020`
- [x] **T-863** — `C-014 / RN-020`
- [x] **T-864** — `C-015 / RN-021` (visibilidade da lista)
- [x] **T-865** — `C-016 / RN-022`
- [x] **T-866** — `C-017 / RN-023`
- [x] **T-867** — `RN-024`
- [x] **T-868** — `C-018 / RN-026`
- [x] **T-869** — `C-019 / RN-027`
- [x] **T-870** — `C-020 / RN-028`
- [x] **T-871** — `C-021 / RN-025`
- [x] **T-872** `[P]` — `tests/alertas.test.mjs`: C-005 (mensagem), C-008 (tela), RN-014, agrupamento, etapas
- [x] **T-873** `[P]` — `tests/direcionamento.test.mjs`: C-018 (resumo e cor), RN-029, RF-020, semana

## Verificação

- [x] **T-880** — `cd novo/backend && npm test` verde
- [x] **T-881** — `cd novo/frontend && npm test`, `npm run lint` e `npm run build` limpos
- [x] **T-882** — No simulador (porta própria): Alice em `/alertas` (filtros, marcar, gráfico, Prospecção, `Agendar visita`), `/clientes` aba Prospects, Celso em `/direcionamento-semanal` (3 abas, semanas, exportar, exemplo); 360 px e tema escuro — conferido em 2026-11-03 (simulador 3108, app 5178), menos o download do .xlsx (regra coberta em `tests/direcionamento.test.mjs`)
- [ ] **T-883** `[sandbox]` — Publicar `add-008`, `add-001` e `add-000-perfil-acesso`, `sync:function-map`; rodar a fila uma vez e conferir os e-mails no Gmail e no Outlook
- [ ] **T-830** `[sandbox]` — Na troca: desligar os agendamentos antigos 264, 208 e 237

## Dependências

```
T-801, T-802 ─────────────────────────────────────────┐
T-810 → T-811 → T-812 → T-813 → T-814 → T-815 → T-816 → T-850…T-871 → T-880
T-820 → T-821 [P] → T-822…T-826
T-821 → T-872, T-873 [P] → T-881
T-880 + T-881 → T-882 → T-883 (exige T-801, T-802) → T-830
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / RN-001…008 | T-812, T-813 | T-851, T-852, T-853 |
| RF-002, RF-003 / C-001, C-006, C-007, RN-009/010/012 | T-811, T-813, T-822 | T-850, T-856, T-857 |
| RF-004 / C-004, C-005, RN-011 | T-811, T-813, T-822 | T-854, T-855, T-872 |
| RF-005 / C-008, RN-013 | T-814, T-822 | T-858, T-872 |
| RF-006, RF-007, RF-008 / RN-005, RN-014 | T-813, T-822 | T-872, T-882 |
| RF-011 / C-010, RN-016 | T-812, T-813 | T-859 |
| RF-012 / C-011, RN-017 | T-812, T-813 | T-860, T-883 |
| RF-013 / C-012, RN-018 | T-812, T-813 | T-861, T-883 |
| RF-014 / C-013, C-014, RN-020 | T-813, T-823, T-825 | T-862, T-863, T-882 |
| RF-015 / C-015, RN-021 | (002) | T-864 |
| RF-016 / C-016, C-017, RN-022/023 | T-813, T-824 | T-865, T-866 |
| RF-017 / RN-024 | T-813, T-825 | T-867 |
| RF-018 / C-018…C-021, RN-025…028 | T-813, T-826 | T-868…T-871, T-873 |
| RF-019 / RN-029 | T-821, T-826 | T-873 |
| RF-020 | T-821, T-826 | T-873 |
| RNF-001 | T-812 | T-859 |
| RNF-002 | T-813 | T-860, T-861 |
| RNF-003 | T-822, T-826 | T-882 |
