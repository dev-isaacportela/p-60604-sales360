# Módulo: Analytics e Acompanhamento Semanal

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md) · [Regras](../regras-de-negocio.md)

## Objetivo

Análise comercial do vendedor (RCA): evolução, mix, carteira, metas e comparativos — mais a matriz de acompanhamento semanal (semana operacional sexta–quinta) com delta BW.

## Rotas e páginas

| Rota | Página | Observação |
|---|---|---|
| `/analytics` | [AnalyticsPage.tsx](../../frontend/src/pages/AnalyticsPage.tsx) | 6 abas: Overview, Semanal, Clientes, Produtos, Metas, Comparativo (~2.600 linhas) |
| `/acomp-semanal-vendedor` | [AcompanhamentoSemanalVendedorPage.tsx](../../frontend/src/pages/AcompanhamentoSemanalVendedorPage.tsx) | Visão do vendedor; também embutida na aba Semanal do Analytics |
| `/acomp-semanal` | [AcompanhamentoSemanalPage.tsx](../../frontend/src/pages/AcompanhamentoSemanalPage.tsx) | Escopo de gestão (filtro coordenador/vendedor) + sync manual |
| `/admin-acomp-semanal` | [AdminAcompanhamentoSemanalPage.tsx](../../frontend/src/pages/AdminAcompanhamentoSemanalPage.tsx) | Auditoria de dados brutos; restrita por e-mail hardcoded ([pendências](../pendencias.md)) |

## Funcionalidades

- **Analytics**: evolução 24 meses, mix de produtos, análise da carteira, top clientes, visitas, devoluções; edição de metas por vendedor/BU e por ramo+UF; comparativos.
- **Acompanhamento semanal**: valor por semana operacional (1–6) do mês, delta **BW**, fechamento vs. mês anterior, drill inline por cliente ([DetalheClienteInline](../../frontend/src/components/DetalheClienteInline.tsx)), export.
- Sync manual e status da sincronização (visão gestão).
- Drill-down multidimensional nos gráficos via [useDrill](../../frontend/src/hooks/useDrill.ts) (placeholders `:PARAM` na query) e seleção de séries via [useHighlight](../../frontend/src/hooks/useHighlight.ts).

## Server Functions

- Analytics RCA: `analyticsRcaFiltros` (181), `analyticsRcaMetaResumo` (182), `analyticsRcaEvolucao24m` (183), `analyticsRcaMixProdutos` (184), `analyticsRcaCarteira` (185), `analyticsRcaTopClientes` (186), `analyticsRcaVisitas` (187), `analyticsRcaDevolucoes` (188), `analyticsRcaEvolucaoCliente` (287); legado 16–19.
- Metas: `painelCoordenadorMetasBuRecebidas` (195), `painelCoordenadorMetasVendedoresBu` (196 — atende todas as BUs do escopo numa chamada), `painelCoordenadorSalvarMetaVendedorBu` (197), `painelCoordenadorSalvarMetaVendedorRamoUf` (296), `metasVendedorRamoUfAplicadas` (295 — aceita `vendedorIds` em lote). Ver a seção Aba Metas abaixo.
- Semanal: `calcularBwSemanal` (104), `acompanhamentoSemanalStatusSync` (106), `acompanhamentoSemanalSincronizarManual` (107), `clienteDetalheVendasSemanais` (109), `clienteDetalheItensSemana` (110), `clienteDetalheResumoPedidosSemana` (111), `adminAcompSemanalListar` (146).

## Tabelas

`PEDIDOS_SEMANAIS_SYNC_RAW`/`PEDIDOS_SEMANAIS_SYNC`, `ACOMP_SEMANAL_SYNC_LOG`/`_ERRO`, `VW_META_VENDEDOR_MES` (view), `METAS_BU_VENDEDOR`, `METAS_BU_VENDEDOR_RAMO_UF`, `METAS_VENDEDOR` (legado), `INTG_MONTHLY_BILLING_TARGET` (BW), `EQUIPE_CLIENTE`, `VISITAS`.

