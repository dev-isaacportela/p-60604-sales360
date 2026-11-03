# Módulo: Tarefas (Atividades)

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md)

## Objetivo

Gestão das atividades do vendedor: follow-ups, cobranças e pendências, com vínculo opcional a cliente e trilha de alterações.

## Rotas e páginas

| Rota | Página |
|---|---|
| `/tarefas` | [TarefasPage.tsx](../../frontend/src/pages/TarefasPage.tsx) |

## Funcionalidades

- CRUD de tarefas com prioridade (ALTA/MEDIA/BAIXA), prazo (`DATA_LIMITE`) e cliente vinculado.
- Busca fuzzy nos títulos/clientes via [smartSearch.ts](../../frontend/src/lib/smartSearch.ts) (normalização de acentos, stopwords pt-BR, Levenshtein — testado).
- **Log de atividades**: cada alteração de campo é registrada (`ATIVIDADES_LOG`) e listável na tela.
- Sync com Google Agenda (mesmo mecanismo da [Agenda](agenda.md)).
- Badge de pendentes na sidebar ([Layout](../../frontend/src/components/Layout.tsx), via `contarTarefasPendentes`).

## Server Functions

`listarTarefas` (11), `contarTarefasPendentes` (12), `criarTarefa` (23), `atualizarStatusTarefa` (15), `tarefasAtualizarDados` (52), `tarefasAtualizarStatusSeguro` (53), `tarefasExcluirSeguro` (54), `atividadesRegistrarLog` (140), `atividadesListarLog` (141), `googleAgendaSincronizarItem` (212).

## Tabelas

`TAREFAS` (com `CLIENTE_ID`, `CONCLUIDO_EM`), `ATIVIDADES_LOG`, `GOOGLE_AGENDA_EVENTOS`.

## Regras

- Isolamento por vendedor: `listarTarefas` filtra `VENDEDOR_ID = :VAR_USER` no SQL da SF.
- Seletor de clientes usa busca case-insensitive (correção de collation, commit `fix: corrige seletor de clientes em Tarefas`).
