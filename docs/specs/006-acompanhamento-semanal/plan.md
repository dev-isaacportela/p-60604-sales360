# Plan: Acompanhamento semanal (visão do vendedor + carga do ERP)

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Sobrou da 006 a **visão do vendedor** (matriz cliente × semana, detalhe do
cliente, planilha) e a **carga automática do ERP**. A visão mora na tela
`/comparativo` (visão `Semanal`), que é da spec 007 e é construída junto. A
visão de gestão, o Painel de Validação e o Acomp. Semanal Admin foram
cancelados (D3/D4); coordenação e diretoria usam a mesma visão com o filtro de
escopo (RN-010).

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-006-semanal.mjs` só roda no sandbox; depois `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nem coluna nova; a carga grava nas tabelas que o antigo já usa |
| Leitura e escrita por Server Function | sim | 4 SFs de leitura para a tela; a carga é SF agendada, fora do mapa do frontend |
| Simulador cobre a feature | sim | `schema-producao/006-semanal.mjs`, `seeds/006-semanal.mjs` (ids 6001+), `smoke/006-semanal.mjs` |
| Testes automatizados | sim | cada linha da seção Testes vira `teste()` no smoke ou `test()` em `tests/semanal.test.mjs` |
| Design tokens | sim | vocabulário de `components/page.tsx`, sem cor literal |
| Simplicidade | sim | uma SF por carga de tela; status e B/W calculados uma vez no servidor; planilha com `exceljs` carregado só no clique |

## Contexto técnico

- **Reuso (não reescrever):** `lib/002-carteira.mjs` — `carteiraVisivel`,
  `escopoAlvo`, `vendaDoVendedor` (RNT-007/010, RN-002 da 002), `cod`, `dia`,
  `nomeCliente`, `nomeUsuario`, `ramoDe`, `ESCOPO_MARCADO`; o prelúdio de SF
  JAVASCRIPT de `add-002-carteira.mjs` (mesma forma: `consultar`, `preencher`).
  Na tela: `useEscopo`/`FiltroEscopo`, `paraInput`, `formato.ts`, `mitra-api.ts`.
- **Regras puras do servidor** em `novo/backend/lib/006-regras.mjs` (sem
  import; vão como texto no corpo da SF, como `002-regras.mjs`): semanas
  operacionais (RNT-005), célula, B/W, status, curva, valor médio, agregação
  "Equipe", cards, movimento do item.
- **Fonte das vendas da matriz:** `PEDIDOS_SEMANAIS_SYNC_RAW` com
  `ATIVO = 1 AND STATUS_INGESTAO = 'ATIVO'` (item válido e ativo, RN-013/014),
  lido como linha de venda `(CODCLI = CLIENTE_ID, CODFILIAL, CODEPTO,
  CODSEC = ID_SECAO, DIA = DATA_SAIDA, VALOR = TOTAL, QT, CODPROD, NUMPED)`
  para o `vendaDoVendedor` da 002 servir sem mudança. **Devoluções:**
  `IMP_DEVOLUCOES_TOTVS` pela `DATA_DEVOLUCAO`, sem seção vazia (RN-003).
- **Quem conta a venda:** para cada linha de escopo `A` de `escopoAlvo`, a
  venda conta se casa filial/departamento (e seção, quando `A` tem seção) e
  `vendaDoVendedor(s, CASE WHEN A.COBERTURA = 1 THEN :VAR_USER ELSE
  A.VENDEDOR_ID END, s.DIA)` — a linha herdada de férias só conta na data
  coberta (C-007). Cada venda entra uma vez por cliente (`EXISTS`, RN-002).
  Esse predicado é `contaNoEscopo(s, p)` em `lib/006-semanal.mjs` (fragmentos
  SQL da 006), reusado pela 007 sobre `IMP_VENDAS_*`.

## Modelo de dados

Nenhum acréscimo. Declaradas em `schema-producao/006-semanal.mjs` (nenhuma
outra spec as declara hoje; DDL do `modelo-de-dados.md`):

