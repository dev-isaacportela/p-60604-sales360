# Banco de Dados

> Parte da [documentação do projeto](README.md). Veja também: [Arquitetura](arquitetura.md) · [Server Functions](server-functions.md)

Schema consolidado (~70 tabelas) do MySQL gerenciado pelo Mitra, extraído dos `CREATE TABLE`/`ALTER TABLE` em [`backend/*.mjs`](../backend/), [`backend/setup-backend.mjs`](../backend/setup-backend.mjs) e [`backend/migrations/`](../backend/migrations/).

> ⚠️ **Fonte de verdade**: as migrations em disco cobrem só ~7 tabelas (bloco mix/custos e solicitações). O restante do schema foi criado por scripts `.mjs` via SDK, e o sistema materializa migrations fora do turno do agente. O estado atual definitivo só é verificável no projeto Mitra remoto (ex.: via [MCP `listar_tabelas`](../backend/README-mcp.md)).

## Núcleo CRM

Criadas pelo [setup-backend.mjs](../backend/setup-backend.mjs) (fase 1); colunas em **negrito** foram adicionadas depois.

| Tabela | Colunas principais |
|---|---|
| `CARGOS` | ID PK, NOME, DESCRICAO |
| `PERFIL_TELAS` | ID PK, CARGO_ID→CARGOS, TELA, CATEGORIA, ORDEM |
| `CLIENTES` | ID PK, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, ENDERECO, CIDADE, UF, SEGMENTO, STATUS ('ATIVO'), TELEFONE, EMAIL, VENDEDOR_ID, CRIADO_EM, **WINTHOR_CODCLI** |
| `VISITAS` | ID PK, CLIENTE_ID→CLIENTES, VENDEDOR_ID, DATA_AGENDADA, HORA_INICIO/FIM, TIPO, STATUS ('AGENDADA'), CHECKIN_HORA, CHECKOUT_HORA, RELATO TEXT, **PLANEJAMENTO TEXT** |
| `TAREFAS` | ID PK, VENDEDOR_ID, TITULO, DESCRICAO, STATUS ('PENDENTE'), PRIORIDADE ('MEDIA'), DATA_LIMITE, **CLIENTE_ID, CONCLUIDO_EM** |
| `PRODUTOS` | ID PK, CODIGO, NOME, CATEGORIA, PRECO_TABELA, CUSTO, UNIDADE ('UN'), ATIVO |
| `SIMULACOES` / `SIMULACAO_ITENS` | simulações de mix (fase 1) — ver nota "legado vs. ativo" abaixo |
| `METAS` | ID PK, VENDEDOR_ID, MES, ANO, VALOR_META, VALOR_REALIZADO |
| `COMISSOES` | ID PK, VENDEDOR_ID, MES, ANO, VALOR_VENDAS, PERC_COMISSAO, VALOR_COMISSAO |
| `ATIVIDADES_LOG` | ID_ATIVIDADE→TAREFAS, CAMPO_ALTERADO, VALOR_ANTERIOR/NOVO, DATA_ALTERACAO, ID_USUARIO |

## Organização comercial e escopo (BU, filial, seção, RCA)

| Tabela | Papel |
|---|---|
| `BU` | Business Units (CODIGO, NOME, ATIVO) |
| `BU_VENDEDOR` | Vínculo BU↔vendedor, com **CODFILIAL**→FILIAL e **ID_SECAO**→SECAO |
| `FILIAL` | CODFILIAL VARCHAR(10) PK, NOME_FILIAL, **UF** (estado da filial — casa a meta do planejamento estratégico, que é por UF) |
| `SECAO` | ID PK, NOME_SECAO, ID_BU→BU; UNIQUE(NOME_SECAO, ID_BU) |
| `SEGMENTOS` | NOME UNIQUE, ATIVO, ORDEM |
| `EQUIPE_CLIENTE` | Carteira: ID_CLIENTE→CLIENTES, ID_VENDEDOR, **CURVA_CLASSIFICACAO CHAR(1)**, **CODFILIAL**, **ID_SECAO** (coluna `ID_BU` foi removida) |
| `CLIENTE_BU_VENDEDOR` | Cliente↔BU↔vendedor com **RCA_NOME, SUPERVISOR_NOME, WINTHOR_COD_RCA** |
| `RCA_TOTVS` | COD_RCA, RCA_NOME, SUPERVISOR_NOME, **COD_SUPERVISOR**, ATIVO — espelho do TOTVS |
| `RCA_DEPARTAMENTO` | COD_RCA ↔ departamento/filial; UNIQUE(COD_RCA, COD_DEPARTAMENTO, COD_FILIAL) |
| `VENDEDOR_RCA` | USER_ID PK→INT_USER, COD_RCA UNIQUE→RCA_TOTVS, COD_SUPERVISOR→RCA_TOTVS (redefinida 3×; esta é a versão final) |
| `VENDEDOR_RCA_AUDITORIA` | Trilha de mudanças de vínculo (anterior/novo, quem, quando, observação) |
| `COORDENADORES` / `COORDENADORES_BU` | Coordenadores (COD_SUPERVISOR, USER_ID, ATIVO) e seus recortes de BU (CODFILIAL, CODEPTO) |
| `USUARIO_CARGO` | USER_ID PK, CARGO ('DIRETORIA'/'COORDENADOR'/'VENDEDOR') |
| `FUNCIONARIOS` | ID, NOME, STATUS ('ATIVO'), ID_SUBSTITUTO |
| `FERIAS_VENDEDOR` | COD_RCA, DT_INICIO/FIM DATE, COD_RCA_SUBSTITUTO, ATIVO |
| `INT_USER` | Tabela da plataforma Mitra (não criada aqui); recebeu coluna extra `NOME` |

