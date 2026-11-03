# Server Functions

> Parte da [documentação do projeto](README.md). Veja também: [Arquitetura](arquitetura.md) · [Banco de Dados](banco-de-dados.md)
>
> **Inventário detalhado (SF por SF, com cruzamentos e consumo por tela): [sf-cruzamentos.md](legado/sf-cruzamentos.md)** — este documento é a visão consolidada.

## Onde vivem e como são chamadas

As SFs são hospedadas na plataforma Mitra (tipos SQL e JAVASCRIPT). O frontend as chama exclusivamente por id numérico através do mapa `SF` e dos wrappers de [useMitra.ts](../frontend/src/hooks/useMitra.ts) (`callSF`, `callSFSingle`, `callSFWithMeta`, `callSFMutation`).

Padrões de parametrização (visíveis em [setup-backend.mjs](../backend/setup-backend.mjs) e nos `create-sf-*.sql` de [`backend/migrations/`](../backend/migrations/)):

- `{{param}}` — interpolação do input enviado pelo frontend.
- `:VAR_USER` — id do usuário logado, resolvido pela plataforma. É a base do isolamento por vendedor (ex.: `listarTarefas` filtra `VENDEDOR_ID = :VAR_USER`) e das mutações seguras do Mix Builder.

### Armadilha: comentário de várias linhas entre CTEs derruba a SF

Antes de executar uma SF SQL, a plataforma faz um parse para garantir que os
`{{param}}` podem ser parametrizados com segurança. Esse parser **falha** quando
um bloco `--` de **duas ou mais linhas** aparece no nível superior, entre o `),`
de uma CTE e o nome da próxima. A SF salva normalmente e só quebra na execução:

```
Server function SQL has placeholders that cannot be parameterized safely
(mes=LITERAL_EMBEDDED, ..., parse=FAILED); execution blocked
```

O mesmo erro aparece com **duas ou mais linhas em branco seguidas** em qualquer
ponto do SQL: o parser trata a sequência como fim de comando. Use no máximo uma
linha em branco entre blocos.

Parâmetro sem aspas (`LIMIT {{limit}} OFFSET {{offset}}`) é enviado como bind
`?`: o frontend tem que mandar **número**, não `String(...)`, senão o MySQL
recebe `LIMIT '20'` e falha com bad SQL grammar.

Comentário de **uma** linha entre CTEs funciona, e comentário de várias linhas
funciona **dentro** do corpo da CTE (depois do `AS (`) — é assim que a SF 195
está escrita. Na dúvida, comente dentro da CTE.

Versionamento: além das migrations, snapshots de SFs críticas ficam em [`backend/sf-versions/`](../backend/sf-versions/) (gerados por [sf-versionar.mjs](../backend/sf-versionar.mjs)) e SFs JAVASCRIPT têm fonte em `backend/*.sf.js`.

## Domínios (ids do mapa `SF` do frontend)

270 aliases, ids 1–363 com lacunas. Agrupamento por prefixo do alias:

