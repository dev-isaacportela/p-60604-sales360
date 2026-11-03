# Módulo: Carteira de Clientes

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md) · [Regras](../regras-de-negocio.md)

## Objetivo

Gestão da carteira do vendedor: quem são os clientes, sua saúde comercial (temperatura, curva, alertas), histórico de compras/visitas e incorporação de novos clientes.

## Rotas e páginas

| Rota | Página | Observação |
|---|---|---|
| `/clientes` e `/clientes/:clienteId` | [ClientesPage.tsx](../../frontend/src/pages/ClientesPage.tsx) | 3 abas: Minha Carteira · Clientes Disponíveis · Histórico do Cliente |
| — (embutida) | [HistoricoClientesPage.tsx](../../frontend/src/pages/HistoricoClientesPage.tsx) | Sem rota própria; usada como aba de ClientesPage. Helpers testados em [historicoClientes.utils.ts](../../frontend/src/pages/historicoClientes.utils.ts) |

## Funcionalidades

- **Minha Carteira**: lista com filtros/busca, curva (A/B/C), temperatura (Quente/Morno/Frio), ranking, alertas de queda ([AlertasQuedaWidget](../../frontend/src/components/AlertasQuedaWidget.tsx)), detalhe de temperatura ([TemperaturaDetalhePopover](../../frontend/src/components/TemperaturaDetalhePopover.tsx)), legenda dos indicadores ([LegendaCarteira](../../frontend/src/components/LegendaCarteira.tsx)).
- **Clientes Disponíveis**: clientes da BU do vendedor ainda sem dono, com ação de adicionar à carteira.
- **Histórico do Cliente**: visitas/tarefas e pedidos paginados, com modal de detalhe do pedido.
- Criação de **cliente prospecto** direto da tela.
- Leitura direta de registro via `getRecordMitra` (tabela `CLIENTES`) — único acesso a tabela fora de SF no frontend.

## Server Functions

- Carteira: `minhaCarteiraClientes` (27), `contarMinhaCarteiraClientes` (38), `minhaCarteiraClientesRanking` (84), `listarCurvasMinhaCarteira` (119), `atualizarCurvaClienteCarteira` (120), `temperaturaClientesCarteira` (128), `temperaturaClienteDetalhe` (138), `calcularPerfilCliente` (103).
- Disponíveis/vínculo: `listarClientesDisponiveisMinhaBu` (39), `contarClientesDisponiveisMinhaBu` (40), `adicionarClienteMinhaCarteira` (41), `inserirClienteMinhaCarteira` (116), `removerClienteMinhaCarteira` (50), `clienteAtualizarCarteira` (48), `clienteInativarCarteira` (49), `vincularClienteCarteiraAtual` (51).
- Histórico: `historicoVisitasCliente` (22), `historicoPedidosCliente` (25), `detalhesPedidoCliente` (26), `historicoResumoPedidosCliente` (85), `clienteDetalheVendasSemanais` (109), `clienteDetalheItensSemana` (110), `clienteDetalheResumoPedidosSemana` (111).
- Busca/base: `buscarClientes` (6), `contarClientes` (7), `listarSegmentosClientes` (121), `listarRamosClientesTotvs` (142).

## Tabelas

`CLIENTES` (com `WINTHOR_CODCLI`), `EQUIPE_CLIENTE` (carteira + `CURVA_CLASSIFICACAO`), `CLIENTE_BU_VENDEDOR`, `PERFIL_COMPRA_CLIENTE`, `PEDIDOS_SEMANAIS_SYNC`/`_RAW` (histórico de compras), `VISITAS`, `ALERTAS_INTELIGENTES`, `SEGMENTOS`.

## Regras

- Fórmula de temperatura (0–100, pesos 30/25/25/20) e classificação Quente/Morno/Frio: [regras-de-negocio.md](../regras-de-negocio.md#temperatura-do-cliente-score-0100).
- Busca de clientes é case-insensitive nas SFs (correção sobre collation `utf8mb3_bin`).
- Transferência de carteira entre vendedores é ação de coordenador — [gestao-diretoria.md](gestao-diretoria.md).
