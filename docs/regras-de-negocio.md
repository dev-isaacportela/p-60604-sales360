# Regras de Negócio (verificadas no código)

> Parte da [documentação do projeto](README.md). Documento de origem (histórico): [regras-de-negocio.md da raiz](legado/regras-de-negocio.md).
> Cada regra abaixo cita o arquivo onde está implementada.

## Semana operacional (sexta–quinta)

Implementação: [operational-week.ts](../frontend/src/lib/operational-week.ts) (frontend) e SFs do acompanhamento semanal (backend).

- A semana comercial vai de **sexta-feira a quinta-feira**.
- As semanas são **recortadas nos limites do mês**: a semana 1 sempre começa no dia 1 (mesmo que não seja sexta) e a última termina no último dia do mês. Uma semana sexta–quinta que cruza a virada do mês é dividida em duas.
- Numeração: semana que começa no dia 1 = semana 1; a partir da primeira sexta-feira do mês contam-se as demais (`weekNumberFromStart`). Um mês tem 4 a 6 semanas operacionais.
- `buildOperationalWeeksForMonth` devolve as semanas do mês em ordem decrescente; é a malha usada pelo [Acompanhamento Semanal](modulos/analytics.md).

## Meta semanal de visitas

Implementação: **frontend**, em [DashboardPage.tsx](../frontend/src/pages/DashboardPage.tsx) (card "Meta semanal de visitas") e [AgendaPage.tsx](../frontend/src/pages/AgendaPage.tsx) (resumo da semana). Não existe SF nem coluna de meta no banco — o cálculo é feito no navegador sobre as linhas devolvidas por `listarVisitasPeriodo` (5) e `prospectsVisitasListar` (254).

