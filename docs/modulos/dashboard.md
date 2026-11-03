# Módulo: Dashboard

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md)

## Objetivo

Home do vendedor: visão do dia e do mês em uma tela — vendas, meta, visitas e pendências.

## Rotas e páginas

| Rota | Página |
|---|---|
| `/` | [DashboardPage.tsx](../../frontend/src/pages/DashboardPage.tsx) |

## Funcionalidades

- Saudação e KPIs do mês: vendas, meta, visitas realizadas, clientes ativos.
- Gráfico de vendas diárias e projeção de atingimento de meta.
- Visitas do dia e resumo da semana.
- Card "Meta semanal de visitas": realizadas x meta da semana (seg–sex) — regra completa em [Meta semanal de visitas](../regras-de-negocio.md#meta-semanal-de-visitas).
- Resumo de alertas não lidos e tarefas pendentes (atalhos para [Alertas](alertas-prospeccao.md) e [Tarefas](tarefas.md)).
- Respeita o filtro de escopo `ME|TEAM|SELLER|GLOBAL` ([regras](../regras-de-negocio.md#escopo-de-visualização)).

## Server Functions

`dashboardKpis` (1), `listarVisitasPeriodo` (5), `visitasDoDia` (20), `dashboardVendasDiarias` (214), `dashboardVisitasSemanaResumo` (215), `metaRealizadoProjecao` (123), `analyticsRcaMetaResumo` (182), `listarTarefas` (11), `alertasInteligentesListar` (131), `prospectsVisitasListar` (254), `dadosUsuarioLogado` (28).

Os badges da sidebar (`contarTarefasPendentes` 12, `alertasInteligentesContarNaoLidos` 134) são chamados pelo [Layout](../../frontend/src/components/Layout.tsx), não pela página.

## Tabelas

`VISITAS`, `TAREFAS`, `PEDIDOS_SEMANAIS_SYNC`, `METAS_VENDEDOR`/`METAS_BU_VENDEDOR`, `ALERTAS_INTELIGENTES`, `EQUIPE_CLIENTE`.
