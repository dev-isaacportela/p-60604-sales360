# Tasks: Agenda e visitas

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox

- [ ] **T-001** `[sandbox]` — Para a etapa 2: SF JAVASCRIPT de usuário business chama SF SQL por id e ela grava com o `:VAR_USER` de quem chamou?; onde guardar segredo protegido; `callIntegrationMitra` aceita cabeçalho por chamada? Registrar no `plan.md`
- [ ] **T-002** `[sandbox]` — Depois de publicar a etapa 1: `UTC_TIMESTAMP()`, `JSON_TABLE` com parâmetro, SF com `;` e `UPDATE` com a derivada `COMPROMISSOS` (erro 1093) rodam com usuário business; nenhuma SF `s360Agenda*`, `s360Visita*`, `s360Prospeccao*`, `s360Interno*` existia antes

## Backend (etapa 1)

- [x] **T-010** — `schema-producao/003-agenda.mjs`: DDL de `AGENDA_INTERNA`, `AGENDA_INTERNA_PARTICIPANTES`, `PROSPECT_VISITAS` (sem coluna nova, D-305)
- [x] **T-011** — `simulator/mysql-dialect.mjs`: `UTC_TIMESTAMP()` (kit, edição pontual)
- [x] **T-012** — `lib/003-agenda.mjs`: `AGORA_BR`, `HOJE_BR`, `CARIMBO_BR`, `LIMITE_RETRO`, `COMPROMISSOS`, `conflito`, `pessoasJson`, `PESSOAS_ESCOPO`, `podeOperar`, `CLIENTES_DE_QUEM_CRIA`, `PROSPECTS_DE_QUEM_CRIA`, `textoOk`, `acrescentar`, metas 16/8
- [x] **T-013** — `add-003-agenda.mjs`: `definitions` das 20 SFs; `package.json` com `publish:003`
- [x] **T-014** — `simulator/seeds/003-agenda.mjs`: usuários, escopo F6 · Estética, férias, carteira 3001+, prospects, semana de compromissos
- [x] **T-015** — `npm run sim:check` sem `FALHOU` (com `CHECK_INPUT` acrescido só do que faltar)

## Frontend (etapa 1)

- [x] **T-020** — `src/lib/server-functions.ts`: 20 entradas em ordem alfabética, ids 301…320
- [x] **T-021** `[P]` — `src/lib/agenda.ts` (funções da tabela do plan)
- [x] **T-022** — `pages/AgendaPage.tsx` (`.rota = '/agenda'`): escopo, cabeçalho, visões, painel lateral
- [x] **T-023** — `pages/agenda/Grade.tsx` (com o item) e `layout.tsx`: Dia, Semana, Mês, linha compacta, cores, `Somente visualização`
- [x] **T-024** — `pages/agenda/dialogos.tsx`: Nova agenda (4 tipos), Reagendar, Relato e atividades, Cancelar, Concluir, Ver planejamento/relato, Histórico do cliente

## Testes (etapa 1)

Backend em `simulator/smoke/003-agenda.mjs`, uma task por linha da tabela Testes do plan:

- [x] **T-080** — C-001
- [x] **T-081** — C-003
- [x] **T-082** — C-004
- [x] **T-083** — C-005
- [x] **T-084** — C-007
- [x] **T-085** — C-008
- [x] **T-086** — C-009
- [x] **T-087** — C-010
- [x] **T-088** — C-011
- [x] **T-089** — C-012
- [x] **T-090** — C-013
- [x] **T-091** — C-017
- [x] **T-092** — RN-003, RN-004, RN-005, RN-006, RN-007
- [x] **T-093** — RN-008, RN-009, RN-010, RN-011
- [x] **T-094** — RN-012, RN-013, RN-014, RF-014
- [x] **T-095** `[P]` — `tests/agenda.test.mjs`: C-002, C-004 (mensagem), C-006, C-008 (ações), RN-001, RN-002, RF-001

## Verificação (etapa 1)

- [x] **T-110** — `cd novo/backend && npm test` verde
- [x] **T-111** — `cd novo/frontend && npm test`, `npm run lint` e `npm run build` limpos
- [x] **T-112** — Simulador em porta própria: Ana Agenda cria, faz check-in/out e reagenda; Bruno Agenda vê as visitas de Ana; Carlos Agenda em Time inteiro com `Somente visualização`
- [x] **T-113** — Verificação manual da spec: 360 px (Semana com abas por dia, ação principal com um toque), Mês, legenda em tema claro e escuro
- [ ] **T-114** `[sandbox]` — Publicar `add-003` e `add-000-perfil-acesso`, `sync:function-map`; T-002

## Etapa 2 — Google Agenda (depois de T-001)

- [ ] **T-200** — Atualizar o plan com as respostas de T-001 e aprovar de novo
- [ ] **T-201** — `schema-producao/003-agenda.mjs`: tabelas `GOOGLE_*` do contrato
- [ ] **T-202** — `lib/003-google.mjs`: regras puras da RN-016 (título com status, texto simples, rodapé, fuso, lembrete de atividade)
- [ ] **T-203** — SFs de conexão, fila, envio, troca de agenda, status, desconectar e reenvio
- [ ] **T-204** — Seção Google de `/configuracoes` e aviso de falha na Agenda
- [ ] **T-205** — Testes C-014, C-015, C-016, RN-015…RN-019, RNF-003

## Dependências

```
T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-080…T-094 → T-110
T-020 → T-021 [P] → T-022 → T-023 → T-024
T-021 → T-095 [P] → T-111
T-110 + T-111 → T-112 → T-113 → T-114 (T-002)
T-001 → T-200 → T-201…T-205
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 | T-021, T-022, T-023 | T-095 |
| RF-002, RF-013 / C-013 | T-012, T-013, T-023 | T-090, T-113 |
| RF-003 / C-001, C-002, RN-001, RN-002 | T-013, T-021, T-024 | T-080, T-095 |
| RF-004 / RN-013 | T-012, T-013, T-024 | T-094 |
| RF-005 | T-012, T-013, T-024 | T-112 |
| RF-006 / C-003, C-004, RN-003, RN-004 | T-012, T-013 | T-081, T-082, T-092 |
| RF-007 / C-005, C-006, RN-006, RN-007, RN-008 | T-013, T-021, T-024 | T-083, T-092, T-093, T-095 |
| RF-008 / C-007, C-008, RN-005, RN-009, RN-010 | T-013, T-024 | T-084, T-085, T-092, T-093 |
| RF-009 / C-009, RN-011 | T-013, T-024 | T-086, T-093 |
| RF-010 / C-010, RN-014 | T-013, T-024 | T-087, T-094 |
| RF-011 / C-011 | T-013 | T-088 |
| RF-012 / C-012, RN-012 | T-012 | T-089, T-094 |
| RF-014 | T-013, T-022 | T-094 |
| RF-015 / C-017 | T-013, T-024 | T-091 |
| RF-016…RF-021, RNF-002, RNF-003 | T-200…T-205 | T-205 |
| RNF-001, RNF-004 | T-022, T-023 | T-113, T-114 |