**Janela:** segunda a sexta da semana corrente (`startOfWeek` + `isBusinessDayIso`). Atenção: é a semana **calendário**, diferente da [semana operacional sexta–quinta](#semana-operacional-sextaquinta) usada no acompanhamento semanal. Sábado e domingo nunca contam.

**Denominador (a meta):** `16` por vendedor e `8` por coordenador, constantes hardcoded nas duas páginas (`META_VISITAS_SEMANAIS_POR_VENDEDOR` / `META_VISITAS_SEMANAIS_POR_COORDENADOR`). Em escopo `TEAM`/`GLOBAL` a meta é a soma pessoa a pessoa do filtro aberto.

**Numerador (o que conta como realizada):**

| Origem | Tabela | Conta na meta? | Chega a `CONCLUIDA`? |
|---|---|---|---|
| `VISITA` | `VISITAS` | sim | sim — via checkout (`checkoutVisita` 14) |
| `PROSPECCAO` | `PROSPECT_VISITAS` | sim | sim |
| `INTERNA` + `TIPO='Deslocamento'` | `AGENDA_INTERNA` | sim | **não — não existe fluxo de conclusão** |
| `INTERNA` (Reunião interna, Outros) | `AGENDA_INTERNA` | não | não |

A regra é a mesma nas duas telas: `(ORIGEM <> 'INTERNA' OR TIPO = 'Deslocamento') AND dia útil`. O **realizado** exige ainda `STATUS = 'CONCLUIDA'`.

**Consequência conhecida — deslocamento nunca soma no realizado.** `AGENDA_INTERNA` só tem as SFs `agendaCriarCompromissoInterno` (231), `agendaAtualizarCompromissoInterno` (285, não altera `STATUS`) e `agendaCancelarCompromissoInterno` (286). Sem SF de conclusão, todo registro fica em `AGENDADA` até ser cancelado — em todo o histórico da tabela não existe uma linha `CONCLUIDA`. Ou seja: deslocamento entra no **planejado** da semana, mas não pode entrar no **realizado** enquanto não existir um fluxo de concluir compromisso interno.

**Consequência conhecida — realizado depende do checkout do vendedor.** `STATUS` só vira `CONCLUIDA` quando o vendedor faz checkout **com relato preenchido** (SF 14 exige `relato` não vazio e `STATUS IN ('AGENDADA','EM_ANDAMENTO')`). Visita feita em campo sem checkout permanece `AGENDADA` e não conta como realizada. `EM_ANDAMENTO` (checkin sem checkout) também não conta.

## Temperatura do cliente (score 0–100)

Documentada na UI em [LegendaCarteira.tsx](../frontend/src/components/LegendaCarteira.tsx); calculada nas SFs `temperaturaClientesCarteira` (128) e `temperaturaClienteDetalhe` (138).

| Fator | Peso | Regra |
|---|---|---|
| Recência | 30 pts | última compra < 30 dias = 30; < 60 = 20; < 90 = 10; senão 0 |
| Frequência | 25 pts | compra dentro de 1,1× do ciclo médio = 25; até 1,3× = 15; até 1,6× = 5; acima = 0 |
| Tendência | 25 pts | volume cresceu > 10% nos últimos 2 meses = 25; estável = 15; queda leve = 5; queda forte = 0 |
| Visitas | 20 pts | visita < 30 dias = 20; < 60 = 12; < 90 = 5; sem visita = 0 |

Classificação: **Quente** ≥ 70 · **Morno** 40–69 · **Frio** < 40.

## Alerta de queda de volume

Config por vendedor em `CONFIG_ALERTAS_VENDEDOR` (SFs `alertaConfigurar` 125 / `alertaObterConfig` 126; cálculo em `alertasQuedaVolume` 127).

- `queda (%) = (valor anterior − valor atual) / valor anterior × 100`, comparando período atual vs. anterior, por **semana ou mês** (`PERIODO_COMPARACAO`).
- Só gera alerta se o período anterior teve compras e a queda atingiu o limite.
- Limite padrão: **30%** (`PERCENTUAL_ALERTA` default 30), ajustável por vendedor.

## Alertas inteligentes (tipos)

Gerados pelas SFs de população/fila (`alertasInteligentesPopular` 130, `alertasInteligentesProcessarFila` 264) sobre janelas de 3/6/12 meses de `PEDIDOS_SEMANAIS_SYNC_RAW` × `EQUIPE_CLIENTE` × `BU_VENDEDOR`:

| Tipo | Significado |
|---|---|
| `PRODUTO_PERDIDO` | Parou de comprar produto que comprava regularmente |
| `SAZONALIDADE_NAO_REPETIDA` | Época do ano em que costuma comprar, sem pedido ainda |
| `REPOSICAO_PREVISTA` | Data estimada da próxima compra se aproximando |
| `VOLUME_CRESCENTE` | Cliente em expansão — momento de ampliar mix |
| `NAO_EXPLORADO` | Produto popular no segmento que o cliente nunca comprou |
| `PEDIDO_INCOMPLETO` | Último pedido abaixo da média histórica |

## Escopo de visualização

Implementação: [CoordinatorScopeFilter.tsx](../frontend/src/components/CoordinatorScopeFilter.tsx) (`useCoordinatorScope`).

- Modos: `ME` (meu painel) · `TEAM` (time inteiro do coordenador) · `SELLER` (um vendedor específico) · `GLOBAL` (visão diretoria).
- Default: `GLOBAL` para quem tem permissão de diretoria; `TEAM` para coordenador; `ME` para vendedor.
- O hook injeta nas SFs os params `scopeUserId`, `scopeCodRca`, `scopeCodSupervisor`, `scopeCodFilial`, `scopeCodepto`, `scopeIdSecao`; sem permissão (`canUseScope` falso) tudo colapsa para `ME`.
- Isolamento de dados do vendedor no backend: SFs filtram por `:VAR_USER` (usuário logado) — ver [server-functions.md](server-functions.md#onde-vivem-e-como-são-chamadas).
- **Escopo por BU, não por vendedor** (alertas inteligentes — SFs 131/133/134): o recorte é o par vendedor + filial + departamento do alerta (`ALERTAS_INTELIGENTES.CODFILIAL`/`CODEPTO`), não só `ID_VENDEDOR`. Consequências: vendedor com mais de um departamento usa o filtro de escopo do topo da tela para ver um departamento por vez (sem seleção, vê todos os seus); coordenador vê **apenas as BUs dele** (`COORDENADORES_BU`) mesmo quando o vendedor também responde a outro coordenador; "marcar tudo como lido" só afeta o escopo aberto na tela.

## Papéis e permissões

- Papéis em `USUARIO_CARGO`: `DIRETORIA`, `COORDENADOR`, `VENDEDOR` (atribuídos na tela [Papéis dos usuários](modulos/gestao-diretoria.md)).
- Coordenador enxerga o time via `COORDENADORES`/`COORDENADORES_BU` (recorte por filial+departamento); vendedor↔RCA via `VENDEDOR_RCA` (auditado em `VENDEDOR_RCA_AUDITORIA`).
- Telas restritas são gateadas por SFs de permissão — tabela em [server-functions.md](server-functions.md#sfs-de-permissão-gate-de-telas). Matriz completa por perfil: [matriz-crud-permissoes.md](legado/matriz-crud-permissoes.md) (documento de origem).

## Mapeamento de venda → vendedor

Implementação de referência: SF `calcularBwSemanal` (104), snapshot em [sf-104-calcular-bw-semanal.sql](../backend/sf-versions/20260821151600/sf-104-calcular-bw-semanal.sql) (CTEs `CARTEIRA` e `VENDEDOR_ESCOPO`).

A linha de venda importada do Winthor (`PEDIDOS_SEMANAIS_SYNC_RAW`) **não referencia um usuário do sistema** — carrega `CLIENTE_ID`, `CODFILIAL`, `CODEPTO`, `CODSECAO/ID_SECAO`, `COD_RCA` e `DATA_SAIDA`. A atribuição acontece na consulta, e uma venda conta para o vendedor **somente quando as duas condições valem ao mesmo tempo**:

1. **Cliente na carteira** — o cliente da venda está em `EQUIPE_CLIENTE` com `ID_VENDEDOR` = vendedor. ⚠️ O SQL contém um ramo para o **substituto de férias** (`FUNCIONARIOS.ID_SUBSTITUTO`), mas na SF 104 ele é **inalcançável** — o `JOIN` já restringe ao titular antes do `OR`, então o substituto **não herda** os clientes do titular nesse cálculo (possível bug, registrado em [pendências](pendencias.md)).
2. **Venda dentro do escopo de BU do vendedor** — existe vínculo ativo em `BU_VENDEDOR` cujo `CODFILIAL` e `BU_CODIGO` (= `CODEPTO` da venda) casam com a filial/departamento da venda; a seção também precisa casar quando o vínculo define `ID_SECAO` (`NULL` = todas as seções; a comparação tolera zero à esquerda, ex.: `2` = `02`).

Antes disso, a linha só é elegível se `ATIVO = TRUE`, `STATUS_INGESTAO = 'ATIVO'`, `DATA_SAIDA` válida e cliente/filial/departamento/seção preenchidos; as linhas são agregadas por cliente × filial × depto × seção × semana operacional.

Consequências práticas:

- Venda de um cliente **da carteira**, mas em filial/departamento fora do vínculo do vendedor, **não conta** para ele.
- O mesmo cliente pode contar para vendedores diferentes em BUs diferentes (cada um vê a fatia do seu escopo).
- O `COD_RCA` da venda **não participa** desse join. O vínculo usuário↔RCA (`VENDEDOR_RCA`, mantido na [Governança RCA](modulos/gestao-diretoria.md)) alimenta as consultas parametrizadas por RCA — o filtro de escopo envia `scopeCodRca`/`scopeCodSupervisor` para as SFs de analytics/faturamento ([CoordinatorScopeFilter.tsx](../frontend/src/components/CoordinatorScopeFilter.tsx)).
- Nos modos de escopo `TEAM`/`GLOBAL` a identificação individual é colapsada na apresentação (`VENDEDOR_ID = 0`, rotulado "Coordenador") — a atribuição acima continua valendo por baixo.

## Acompanhamento semanal e BW

- Vendas do Winthor entram na camada raw (`PEDIDOS_SEMANAIS_SYNC_RAW`), são validadas e agregadas por cliente × filial × depto × seção × semana operacional (`PEDIDOS_SEMANAIS_SYNC`); cada execução é logada (`ACOMP_SEMANAL_SYNC_LOG/_ERRO`).
- **Devoluções são deduzidas** do acompanhamento semanal (commit `fix: deduz devolucoes no acompanhamento semanal`); o Painel de Validação confere faturamento vs. devoluções.
- O delta **BW** é calculado pela SF `calcularBwSemanal` (104) — snapshot versionado em [`backend/sf-versions/`](../backend/sf-versions/); metas BW externas chegam em `INTG_MONTHLY_BILLING_TARGET` (`BW_PERCENT`).
- A compra é atribuída ao vendedor por **carteira + escopo de BU**, não pelo RCA — regra detalhada em [Mapeamento de venda → vendedor](#mapeamento-de-venda--vendedor) (commit `fix: calcula compra por escopo de bu do vendedor`).
- A tela lista **toda a carteira do escopo**, inclusive clientes **sem venda no mês** (linha zerada, BW "Sem base") — o CTE `CARTEIRA_COMPLETA` da SF 104 parte de `EQUIPE_CLIENTE`, e não do movimento do mês. Cliente sem venda continua entrando nas regras de status (ex.: "Alerta" quando o perfil de compra esperava pedido na semana).
- O export do acompanhamento semanal sai em **.xlsx** ([lib/excel-export.ts](../frontend/src/lib/excel-export.ts), ExcelJS): valor vai como **número puro** (sem `R$`) e BW como **porcentagem**, com formato só na célula — dá para somar e filtrar no Excel. A aba "Produtos" detalha apenas as semanas com movimento (cliente/semana zerado não tem item e não vira chamada de SF).

## Carteira e curva

- Carteira do vendedor = `EQUIPE_CLIENTE` (com `CURVA_CLASSIFICACAO` A/B/C... por cliente — SFs `listarCurvasMinhaCarteira` 119, `atualizarCurvaClienteCarteira` 120).
- Transferência de clientes entre vendedores (individual ou carteira inteira) é ação de coordenador — [gestão de carteira](modulos/gestao-diretoria.md).
- Férias: `FERIAS_VENDEDOR` registra período e RCA substituto; o status do usuário (ativo/férias + substituto) também aparece em [Configurações](../frontend/src/pages/ConfiguracoesUsuarioPage.tsx).

## Mix Builder e custos

- Três origens de custo por item: **padrão** (`CUSTO_PADRAO_PRODUTO`), **especial** (`CUSTO_ESPECIAL_PRODUTO` restrito aos clientes de `CUSTO_ESPECIAL_CLIENTES` — vazamento entre clientes foi bug corrigido) e **tempo real** (SF `mixCustoTempoReal` 226).
- Margem padrão sugerida: **30%**.
- Escrita (salvar/duplicar/excluir mix) passa por SFs com `:VAR_USER` — o mix pertence ao usuário logado (SFs 358–363).
- Sync de custos roda em **cron** com identidade de integração (SF JAVASCRIPT; ver commits `fix: move sync de custos para cron` e `fix: sync de custos le o projeto remoto via integracao`), com estado em `MIX_CUSTOS_SYNC`.

## Fuso horário e formatos

- Todo carimbo de data/hora do frontend usa **America/Sao_Paulo** (`getBrasiliaDate`/`getBrasiliaTimestamp` em [useMitra.ts](../frontend/src/hooks/useMitra.ts)).
- Datas persistidas como texto ISO (`YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:SS`) na maioria das tabelas — ver [banco-de-dados.md](banco-de-dados.md#observações-de-modelagem).
- Moeda: BRL via `formatCurrency`.