| Entidade (spec) | Tabela | Uso |
|---|---|---|
| Item de venda do ERP | `PEDIDOS_SEMANAIS_SYNC_RAW` | lê (matriz, detalhe); a carga grava |
| Consolidado semanal | `PEDIDOS_SEMANAIS_SYNC` | a carga grava (outras rotinas leem) |
| Execução de carga | `ACOMP_SEMANAL_SYNC_LOG` | lê a última concluída (RF-010); a carga grava |
| Erro de ingestão | `ACOMP_SEMANAL_SYNC_ERRO_ATUAL` | a carga grava (RN-015) |
| Devolução | `IMP_DEVOLUCOES_TOTVS` | já declarada pela 002 |
| Fonte da carga | `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | já declarada pela 002 |

`STATUS` do log continua gravado como `RUNNING`/`SUCCESS`/`FAILED` (o antigo lê
esses valores enquanto os dois convivem); a tela traduz para Em andamento,
Concluída, Com falha (RN-016).

## Contratos de backend — `novo/backend/add-006-semanal.mjs`

Escopo = os sete parâmetros da 002 (`modo`, `coordenador`, `vendedor`,
`filial`, `depto`, `secao`, `hoje`). `ano` e `mes` = mês aberto.

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360SemanalMatriz` | JAVASCRIPT | escopo + `ano`, `mes` | `{ ok, agregado, semanas[{n, ini, fim}], semanaRef, mesEncerrado, linhas[], ramos[] }` — linha: `CLIENTE_ID`, `CLIENTE`, `CURVA`, `SEGMENTO`, `RAMO`, `VENDEDOR_ID`, `VENDEDOR` ("Equipe" no agregado), `DE_TITULAR` (nome, quando herdada), `SEMANAS[{valor, anterior, bw}]`, `FECH_ANT`, `FECH`, `BW_FECH`, `STATUS`, `MES_2`, `MES_1`, `MES` (para o Comparativo mensal da 007) | RF-001..005, RN-001..010 |
| `s360SemanalDetalhe` | JAVASCRIPT | escopo + `ano`, `mes`, `clienteId` | `{ ok, semanas[{n, ini, fim, pedidos, valor}], itens[{semana, CODPROD, PRODUTO, qt, qtAnt, dif, vlUnit, total, movimento, ultimas8[], pico}], pedidos[{semana, NUMPED, valor}], sazonalidade[{CODPROD, PRODUTO, meses[{ano, mes, qt, valor}]}] }` | RF-006, RN-011 |
| `s360SemanalProdutos` | JAVASCRIPT | escopo + `ano`, `mes` | itens por cliente × semana com movimento (aba "Produtos" da planilha) | RF-007, RN-012 |
| `s360SemanalAtualizacao` | SQL | — | 1 linha `FIM_EM` da última execução `SUCCESS` (nenhuma = sem linha) | RF-010, RN-016 |
| `s360SemanalCarga` | JAVASCRIPT, `cronExpression` `0 8-19 * * 1-5` (hora de Brasília: confirmar fuso do cron em T-001) | — | `{ ok, execucaoId, status, validos, erros, inativados }` ou `{ ok: false, error }` | RF-011..013, RN-013..017 |

Como `s360SemanalMatriz` trabalha (1 chamada por mês aberto, RNF-001):
1. 2 consultas: (a) carteira do escopo (`carteiraVisivel`) + cadastro, ramo,
   curva, nome do dono; (b) líquido por cliente × dia nos meses M−2, M−1 e M
   (venda do RAW + devolução, regra de "quem conta" acima). No modo `ME`, o
   `hoje` de `escopoAlvo` vira a data do mês aberto mais próxima do início das
   férias, para o substituto ver os clientes do titular quando as férias
   **cruzam** o mês (RN-001), e não só quando estão ativas hoje.
2. JS: semanas (RNT-005), célula = soma dos dias da semana (RN-003), B/W
   (RN-004), período de referência (RN-007: semana de hoje no mês corrente,
   fechamento em mês encerrado), status (RN-008, arredondado a 1 casa antes da
   faixa), valor médio e curva (RN-006/009), agregação "Equipe" com a melhor
   curva quando o modo é `TEAM`/`ALL`/`COORD` (RN-010).
3. Filtros Ramo e `Abaixo da expectativa` e os cards são aplicados na tela
   sobre as linhas recebidas (RF-004 "sem recarregar").

Detalhe (RN-011): 2 consultas (itens de venda e devoluções do cliente nos 12
meses que terminam no mês aberto, mais o mês anterior) e o resto em JS; o valor
da semana sai da mesma regra da célula, então bate com a matriz.

Planilha (RF-007): matriz já carregada + `s360SemanalProdutos` = 2 chamadas,
qualquer número de clientes.

