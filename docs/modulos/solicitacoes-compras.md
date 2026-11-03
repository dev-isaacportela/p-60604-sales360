# Módulo: Solicitações de Compras

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md)

## Objetivo

Canal do comercial para pedir produtos ao time de compras: solicitação com cliente/filial/prazo/executivo, itens, envio e acompanhamento de status.

## Rotas e páginas

| Rota | Página | Observação |
|---|---|---|
| `/solicitacoes-compras` | [SolicitacoesComprasPage.tsx](../../frontend/src/pages/SolicitacoesComprasPage.tsx) | Visível na sidebar apenas com `solicitacoesComprasPermissaoGestao` |

## Funcionalidades

- Criar solicitação (cliente, tipo, filial, prazo desejado, executivo responsável) e adicionar itens (produto, fornecedor, quantidade, observação).
- Enviar item ao time de compras e **sincronizar status** de volta.
- Consultas de apoio: saída do produto por filial/geral e clientes que compram o produto (por filial/geral).
- Busca de solicitação por referência comercial.

## Server Functions

`solicitacoesComprasPermissaoGestao` (269), `solicitacoesComprasExecutivos` (270), `solicitacoesComprasListar` (271), `solicitacoesComprasContar` (272), `solicitacoesComprasCriar` (273), `solicitacoesComprasBuscarPorReferencia` (274), `solicitacoesComprasAdicionarItem` (275), `solicitacoesComprasItensListar` (283), `solicitacoesComprasClientesGeral` (276), `solicitacoesComprasEnviarItemCompras` (277), `solicitacoesComprasSincronizarStatusCompras` (278), `solicitacoesComprasProdutoSaidaFilial` (279), `solicitacoesComprasProdutoClientesFilial` (280), `solicitacoesComprasProdutoSaidaGeral` (281), `solicitacoesComprasProdutoClientesGeral` (282).

## Tabelas

`SOLICITACOES` (STATUS default 'ABERTA', PRIORIDADE default 'MEDIA'), `SOLICITACAO_ITENS` (com `CODFORNEC`), `FILIAL`, `PEDIDOS_SEMANAIS_SYNC_RAW` (consultas de saída/clientes por produto).

O DDL deste módulo está versionado em [`backend/migrations/`](../../backend/migrations/) (família `solicitacoes*`).