## Metas

A meta do vendedor é **criada pelo coordenador**, que redistribui entre a equipe
a meta vinda do projeto de planejamento estratégico (`INTG_MONTHLY_BILLING_TARGET`).

### Meta que o coordenador recebe da diretoria

O planejamento estratégico define a meta por **BU + UF** (`SOURCE_REGION_ID` →
`INTG_REGION`: DF, GO, TO, RS, Outros Estados). A SF 195 traduz isso para o grão
de trabalho do coordenador, que é (filial, departamento):

1. cada filial tem uma UF em `FILIAL.UF` e recebe a meta da **sua** UF na BU;
2. havendo mais de uma filial da mesma BU na mesma UF, a meta da UF é rateada
   entre elas pelo faturamento dos **12 meses anteriores** ao mês da meta
   (sem histórico: divisão igual);
3. meta de UF sem filial correspondente (ex.: MEDICAMENTO / Outros Estados) é
   redistribuída entre as filiais da BU pelo mesmo critério — sem isso a soma
   das metas dos coordenadores ficaria menor que a meta do planejamento;
4. valor lançado manualmente pela diretoria em `METAS_BU` **prevalece** sobre o
   cálculo.

O denominador do rateio usa o universo de (filial, departamento) de **todos** os
coordenadores ativos, nunca o escopo de quem abriu a tela — senão a meta da mesma
filial mudaria conforme o coordenador que a consulta. Até 09/2026 a SF dividia a
meta total da BU (somando todas as UFs) pelo número de escopos do próprio
coordenador: quem tinha uma filial só recebia a meta da BU no Brasil inteiro.

> `FILIAL.UF` foi semeada a partir da UF predominante dos clientes faturados por
> filial (1 DF, 2 GO, 3 DF, 4 GO, 5 GO, 6 TO, 7 DF, 8 RS). A diretoria pode
> corrigir qualquer linha direto na coluna — o cálculo lê sempre a tabela.

| Tabela | Granularidade |
|---|---|
| `METAS_BU` | Filial+departamento por mês/ano (diretoria) |
| `METAS_BU_VENDEDOR` | + VENDEDOR_ID; UNIQUE(CODFILIAL, CODEPTO, VENDEDOR_ID, ANO, MES). **Fonte da verdade da meta do vendedor** |
| `METAS_BU_VENDEDOR_RAMO_UF` | Personalização do rateio por ramo/UF; UNIQUE(CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF). `CODFILIAL` é gravado como `0`: o rateio por ramo/UF é por vendedor+BU, não por filial |
| `METAS_VENDEDOR` | Legado. USER_ID por ano/mês; UNIQUE(USER_ID, ANO, MES). Nenhuma SF escreve aqui — serve só de histórico anterior ao fluxo de redistribuição |
| `VW_META_VENDEDOR_MES` *(view)* | Fonte única lida por todo o sistema: soma de `METAS_BU_VENDEDOR` por (vendedor, ano, mês), caindo em `METAS_VENDEDOR` quando não há distribuição no período |

