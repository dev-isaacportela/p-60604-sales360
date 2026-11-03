# Módulo: Mix Builder (Simulação)

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md) · [Regras](../regras-de-negocio.md#mix-builder-e-custos)

## Objetivo

Montar propostas de mix de produtos por cliente com custo real (padrão, especial por política, ou tempo real), margem e preço de venda — e exportar/imprimir a proposta.

## Rotas e páginas

| Rota | Página |
|---|---|
| `/simulacao` | [SimulacaoPage.tsx](../../frontend/src/pages/SimulacaoPage.tsx) (~2.200 linhas) |

## Funcionalidades

- Seleção de cliente da carteira e montagem do mix item a item (produto, quantidade, tipo de custo, margem, preço de venda, preço concorrente, CMV%).
- Três origens de custo por item: **padrão**, **especial** (restrito aos clientes elegíveis da política) e **tempo real**.
- Salvar, duplicar e excluir mix ("Meus Mix"); envio ao histórico (`ENVIADO_HISTORICO`).
- Exportação CSV e **impressão em PDF** (logo embutido em base64).
- Status/atualização do sync de custos visível na tela.
- **Foto do produto** no catálogo, nos itens, na visualização e no PDF, do mesmo sistema de fotos do Pricing Hub (Busca 360, pelo CODPROD do Winthor). Passar o mouse (ou tocar) abre a foto maior; sem foto = quadro "Sem foto" (no PDF, espaço em branco).

## Server Functions

- Catálogo/custos: `mixCatalogoProdutosCustos` (91), `mixCatalogoProdutosCustosRemoto` (227), `mixCustoTempoReal` (226), `mixCustosDisponiveis` (228), `mixAtualizarCustosSeNecessario` (251), `mixStatusCustos` (363).
- Mix: `mixListar` (92), `mixItens` (93), `mixCriar` (358), `mixAtualizar` (359), `mixExcluir` (360), `mixUltimoCriado` (361), `mixCarteiraClientes` (362), `mixEnviarHistorico` (267).
- Fotos: `mixFotos` (397, SQL, lê o cache), `mixFotosSincronizar` (398, JS, cron diário `0 0 9 * * *` + botão do Painel Dev), `mixFotosTestar` (399), `mixFotosConfigStatus` (400) e `mixFotosChaveGravar` (401) — as três últimas só para quem vê o Painel Dev.
- Legado (simulações fase 1, ainda no mapa `SF`): `listarSimulacoes` (9), `itensSimulacao` (10), `simulacoes*` (55–59), `simulacaoItens*` (60–62).

## Tabelas

`PRODUCT_MIX` + `PRODUCT_MIX_ITEMS` (modelo atual), `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO`, `CUSTO_ESPECIAL_PRODUTO` + `CUSTO_ESPECIAL_CLIENTES`, `MIX_CUSTOS_SYNC`, `MIX_PRODUTO_FOTO` (cache da foto principal por CODPROD; URL vazia = sem foto) e `MIX_FOTOS_CONFIG` (chave do sistema de fotos e status; fora de todo perfil); legado: `SIMULACOES`/`SIMULACAO_ITENS`, `CUSTOPRODUTO`, `COST_POLICIES`/`POLICY_ITEMS` ([nota legado vs. ativo](../banco-de-dados.md#mix-e-custos-mix-builder)).

## Regras

- Margem padrão sugerida: **30%**.
- Escrita via SFs com `:VAR_USER` — mix pertence ao usuário logado (correção do bug "mix salvo para vendedor errado").
- Custo especial **não pode vazar entre clientes** — a elegibilidade vem de `CUSTO_ESPECIAL_CLIENTES` (bug corrigido).
- Sync de custos roda em cron com identidade de integração (SF JAVASCRIPT lê o projeto remoto via integração; cron sem identidade recebia 403).
- **Nenhum id de projeto no código das SFs agendadas** (251 e 268): com o par dev/prod, SF agendada que cita outro projeto (`SF_FOREIGN_PROJECT_REF`) fica fora do agendamento do PROD — foi o que parou os custos de 24/09 a 23/10. A leitura do Gestão de Custos é sempre pela integração `gestao-de-custos`, e as SFs não rodam DDL (cada execução virava migration no DEV). Correção em [fix-mix-custos-sem-id-de-projeto.mjs](../../backend/fix-mix-custos-sem-id-de-projeto.mjs).
- Fotos: o vendedor é BUSINESS e SF JAVASCRIPT com BUSINESS não grava, então quem consulta o Busca 360 e grava o cache é o cron (398); a tela só lê por SF SQL. A chave fica em `MIX_FOTOS_CONFIG` e é cadastrada no Painel Dev (cada ambiente, DEV e PROD, tem a sua; dado não sobe no promote).
- Este é o único domínio cujo DDL está de fato em [`backend/migrations/`](../../backend/migrations/).
