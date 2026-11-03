# Módulo: Alertas Inteligentes e Prospecção

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md) · [Regras](../regras-de-negocio.md)

## Objetivo

Transformar o histórico de vendas em ação: alertas automáticos por cliente (produto perdido, sazonalidade, reposição...) e priorização semanal de prospecção da carteira, além do pipeline de prospects novos.

## Rotas e páginas

| Rota | Página | Observação |
|---|---|---|
| `/alertas` | [AlertasInteligentesPage.tsx](../../frontend/src/pages/AlertasInteligentesPage.tsx) | 2 abas via `?aba=`: Alertas · Prospecção |
| — (embutida) | [ProspeccaoPage.tsx](../../frontend/src/pages/ProspeccaoPage.tsx) | "Prospecção desta semana" — sem rota própria |

Widgets relacionados: [AlertaSazonalidadeGrafico](../../frontend/src/components/AlertaSazonalidadeGrafico.tsx), [AlertasQuedaWidget](../../frontend/src/components/AlertasQuedaWidget.tsx), [DicaProCard](../../frontend/src/components/DicaProCard.tsx). Badge de não lidos na sidebar ([Layout](../../frontend/src/components/Layout.tsx)).

## Funcionalidades

- Lista/filtra alertas por tipo, prioridade e situação; marca como lido (individual/todos); **lidos ficam ocultos por padrão**; gráfico de sazonalidade no detalhe.
- Configuração do alerta de queda por vendedor (limite %, período semana/mês).
- "Dica Pro" diária por vendedor.
- **Prospecção da carteira**: ranking por temperatura/tendência, dias sem comprar, ciclo médio.
- **Pipeline de prospects**: criar prospect (também a partir da [carteira](carteira-clientes.md)), contatos, agendar/realizar visitas com check-in/out e resultado (resumo, objeções, próximo passo), marcar como convertido em cliente TOTVS.
- Processamento em fila (disparado pelo [Painel de Gestão](gestao-diretoria.md)) e e-mail semanal por vendedor.

## Server Functions

- Alertas: `alertasInteligentesPopular` (130), `alertasInteligentesProcessarFila` (264), `alertasInteligentesListar` (131), `alertasInteligentesMarcarLido` (132), `alertasInteligentesMarcarTodosLidos` (133), `alertasInteligentesContarNaoLidos` (134), `alertasInteligentesDetalheGrafico` (135), `alertasQuedaVolume` (127), `alertaConfigurar` (125), `alertaObterConfig` (126), `alertasAusenciaPedido` (105), `sazonalidadeClienteProdutos` (129), `dicaProObter` (136), `dicaProMarcarVisualizada` (137).
- Prospecção: `prospeccaoSemanalCarteira` (115), `prospectsListar` (252), `prospectsContar` (253), `prospectsCriar` (265), `prospectsAtualizarStatus` (256), `prospectsAgendarVisita` (266), `prospectsVisitasListar` (254), `prospectsRegistrarResultadoVisita` (258), `prospectsMarcarConvertido` (259), `prospectsAtualizarVisita` (260), `prospectsCancelarVisita` (261), `prospectsCheckinVisita` (262), `prospectsCheckoutVisita` (263).

## Tabelas

`ALERTAS_INTELIGENTES`, `ALERTAS_PROCESSAMENTO`, `ALERTAS_EMAIL_SEMANAL`, `CONFIG_ALERTAS_VENDEDOR`, `DICAS_PRO_LOG`, `PERFIL_COMPRA_CLIENTE`, `PROSPECTS`, `PROSPECT_CONTATOS`, `PROSPECT_VISITAS`, `PEDIDOS_SEMANAIS_SYNC_RAW` (fonte dos cálculos).

## Regras

- Escopo de visualização por BU (vendedor multi-departamento e coordenador com BU compartilhada): [regras-de-negocio.md](../regras-de-negocio.md#escopo-de-visualização).
- Tipos de alerta e janelas de cálculo: [regras-de-negocio.md](../regras-de-negocio.md#alertas-inteligentes-tipos).
- Fórmula e limite do alerta de queda (default 30%): [regras-de-negocio.md](../regras-de-negocio.md#alerta-de-queda-de-volume).
- Backlog de origem da feature de prospecção: [tasks.md](../legado/tasks.md) (documento de origem).