> **Leia a meta do vendedor pela view `VW_META_VENDEDOR_MES`, nunca por `METAS_VENDEDOR` direto.**
> Até 09/2026 as SFs 123, 124, 136, 155, 190, 192, 193, 237 e 295 liam `METAS_VENDEDOR`,
> que ninguém alimentava: a meta distribuída pelo coordenador não chegava ao painel do
> coordenador, ao dashboard do vendedor nem ao relatório semanal.

## Vendas e acompanhamento semanal (pipeline TOTVS/Winthor)

| Tabela | Papel |
|---|---|
| `PEDIDOS_SEMANAIS_SYNC_RAW` | **Camada raw da ingestão**: CHAVE_NATURAL UNIQUE, NUMPED, NUMNOTA, CODFILIAL, CODPROD, COD_RCA, CODCLI, CODEPTO, CODSECAO, QT, VLUNIT, TOTAL, DATA_SAIDA, ANO/MES/SEMANA_NUMERO, CLIENTE_ID, STATUS_INGESTAO, ATIVO, ULTIMA_EXECUCAO_ID |
| `PEDIDOS_SEMANAIS_SYNC` | **Camada agregada**: CHAVE_AGREGADA UNIQUE, CLIENTE_ID, CODFILIAL, CODEPTO, ID_SECAO, VALOR, QT, SEMANA_NUMERO, MES, ANO, ATIVO |
| `PEDIDOS_SEMANAIS` | Agregado legado (pré-integração) |
| `ACOMP_SEMANAL_SYNC_LOG` | Log por execução: EXECUCAO_ID, STATUS, contadores (fonte/processados/válidos/erros/inativados), MENSAGEM. Execucao que fica RUNNING por mais de 30 min e fechada como FAILED pela execucao seguinte da SF 107 |
| `ACOMP_SEMANAL_SYNC_ERRO_ATUAL` | Erros de ingestao, **uma linha por CHAVE_NATURAL + TIPO_ERRO** (UNIQUE): CODCLI, COD_RCA, DETALHE, SITUACAO (ABERTO/RESOLVIDO), QTD_OCORRENCIAS, primeira/ultima ocorrencia, RESOLVIDO_EM. A cada execucao a SF 107 soma a ocorrencia dos erros presentes, marca RESOLVIDO os que sumiram da carga e apaga os resolvidos ha mais de 7 dias |
| `ACOMP_SEMANAL_SYNC_ERRO` | **Desativada** (nao recebe mais gravacoes desde 2026-10-05). Guardava todos os erros de novo a cada execucao e chegou a ~95 milhoes de linhas |
| `PERFIL_COMPRA_CLIENTE` | FREQUENCIA, SEMANA_PADRAO, TICKET_MEDIO_3M por cliente |