| Domínio | Faixas/aliases típicos | Módulo |
|---|---|---|
| Dashboard | 1, 20, 214–215 (`dashboardKpis`, `visitasDoDia`, `dashboardVendas*`) | [dashboard](modulos/dashboard.md) |
| Painel de gestão | 29–32 (`painelGestao*`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Metas do vendedor | 122–124 (`meta*`; 123 usado no Dashboard) | [dashboard](modulos/dashboard.md) / [analytics](modulos/analytics.md) |
| Agenda e visitas | 5, 13–14, 21, 42–47, 139, 231–233, 285–286 (`agenda*`, `checkin/checkoutVisita`) | [agenda](modulos/agenda.md) |
| Clientes e carteira | 6–7, 22, 25–27, 38–41, 48–51, 84–85, 103, 116, 119–121, 128, 138, 142 (`minhaCarteira*`, `historico*`, `temperatura*`, `curva*`) | [carteira-clientes](modulos/carteira-clientes.md) |
| Tarefas | 11–12, 15, 23, 52–54, 140–141 (`tarefas*`, `atividades*Log`) | [tarefas](modulos/tarefas.md) |
| Mix e custos | 9–10, 55–62 (simulação legado); 91–93, 226–228, 251, 267, 358–363 (`mix*`) | [mix-builder](modulos/mix-builder.md) |
| Analytics RCA | 16–19 (legado), 181–188, 287 (`analyticsRca*`) | [analytics](modulos/analytics.md) |
| Acompanhamento semanal | 104, 106–107, 109–111, 146 (`calcularBwSemanal`, `clienteDetalhe*`, sync) | [analytics](modulos/analytics.md) |
| Alertas e dicas | 105, 125–137, 264 (`alertas*`, `dicaPro*`) | [alertas-prospeccao](modulos/alertas-prospeccao.md) |
| Prospecção | 115, 252–266 (`prospects*`, `prospeccaoSemanalCarteira`) | [alertas-prospeccao](modulos/alertas-prospeccao.md) |
| Solicitações de compras | 269–283 (`solicitacoesCompras*`) | [solicitacoes-compras](modulos/solicitacoes-compras.md) |
| Painel coordenador | 153–163, 189–197, 213, 248–250 (`painelCoordenador*`, `gestaoCarteiraCoordenador*`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Diretoria | 167–171, 198–207, 240–247, 295–296 (`gestaoMetasDiretoria*`, `analiseDiretoria*`, `faturamentoDiretoria*`, `gestaoCargosUsuarios*`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Governança RCA/BU | 33–37, 63, 94–102, 112–114, 145, 164–166, 172–180 (`*VendedorRca*`, `adminBu*`, `ferias*`, `gestaoCoordenadores*`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Admin cadastros | 64–83 (`admin*` produtos/metas/comissões, configurações de usuário) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Validação | 147–151 (`validacao*`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Google Agenda | 209–212 (`googleAgenda*`) | [agenda](modulos/agenda.md) |
| Suporte | 234–236 (`suporte*`) | [suporte](modulos/suporte.md) |
| Notas de versão | 403–407 (`releaseNotes*`) | [suporte](modulos/suporte.md) |
| Integrações billing | 288–294 (`*IntegrationBilling*`, `sincronizarClientesUfRamoTotvs`) | [gestao-diretoria](modulos/gestao-diretoria.md) |
| Base | 28 (`dadosUsuarioLogado`), 117–118 (`listarFiliais`, `listarSecoesDisponiveis`), 121 (`listarSegmentosClientes`) | transversal |

Aliases presentes no mapa **sem nenhuma chamada no frontend** (candidatos a limpeza, junto com o legado de simulação 9–10, 16–19, 55–62): `vendasMensais` (2), `visitasPorStatus` (3), `proximasVisitas` (4), `listarProdutos` (8), `metaDefinir` (122), `metaListarHistorico` (124) — ver [pendências](pendencias.md).

## SFs de permissão (gate de telas)

O acesso a telas restritas é decidido por SFs booleanas chamadas pelo [Layout](../frontend/src/components/Layout.tsx) (8 chamadas em paralelo, revalidadas a cada 5 min) e pelas próprias páginas:

| SF | Gateia |
|---|---|
| `painelGestaoPermissao` (29) | Painel de Gestão |
| `painelCoordenadorPermissao` (153) | Agenda do coordenador, gestão de carteira, seções de coordenador |
| `gestaoMetasDiretoriaPermissao` (167) | Gestão de metas / telas de diretoria |
| `gestaoCoordenadoresPermissao` (172) | Gestão de coordenadores |
| `gestaoCargosUsuariosPermissao` (204) | Papéis dos usuários |
| `solicitacoesComprasPermissaoGestao` (269) | Solicitações de compras (visão gestão) |
| `suportePainelPermissao` (236) | Painel do desenvolvedor |

Exceção: "Acomp. Semanal Admin" e "Painel de Validação" são gateados por **e-mail hardcoded** no frontend — ver [pendencias.md](pendencias.md).

## Convenções de retorno e erro

- Leituras retornam linhas; o wrapper `extractRowsFromOutput` normaliza os formatos de output do Mitra.
- Falha de execução (status ≠ `COMPLETED` ou campo `error`) vira mensagem genérica ao usuário e log detalhado no console (`callSFWithMeta`).
- Mutações retornam apenas sucesso/falha (`callSFMutation`).
