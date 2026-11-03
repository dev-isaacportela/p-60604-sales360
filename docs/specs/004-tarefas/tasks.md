# Tasks: Atividades (tarefas e follow-ups)

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — Numa SF SQL de teste com 2 instruções: `UTC_TIMESTAMP()` − 3 h dá a hora de Brasília; `LAST_INSERT_ID()` da 1ª instrução chega à 2ª; erro na 2ª para a 3ª. `listTablesMitra`: colunas de `ATIVIDADES_LOG` (FK sem cascata?) e `GOOGLE_AGENDA_FILA`; valores distintos de `TAREFAS.STATUS` e `PRIORIDADE`. Registrar no `plan.md`
- [ ] **T-002** `[sandbox]` — Confirmar que nenhuma SF `s360Atividade*` existe

## Backend

- [x] **T-010** — `novo/backend/schema-producao/004-atividades.mjs`: `ATIVIDADES_LOG` e `GOOGLE_AGENDA_FILA`
- [x] **T-011** — `simulator/mysql-dialect.mjs`: `UTC_TIMESTAMP()` (uma linha, citada no relatório)
- [x] **T-012** — `novo/backend/add-004-atividades.mjs`: as 9 SFs do plan (leituras, busca de clientes JS com as funções da RN-018 da 002, 4 escritas com fila → log → alteração); publica só em `isEntrypoint()`; `package.json` com `publish:004`
- [x] **T-013** — `simulator/seeds/004-atividades.mjs`: tabela de seed do plan (ids 4001+, usuários por `ctx.usuario`)
- [x] **T-014** — `simulator/config.mjs` `CHECK_INPUT`: `status`, `prioridade`, `prazo`, `id`; `npm run sim:check` sem `FALHOU`

## Frontend

- [x] **T-020** — `src/lib/server-functions.ts`: as 9 entradas em ordem alfabética, ids 401…409
- [x] **T-021** — `src/lib/atividades.ts`: funções da tabela do plan
- [x] **T-022** — `pages/AtividadesPage.tsx` (`.rota = '/tarefas'`): cabeçalho, escopo, Lista/Kanban, cards, filtros, recargas e `avisarContadores()`
- [x] **T-023** `[P]` — `pages/atividades/Lista.tsx`: abertas + bloco `CONCLUÍDA` recolhido e paginado
- [x] **T-024** `[P]` — `pages/atividades/Kanban.tsx`: 3 colunas compactas
- [x] **T-025** — `pages/atividades/JanelaAtividade.tsx`: Nova/Editar, abas Dados/Log, busca de cliente, somente visualização; peças comuns em `pages/atividades/comum.tsx`

## Testes

Backend em `simulator/smoke/004-atividades.mjs`; tela em `tests/atividades.test.mjs`.

- [x] **T-080** — `RN-011`: contador 3
- [x] **T-081** — `C-001`: criar com cliente, log, contador 3 → 4, fila
- [x] **T-082** — `C-002 / RN-005`: título e prazo obrigatórios
- [x] **T-083** — `C-003 / RN-008`: remover cliente; cliente fora da carteira
- [x] **T-084** — `RN-008 (busca)`: RN-018, só a carteira própria, 80 + total
- [x] **T-085** — `RN-006 (servidor)`: atrasadas no resumo
- [x] **T-086** — `C-005 / RN-007`: ordem das abertas e páginas de concluídas
- [x] **T-087** — `C-006 / RN-003`: status, conclusão, log, contador, fila
- [x] **T-088** — `C-007 / RN-009`: log por campo, hora do servidor, sem mudança = 0
- [x] **T-089** — `RNF-002`: falha no log não muda a atividade
- [x] **T-090** — `C-008 / RN-010`: exclusão com log e fila
- [x] **T-091** — `C-009 / RN-002`: coordenador só lê
- [x] **T-092** — `C-010 / RN-001`: atividade de outro e papel GESTOR → 0
- [x] **T-093** — `C-011 / RN-013`: filtros e resumo
- [x] **T-094** — `RN-004`: prioridade padrão
- [x] **T-095** — `RN-012`: fila só com prazo
- [x] **T-096** — `RN-014`: concluída no histórico do cliente
- [x] **T-097** `[P]` — `tests/atividades.test.mjs`: C-002, C-003, C-004, C-005 (Kanban), C-006, C-007, C-010, RF-001

## Verificação

- [x] **T-110** — `cd novo/backend && npm test` verde (todas as specs)
- [x] **T-111** — `cd novo/frontend && npm test`, `npm run lint` e `npm run build` limpos
- [x] **T-112** — No simulador (porta própria): Amanda cria, edita prazo, conclui (contador do menu muda na hora), exclui pela Lista e pelo Kanban; Caio em Time inteiro abre atividade de Amanda em somente visualização
- [x] **T-113** — Verificação manual da spec: 360 px na Lista (cartões compactos, cards 2 por linha); cores de prioridade em tema escuro; somente visualização do coordenador
- [ ] **T-114** `[sandbox]` — Publicar `add-004` e `add-000-perfil-acesso`, `sync:function-map` (exige T-001, T-002)

## Dependências

```
T-001, T-002 ─────────────────────────────────────┐
T-010 → T-011 → T-012 → T-013 → T-014 → T-080…T-096 → T-110
T-020 → T-021 → T-022 → T-023/T-024 [P] → T-025
T-021 → T-097 → T-111
T-110 + T-111 → T-112 → T-113 → T-114
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-005, RN-002, RN-007 | T-012, T-022, T-023, T-024 | T-086, T-091, T-097 |
| RF-002 / C-004, RN-006, RN-013 | T-012, T-022 | T-085, T-093, T-097 |
| RF-003 / C-011 | T-012, T-021, T-022 | T-093 |
| RF-004 / C-001, C-002, RN-004, RN-005 | T-012, T-025 | T-081, T-082, T-094, T-097 |
| RF-005 / C-003, C-007 | T-012, T-025 | T-083, T-088, T-097 |
| RF-006 / C-006, RN-003 | T-012, T-023, T-024 | T-087, T-097 |
| RF-007 / C-008, RN-010 | T-012, T-023, T-024 | T-090 |
| RF-008 / RN-009 | T-012, T-025 | T-088, T-097 |
| RF-009 / RN-008 | T-012, T-025 | T-084 |
| RF-010 / RN-011 | T-022 | T-080, T-081, T-087, T-090 |
| RF-011 / RN-012 | T-012 | T-081, T-087, T-090, T-095 |
| RF-012 / C-009, C-010, RN-001 | T-012, T-023, T-025 | T-091, T-092, T-097 |
| RN-014 | — (lê a SF da 002) | T-096 |
| RNF-001 | T-022 | T-112 |
| RNF-002 | T-012 | T-089 |