### Carga do ERP (RF-011..013)

`s360SemanalCarga` porta a SF 107 do antigo com as correções da spec. O SQL de
cada passo fica em `lib/006-carga.mjs` (exporta `PASSOS`), e o corpo é só a
sequência com `runDmlMitra`, o log e a mensagem real de erro:

1. **RN-017:** chamada com usuário identificado (`:VAR_USER` é um `INT_USER`)
   é recusada: "A carga de vendas roda só pela rotina automática." — vale para
   qualquer papel. A SF também não entra em `server-functions.ts`.
2. **RN-016:** fecha `RUNNING` com mais de 30 min como `FAILED` ("Execução
   interrompida sem finalizar (tempo limite ou queda do processo)"); se sobrar
   `RUNNING`, recusa com "Já existe uma sincronização em andamento desde
   hh:mm." e não grava nada.
3. Atualiza o Data Loader `VENDAS_DASHBOARD_TOTVS_RCA` (como a 107; só no
   sandbox).
4. **RN-013:** grava o RAW a partir da fonte **agrupada** por pedido + produto
   + filial (`SUM(QT)`, `SUM(TOTAL)`: C-019), com a validação na ordem da spec
   (data, cliente, filial, departamento, seção vazia, seção não cadastrada) e
   a quantidade corrigida (total ÷ unitário; sem unitário e total > 0 → 1).
   Atualiza o existente e insere o novo (`UPDATE` + `INSERT ... WHERE NOT
   EXISTS`, sem `ON DUPLICATE KEY`, que o simulador não traduz).
5. **RN-014:** inativa o item válido que não veio nesta execução e conta só
   esses no `TOTAL_INATIVADOS_RAW`; refaz o consolidado semanal e inativa a
   semana sem item.
6. **RN-015:** registro único por item + tipo de erro: cria ou reabre com +1
   ocorrência; aberto que não reapareceu vira `RESOLVIDO` com data; resolvido
   há mais de 7 dias é apagado.
7. Fecha o log com os contadores (`SUCCESS`) ou com a mensagem real do erro
   (`FAILED`, RF-012).

`PERFIL_COMPRA_CLIENTE` continua sendo gravado pela 107 do antigo enquanto a
prospecção antiga o ler (anexo da spec); a carga nova não grava.

**Convivência:** a 107 do antigo continua agendada. Ver Pendência P-1 (as duas
cargas não podem rodar ao mesmo tempo nas mesmas tabelas).

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/comparativo`, visão `Semanal` | filtro de escopo, Mês, Ano (corrente −1 a +1), Ramo, `Abaixo da expectativa: Nª sem`; cards; "Vendas atualizadas em dd/mm/aaaa hh:mm"; matriz com coluna Cliente fixa, uma coluna por semana ("2ª sem" + "02/10 a 08/10"), Fech. mês anterior, Fech. do mês, B/W, Status, linha TOTAL; `Exportar Excel` | `pages/comparativo/Semanal.tsx` (a página `ComparativoPage.tsx` é da 007) |
| Detalhe do cliente | abre ao clicar no cliente: semanas do mês (pedidos e valor), seletor "Semana N - dd/mm/aaaa a dd/mm/aaaa" com cabeçalho "2 pedido(s) • R$ 2.000,00", itens com movimento, pedidos da semana, aba Sazonalidade | `pages/comparativo/DetalheCliente.tsx` |

Regra pura em `novo/frontend/src/lib/semanal.ts` (o que `tests/semanal.test.mjs`
importa): `rotuloSemana(s)` ("02/10 a 08/10"), `fmtBw(bw)` ("+20,0%", "Sem
base"), `corBw(bw)`, `filtrar(linhas, {ramo, abaixo})` (RN-005), `cards(linhas)`,
`totalLinha(linhas)`, `planilha(dados, produtos)` (abas, colunas, números e
formatos da RN-012), `rotuloStatusCarga`.

## Fluxo

1. Abertura: `s360EscopoOpcoes` (do filtro), `s360SemanalAtualizacao`,
   `s360SemanalMatriz` = 3 chamadas.
2. Trocar mês, ano ou escopo: só `s360SemanalMatriz`. Ramo e `Abaixo`: nenhuma
   chamada.
3. Clique no cliente: `s360SemanalDetalhe` (mesmo mês, ano e escopo, RN-011).
4. `Exportar Excel`: `s360SemanalProdutos` + `import('exceljs')`; sem linhas →
   "Não há dados semanais para exportar." e nada baixa.

## Simulador

- `schema-producao/006-semanal.mjs`: as 4 tabelas acima.
- `seeds/006-semanal.mjs` — vendedores próprios por `ctx.usuario` (os ids
  1..11 não ganham carteira nem venda):

  | Quem / o quê | Para |
  |---|---|
  | Alice Moura (vendedora, F1·Nutrição seção 6101) com carteira de 40 clientes 6001–6040, 12 sem venda em set/out | C-002, C-010 |
  | Alfa (6001): 1.200 na sem 2 de out e 1.000 na sem 2 de set; 2.000 em 10/10 e devolução de 300 em 12/10; 2 pedidos na sem 3 (P1 10 un, P2 0 un; set: P1 6, P2 4) | C-001, C-004, C-009 |
  | Beta, Gama, Delta, Épsilon (6002–6005): semana 4 de set e out da C-005; Beta fecha out com 4.000 contra 5.000 | C-005, C-018 |
  | Bernardo Reis (substituto de Alice de 01/10 a 15/10), Cecília Paz (coordenadora 6001 das BUs dos dois) | C-007, C-008, RN-010 |
  | linha de log `SUCCESS` de 30/10/2026 08:05 | RF-010 |
  | linhas de RAW e de `IMP_VENDAS_DASHBOARD_TOTVS_RCA` iguais (a fonte "já carregada") | carga no smoke |
  Clientes `CLIENTES.ID = WINTHOR_CODCLI` (C5 do modelo de dados).
- O cron e o Data Loader só existem no sandbox. O smoke chama o corpo da carga
  (o simulador serve `runQueryMitra`/`runDmlMitra`) sobre `IMP_VENDAS_*`
  preparado em cada teste: é o SQL publicado sendo testado, não uma cópia.

## Testes

Backend em `simulator/smoke/006-semanal.mjs`; tela em
`frontend/tests/semanal.test.mjs`. Título começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-004 | smoke + tela | Alfa sem 2: valor 1200, bw 0,2; `fmtBw(0.2)` = "+20,0%"; `rotuloSemana` = "02/10 a 08/10"; out/2026 tem 6 semanas e fev/2026 5 (RF-001) |
| C-002 / RF-002 | smoke + tela | 40 linhas, 12 zeradas com bw nulo e `Sem base`; `cards` → 40 e 28 |
| C-003 / RN-004 / RN-005 | smoke + tela | 0 × 1.000 → −1, "−100,0%", Alerta; `filtrar` sem 2 inclui; anterior 0 fica fora |
| C-004 / RN-003 | smoke | sem 3 = 1.700; devolução sem seção ignorada; fechamento desconta 300 |
| C-005 / RN-008 | smoke | hoje 20/10: Beta No padrão, Gama Fora do padrão, Delta Alerta, Épsilon Sem base; card Alerta = 1 |
| RN-008 (limites) | smoke (funções) | −14,9 → No padrão; −15,0 e +25,0 → Fora; +25,1 → Alerta; −14,96 → Fora |
| C-018 / RN-007 | smoke | aberto em 05/11: Beta pelo fechamento −20,0% Fora; aberto em 20/10: pela semana 4 |
| C-019 / RN-013 | smoke (carga) | P1 em duas linhas 3/300 e 2/200 → 1 item 5 un e 500; célula 500 |
| RN-006 | smoke | 3.000 + 1.000 em 2 semanas → 2.000; 5.000 em outra BU fora; sem compra → 0 |
| C-007 / RN-001 | smoke | Bernardo: Alfa "de Alice", sem 2 = 900, sem 4 = 0; aberto em 05/11 continua vendo (férias cruzam o mês) |
| C-008 / RN-002 | smoke | Cecília `TEAM`: Alfa sem 2 = 900, sem 4 = 400 |
| RN-002 (escopo duplo) | smoke | Alice com F1·Nutrição sem seção e seção 6101; venda de 500 na 6101 → 500 |
| RN-010 | smoke | Alice 1.000 e Bernardo 500 no mesmo cliente, anteriores 1.000 e 0 → linha "Equipe" 1.500, +50,0%, Alerta |
| RN-009 | smoke (funções) | curva B cadastrada → B; sem curva 15.000 → A; 6.999,99 → C; equipe A + C → A |
| C-009 / RN-011 | smoke | cabeçalho 2 pedidos e 2.000 = célula; P2 Deixou de comprar −4 primeiro, P1 Comprou a mais +4 |
| C-010 / RN-012 | tela | `planilha`: 40 linhas + TOTAL; valor 1200 numérico com formato de moeda; bw −1 com `0.0%`; Sem base vazio; aba Produtos sem semanas zeradas; nome `analytics-semanal-2026-10.xlsx` |
| C-012 | smoke (carga) | 10.000 itens, 50 sem cliente → validos 9.950, erros 50, `SUCCESS`; `s360SemanalAtualizacao` devolve o fim |
| C-013 / RN-016 | smoke (carga) | `RUNNING` das 10:00: às 10:10 recusada com a mensagem; às 10:31 a antiga vira `FAILED` com a mensagem padrão e a nova roda |
| C-014 / RN-015 | smoke (carga) | 2 cargas: 48 com 2 ocorrências abertas, 2 resolvidos; resolvido há 8 dias apagado, há 6 fica |
| RN-013 | smoke (carga) | sem data e sem cliente → 1 erro de data; qt 0, total 100, unit 25 → 4; sem unit → 1 |
| RN-014 | smoke (carga) | pedido ausente na 2ª carga → inativo, fora do total; inativados = 1 |
| RN-017 | smoke (carga) | chamada com usuário (Alice, Tânia ADMIN) → recusada e nenhum log novo |
| RF-011 (devoluções) | smoke | devolução incluída na fonte aparece na matriz na leitura seguinte (a matriz lê a fonte direto); agendamento horário do Data Loader é T-002 |
| RF-010 / RN-016 (tela) | tela | `rotuloStatusCarga('SUCCESS')` = Concluída; sem execução → nada |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-601 | Matriz lê o RAW (item válido e ativo), devoluções da fonte | ler `IMP_VENDAS_*` direto como a 002 | RN-013/014: item com erro ou inativo não entra em total; e "Vendas atualizadas em" é a carga |
| D-602 | Matriz e detalhe em SF JAVASCRIPT com regras puras em `lib/006-regras.mjs` | tudo em SQL | semana operacional recortada no mês, B/W, status e agregação são legíveis e testáveis em JS; o SQL só soma por dia |
| D-603 | Linha herdada usa `:VAR_USER` na atribuição; o `hoje` do escopo vira a data do mês mais próxima das férias | fragmento novo de carteira | reusa `escopoAlvo`/`vendaDoVendedor` da 002 sem mudar; ponytail: depende de `p.hoje` só servir às férias no fragmento da 002 |
| D-604 | SQL da carga em `PASSOS` e o smoke executa o corpo publicado sobre a fonte semeada | testar funções JS paralelas | o teste roda o mesmo SQL que vai para produção |
| D-605 | `exceljs` (o mesmo do antigo) importado só no clique | escrever .xlsx à mão | formato de moeda, %, colunas fixas e duas abas; o import dinâmico não pesa na abertura |
| D-606 | Status do log gravado em inglês, exibido em português | gravar em português | o antigo lê `RUNNING`/`SUCCESS`/`FAILED` enquanto convivem |
| D-607 | RF-017 (lista de erros para a TI, `could`) fica fora desta entrega | — | sem tela técnica no módulo (RF-016 cancelado); os erros ficam consultáveis no banco |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Como o cron chama a SF JS (há `:VAR_USER`? qual fuso?) | carga recusada pela guarda da RN-017 ou fora de horário | T-001 confirma no sandbox antes de agendar; se o cron tiver usuário, a guarda passa a exigir `event.origem = 'ROTINA'` do `cronInputJson` |
| Duas cargas (107 antiga e nova) nas mesmas tabelas | contadores e inativação trocados | P-1 |
| `EXISTS` com `vendaDoVendedor` por linha em "Time inteiro" | passar de 6 s (RNF-001) | pré-filtro por `CLIENTE_ID IN (carteira)` e janela de datas; T-003 mede no sandbox |
| 100 mil itens em uma carga (RNF-002) | passar de 15 min | passos em SQL de conjunto, sem laço por item |

## Pendências

- **P-1 (ao usuário):** convivência das duas cargas — ver resumo do plano.

## Complexity Tracking

| Violação | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| Regra em SF JAVASCRIPT | RNT-005 e RN-004..010 | SQL com semanas calculadas: ilegível e não testável por função |
