# Plan: Analytics, comparativo e redistribuição de metas

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Duas telas: `/analytics` (abas Overview, Clientes, Produtos, Metas, Modular) e
`/comparativo` (visões `Semanal`, da spec 006, e `Mensal`). A meta da BU vem
só do planejamento estratégico (RNT-009, D2): o coordenador redistribui entre
os vendedores; os lançamentos manuais antigos (`METAS_BU`) não são lidos.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta |
| Backend local, executado no sandbox | sim | `novo/backend/add-007-analytics.mjs`, depois `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nem coluna nova; grava em `METAS_BU_VENDEDOR` e `METAS_BU_VENDEDOR_RAMO_UF` |
| Leitura e escrita por Server Function | sim | 13 SFs; gravação de metas por SF SQL com guarda de permissão |
| Simulador cobre a feature | sim | `schema-producao/007-metas.mjs`, `seeds/007-analytics.mjs` (ids 7001+), `smoke/007-analytics.mjs` |
| Testes automatizados | sim | mapa abaixo; regras de tela em `tests/analytics.test.mjs` |
| Design tokens | sim | `components/page.tsx`; gráficos em SVG/CSS com as cores do tema |
| Simplicidade | sim | nenhuma biblioteca de gráfico; `exceljs` (já pedida pela 006) só no clique de exportar |

## Contexto técnico

- **Reuso:** `lib/002-carteira.mjs` (`escopoAlvo`, `carteiraVisivel`,
  `vendaDoVendedor`, `cod`, `dia`, `ramoDe`, `nomeCliente`, `ESCOPO_SQL`),
  `lib/006-semanal.mjs` (`contaNoEscopo(s, p)`: a mesma regra de "quem conta a
  venda" da 006, sobre `IMP_VENDAS_DASHBOARD_TOTVS_RCA`), `s360EscopoOpcoes` e
  `s360ClientesRamos` (002) para as opções de filtro, `s360CarteiraCarregar`
  (002) para a busca de cliente do filtro (RNT-014). Na tela: `useEscopo`,
  `FiltroEscopo`, `paraInput`, `formato.ts`, `mitra-api.ts`.
- **Fonte das vendas do Analytics:** `IMP_VENDAS_DASHBOARD_TOTVS_RCA` +
  `IMP_DEVOLUCOES_TOTVS` (a mesma da carteira da 002), atribuídas pela RNT-007
  com `contaNoEscopo`; líquido sem truncar em zero (RN-003). O "Time inteiro"
  só soma as BUs do coordenador porque `escopoAlvo('TEAM')` já recorta assim
  (RNT-004, C-005).
- **Fragmento comum** `lib/007-analytics.mjs`: `LINHAS` = linhas de venda
  (`TIPO 'V'`) e de devolução (`'D'`, pela data da devolução) do recorte:
  `CODCLI, CODPROD, PRODUTO, CODFORNEC, CODFILIAL, CODEPTO, CODSEC, NUMPED,
  DIA, BRUTO, DEVOLVIDO, LIQUIDO, QT, RAMO` com período (`de`, `ate`), ramos e
  clientes. Toda SF de bloco é `WITH L AS (LINHAS) SELECT ...` — um texto só
  para os 8 blocos (C-003: o filtro vale para todos).
- Parâmetros de lista vão como texto delimitado: `ramos` = `|HOSPITAL|CLINICA|`,
  `clientes` = `,6001,6002,` (vazio = todos), testados com `INSTR`.
- **Meta do período** (RN-004): `SUM(METAS_BU_VENDEDOR.META_VALOR)` dos meses
  que o período toca, das linhas de escopo não herdadas (`COBERTURA = 0`) de
  `escopoAlvo`, casando filial e departamento. Nunca `VW_META_VENDEDOR_MES`,
  `METAS_VENDEDOR` nem `METAS` (C3 do modelo).
- **Meta recebida** (RN-010) em JS, regra pura em `lib/007-regras.mjs`:
  planejamento por BU × UF do mês (`INTG_MONTHLY_BILLING_TARGET` ⋈
  `INTG_BUSINESS_UNIT` ⋈ `INTG_REGION`, `ACTIVE`), universo = filial ×
  departamento de `COORDENADORES_BU` de coordenadores ativos (`DISTINCT`, cada
  BU uma vez: C-008), UF de `FILIAL.UF`, peso = líquido da filial ×
  departamento nos 12 meses anteriores (sem histórico: partes iguais), meta de
  UF sem filial redistribuída entre todas as filiais da BU pelo mesmo peso.
  Departamento ↔ unidade: 1 `NUTRICAO`, 2 `ENFERMAGEM`, 8 `MEDICAMENTO`, 9
  `ESTETICA_E_INJETAVEIS` (fixo, como a SF 195).

## Modelo de dados

Nenhum acréscimo. `schema-producao/007-metas.mjs` declara (DDL do
`modelo-de-dados.md`; nenhuma outra spec as declara hoje — a 005 também lê
`METAS_BU_VENDEDOR`, nota na pasta compartilhada):

| Tabela | Uso |
|---|---|
| `METAS_BU_VENDEDOR` | lê (meta do vendedor, RNT-009) e grava (redistribuição) |
| `METAS_BU_VENDEDOR_RAMO_UF` | lê e grava (RF-017) |
| `INTG_BUSINESS_UNIT`, `INTG_REGION`, `INTG_ACTIVITY_SEGMENT`, `INTG_MONTHLY_BILLING_TARGET` | só leitura (planejamento) |
| `METAS_BU` | **não é lida**; declarada só para o smoke provar a C-007 |

Lidas de outras specs: `VISITAS` (002), `PROSPECT_VISITAS` (003),
`IMP_*` (002), `COORDENADORES_BU` (002/010), escopo e férias (001).

## Contratos de backend — `novo/backend/add-007-analytics.mjs`

"Recorte" = escopo (os sete da 002) + `de`, `ate` (`AAAA-MM-DD`), `ramos`,
`clientes`. Todas as SFs de bloco são SQL.

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360AnalyticsResumo` | recorte | 1 linha: `META`, `BRUTO`, `DEVOLVIDO`, `LIQUIDO` | RF-003, RN-003/004, C-001/005 |
| `s360AnalyticsEvolucao` | recorte + `porDia` (1/0) | `TIPO` `L` (`CHAVE` dia ou mês, `LIQUIDO`) e `M` (`CHAVE` mês, `META`) | RF-004, RN-006 |
| `s360AnalyticsProdutos` | recorte | `GRUPO` ∈ `VALOR` (10), `QTD` (10), `DEVOLUCAO` (50, % sobre o bruto), `FORNECEDOR`, `RAMO`, `SEGMENTO` (todos), `RAMO_TOP3`, `DEPTO`, `SECAO` (20) — `CHAVE`, `NOME`, `RAMO`, `VALOR`, `QT`, `BRUTO`, `DEVOLVIDO` | RF-005/010, RN-008 |
| `s360AnalyticsClientes` | recorte | 10 maiores: `CODCLI`, `CLIENTE`, `BRUTO`, `DEVOLVIDO`, `LIQUIDO`, `PEDIDOS`, `TOTAL_LIQUIDO` do recorte | RF-009, RN-008 |
| `s360AnalyticsEvolucaoCliente` | recorte (com `clientes`) | `CODCLI`, `CLIENTE`, `MES`, `LIQUIDO` | RF-009 |
| `s360AnalyticsCarteira` | recorte + `deAnt`, `ateAnt` | `CARTEIRA`, `ATIVOS`, `INATIVOS`, `EM_RISCO`, `NOVOS`, `LIQUIDO` | RF-007, RN-007, C-004 |
| `s360AnalyticsCarteiraLista` | idem + `situacao` (`INATIVO`/`EM_RISCO`), `pagina` | 20 por página com `TOTAL`: cliente, ramo, último pedido, `DIAS_SEM_COMPRA` (até hoje, ou até o fim do período encerrado) | RF-007, RNFT-001 |
| `s360AnalyticsVisitas` | escopo + `de`, `ate` | `TIPO`, `N` (visitas `CONCLUIDA` + prospecção concluída dos vendedores do escopo) | RF-008, RN-009 |
| `s360AnalyticsDevolucoes` | recorte + `pagina` | `PARTE` `TOP` (4 maiores) e `LINHA` (50 da página), com `TOTAL`, `REGISTROS`, `VALOR_TOTAL`, `ACIMA_30` em toda linha | RF-006 |
| `s360AnalyticsComparativo` | recorte (período do bloco) + `categoria` (`CLIENTE`, `RAMO`, `SECAO`, `PRODUTO`, `DEPTO`), `metrica` (`FATURAMENTO`, `PEDIDOS`, `QUANTIDADE`) | `CHAVE`, `NOME`, `VALOR` de **todos** os itens do recorte | RF-011, RN-016 |
| `s360MetasCarregar` | JAVASCRIPT: `ano`, `mes`, `coordenador` (diretoria; vazio = todos) | `{ ok, leitura, bus[], vendedores[] }` — BU: `CODFILIAL`, `FILIAL`, `UF`, `CODEPTO`, `DEPTO`, `META`, `ORIGEM` ("Planejamento estratégico · DF, GO"); vendedor × BU: `VENDEDOR_ID`, `NOME`, `CODFILIAL`, `CODEPTO`, `META`, `REALIZADO` (líquido na BU no mês) | RF-013..015, RN-010/011/014, C-006..008, C-014 |
| `s360MetasSalvar` | SQL: `ano`, `mes`, `metas` (JSON `[{vendedorId, codFilial, codepto, valor}]`) | linhas afetadas | RF-018/020, RN-019, C-009/011/014 |
| `s360MetasMotivo` | SQL: mesmos | 1 linha `MOTIVO`, `CODFILIAL`, `CODEPTO`, `VENDEDOR` da primeira linha recusada | C-011 (mensagem) |