## Aba Metas (redistribuição)

Quem cria a meta do vendedor é o **coordenador**, redistribuindo entre a equipe a meta
vinda do planejamento estratégico (`INTG_MONTHLY_BILLING_TARGET`). Diretoria acompanha
em modo leitura (`canEditMetas = isCoordinatorScope && !isDirectorScope`).

- **Fonte da verdade**: `METAS_BU_VENDEDOR`, lida por todo o sistema através da view
  `VW_META_VENDEDOR_MES` ([banco](../banco-de-dados.md#metas)).
- **Meta recebida da diretoria (SF 195)**: vem do planejamento estratégico por
  **BU + UF**; cada filial recebe a meta da UF cadastrada em `FILIAL.UF`, com rateio
  por faturamento dos 12 meses anteriores quando há mais de uma filial da BU na mesma
  UF. Regra completa em [banco](../banco-de-dados.md#meta-que-o-coordenador-recebe-da-diretoria).
  O rótulo da linha e o filtro trazem a UF (`Filial 2 · GO · Nutrição`) porque é ela
  que explica por que duas filiais da mesma BU recebem valores diferentes.
- **Carregamento**: 3 Server Functions, e só quando a aba é aberta — SF 195 (BUs do
  escopo), SF 196 (vendedores de **todas** as BUs numa chamada) e SF 295 (rateio
  ramo/UF de **todos** os vendedores numa chamada, via `vendedorIds`). Antes eram
  ~100 execuções, disparadas em toda visita ao Analytics mesmo sem abrir a aba —
  contra um limite de 300/min compartilhado por todo o projeto.
- **Grão do rateio ramo/UF**: por (vendedor, BU, ramo, UF) — **sem filial**. A SF 295
  rateia a meta total do vendedor sobre a base de planejamento, que não tem filial no
  agrupamento; chamar a SF por filial fazia a mesma linha ser contada uma vez por
  filial do vendedor.
- **Grão da tabela de vendedores**: uma linha por (filial, BU, vendedor) — o mesmo
  vendedor aparece várias vezes porque atua em várias BUs, cada uma com meta própria
  da diretoria. A linha traz o rótulo `Filial N · Departamento` e a aba tem filtro
  **Filial / BU** (`metaBuSelecionada`) para trabalhar uma BU de cada vez; sem esse
  rótulo a tabela parecia repetir o mesmo usuário.
- **BU com mais de um coordenador**: `ESCOPO_BU` da SF 195 não pode carregar
  `COD_SUPERVISOR` no `SELECT DISTINCT` — MEDICAMENTO tem 2 coordenadores nas 8
  filiais e a BU saía duplicada, dobrando a "Meta geral" e dividindo a meta integrada
  por 16 filiais em vez de 8
  ([fix-metas-bu-escopo-duplicado.mjs](../../backend/fix-metas-bu-escopo-duplicado.mjs)).
- **Personalização**: o ajuste manual por ramo/UF é gravado pela SF 296 e relido pela
  SF 295 (coluna `PERSONALIZADO`); linha personalizada não é reescalada pelo rateio.
- **Gravação**: só o que foi editado, com validação completa antes do primeiro INSERT.
  O campo de meta aceita `1.500,50` e `1500.50` ([metas.utils.ts](../../frontend/src/pages/metas.utils.ts),
  com testes em `metas.utils.test.ts`).
- **Escopo GLOBAL**: exige cargo `DIRETORIA`/`ADMIN` nas SFs 195 e 196; quem não tem
  cai no próprio escopo.

## Regras

- Semana operacional sexta–quinta recortada no mês: [regras-de-negocio.md](../regras-de-negocio.md#semana-operacional-sextaquinta) / [operational-week.ts](../../frontend/src/lib/operational-week.ts).
- Devoluções deduzidas do realizado; compra atribuída pelo escopo de BU do vendedor: [regras-de-negocio.md](../regras-de-negocio.md#acompanhamento-semanal-e-bw).
- Snapshots das SFs críticas do semanal em [`backend/sf-versions/`](../../backend/sf-versions/).