A semana usada é a **semana operacional sexta–quinta** — ver [regras-de-negocio.md](regras-de-negocio.md#semana-operacional-sextaquinta).

## Mix e custos (Mix Builder)

Única área cujo DDL está de fato em [`backend/migrations/`](../backend/migrations/).

| Tabela | Papel |
|---|---|
| `PRODUCT_MIX` | Cabeçalho do mix: NOME, ID_CLIENTE, ID_USUARIO_CRIACAO, TOTAL_CUSTO/VENDA, MARGEM_MEDIA, **ENVIADO_HISTORICO, DT_ENVIO_HISTORICO** |
| `PRODUCT_MIX_ITEMS` | Itens: ID_MIX, ID_PRODUTO, QUANTIDADE, TIPO_CUSTO, CUSTO_UNITARIO, MARGEM_PERCENT, PRECO_VENDA, PRECO_CONCORRENTE, CMV_PERCENT |
| `PRODUTOS_CUSTOS` | Catálogo sincronizado do TOTVS: CODPROD PK, CODFAB, CODAUXILIAR, NOME, FORNECEDOR/DEPARTAMENTO/SECAO, ATIVO |
| `CUSTO_PADRAO_PRODUTO` | CODPROD PK, CUSTO DECIMAL(12,4), DATA_REF |
| `CUSTO_ESPECIAL_PRODUTO` | Custo por política: CODPROD, CLIENTE_ID NULL, POLITICA_ID/NOME, STATUS, FILIAL_ID, DATA_INICIO/FIM |
| `CUSTO_ESPECIAL_CLIENTES` | PK composta (CUSTO_ESPECIAL_ID, CLIENTE_ID) — clientes elegíveis a custo especial |
| `MIX_CUSTOS_SYNC` | Key/value de controle do sync de custos |
| `COST_POLICIES` / `POLICY_ITEMS` / `CUSTOPRODUTO` | Modelo de custos da fase 1 — ver nota abaixo |

> **Legado vs. ativo**: há dois pares redundantes — `SIMULACOES`/`SIMULACAO_ITENS` (fase 1) vs. `PRODUCT_MIX`/`PRODUCT_MIX_ITEMS` (atual, usado pelo [Mix Builder](modulos/mix-builder.md)); e `PRODUTOS`+`CUSTOPRODUTO`+`COST_POLICIES`/`POLICY_ITEMS` (fase 1) vs. `PRODUTOS_CUSTOS`+`CUSTO_PADRAO_PRODUTO`+`CUSTO_ESPECIAL_*` (atual, sincronizado do TOTVS). As SFs de simulação (55–62) seguem no mapa `SF` do frontend, então o par antigo ainda não pode ser considerado morto sem verificação no Mitra.

## Alertas e inteligência comercial

| Tabela | Papel |
|---|---|
| `ALERTAS_INTELIGENTES` | Alertas por vendedor/cliente: TIPO_ALERTA, TITULO, DESCRICAO, VALOR_REFERENCIA, PRIORIDADE ENUM(ALTA/MEDIA/BAIXA), LIDO, MES_REFERENCIA, PRODUTO_REFERENCIA, **CODEPTO, RAMO_CLIENTE** |
| `ALERTAS_PROCESSAMENTO` | Fila de geração: RUN_ID, VENDEDOR_ID, **CLIENTE_ID**, STATUS, tempos, TOTAL_ALERTAS_ATIVOS, ERRO |
| `ALERTAS_EMAIL_SEMANAL` | Log de envio; UNIQUE(ID_VENDEDOR, SEMANA_REFERENCIA) |
| `CONFIG_ALERTAS_VENDEDOR` | USER_ID PK, PERCENTUAL_ALERTA (default 30), PERIODO_COMPARACAO ENUM('semana','mes'), ATIVO |
| `DICAS_PRO_LOG` | Dicas geradas por vendedor: TIPO_DICA, TITULO, DATA_GERACAO, VISUALIZADA |
| `RELATORIO_SEMANAL_COORDENADORES_LOG` | E-mail semanal por coordenador; UNIQUE(COD_SUPERVISOR, SEMANA_REFERENCIA) |

Tipos de alerta gerados: `PRODUTO_PERDIDO`, `SAZONALIDADE_NAO_REPETIDA`, `REPOSICAO_PREVISTA`, `VOLUME_CRESCENTE`, `PEDIDO_INCOMPLETO`, `NAO_EXPLORADO` — janelas de 3/6/12 meses sobre `PEDIDOS_SEMANAIS_SYNC_RAW` cruzadas com `EQUIPE_CLIENTE` + `BU_VENDEDOR`. Detalhes em [modulos/alertas-prospeccao.md](modulos/alertas-prospeccao.md).

## Agenda interna e Google Agenda

| Tabela | Papel |
|---|---|
| `AGENDA_INTERNA` | Compromissos internos: TITULO, DATA/HORA, TIPO, ORIGEM/DESTINO_DESLOCAMENTO, STATUS, CRIADOR_ID |
| `AGENDA_INTERNA_PARTICIPANTES` | Participantes por compromisso |
| `GOOGLE_AGENDA_CONFIG` | OAuth por usuário: CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, CALENDAR_ID ('primary'), EMAIL_GOOGLE, STATUS — ⚠️ secrets em TEXT sem criptografia ([pendências](pendencias.md)) |
| `GOOGLE_OAUTH_APP` | Credencial OAuth da empresa (linha única): CLIENT_ID, CLIENT_SECRET, REDIRECT_URI. Gravada só pelo backend; o secret nunca é selecionado por SF exposta ao frontend |
| `GOOGLE_OAUTH_PENDENTE` | Ponte temporária do fluxo OAuth: STATE (único), REFRESH_TOKEN, EMAIL_GOOGLE, CRIADO_EM. Vive no máximo 10 min ([fluxo](modulos/agenda.md#fluxo-oauth-do-google-agenda)) |
| `GOOGLE_AGENDA_TICKET` | Ticket de uso único (5 min) que liga uma SF JAVASCRIPT ao usuário logado, já que SF JS não enxerga `:VAR_USER` ([ticket](modulos/agenda.md#ticket-de-identidade)) |
| `GOOGLE_AGENDA_EVENTOS` | Mapeamento entidade local ↔ GOOGLE_EVENT_ID; UNIQUE(USER_ID, ENTIDADE, ENTIDADE_ID) |
| `GOOGLE_AGENDA_LOGS` | Trilha de ações de sync |

## Prospecção

| Tabela | Papel |
|---|---|
| `PROSPECTS` | Pipeline: RAZAO_SOCIAL, CNPJ, SEGMENTO, PORTE, ORIGEM, STATUS_PIPELINE ('NOVO'), POTENCIAL, PROBABILIDADE (10), RESPONSAVEL_ID, COD_CLIENTE_TOTVS, CONVERTIDO_EM |
| `PROSPECT_CONTATOS` | Contatos por prospect (PRINCIPAL flag) |
| `PROSPECT_VISITAS` | Visitas a prospects: OBJETIVO, STATUS ('AGENDADA'), RESUMO, OBJECOES, PROXIMO_PASSO, DATA_PROXIMO_PASSO |

## Integrações externas (`INTG_`)

| Tabela | Papel |
|---|---|
| `INTG_BUSINESS_UNIT` / `INTG_REGION` / `INTG_ACTIVITY_SEGMENT` | Dimensões espelhadas (SOURCE_*_ID UNIQUE, CODE, NAME, ACTIVE, SYNCED_AT) |
| `INTG_MONTHLY_BILLING_TARGET` | Metas mensais de faturamento por BU/região/segmento: TARGET_VALUE, STORED_RESULT_VALUE, REALIZED_PERCENT, BW_PERCENT |
| `INTG_BILLING_SYNC_LOG` | Log das execuções de sync |
| `IMP_CLIENTES_TOTVS` | Espelho de clientes do TOTVS — fonte do **RAMO**/UF do cliente em dezenas de SFs (ex.: CTE `CLIENTES_RAMO` da SF 104). Sem `CREATE TABLE` no repo (nasce de import; estrutura verificável só no Mitra remoto, como `INT_USER`) |

## Suporte e solicitações

| Tabela | Papel |
|---|---|
| `RELEASE_NOTES` | Notas de versão: VERSAO, TIPO (NOVIDADE/MELHORIA/CORRECAO), TITULO, CONTEUDO (linhas com "- " viram tópicos), PUBLICADO, DATA_PUBLICACAO, CRIADO_POR |
| `RELEASE_NOTES_LEITURA` | Quem já viu cada nota no popup (RELEASE_ID + USER_ID únicos, LIDO_EM) |
| `SUPORTE_BUGS` | Reporte de bugs: PROTOCOLO, USER_*, TITULO, CATEGORIA, PRIORIDADE, TELA_AFETADA, textos de reprodução, **ANEXO_URL/NOME, EMAIL_STATUS/ERRO**, CONTEXTO_JSON, STATUS ('ABERTO') |
| `SOLICITACOES` | Solicitações ao time de compras: CLIENTE, TIPO_SOLICITACAO, PRIORIDADE ('MEDIA'), STATUS ('ABERTA'), PRAZO_DESEJADO, CODFILIAL, EXECUTIVO_* |
| `SOLICITACAO_ITENS` | Itens: CODPROD, **CODFORNEC**, PRODUTO, QUANTIDADE, OBSERVACAO |

## Observações de modelagem

- **Datas em VARCHAR**: a maioria das tabelas guarda datas/timestamps como `VARCHAR(10)`/`VARCHAR(19)` (`'YYYY-MM-DD'`, `'YYYY-MM-DDTHH:MM:SS'`). Apenas as mais recentes (`FERIAS_VENDEDOR`, `ALERTAS_*`, `METAS_BU*`, `COORDENADORES`) usam DATE/DATETIME nativos. O frontend formata com os helpers de Brasília em [useMitra.ts](../frontend/src/hooks/useMitra.ts).
- **FKs com ON UPDATE CASCADE**: várias FKs para `CLIENTES(ID)` foram dropadas e recriadas com `ON UPDATE CASCADE` (`VISITAS`, `SIMULACOES`, `PEDIDOS_SEMANAIS*`, `PERFIL_COMPRA_CLIENTE`, `PRODUCT_MIX`, `EQUIPE_CLIENTE`, `CLIENTE_BU_VENDEDOR`) — preparação para migrar IDs de cliente para códigos Winthor.
- **Collation**: o banco usa `utf8mb3_bin` em pontos que tornaram buscas case-sensitive; SFs de carteira foram corrigidas para busca case-insensitive (commit `fix: busca de clientes case-insensitive nas SFs de carteira`).