- **Gravação tudo ou nada:** `s360MetasSalvar` são duas instruções (`UPDATE`
  das linhas existentes e `INSERT ... SELECT ... WHERE NOT EXISTS` das novas),
  ambas lendo o lote por `JSON_TABLE` e ambas com a guarda "nenhuma linha do
  lote é inválida": quem grava é coordenador ativo **sem** papel DIRETORIA ou
  ADMIN (RF-020, C-014) e coordena a BU (`COORDENADORES_BU`); o vendedor tem
  escopo ativo na BU e não é coordenador; valor ≥ 0; `ano`/`mes` válidos. Uma
  linha ruim → 0 linhas nas duas instruções (C-011). A tela então chama
  `s360MetasMotivo` e mostra "Nada foi alterado: você não coordena a BU Filial
  3 · Medicamento.".
- A tela manda só o que mudou (≥ R$ 0,005, RN-019) e valida antes (RN-018); o
  servidor confere de novo o que é de permissão.
- **Visitas:** tipos da RN-009 (Aumento de mix, Padronização de produto,
  Positivação, Renegociação, Manutenção) e um balde "Outros tipos" para os que
  a agenda (003) também tem (Gerar demanda, Financeiro) e para a prospecção,
  que guarda o tipo no início do objetivo (D-305 da 003). Divergência anotada
  no relatório (a spec cita 5 tipos).

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/analytics` | filtro de escopo, Período (`Mês atual`, `Último trimestre`, `Último ano`, `Intervalo personalizado`), Ramos (vários), Cliente (vários, com busca), `Buscar` ("Alterações nos filtros só afetam os blocos após clicar em Buscar."); abas | `AnalyticsPage.tsx` (`.rota = '/analytics'`) |
| Overview | cards Meta do período, Faturamento líquido ("R$ … bruto menos devoluções"), Falta para meta, Total devolvido; progresso; projeção; Evolução Histórica; Ranking de Produtos (8 + 8); Devoluções do Período; Tipos de Visita | `pages/analytics/Overview.tsx` |
| Clientes | Análise de Carteira (cards clicáveis Inativos/Em risco → lista paginada), Top Clientes (10, ordenável), Evolução do cliente | `pages/analytics/Clientes.tsx` |
| Produtos | top produtos (10 + 10), com devolução, fornecedores, por ramo, top 3 por ramo, departamentos/seções | `pages/analytics/Produtos.tsx` |
| Metas | mês/ano, Filial / BU, cards (Meta geral, Total distribuído, Saldo, Vendedores com meta, status do rateio), Detalhamento por Vendedor (Meta atual, Nova meta, realizado, atingimento, status), `Ratear igual` / `Por realizado` / `Manter proporção` por BU, `Salvar`, confirmação de descarte (RF-019), diretoria "Acompanhamento de Metas por Coordenador" e `Somente leitura` | `pages/analytics/Metas.tsx` |
| Modular | até 4 blocos (categoria, métrica, período, itens com busca de até 8), gráfico dos 6 maiores, `Exportar Excel` | `pages/analytics/Modular.tsx` |
| `/comparativo` | visões `Semanal` (spec 006) e `Mensal` | `ComparativoPage.tsx` (`.rota = '/comparativo'`) |
| Mensal | mês (ano atual ou anterior), 3 totais, variação, recortes (Todos, Em queda, Em alta, Não compraram no mês, Novos no mês), selos `SEM COMPRA`/`NOVO`, `Baixar PDF` | `pages/comparativo/Mensal.tsx` |
| gráficos | barras horizontais (CSS) e evolução barras × linha (SVG), sem biblioteca | `pages/analytics/graficos.tsx` |

Regras puras (o que os testes importam):

| Arquivo | Funções |
|---|---|
| `src/lib/analytics.ts` | `periodo(tipo, hoje, de, ate)` + `validarIntervalo` (RN-001, C-017), `periodoAnterior`, `diasUteis`, `projecao` (RN-005), `pontosEvolucao` (RN-006), `cardsResumo` (RN-004), `ordenar` numérico (RF-022), `listaParam`, `filtroDoClique` (RF-023) |
| `src/lib/metas.ts` | `lerValor` (RN-018), `alteracoes` (RN-019), `statusRateio` (RN-013), `statusVendedor` (RN-014), `ratear` (RN-015), `mensagemSalvar`, `rotuloBu` ("Filial N · UF · Departamento"), `ramosDoVendedor`/`aplicarRamos`/`validarRamos` (RN-012), `insights`/`planilhaMetas` (RF-021) |
| `src/lib/comparativo.ts` | `blocosPadrao(hoje)`, `METRICAS` por categoria, `diferenca` (RN-016), `planilhaModular`, `mensal(linhas, recorte)` (RN-017: variação, % vazio, selos, ordem) |

## Fluxo

1. **Abertura de `/analytics`:** `s360EscopoOpcoes`, `s360ClientesRamos` e os
   7 blocos (`Resumo`, `Evolucao`, `Produtos`, `Clientes`, `Carteira`,
   `Visitas`, `Devolucoes`) = 9 chamadas (RNF-001). Abas Clientes e Produtos
   reusam o que já veio. Evolução do cliente: só com cliente marcado.
2. **Filtros:** editar não chama nada; `Buscar` valida o período e recarrega os
   7 blocos (`Promise.allSettled`; bloco que falha mostra a mensagem padrão do
   bloco, RNFT-007).
3. **Aba Metas:** só ao abrir: `s360MetasCarregar` (1 chamada, RNF-002). Trocar
   mês/ano/BU ou recarregar com edição pendente pede confirmação (RF-019).
   `Salvar` → valida → `s360MetasSalvar` → 0 linhas com algo a gravar →
   `s360MetasMotivo` → mensagem; sucesso → "Metas salvas: N vendedor(es) e M
   ajuste(s) por ramo/UF." e recarrega.
   Ramos: `Aplicar ao vendedor` só mexe nos campos; vai junto no `Salvar`.
4. **Aba Modular:** ao abrir, uma `s360AnalyticsComparativo` por bloco.
5. **`/comparativo` → Mensal:** `s360SemanalMatriz` da 006 (já traz M−2, M−1 e
   M por cliente, mesmo cálculo: RN-017), sem chamada nova.

## Simulador

- `schema-producao/007-metas.mjs`: as tabelas acima.
- `seeds/007-analytics.mjs` (hoje = 15/10/2026 nos cenários; ids 7001+):

  | Quem / o quê | Para |
  |---|---|
  | Amélia Torres (vendedora F1·Nutrição): meta 50.000 em out/2026, bruto 42.000 e devolução 2.000; carteira de 40 (25 ativos, 6 em risco, 2 novos) | C-001, C-002, C-004 |
  | Benício (vendedor em F1·Nutrição com coord. Caio e F2·Medicamento com coord. Dalva): 30.000 e 20.000 | C-005 |
  | Caio Prates e Dalva Rocha (coordenadores 7001/7002 por `ctx.usuario`); Caio com 5 vendedores em F1·Nutrição | C-009..C-012 |
  | Planejamento nov/2026 de Nutrição: DF 100.000, GO 300.000, Outros Estados 40.000; Nutrição nas filiais 71 (DF), 72 (GO), 74 (GO) com líquido 12 meses de 1, 2 e 1 milhão; `METAS_BU` antigo de 250.000 na 72 | C-006, C-007 |
  | Medicamento em 8 filiais com dois coordenadores, planejamento 800.000 | C-008 |
  | Visitas concluídas (8 de cliente + 4 de prospecção em 30 dias) | RN-009 |
  | Filiais 71–78 com UF; vendas do Comparativo modular (cliente X 10.000 em 1º tri/2025 e 12.500 em 1º tri/2026) | C-015 |
  Gil (id 8, DIRETORIA + COORDENADOR) só ganha a coordenação no seed para a
  C-014; nenhum outro dado nos ids 1..11.
- `CHECK_INPUT` (`config.mjs`, linha da spec 007): `de`, `ate`, `deAnt`,
  `ateAnt`, `ramos`, `clientes`, `porDia`, `situacao`, `pagina`, `categoria`,
  `metrica`, `ano`, `mes`, `coordenador`, `metas`.

## Testes

Backend em `simulator/smoke/007-analytics.mjs`; tela em
`tests/{analytics,metas,comparativo}.test.mjs`.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-004 | smoke + tela | Resumo de Amélia: meta 50.000, bruto 42.000, devolvido 2.000, líquido 40.000; `cardsResumo` → falta 10.000, 80,0%, devolvido 4,8% |
| C-002 / RN-005 | tela | 40.000 ÷ 11 × 22 = 80.000; out/2026 = 22 dias úteis; set/2026 encerrado 30.000 → 30.000 |
| C-003 / RN-002 | smoke | venda 1.000 F1 e 500 F2, filtro filial 2 → 500 em Resumo, Evolução, Produtos, Clientes, Carteira, Devoluções, Comparativo |
| C-004 / RN-007 | smoke | 40 / 25 / 15 / 6 / 2; lista Em risco = 6; dias sem compra em 15/10 com último 05/10 = 10 |
| C-005 / RN-003 | smoke | Caio `TEAM` 30.000, Dalva 20.000 |
| C-006 / RN-010 | smoke (+ função) | 110.000 / 220.000 / 110.000, origem "Planejamento estratégico · DF, GO"; sem histórico em GO → 150.000 + 150.000 |
| C-007 | smoke | `METAS_BU` 250.000 não muda nada: 220.000 |
| RN-010 (unidade) | smoke | depto 8 lê Medicamento; 9 lê Estética e Injetáveis |
| C-008 | smoke | diretoria em todos: Medicamento 800.000, cada filial uma vez |
| C-009 / RN-019 | smoke + tela | 2 editados → 2 linhas; `alteracoes` com valor reescrito igual → vazio → "Nenhuma alteração para salvar." |
| C-010 / RN-018 | tela | `1.500,50`, `1500.50`, `R$ 1.500,50` → 1500,5; `1,500` → 1500; `0` → 0; vazio e `-10` inválidos; um inválido entre 3 → nada enviado e mensagem com o nome |
| C-011 | smoke | lote com F3·Medicamento → 0 linhas e as outras do lote também não gravam; motivo `BU_NAO_COORDENADA`; vendedor que é coordenador → `VENDEDOR_COORDENADOR` |
| C-012 / RN-015 | tela | 90.000 ÷ 3; realizados 50/30/20 → 45/27/18; atuais 40/40/20 → 36/36/18; realizados 0 → iguais; negativo conta 0 |
| C-014 / RN-011 | smoke | Gil grava → 0 linhas, motivo `SOMENTE_LEITURA`; `leitura = true`; vendedor pede Metas → `bus` vazio |
| C-015 / RN-016 | smoke + tela | SF: X 10.000 e 12.500; `diferenca` → 2.500 e 25,0%; base 0 → % vazio; Seção só Faturamento; `blocosPadrao` em 15/10/2026 → 3º tri/2026 × 3º tri/2025 |
| C-016 / RN-017 | tela | 80/100/60 mil → −40.000 e −40,0%; anterior 0 e mês 5.000 → NOVO e % vazio; set > 0 e out 0 → SEM COMPRA; zerado nos 3 fora |
| C-017 / RN-001 | tela | 31/12/2026–01/01/2026 recusado; 36 meses recusado; Último trimestre em 15/10/2026 = 01/08–31/10 |
| RN-006 | smoke + tela | meta 44.000 → 2.000 por dia útil; sábado 03/10 → 0; Caio `TEAM` → meta da linha = soma da equipe |
| RN-008 | smoke | 15 clientes, Hospital com 3 fora do top 10 → `RAMO` inclui os 3; top 3 por ramo usa líquido |
| RN-009 | smoke | 8 + 4 concluídas em 30 dias → 12, média 2,8 (tela) |
| RN-013 | tela | 90.000: 90.000 → rateio fechado; 0 → não distribuído; 60.000 → em aberto |
| RN-014 | tela | 10.000 / 8.500 / 7.000 / meta 0 → acima / atenção / risco / sem meta |
| C-013 / RN-012 | tela + smoke | 100.000 com bases 60/40 → 60.000/40.000; Clínica 30.000 → Hospital 70.000 e BU 100.000; 150.000 → recusado; as duas fixadas 50.000 e 30.000 → BU 80.000 repartida entre as filiais; ramo sem planejamento não editável; vendedor só em DF numa BU planejada em DF e GO → só ramos de DF. SF: grava as personalizadas, apaga a que voltou a automática |
| RF-021 | tela | 3 UFs de maior meta; planilha com linha por vendedor × BU e por vendedor × BU × ramo × UF |
| RF-023 | tela | clique em cliente/produto do ranking → filtro trocado; ramo/fornecedor/departamento → filtros iguais |
| RF-001 | tela | abas por perfil: vendedor 4 (sem Metas), coordenador e diretoria 5 |
| RF-006 | smoke | 120 devoluções → `TOTAL` 120, página 1 com 50, 3 páginas; `TOP` 4 |
| RF-022 | tela | `ordenar` por número: 9.000 antes de 10.000 |

## Ramo/UF, insights e clique no gráfico (entram nesta entrega)

O usuário pediu tudo agora (2026-11-03): RF-017/RN-012/C-013, RF-021 e RF-023.

- **Dados (RN-012):** `s360MetasCarregar` também devolve `base[]` (planejamento
  do mês por departamento × UF × ramo: `INTG_ACTIVITY_SEGMENT.CODE`/`NAME`),
  `ufs[]` (vendedor × departamento × UF das filiais em que ele atua),
  `personalizadas[]` (`METAS_BU_VENDEDOR_RAMO_UF` do mês) e `realizadoRamo[]`
  (líquido do vendedor por departamento × UF × ramo, ramo do cliente mapeado
  para o código do planejamento pela tabela fixa da SF 295).
- **Rateio (tela, `metas.ts` `ramosDoVendedor`):** a meta do vendedor na BU
  (soma das filiais do departamento) é repartida entre os ramos/UF da base, só
  nas UFs dele, na proporção da base; personalizada mantém o valor; as
  automáticas dividem a sobra. Ramo com venda e sem planejamento aparece pelo
  realizado e não é editável. Soma das personalizadas > meta → "Os ramos
  ajustados passam da meta total de: Ana. Reduza os valores. Nada foi gravado."
- **Gravação:** linha gravada em `METAS_BU_VENDEDOR_RAMO_UF` = personalizada
  (como o antigo: existir a linha marca a personalização; `CODFILIAL` = 0). "Todos
  os ramos gravados como estão na tela" = o estado do vendedor na BU vai inteiro:
  personalizadas são gravadas e as que voltaram a automáticas são apagadas (D-710).
  Sem nenhuma automática, a meta do vendedor na BU vira a soma das
  personalizadas, repartida entre as filiais na proporção atual (a tela calcula
  e manda nas `metas`). `s360MetasSalvar` ganha `ramos` (JSON `[{vendedorId,
  codepto, ramo, ramoNome, uf, valor, percentual}]`) e `ramosLimpar` (JSON
  `[{vendedorId, codepto}]`): mais três instruções (apagar, atualizar, inserir)
  sob a mesma guarda do lote.
- **RF-021:** Ocupação por Região (3 UFs de maior meta), Insights (região
  destaque = maior atingimento, ramo líder = maior realizado, performance por
  estado) calculados na tela sobre os dados da aba; `Exportar relatório` em
  .xlsx com uma linha por vendedor × BU e uma por vendedor × BU × ramo × UF.
- **RF-023:** clique numa barra do ranking de clientes ou de produtos troca o
  filtro (Cliente ou Produto) e aplica como um `Buscar`; ramo, fornecedor e
  departamento não filtram. O filtro de produto (`produtos`, como `clientes`)
  entra no `LINHAS`.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-701 | Analytics lê `IMP_*` com a regra de atribuição da 006 (`contaNoEscopo`) | ler o RAW da carga | é a fonte da carteira (002) e do antigo Analytics; o Comparativo mensal usa a matriz da 006, como a RN-017 pede |
| D-702 | Um fragmento `LINHAS` e uma SF SQL por bloco | uma SF JS que devolve tudo | cada bloco falha sozinho (C-007 da 000) e a contagem da RNF-001 fica visível |
| D-703 | Filial, Departamento e Seção pelo filtro de escopo comum (um de cada) | três listas de escolha múltipla só nesta tela | decisão do usuário em 2026-11-03 (P-2) |
| D-704 | Meta recebida calculada em JS sobre 3 consultas | SQL único como a SF 195 | a regra de rateio fica testável por função (RN-010) |
| D-705 | Gravação em lote com guarda "nenhuma linha inválida" nas duas instruções | uma chamada por vendedor | tudo ou nada (A-03) sem transação explícita |
| D-706 | ADMIN na aba Metas = diretoria (leitura) | ADMIN grava | só coordenador redistribui (RN-011); o escopo já trata ADMIN como diretoria |
| D-707 | Gráficos em SVG/CSS próprios | `recharts` | poucos tipos de gráfico; sem dependência nova |
| D-708 | `Baixar PDF` abre a impressão do navegador com layout próprio (escopo e recorte no cabeçalho) | `jspdf` | decisão do usuário em 2026-11-03 (P-3); sem dependência nova |
| D-710 | Existir linha em `METAS_BU_VENDEDOR_RAMO_UF` = ramo personalizado; voltar a automático apaga a linha | gravar todos os ramos | sem coluna nova não há outro jeito de distinguir; mesmo critério do antigo (`PERSONALIZADO`) |
| D-709 | Comparativo mensal sem SF nova | SF própria | a matriz da 006 já soma M−2, M−1 e M por cliente com a mesma regra |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `contaNoEscopo` por linha em "Último ano" × "Time inteiro" | lento | pré-filtro por cliente da carteira e período antes do `EXISTS`; T-003 mede |
| `JSON_TABLE` e duas instruções numa SF SQL no Mitra | gravação parcial | o mesmo padrão já roda na 009; T-001 confirma |
| `INTG_*` com códigos diferentes do esperado (BU, região "Outros Estados") | meta recebida errada | T-001 lê os códigos reais e corrige a correspondência |

## Pendências

- [x] **P-2** — 2026-11-03: Filial/Departamento/Seção pelo filtro de escopo (um de cada); Ramos e Clientes aceitam vários.
- [x] **P-3** — 2026-11-03: PDF pela impressão do navegador.
- [x] **P-4** — 2026-11-03: ramo/UF e os itens `could` entram nesta entrega.

## Complexity Tracking

| Violação | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| 13 SFs | 8 blocos independentes + metas | SF única: um erro derruba a tela inteira |
