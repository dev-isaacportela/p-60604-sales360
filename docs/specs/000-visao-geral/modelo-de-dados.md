# Modelo de dados — contrato congelado do schema de produção

**ID:** 000-visao-geral · **Nível:** plan · **Data:** 2026-10-30 · **Spec-mãe:** [spec.md](spec.md)

## Propósito

O Comercial Externo 360 vai ser reconstruído no mesmo projeto Mitra, **sobre os dados de produção que já existem** (RF-007). Este arquivo congela o schema que o sistema novo herda: tabelas, colunas, chaves e o papel de cada tabela no sistema novo. As specs de módulo (001–012) e seus planos citam tabelas e colunas **a partir daqui**.

## Fontes (a mais recente vence)

1. `backend/migrations/*.sql` + `backend/migrations.yaml`: 338 entradas no yaml e 338 arquivos em disco, que batem 1:1. DDL só em 18 arquivos `runddl-*.sql`: 13 tabelas e 2 `ALTER`. O resto são SFs (`create-sf-*`, `update-sf-*`), DML (`rundml-*`) e permissões (`set-profile-*`).
2. DDL embutido nos scripts `backend/*.mjs`: 73 arquivos com `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` / `CREATE OR REPLACE VIEW`, entre eles `setup-backend.mjs`, `add-*`, `fix-*`, `update-*`, `ajustar-*`, `localizar-*`, `import-*`, `migrar-*`, `extrair-*` e `hotfix-*`.
3. `backend/migrations/set-profile-select-tables-operacao-comercial-1793018565.sql`: lista das tabelas que o perfil 1 pode ler direto. Prova que existem em produção tabelas sem DDL no repositório (`*_BKP`, `USUARIO_PREFERENCIAS`, `CUSTO_ESPECIAL_PRODUTO_CLIENTE`).
4. Consultas de Data Loader (`createDataLoaderMitra` / `updateDataLoaderMitra`) nos scripts. Delas sai a estrutura das tabelas `IMP_*`.
5. Uso nas SFs, procurado com grep nas versões de SF em `backend/migrations/` (as mais recentes), em `backend/sf-versions/` e nos scripts.
6. [`docs/banco-de-dados.md`](../../banco-de-dados.md), um resumo defasado. As divergências estão em [Lacunas](#lacunas).

> O estado definitivo só pode ser conferido no projeto Mitra remoto. Onde o repositório não basta, o texto diz **"a verificar no Mitra"**.

## Regras do contrato

### C1 — Nada se altera nem se remove

- O sistema novo **não altera nem remove** coluna, tabela, índice, FK ou view existente. Isso inclui `MODIFY`, `RENAME`, `DROP` e troca de collation.
- **Acréscimo** (tabela ou coluna nova) só entra com **spec própria** e via DDL **idempotente**: `CREATE TABLE IF NOT EXISTS`, ou `ALTER TABLE … ADD COLUMN` precedido de consulta a `INFORMATION_SCHEMA.COLUMNS`, como faz o `addColumnIfMissing` dos scripts atuais. Coluna nova é sempre `NULL` ou tem `DEFAULT`, para não quebrar as SFs antigas durante a convivência.
- Todo DDL executado vira **migration nova**, materializada pelo sistema. As migrations são **append-only**: nunca se edita, renumera ou funde migration existente, e correção é sempre migration nova.
- Tabelas marcadas **legada — não usar** continuam no banco intactas (spec, "Fora de escopo": não se migram nem se limpam dados históricos). O sistema novo só não as lê nem as grava.

### C2 — Datas e horas

A maior parte das datas fica em `VARCHAR`. Formatos encontrados:

| Formato | Tipo | Onde |
|---|---|---|
| `'YYYY-MM-DD'` | `VARCHAR(10)` | `VISITAS.DATA_AGENDADA`, `TAREFAS.DATA_LIMITE`, `AGENDA_INTERNA.DATA_AGENDADA`, `PROSPECT_VISITAS.DATA_VISITA`/`DATA_PROXIMO_PASSO`, `RELATOS_CLIENTE.DATA_CONTATO`, `SOLICITACOES.PRAZO_DESEJADO`, `PEDIDOS_SEMANAIS_SYNC_RAW.DATA_SAIDA`, `CUSTO_ESPECIAL_PRODUTO.DATA_INICIO`/`DATA_FIM`, `RELATORIO_SEMANAL_COORDENADORES_LOG.DATA_INICIO`/`DATA_FIM`, legadas (`SIMULACOES.DATA_SIMULACAO`, `CUSTOPRODUTO.DATA`, `COST_POLICIES.DT_START`/`DT_END`). Também `IMP_VENDAS_DASHBOARD_TOTVS_RCA.DTSAIDA`, que o loader grava com `TO_CHAR(dtsaida,'YYYY-MM-DD')`; o tipo da coluna fica a verificar no Mitra. |
| `'HH:MM'` | `VARCHAR(5)` | `HORA_INICIO`/`HORA_FIM` (`VISITAS`, `AGENDA_INTERNA`, `PROSPECT_VISITAS`), `RELATOS_CLIENTE.HORA_CONTATO` |
| `'YYYY-MM-DDTHH:MM:SS'` **ou** `'YYYY-MM-DD HH:MM:SS'` | `VARCHAR(19)` | `CRIADO_EM`, `ATUALIZADO_EM` e afins na maioria das tabelas; `VISITAS.CHECKIN_HORA`/`CHECKOUT_HORA`; `TAREFAS.CONCLUIDO_EM`; `PRODUCT_MIX.DT_CRIACAO`/`DT_ENVIO_HISTORICO`; `PROSPECTS.CONVERTIDO_EM`; `RELEASE_NOTES.DATA_PUBLICACAO`; `CUSTO_PADRAO_PRODUTO.DATA_REF`; `INTG_*.SYNCED_AT`/`SOURCE_UPDATED_AT`; tabelas `GOOGLE_*`, `ACOMP_*`, `MIX_*` |

**Os dois formatos de timestamp convivem, inclusive na mesma coluna:**
- com `T`: `DATE_FORMAT(NOW(),'%Y-%m-%dT%H:%i:%s')` (35 ocorrências), `DATE_FORMAT(UTC_TIMESTAMP(),…T…)` e `new Date().toISOString().slice(0,19)` nas SFs JavaScript (77 ocorrências, em UTC);
- com espaço: `SUBSTRING(CURRENT_TIMESTAMP,1,19)` (63 arquivos; ex.: `ATUALIZADO_EM` em `USUARIO_PREFERENCIAS`, `FIM_EM` em `ACOMP_SEMANAL_SYNC_LOG`, `RESOLVIDO_EM` em `ACOMP_SEMANAL_SYNC_ERRO_ATUAL`) e `DATE_FORMAT(CONVERT_TZ(NOW(),'+00:00','-03:00'),'%Y-%m-%d %H:%i:%s')` (`RELATOS_CLIENTE.CRIADO_EM`).

Regras para o sistema novo:
- comparação de timestamp `VARCHAR` **sempre** normaliza antes: `REPLACE(col,'T',' ')`. Hoje isso já é feito em `GOOGLE_OAUTH_PENDENTE.CRIADO_EM`, `GOOGLE_AGENDA_TICKET.CRIADO_EM`, `GOOGLE_AGENDA_FILA.PROCESSADO_EM` e `MIX_CUSTOS_SYNC.VALOR` (`LAST_SUCCESS_AT`). Sem a normalização, o espaço ordena antes do `T` e janelas de expiração erram;
- comparação só por dia usa `LEFT(col,10)`;
- o fuso também é misto: há valores em hora do servidor (`NOW()`/`CURRENT_TIMESTAMP`, fuso a verificar no Mitra), em UTC (`UTC_TIMESTAMP()`, `toISOString`) e em Brasília (`CONVERT_TZ … '-03:00'`). A exibição segue a RNT-011 (Brasília). Gravação nova usa **um** formato, definido no plano da spec 001, sem reescrever o histórico.

**Tabelas com `DATE`/`DATETIME`/`TIMESTAMP` nativos:** `FERIAS_VENDEDOR` (`DT_INICIO`/`DT_FIM DATE`, `CREATED_AT DATETIME`), `ALERTAS_INTELIGENTES` (`DATA_GERACAO`, `DATA_LEITURA`), `ALERTAS_EMAIL_SEMANAL.ENVIADO_EM`, `ALERTAS_PROCESSAMENTO` (`CRIADO_EM`, `INICIADO_EM`, `FINALIZADO_EM`), `DICAS_PRO_LOG.DATA_GERACAO DATE`, `CONFIG_ALERTAS_VENDEDOR.ATUALIZADO_EM TIMESTAMP`, `METAS_VENDEDOR` (`TIMESTAMP`), `METAS_BU`, `METAS_BU_VENDEDOR` e `METAS_BU_VENDEDOR_RAMO_UF` (`CREATED_AT`/`UPDATED_AT DATETIME`), `COORDENADORES.CREATED_AT`, `RELATORIO_SEMANAL_COORDENADORES_LOG.ENVIADO_EM`. Nas `IMP_*`, `DATA_DEVOLUCAO`/`DATA_VENDA` são lidas com `CAST(… AS CHAR)` e `STR_TO_DATE(LEFT(…,10),'%Y-%m-%d')`; o tipo real fica a verificar no Mitra.

### C3 — Meta do vendedor = soma de `METAS_BU_VENDEDOR`

**Decisão (revisão de 2026-10-30):** o sistema novo lê a meta mensal do vendedor como `SUM(META_VALOR)` de `METAS_BU_VENDEDOR` por (vendedor, ano, mês). Sem linha no mês, a meta é zero e a tela mostra "Meta não distribuída" (RNT-009). O sistema novo **não lê** a view `VW_META_VENDEDOR_MES`, nem `METAS_VENDEDOR`, nem `METAS`. A view continua no banco, sem alteração, porque o sistema antigo a usa enquanto os dois convivem. Definição vigente, de `backend/fix-metas-fonte-unica.mjs` (não há migration da view no repositório):

```sql
CREATE OR REPLACE VIEW VW_META_VENDEDOR_MES AS
SELECT MBV.VENDEDOR_ID AS USER_ID, MBV.ANO AS ANO, MBV.MES AS MES,
       ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS VALOR_META
FROM METAS_BU_VENDEDOR MBV
GROUP BY MBV.VENDEDOR_ID, MBV.ANO, MBV.MES
UNION ALL
SELECT MV.USER_ID, MV.ANO, MV.MES, COALESCE(MV.VALOR_META, 0) AS VALOR_META
FROM METAS_VENDEDOR MV
WHERE NOT EXISTS (SELECT 1 FROM METAS_BU_VENDEDOR B
                  WHERE B.VENDEDOR_ID = MV.USER_ID AND B.ANO = MV.ANO AND B.MES = MV.MES)
```

Colunas: `USER_ID` (= `INT_USER.ID`), `ANO`, `MES`, `VALOR_META`. **Conflito com a RNT-009:** a view devolve `METAS_VENDEDOR` quando não há distribuição no mês, mas a RNT-009 diz que nesse caso a meta é zero e a tela mostra "Meta não distribuída". A view não informa a origem da linha. Ver [Lacunas](#lacunas), L-03.

### C4 — Collation `utf8mb3_bin` e busca (RNT-014)

`CLIENTES` usa collation `utf8mb3_bin` (comentário em `backend/fix-busca-case-insensitive-carteira.mjs`; nenhum DDL do repositório declara `COLLATE`). As demais tabelas ficam a verificar no Mitra. Com collation binária:
- `LIKE`/`=` diferenciam maiúsculas, minúsculas **e acentos**; os nomes de cliente estão gravados em maiúsculas;
- a correção atual (`UPPER(col) LIKE UPPER('%…%')`, SFs 27, 38, 84 e 362) resolve maiúsculas e minúsculas, mas **não resolve acentos**: "acai" não encontra "AÇAÍ";
- a RNT-014 exige busca sem diferença de caixa nem de acento, por nome, nome fantasia, CNPJ (só dígitos ou formatado) e código do ERP. Como C1 proíbe trocar a collation da coluna, a normalização fica na consulta (`COLLATE` de comparação accent-insensitive no predicado, ou normalização de acentos e de pontuação do CNPJ nos dois lados). A técnica fica para o plano da spec 002.

### C5 — FKs para `CLIENTES(ID)` com `ON UPDATE CASCADE`

`backend/add-migracao-clientes-id-winthor.mjs` recriou estas FKs com `ON UPDATE CASCADE` e depois executou `UPDATE CLIENTES SET ID = WINTHOR_CODCLI`. **Invariante: `CLIENTES.ID` = código do cliente no ERP (`WINTHOR_CODCLI`).**

| Tabela | Coluna | Constraint |
|---|---|---|
| `VISITAS` | `CLIENTE_ID` | `VISITAS_ibfk_1` |
| `EQUIPE_CLIENTE` | `ID_CLIENTE` | `EQUIPE_CLIENTE_ibfk_1` |
| `PRODUCT_MIX` | `ID_CLIENTE` | `PRODUCT_MIX_ibfk_1` |
| `PERFIL_COMPRA_CLIENTE` | `CLIENTE_ID` | `PERFIL_COMPRA_CLIENTE_ibfk_1` |
| `PEDIDOS_SEMANAIS_SYNC` | `CLIENTE_ID` | `PEDIDOS_SEMANAIS_SYNC_ibfk_1` |
| `PEDIDOS_SEMANAIS_SYNC_RAW` | `CLIENTE_ID` | `PEDIDOS_SEMANAIS_SYNC_RAW_ibfk_1` |
| `CLIENTE_BU_VENDEDOR` (legada) | `CLIENTE_ID` | `CLIENTE_BU_VENDEDOR_ibfk_1` |
| `SIMULACOES` (legada) | `CLIENTE_ID` | `SIMULACOES_ibfk_1` |
| `PEDIDOS_SEMANAIS` (legada) | `CLIENTE_ID` | `PEDIDOS_SEMANAIS_ibfk_1` |

Ficaram **sem FK** para `CLIENTES`: `TAREFAS.CLIENTE_ID`, `RELATOS_CLIENTE.CLIENTE_ID`, `CLIENTE_TITULAR_DEPTO.ID_CLIENTE`, `ALERTAS_INTELIGENTES.ID_CLIENTE` e `CUSTO_ESPECIAL_*.CLIENTE_ID`. O sistema novo garante a integridade dessas colunas na SF.

### C6 — Identificadores compartilhados

- **Usuário:** toda coluna `USER_ID`, `VENDEDOR_ID`, `ID_VENDEDOR`, `CRIADOR_ID`, `RESPONSAVEL_ID`, `EXECUTIVO_ID`, `ID_USUARIO*`, `ALTERADO_POR`, `CRIADO_POR INT` e `ATUALIZADO_POR` aponta para `INT_USER.ID`. Só `VENDEDOR_RCA.USER_ID` tem FK declarada. O valor gravado vem sempre de `:VAR_USER` (RNT-012). Exceção: `CRIADO_POR VARCHAR` nas tabelas `METAS_BU*` guarda texto.
- **Filial, departamento e seção têm tipos diferentes conforme a tabela.** `CODFILIAL` é `VARCHAR(10)` em `FILIAL`, `BU_VENDEDOR`, `EQUIPE_CLIENTE`, `CLIENTE_TITULAR_DEPTO` e `PEDIDOS_SEMANAIS_SYNC*`, e `INT` em `COORDENADORES_BU`, `METAS_BU*`, `ALERTAS_INTELIGENTES` e `DICAS_PRO_LOG`. O departamento aparece como `BU.CODIGO`/`BU_VENDEDOR.BU_CODIGO VARCHAR(100)`, `CODEPTO VARCHAR(50)`/`VARCHAR(20)`/`INT` e `RCA_DEPARTAMENTO.COD_DEPARTAMENTO VARCHAR(150)`. A seção aparece como `ID_SECAO INT` (= `SECAO.ID`), `CODSECAO INT`/`CODSEC` e `ALERTAS_INTELIGENTES.ID_SECAO VARCHAR(20)`. **Toda junção por esses códigos compara texto normalizado (`TRIM(CAST(x AS CHAR))`, sem zero à esquerda)**, como exige a RNT-007 ("2 = 02").
- **RCA:** `VENDEDOR_RCA` (`USER_ID` PK, `COD_RCA` UNIQUE) sustenta a regra do glossário: no máximo um RCA por usuário e um usuário por RCA.

---

## Núcleo CRM

### `CLIENTES` — somente leitura
Cadastro de clientes vindo do ERP. É carregado por `import-clientes-winthor.mjs` e mantido pela SF `sincronizarClientesUfRamoTotvs`. Nenhuma tela cadastra cliente.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK (= `WINTHOR_CODCLI`, C5) |
| RAZAO_SOCIAL | VARCHAR(300) | NOT NULL | |
| NOME_FANTASIA | VARCHAR(300) | NULL | |
| CNPJ | VARCHAR(20) | NULL | |
| ENDERECO | VARCHAR(500) | NULL | |
| CIDADE | VARCHAR(200) | NULL | |
| UF | VARCHAR(2) | NULL | |
| SEGMENTO | VARCHAR(100) | NULL | |
| STATUS | VARCHAR(20) | 'ATIVO' | |
| TELEFONE | VARCHAR(20) | NULL | |
| EMAIL | VARCHAR(200) | NULL | |
| VENDEDOR_ID | INT | NULL | (→ INT_USER, sem FK; a posse real é `EQUIPE_CLIENTE`) |
| CRIADO_EM | VARCHAR(19) | NULL | |
| WINTHOR_CODCLI | INT | NULL | UNIQUE `UX_CLIENTES_WINTHOR_CODCLI` |

Collation `utf8mb3_bin` (C4). O ramo do cliente **não** está aqui: vem de `IMP_CLIENTES_TOTVS.RAMO`.

### `VISITAS` — ativa
Visitas a clientes da agenda: agendamento, check-in/out, relato e planejamento.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE_ID | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE |
| VENDEDOR_ID | INT | NOT NULL | (→ INT_USER) |
| DATA_AGENDADA | VARCHAR(10) | NOT NULL | |
| HORA_INICIO / HORA_FIM | VARCHAR(5) | NULL | |
| TIPO | VARCHAR(50) | NULL | |
| STATUS | VARCHAR(20) | 'AGENDADA' | |
| CHECKIN_HORA / CHECKOUT_HORA | VARCHAR(19) | NULL | |
| RELATO | TEXT | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |
| PLANEJAMENTO | TEXT | NULL | (acrescentada) |

### `TAREFAS` — ativa
Atividades e follow-ups do vendedor (spec 004).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| VENDEDOR_ID | INT | NOT NULL | (→ INT_USER) |
| TITULO | VARCHAR(300) | NOT NULL | |
| DESCRICAO | TEXT | NULL | |
| STATUS | VARCHAR(20) | 'PENDENTE' | |
| PRIORIDADE | VARCHAR(10) | 'MEDIA' | |
| DATA_LIMITE | VARCHAR(10) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |
| CLIENTE_ID | INT | NULL | (→ CLIENTES, sem FK) |
| CONCLUIDO_EM | VARCHAR(19) | NULL | |

### `ATIVIDADES_LOG` — ativa
Trilha de alterações de tarefa, gravada pelas SFs de tarefa.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_ATIVIDADE | INT | NOT NULL | FK→TAREFAS(ID) |
| CAMPO_ALTERADO | VARCHAR(80) | NOT NULL | |
| VALOR_ANTERIOR / VALOR_NOVO | VARCHAR(255) | NULL | |
| DATA_ALTERACAO | VARCHAR(19) | NOT NULL | |
| ID_USUARIO | INT | NOT NULL | (→ INT_USER) |

### `RELATOS_CLIENTE` — ativa
Relato avulso de contato com o cliente, fora de uma visita. Gravado pela SF `registrarRelatoCliente` e lido no histórico. DDL em migration.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE_ID | INT | NOT NULL | INDEX `IX_RELATOS_CLIENTE_CLIENTE`(CLIENTE_ID, DATA_CONTATO) |
| VENDEDOR_ID | INT | NOT NULL | |
| DATA_CONTATO | VARCHAR(10) | NOT NULL | |
| HORA_CONTATO | VARCHAR(5) | NULL | |
| TIPO_CONTATO | VARCHAR(40) | NOT NULL | |
| RELATO | TEXT | NOT NULL | |
| CRIADO_EM | VARCHAR(19) | NOT NULL | (gravado como 'YYYY-MM-DD HH:MM:SS' em Brasília) |

### `SEGMENTOS` — somente leitura
Lista de segmentos para o dropdown de clientes. Só tem SF de listagem; nenhuma tela grava.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| NOME | VARCHAR(120) | NOT NULL | UNIQUE `UK_SEGMENTOS_NOME` |
| ATIVO | BOOLEAN | TRUE | |
| ORDEM | INT | 0 | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `COMISSOES` — ativa
Cadastro manual de comissão, aba "Comissões" de `/gestao-cadastros`, SFs 79–83. O cálculo automático está fora de escopo (spec 010).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| VENDEDOR_ID | INT | NOT NULL | |
| MES / ANO | INT | NOT NULL | |
| VALOR_VENDAS | DECIMAL(12,2) | NULL | |
| PERC_COMISSAO | DECIMAL(5,2) | NULL | |
| VALOR_COMISSAO | DECIMAL(12,2) | NULL | |

### `CARGOS` — legada — não usar
Da fase 1 (`setup-backend.mjs`). Nenhuma SF nem tela a lê; o papel do usuário vem de `USUARIO_CARGO`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| NOME | VARCHAR(100) | NOT NULL | |
| DESCRICAO | VARCHAR(300) | NULL | |

### `PERFIL_TELAS` — legada — não usar
Da fase 1. Nenhuma SF nem tela a lê; o menu é decidido por SFs de permissão.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CARGO_ID | INT | NOT NULL | FK→CARGOS(ID) |
| TELA | VARCHAR(100) | NOT NULL | |
| CATEGORIA | VARCHAR(100) | NULL | |
| ORDEM | INT | 0 | |

---

## Organização comercial e escopo

Sustenta RNT-003, RNT-004 e RNT-007. O **escopo do vendedor** é a linha ativa de `BU_VENDEDOR` (departamento + filial + seção; `ID_SECAO` nulo = todas as seções). A **equipe do coordenador** são os vendedores com escopo ativo em alguma linha de `COORDENADORES_BU` dele e com linha em `VENDEDOR_RCA`.

### `BU` — ativa
Unidades de negócio (departamentos do ERP), mantidas pela Gestão de BUs. Mesmo DDL repetido em 3 scripts.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CODIGO | VARCHAR(100) | NOT NULL | UNIQUE `UX_BU_CODIGO` (código do departamento) |
| NOME | VARCHAR(150) | NOT NULL | |
| ATIVO | BOOLEAN | TRUE | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `BU_VENDEDOR` — ativa
Escopo do vendedor: departamento + filial + seção.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| BU_CODIGO | VARCHAR(100) | NOT NULL | (= BU.CODIGO = CODEPTO, sem FK) |
| VENDEDOR_ID | INT | NOT NULL | INDEX `IX_BU_VENDEDOR_VENDEDOR` |
| ATIVO | BOOLEAN | TRUE | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |
| CODFILIAL | VARCHAR(10) | NULL | FK→FILIAL(CODFILIAL) `FK_BU_VENDEDOR_FILIAL` |
| ID_SECAO | INT | NULL (= todas) | FK→SECAO(ID) `FK_BU_VENDEDOR_SECAO` |

UNIQUE `UX_BU_VENDEDOR_ESCOPO` (VENDEDOR_ID, BU_CODIGO, CODFILIAL, ID_SECAO) substituiu a antiga `UX_BU_VENDEDOR` (BU_CODIGO, VENDEDOR_ID). Cuidado: como `ID_SECAO`/`CODFILIAL` aceitam NULL, o índice UNIQUE não impede escopos duplicados com seção nula.

### `FILIAL` — somente leitura
Filiais do ERP. A carga é por script; a diretoria corrige a UF direto na coluna, sem tela.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CODFILIAL | VARCHAR(10) | NOT NULL | PK |
| NOME_FILIAL | VARCHAR(100) | NOT NULL | |
| ATIVO | BOOLEAN | TRUE | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |
| UF | VARCHAR(20) | NULL | (migration `runddl-1790270526`; semeada por `rundml-1790270546`: 1 DF, 2 GO, 3 DF, 4 GO, 5 GO, 6 TO, 7 DF, 8 RS) |

Sustenta a RNT-009: a meta da diretoria é por BU + UF, e cada filial recebe a meta da sua UF.

### `SECAO` — somente leitura
Seções do ERP (subdivisão do departamento), carregadas por script.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT | NOT NULL | PK (código da seção do ERP, sem auto-incremento) |
| NOME_SECAO | VARCHAR(100) | NOT NULL | |
| ID_BU | INT | NULL | FK→BU(ID) `FK_SECAO_BU`; INDEX `IX_SECAO_BU` |
| ATIVO | BOOLEAN | TRUE | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

UNIQUE `UX_SECAO_NOME_BU` (NOME_SECAO, ID_BU).

### `EQUIPE_CLIENTE` — ativa
Carteira: cliente ↔ vendedor por filial e seção, com curva. Sustenta RNT-007(a) e C-001.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_CLIENTE | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE; INDEX `IX_EQUIPE_CLIENTE_CLIENTE` |
| ID_VENDEDOR | INT | NOT NULL | INDEX `IX_EQUIPE_CLIENTE_VENDEDOR` |
| CRIADO_EM | VARCHAR(19) | NULL | |
| CURVA_CLASSIFICACAO | VARCHAR(1) | NULL | (A/B/C/D) |
| CODFILIAL | VARCHAR(10) | NULL | FK→FILIAL(CODFILIAL) |
| ID_SECAO | INT | NULL | FK→SECAO(ID) |

UNIQUE final: `UX_EQUIPE_CLIENTE_ESCOPO` (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO). Ordem de evolução nos scripts: `UX_EQUIPE_CLIENTE_BU` (com `ID_BU`) → `UX_EQUIPE_CLIENTE_CLIENTE` → `UX_EQUIPE_CLIENTE_CLIENTE_VENDEDOR` → `_ESCOPO`. A coluna `ID_BU` foi removida por `migrar-equipe-cliente-sem-id-bu.mjs`. Qual índice existe hoje fica a verificar no Mitra.

### `VENDEDOR_RCA` — ativa
Vínculo usuário ↔ RCA do ERP. Foi **redefinida 3 vezes**: `add-tabela-local-vendedor-rca.mjs` (ID, RCA_NOME, SUPERVISOR_NOME, ATIVO…), `add-associacao-vendedor-rca.mjs` e, por último, `ajustar-vendedor-rca-fks.mjs`, que fez backup em `VENDEDOR_RCA_BKP_20260408`, `DROP` e recriou a tabela. **A versão abaixo é a final.**

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| USER_ID | INT | NOT NULL | PK; FK→INT_USER(ID) `FK_VENDEDOR_RCA_USER` |
| COD_RCA | INT | NOT NULL | UNIQUE `UX_VENDEDOR_RCA_COD_RCA`; FK→RCA_TOTVS(COD_RCA) |
| COD_SUPERVISOR | INT | NULL | INDEX `IX_VENDEDOR_RCA_SUP`; FK→RCA_TOTVS(COD_RCA) |

Não tem `ATIVO`: desfazer o vínculo apaga a linha, e o histórico vai para `VENDEDOR_RCA_AUDITORIA`.

### `VENDEDOR_RCA_AUDITORIA` — ativa
Trilha das mudanças de vínculo RCA, gravada pela governança de vínculos.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| USER_ID | INT | NOT NULL | |
| COD_RCA_ANTERIOR / COD_RCA_NOVO | INT | NULL | |
| COD_SUPERVISOR_ANTERIOR / COD_SUPERVISOR_NOVO | INT | NULL | |
| ALTERADO_POR | INT | NOT NULL | |
| ALTERADO_EM | VARCHAR(19) | NULL | |
| OBSERVACAO | VARCHAR(300) | NULL | |

### `RCA_TOTVS` — somente leitura
Espelho dos RCAs do ERP, carregado por `extrair-rcas-totvs.mjs` a partir do staging `IMP_RCAS_TOTVS_UNICOS`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_RCA | INT | NOT NULL | UNIQUE `UX_RCA_TOTVS_COD` |
| RCA_NOME | VARCHAR(200) | NULL | |
| SUPERVISOR_NOME | VARCHAR(200) | NULL | |
| COD_SUPERVISOR | INT | NULL | (acrescentada) |
| ATIVO | BOOLEAN | TRUE | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `RCA_DEPARTAMENTO` — somente leitura
RCA ↔ departamento/filial vindo do ERP. Várias SFs de escopo o leem (ex.: `update-sf104-alinhar-escopo-mensal.mjs`). A carga é por script, e a rotina que o atualiza fica a verificar.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_RCA | INT | NOT NULL | INDEX |
| COD_DEPARTAMENTO | VARCHAR(150) | NOT NULL | INDEX |
| DEPARTAMENTO_NOME | VARCHAR(200) | NULL | |
| COD_FILIAL | VARCHAR(30) | NOT NULL, '0' | INDEX |
| FILIAL_NOME | VARCHAR(200) | NULL | |
| ATIVO | BOOLEAN | TRUE | INDEX |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

UNIQUE `UX_RCA_DEP_FILIAL` (COD_RCA, COD_DEPARTAMENTO, COD_FILIAL), que substituiu `UX_RCA_DEPARTAMENTO`.

### `COORDENADORES` — ativa
Cadastro de coordenadores, mantido pela diretoria. Sustenta a RNT-004.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_SUPERVISOR | INT | NOT NULL | UNIQUE `UX_COORDENADORES_COD_SUPERVISOR` |
| NOME | VARCHAR(100) | NOT NULL | |
| EMAIL | VARCHAR(150) | NULL | |
| USER_ID | INT | NULL | INDEX `IX_COORDENADORES_USER_ID` |
| ATIVO | BOOLEAN | TRUE | |
| CREATED_AT | DATETIME | CURRENT_TIMESTAMP | |

### `COORDENADORES_BU` — ativa
As BUs (filial + departamento) de cada coordenador.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_SUPERVISOR | INT | NOT NULL | FK→COORDENADORES(COD_SUPERVISOR) |
| CODFILIAL | INT | NOT NULL | |
| CODEPTO | INT | NOT NULL | |

UNIQUE `UX_COORDENADORES_BU_ESCOPO` (COD_SUPERVISOR, CODFILIAL, CODEPTO); INDEX `IX_COORDENADORES_BU_BU` (CODFILIAL, CODEPTO).

### `USUARIO_CARGO` — ativa
Papel do usuário (RNT-001). Valores encontrados no código: `VENDEDOR`, `COORDENADOR`, `DIRETORIA`, `GESTOR`, `ADMIN`. Tem **dois DDLs** sem `IF NOT EXISTS`: `add-painel-gestao.mjs` (com `ID` AUTO_INCREMENT PK) e `add-gestao-cargos-usuarios.mjs` (`USER_ID` PK). Vale o que rodou primeiro; fica a verificar no Mitra.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK — só se a versão de `add-painel-gestao.mjs` prevaleceu |
| USER_ID | INT | NOT NULL | UNIQUE `UX_USUARIO_CARGO_USER` (ou PK) |
| CARGO | VARCHAR(30) | NOT NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

**Invariante que conflita com a RNT-001:** `USER_ID` é único, então cabe **um** papel por usuário. Acumular papéis foi aprovado em 2026-10-30 como acréscimo: uma tabela nova de papéis por usuário. `USUARIO_CARGO` fica como está (L-04).

### `FUNCIONARIOS` — ativa
Espelho do usuário com estado de férias e substituto. É a **segunda fonte de férias** de hoje: `STATUS` = férias e `ID_SUBSTITUTO`, lida em cerca de 130 trechos de SF (`F.ID_SUBSTITUTO`). O nome é sincronizado com `INT_USER.NOME`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT | NOT NULL | PK (= INT_USER.ID) |
| NOME | VARCHAR(200) | NULL | |
| STATUS | VARCHAR(20) | 'ATIVO' | |
| ID_SUBSTITUTO | INT | NULL | (→ INT_USER) |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

**Decisão (revisão de 2026-10-30):** a fonte única de férias da RNT-010 é `FERIAS_VENDEDOR`. O sistema novo **não lê nem grava** `FUNCIONARIOS.STATUS`/`ID_SUBSTITUTO` para decidir férias ou substituição. As marcações que existem hoje ali são tratadas pela pendência 2 da spec 001 (L-05).

### `FERIAS_VENDEDOR` — ativa
Férias cadastradas pelo coordenador, chaveadas por **RCA**. Sustenta a RNT-010 e o C-005.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_RCA | INT | NOT NULL | INDEX `IX_FERIAS_VENDEDOR_RCA_PERIODO`(COD_RCA, DT_INICIO, DT_FIM, ATIVO) |
| RCA | VARCHAR(100) | NULL | |
| DT_INICIO / DT_FIM | DATE | NOT NULL | |
| COD_RCA_SUBSTITUTO | INT | NOT NULL | INDEX `IX_FERIAS_VENDEDOR_SUBSTITUTO`(COD_RCA_SUBSTITUTO, ATIVO) |
| RCA_SUBSTITUTO | VARCHAR(100) | NULL | |
| ATIVO | BOOLEAN | TRUE | |
| CREATED_AT | DATETIME | CURRENT_TIMESTAMP | |

Nenhuma constraint impede sobreposição de períodos, substituto igual ao titular ou início depois do fim. A RNT-010 é validada na SF.

### `USUARIO_PREFERENCIAS` — ativa (sem DDL no repo)
Preferências do usuário em Configurações. Estrutura a verificar no Mitra. Colunas usadas pelas SFs (`update-configuracoes-personalizadas-sf.mjs`):

| Coluna | Uso observado |
|---|---|
| ID | as SFs leem a linha de `MAX(ID)` por USER_ID, então pode haver mais de uma linha por usuário |
| USER_ID | → INT_USER |
| MODO_AGENDA, EXIBICAO_TAREFAS, PAGINA_INICIAL | texto vindo da tela |
| ATUALIZADO_EM | `SUBSTRING(CURRENT_TIMESTAMP,1,19)` ('YYYY-MM-DD HH:MM:SS') |

---

## Metas

Sustentam a RNT-009. Fluxo: `INTG_MONTHLY_BILLING_TARGET` (planejamento, BU + UF) → coordenador redistribui em `METAS_BU_VENDEDOR` → leitura pela soma de `METAS_BU_VENDEDOR` (C3). Desde 2026-11-03 a meta da BU vem só do planejamento: `METAS_BU` não é lida nem gravada.

### `METAS_BU` — legada — não usar
Lançamento manual da diretoria por filial + departamento e mês, gravado pela tela Gestão de Metas do sistema antigo. A tela foi cancelada em 2026-11-03 e a meta passa a vir só do planejamento (RNT-009); as linhas ficam no banco.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CODFILIAL | INT | NOT NULL | |
| CODEPTO | INT | NOT NULL | |
| MES / ANO | INT | NOT NULL | INDEX `IX_METAS_BU_PERIODO`(ANO, MES) |
| META_VALOR | DECIMAL(15,2) | NOT NULL, 0 | |
| CRIADO_POR | VARCHAR(100) | NULL | |
| CREATED_AT / UPDATED_AT | DATETIME | CURRENT_TIMESTAMP | |

UNIQUE `UX_METAS_BU_PERIODO` (CODFILIAL, CODEPTO, ANO, MES).

### `METAS_BU_VENDEDOR` — ativa
Meta distribuída pelo coordenador. É a **fonte da verdade** da meta do vendedor.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CODFILIAL | INT | NOT NULL | |
| CODEPTO | INT | NOT NULL | |
| VENDEDOR_ID | INT | NOT NULL | INDEX `IX_METAS_BU_VENDEDOR_VENDEDOR`(VENDEDOR_ID, ANO, MES) |
| MES / ANO | INT | NOT NULL | INDEX `IX_METAS_BU_VENDEDOR_BU`(CODFILIAL, CODEPTO, ANO, MES) |
| META_VALOR | DECIMAL(15,2) | NOT NULL, 0 | |
| CRIADO_POR | VARCHAR(150) | NULL | |
| CREATED_AT / UPDATED_AT | DATETIME | CURRENT_TIMESTAMP | |

UNIQUE `UX_METAS_BU_VENDEDOR_PERIODO` (CODFILIAL, CODEPTO, VENDEDOR_ID, ANO, MES).

### `METAS_BU_VENDEDOR_RAMO_UF` — ativa
Rateio personalizado da meta do vendedor por ramo e UF. `CODFILIAL` é gravado como `0`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| AUTO_ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CODFILIAL | INT | NOT NULL (gravado 0) | |
| CODEPTO | INT | NOT NULL | |
| VENDEDOR_ID | INT | NOT NULL | INDEX (VENDEDOR_ID, ANO, MES) |
| MES / ANO | INT | NOT NULL | INDEX (CODFILIAL, CODEPTO, ANO, MES) |
| RAMO_CODE | VARCHAR(120) | NOT NULL | |
| RAMO_NOME | VARCHAR(200) | NULL | |
| UF | VARCHAR(30) | NOT NULL | |
| PERCENTUAL_META | DECIMAL(10,4) | NOT NULL, 0 | |
| META_VALOR | DECIMAL(15,2) | NOT NULL, 0 | |
| CRIADO_POR | VARCHAR(150) | NULL | |
| CREATED_AT / UPDATED_AT | DATETIME | CURRENT_TIMESTAMP | |

UNIQUE final `UX_METAS_BU_VENDEDOR_RAMO_UF` (CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF). O índice foi recriado sem `CODFILIAL` por `fix-metas-ramo-uf-e-lote.mjs`.

### `VW_META_VENDEDOR_MES` (view) — legada — não usar
Mantida para o sistema antigo durante a convivência. O sistema novo lê `METAS_BU_VENDEDOR` direto (C3), porque a view cai em `METAS_VENDEDOR` quando não há distribuição.

### `METAS_VENDEDOR` — legada — não usar
Meta por usuário de antes da redistribuição. Nenhuma SF grava aqui. Ainda aparece no `UNION` da view e em leituras diretas das SFs `metaRealizadoProjecao` e `analyticsRcaMetaResumo` (versões 1792678676). O sistema novo só a vê por meio da view (C3).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| USER_ID | INT | NOT NULL | |
| ANO / MES | INT | NOT NULL | |
| VALOR_META | DECIMAL(15,2) | NOT NULL | |
| CRIADO_EM | TIMESTAMP | CURRENT_TIMESTAMP | |
| ATUALIZADO_EM | TIMESTAMP | CURRENT_TIMESTAMP ON UPDATE | |

UNIQUE `UX_META_VENDEDOR_PERIODO` (USER_ID, ANO, MES).

### `METAS` — legada — não usar
Cadastro manual de meta da fase 1, aba "Metas" de `/gestao-cadastros` (SFs 74–78). Ainda é lido como `META_MES` pelas SFs `dashboardKpis` e `painelGestaoResumo`, o que contraria a RNT-009 (L-03). O sistema novo não a usa como meta. O destino da aba fica para a spec 010.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| VENDEDOR_ID | INT | NOT NULL | |
| MES / ANO | INT | NOT NULL | |
| VALOR_META | DECIMAL(12,2) | NULL | |
| VALOR_REALIZADO | DECIMAL(12,2) | 0 | |

---

## Vendas e acompanhamento semanal

As linhas de venda e devolução do ERP estão em `IMP_VENDAS_DASHBOARD_TOTVS_RCA` e `IMP_DEVOLUCOES_TOTVS` (seção Integrações). As tabelas abaixo são o pipeline do acompanhamento semanal (SF 107). `SEMANA_NUMERO` é a semana operacional sexta a quinta, recortada no mês (RNT-005).

### `PEDIDOS_SEMANAIS_SYNC_RAW` — somente leitura
Camada raw da ingestão de vendas, uma linha por item.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CHAVE_NATURAL | VARCHAR(255) | NOT NULL | UNIQUE `UX_PEDIDOS_SYNC_RAW_CHAVE` |
| NUMPED | VARCHAR(30) | NULL | INDEX |
| NUMTRANSVENDA / NUMNOTA | VARCHAR(30) | NULL | |
| CODFILIAL | VARCHAR(10) | NULL | INDEX scope |
| CODPROD | INT | NULL | |
| DESCRICAO | VARCHAR(255) | NULL | |
| COD_RCA | INT | NULL | (não decide atribuição — RNT-007) |
| CODCLI | INT | NULL | |
| CODEPTO | VARCHAR(50) | NULL | |
| DEPARTAMENTO | VARCHAR(150) | NULL | |
| CODSECAO | INT | NULL | |
| SECAO_NOME | VARCHAR(150) | NULL | |
| ID_SECAO | INT | NULL | |
| QT | DECIMAL(14,6) | 0 | |
| VLUNIT | DECIMAL(14,6) | 0 | |
| TOTAL | DECIMAL(14,2) | 0 | |
| DATA_SAIDA | VARCHAR(10) | NULL | |
| ANO / MES / SEMANA_NUMERO | INT | NULL | |
| CLIENTE_ID | INT | NULL | FK→CLIENTES(ID) ON UPDATE CASCADE; INDEX |
| SEGMENTO | VARCHAR(100) | NULL | |
| STATUS_INGESTAO | VARCHAR(40) | 'ATIVO' | |
| DETALHE_ERRO | VARCHAR(500) | NULL | |
| ATIVO | BOOLEAN | TRUE | |
| ULTIMA_EXECUCAO_ID | VARCHAR(32) | NULL | INDEX |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |
| VENDEDOR_ID | ? | ? | **sem DDL no repo** — existe em produção (`migrar-comunicacao-8-para-61.mjs`) |

INDEX `IX_PEDIDOS_SYNC_RAW_SCOPE` (CODFILIAL, CODEPTO, ID_SECAO, ANO, MES, SEMANA_NUMERO).

### `PEDIDOS_SEMANAIS_SYNC` — somente leitura
Camada agregada por cliente, BU, seção e semana.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CHAVE_AGREGADA | VARCHAR(255) | NOT NULL | UNIQUE `UX_PEDIDOS_SYNC_CHAVE` |
| CLIENTE_ID | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE; INDEX |
| CODFILIAL | VARCHAR(10) | NOT NULL | |
| CODEPTO | VARCHAR(50) | NOT NULL | |
| ID_SECAO | INT | NOT NULL | |
| SEGMENTO | VARCHAR(100) | NOT NULL | |
| VALOR | DECIMAL(14,2) | 0 | |
| QT | DECIMAL(14,6) | 0 | |
| SEMANA_NUMERO / MES / ANO | INT | NOT NULL | |
| ATIVO | BOOLEAN | TRUE | |
| ULTIMA_EXECUCAO_ID | VARCHAR(32) | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |
| VENDEDOR_ID | ? | ? | **sem DDL no repo** — a SF 107 vigente grava `0 AS VENDEDOR_ID` |

INDEX `IX_PEDIDOS_SYNC_SCOPE` (CODFILIAL, CODEPTO, ID_SECAO, ANO, MES, SEMANA_NUMERO, ATIVO).

### `PERFIL_COMPRA_CLIENTE` — somente leitura
Perfil de compra por cliente, recalculado pela SF 107 e lido por temperatura, queda de volume e prospecção semanal.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE_ID | INT | NOT NULL | UNIQUE `UX_PERFIL_COMPRA_CLIENTE_CLIENTE`; FK→CLIENTES(ID) ON UPDATE CASCADE |
| FREQUENCIA | VARCHAR(20) | NOT NULL | |
| SEMANA_PADRAO | INT | NULL | |
| TICKET_MEDIO_3M | DECIMAL(14,2) | 0 | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `ACOMP_SEMANAL_SYNC_LOG` — controle de rotina
Log por execução da SF 107. Fonte da "última atualização" das vendas (RNT-015).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| EXECUCAO_ID | VARCHAR(32) | NOT NULL | UNIQUE `UX_ACOMP_SYNC_LOG_EXECUCAO` |
| STATUS | VARCHAR(20) | NOT NULL | (RUNNING / … / FAILED) |
| INICIO_EM / FIM_EM | VARCHAR(19) | NULL | |
| TOTAL_FONTE, TOTAL_PROCESSADOS, TOTAL_VALIDOS, TOTAL_ERROS, TOTAL_INATIVADOS_RAW, TOTAL_INATIVADOS_AGG, TOTAL_AGREGADOS_ATIVOS | INT | 0 | |
| MENSAGEM | VARCHAR(500) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |

### `ACOMP_SEMANAL_SYNC_ERRO_ATUAL` — controle de rotina
Erros de ingestão, uma linha por chave + tipo. DDL em migration `runddl-1791222719`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CHAVE_NATURAL | VARCHAR(255) | NOT NULL | UNIQUE `UX_ACOMP_SYNC_ERRO_ATUAL`(CHAVE_NATURAL, TIPO_ERRO) |
| TIPO_ERRO | VARCHAR(50) | NOT NULL | |
| CODCLI, COD_RCA, CODPROD, CODSECAO | INT | NULL | |
| NUMPED | VARCHAR(30) | NULL | |
| CODFILIAL | VARCHAR(10) | NULL | |
| CODEPTO | VARCHAR(50) | NULL | |
| DETALHE | VARCHAR(500) | NULL | |
| SITUACAO | VARCHAR(20) | NOT NULL, 'ABERTO' | INDEX (SITUACAO, RESOLVIDO_EM) |
| QTD_OCORRENCIAS | INT | NOT NULL, 1 | |
| PRIMEIRA_EXECUCAO_ID / ULTIMA_EXECUCAO_ID | VARCHAR(32) | NULL | INDEX (ULTIMA_EXECUCAO_ID) |
| PRIMEIRA_OCORRENCIA_EM / ULTIMA_OCORRENCIA_EM / RESOLVIDO_EM | VARCHAR(19) | NULL | |

### `ACOMP_SEMANAL_SYNC_ERRO` — legada — não usar
Sem gravações desde 2026-10-05 (substituída por `_ERRO_ATUAL`). Chegou a cerca de 95 milhões de linhas, então nunca deve ser varrida.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| EXECUCAO_ID | VARCHAR(32) | NOT NULL | INDEX |
| TIPO_ERRO | VARCHAR(50) | NOT NULL | INDEX |
| CHAVE_NATURAL | VARCHAR(255) | NULL | |
| CODCLI, COD_RCA, CODPROD, CODSECAO | INT | NULL | |
| NUMPED | VARCHAR(30) | NULL | |
| CODFILIAL | VARCHAR(10) | NULL | |
| CODEPTO | VARCHAR(50) | NULL | |
| DETALHE | VARCHAR(500) | NULL | |
| OCORRIDO_EM | VARCHAR(19) | NULL | |

### `PEDIDOS_SEMANAIS` — legada — não usar
Agregado de antes da integração com o ERP. Nenhuma SF atual a lê.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE_ID | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE |
| VENDEDOR_ID | INT | NOT NULL | |
| SEGMENTO | VARCHAR(100) | NOT NULL | |
| VALOR | DECIMAL(14,2) | NOT NULL | |
| SEMANA_NUMERO / MES / ANO | INT | NOT NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |

INDEX `IX_PEDIDOS_SEMANAIS_CLIENTE_PERIODO` (CLIENTE_ID, ANO, MES, SEMANA_NUMERO) e `IX_PEDIDOS_SEMANAIS_VENDEDOR_PERIODO` (VENDEDOR_ID, ANO, MES).

---

## Mix e custos

### `PRODUCT_MIX` — ativa
Cabeçalho da proposta do Mix Builder (spec 009).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| NOME | VARCHAR(220) | NOT NULL | |
| DESCRICAO | TEXT | NULL | |
| ID_CLIENTE | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE |
| ID_USUARIO_CRIACAO | INT | NOT NULL | |
| TOTAL_CUSTO / TOTAL_VENDA | DECIMAL(14,2) | 0 | |
| MARGEM_MEDIA | DECIMAL(7,2) | 0 | |
| DT_CRIACAO | VARCHAR(19) | NOT NULL | |
| ENVIADO_HISTORICO | BOOLEAN | FALSE | |
| DT_ENVIO_HISTORICO | VARCHAR(19) | NULL | |

### `PRODUCT_MIX_ITEMS` — ativa
Itens do mix.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_MIX | INT | NOT NULL | FK→PRODUCT_MIX(ID) |
| ID_PRODUTO | INT | NOT NULL | INDEX `IDX_PRODUCT_MIX_ITEMS_ID_PRODUTO`; **sem FK**: a FK para `PRODUTOS(ID)` foi removida e hoje o valor é `PRODUTOS_CUSTOS.CODPROD`. Itens antigos podem apontar para `PRODUTOS.ID`. |
| QUANTIDADE | INT | NOT NULL | |
| TIPO_CUSTO | VARCHAR(40) | NOT NULL | |
| CUSTO_UNITARIO | DECIMAL(12,2) | NOT NULL | |
| MARGEM_PERCENT | DECIMAL(7,2) | NOT NULL | |
| PRECO_VENDA | DECIMAL(12,2) | NOT NULL | |
| PRECO_CONCORRENTE | DECIMAL(12,2) | NULL | |
| CMV_PERCENT | DECIMAL(7,2) | NULL | |

### `PRODUTOS_CUSTOS` — somente leitura
Catálogo de produtos sincronizado do ERP pela SF `mixSincronizarProdutosCustosSemanal`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CODPROD | INT | NOT NULL | PK |
| CODFAB | VARCHAR(60) | NOT NULL | |
| CODAUXILIAR | VARCHAR(60) | NULL | |
| NOME | VARCHAR(255) | NOT NULL | |
| FORNECEDOR_ID | INT | NOT NULL | |
| DEPARTAMENTO_ID | INT | NOT NULL | |
| SECAO_ID | INT | NOT NULL | |
| ATIVO | BOOLEAN | NULL | |

### `CUSTO_PADRAO_PRODUTO` — somente leitura
Custo padrão por produto, copiado do projeto de custos. DDL em migration.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CODPROD | INT | NOT NULL | PK |
| CUSTO | DECIMAL(12,4) | NOT NULL | |
| DATA_REF | VARCHAR(19) | NOT NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NOT NULL | |

### `CUSTO_ESPECIAL_PRODUTO` — somente leitura
Custo especial por política. DDL em migration.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ITEM_ID | BIGINT | NOT NULL | PK |
| CODPROD | INT | NOT NULL | INDEX |
| CLIENTE_ID | INT | NULL | INDEX |
| CUSTO | DECIMAL(12,4) | NOT NULL | |
| POLITICA_ID | INT | NOT NULL | INDEX |
| POLITICA_NOME | VARCHAR(180) | NOT NULL | |
| STATUS | VARCHAR(20) | NOT NULL | |
| FILIAL_ID | INT | NULL | INDEX |
| DATA_INICIO / DATA_FIM | VARCHAR(10) | NOT NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NOT NULL | |

### `CUSTO_ESPECIAL_CLIENTES_BIG` — somente leitura
Clientes que podem receber o custo especial. Versão em uso, com `BIGINT`. DDL em migration.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CUSTO_ESPECIAL_ID | BIGINT | NOT NULL | PK composta (CUSTO_ESPECIAL_ID, CLIENTE_ID) |
| CLIENTE_ID | INT | NOT NULL | INDEX |

### `CUSTO_ESPECIAL_CLIENTES` — legada — não usar
Mesma função da tabela `_BIG`, mas com `CUSTO_ESPECIAL_ID INT`, que estoura. Como a plataforma bloqueia `MODIFY`, `fix-mix-sync-custos.mjs` criou a `_BIG` e migrou leituras e escritas para ela. A SF de custos vigente (251) só grava na `_BIG`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CUSTO_ESPECIAL_ID | INT | NOT NULL | PK composta |
| CLIENTE_ID | INT | NOT NULL | INDEX |

### `MIX_CUSTOS_SYNC` — controle de rotina
Chave/valor do sync de custos: `LAST_SUCCESS_AT`, `LAST_ATTEMPT_AT`, `LAST_RESULT`, `LAST_ERROR`. DDL em migration.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CHAVE | VARCHAR(80) | NOT NULL | PK |
| VALOR | VARCHAR(255) | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NOT NULL | |

### `MIX_PRODUTO_FOTO` — somente leitura
Cache da URL da foto por produto, preenchido por `mixFotosSincronizar`. DDL em migration (2×, idempotente).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CODPROD | INT | NOT NULL | PK |
| URL | VARCHAR(1000) | NOT NULL, '' | |
| NOME_ARQUIVO | VARCHAR(255) | NULL | |
| BUSCADO_EM | VARCHAR(19) | NOT NULL | |

### `MIX_FOTOS_CONFIG` — controle de rotina
Chave/valor do sistema de fotos: `FOTOS_CHAVE` (credencial, gravada pelo Painel Dev e nunca devolvida em leitura, RNFT-006), `LAST_SUCCESS_AT`, `LAST_ERROR`. DDL em migration (2×).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| CHAVE | VARCHAR(40) | NOT NULL | PK |
| VALOR | VARCHAR(1000) | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NOT NULL | |
| ATUALIZADO_POR | INT | NULL | |

### `CUSTO_ESPECIAL_PRODUTO_CLIENTE` — legada — não usar
Aparece só na lista de tabelas do perfil (`set-profile-select-tables-*`). Não há DDL nem uso em SF. Estrutura a verificar no Mitra.

### `PRODUTOS` — legada — não usar
Catálogo da fase 1. A única leitura viva é um `LEFT JOIN PRODUTOS P ON P.ID = MI.ID_PRODUTO`, usado como reserva de nome para itens de mix antigos (SF `detalhesPedidoCliente`). O `PRODUTOS` lido pela SF de sincronização é o do **projeto remoto**, não esta tabela.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CODIGO | VARCHAR(20) | NULL | |
| NOME | VARCHAR(300) | NOT NULL | |
| CATEGORIA | VARCHAR(100) | NULL | |
| PRECO_TABELA / CUSTO | DECIMAL(10,2) | NULL | |
| UNIDADE | VARCHAR(20) | 'UN' | |
| ATIVO | BOOLEAN | TRUE | |

### `SIMULACOES` / `SIMULACAO_ITENS` — legada — não usar
Simulação de mix da fase 1, substituída por `PRODUCT_MIX`/`_ITEMS`. As SFs 9–10 e 55–62 seguem mapeadas em `useMitra.ts`, mas nenhuma página as chama, e nenhuma SF versionada em migrations lê essas tabelas.

`SIMULACOES`: ID INT AI PK · CLIENTE_ID INT NOT NULL FK→CLIENTES(ID) ON UPDATE CASCADE · VENDEDOR_ID INT NOT NULL · DATA_SIMULACAO VARCHAR(10) · STATUS VARCHAR(20) 'RASCUNHO' · VALOR_TOTAL DECIMAL(12,2) 0 · MARGEM_MEDIA DECIMAL(5,2) 0 · OBSERVACOES TEXT · CRIADO_EM VARCHAR(19).

`SIMULACAO_ITENS`: ID INT AI PK · SIMULACAO_ID INT NOT NULL FK→SIMULACOES(ID) · PRODUTO_ID INT NOT NULL FK→PRODUTOS(ID) · QUANTIDADE INT 1 · PRECO_UNITARIO DECIMAL(10,2) · DESCONTO_PERC DECIMAL(5,2) 0.

### `CUSTOPRODUTO` / `COST_POLICIES` / `POLICY_ITEMS` — legada — não usar
Modelo de custos da fase 1 (`add-mix-builder-estrutura.mjs`). A SF de custos vigente cita esses **nomes**, mas consulta o **projeto remoto de custos** (`queryRemoto`), que tem colunas diferentes (ex.: `DATA_REF` lá, `DATA` aqui). As tabelas locais não são lidas.

`CUSTOPRODUTO`: ID INT AI PK · CODPROD INT NOT NULL FK→PRODUTOS(ID) · CUSTO DECIMAL(12,2) NOT NULL · DATA VARCHAR(10) NOT NULL.
`COST_POLICIES`: ID INT AI PK · NAME VARCHAR(180) NOT NULL · STATUS VARCHAR(20) 'ATIVO' · DT_START / DT_END VARCHAR(10) NOT NULL · CRIADO_EM VARCHAR(19).
`POLICY_ITEMS`: ID INT AI PK · POLICY_ID INT NOT NULL FK→COST_POLICIES(ID) · PRODUCT_ID INT NOT NULL FK→PRODUTOS(ID) · SPECIAL_COST DECIMAL(12,2) NOT NULL.

---

## Alertas

### `ALERTAS_INTELIGENTES` — ativa
Gerada pela rotina `alertasInteligentesPopular`. A tela só marca leitura (`LIDO`, `DATA_LEITURA`).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_VENDEDOR | INT | NOT NULL | INDEX `idx_vendedor`(ID_VENDEDOR, CODFILIAL) |
| CODFILIAL | INT | NOT NULL | |
| ID_SECAO | VARCHAR(20) | NULL | |
| ID_CLIENTE | INT | NOT NULL | INDEX `idx_cliente` |
| NOME_CLIENTE | VARCHAR(200) | NULL | |
| TIPO_ALERTA | VARCHAR(50) | NOT NULL | INDEX `idx_tipo` |
| TITULO | VARCHAR(200) | NOT NULL | |
| DESCRICAO | TEXT | NULL | |
| VALOR_REFERENCIA | DECIMAL(15,2) | NULL | |
| PRIORIDADE | ENUM('ALTA','MEDIA','BAIXA') | 'MEDIA' | |
| LIDO | TINYINT(1) | 0 | INDEX `idx_lido` |
| DATA_GERACAO | DATETIME | CURRENT_TIMESTAMP | |
| DATA_LEITURA | DATETIME | NULL | |
| MES_REFERENCIA | VARCHAR(7) | NULL | ('YYYY-MM') |
| PRODUTO_REFERENCIA | VARCHAR(200) | NULL | |
| CODEPTO | VARCHAR(50) | NULL | (acrescentada) |
| RAMO_CLIENTE | VARCHAR(100) | NULL | INDEX `IDX_ALERTAS_RAMO_CLIENTE` |

### `ALERTAS_PROCESSAMENTO` — controle de rotina
Fila de geração de alertas.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| RUN_ID | VARCHAR(80) | NULL | INDEX (RUN_ID, STATUS) |
| VENDEDOR_ID | INT | NULL | INDEX |
| CLIENTE_ID | INT | NULL | INDEX |
| STATUS | VARCHAR(20) | NULL | INDEX (STATUS, ID) |
| CRIADO_EM / INICIADO_EM / FINALIZADO_EM | DATETIME | NULL | |
| DURACAO_MS | INT | NULL | |
| TOTAL_ALERTAS_ATIVOS | INT | NULL | |
| ERRO | VARCHAR(1000) | NULL | |

### `ALERTAS_EMAIL_SEMANAL` — controle de rotina
Log do e-mail semanal de alertas por vendedor.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_VENDEDOR | INT | NOT NULL | UNIQUE `UX_ALERTAS_EMAIL_SEMANAL`(ID_VENDEDOR, SEMANA_REFERENCIA) |
| EMAIL_DESTINO | VARCHAR(200) | NOT NULL | |
| SEMANA_REFERENCIA | VARCHAR(30) | NOT NULL | INDEX |
| TOTAL_ALERTAS | INT | 0 | |
| ENVIADO_EM | DATETIME | NULL | |
| STATUS | VARCHAR(30) | NOT NULL | INDEX |
| ERRO | TEXT | NULL | |

### `CONFIG_ALERTAS_VENDEDOR` — ativa
Preferência de alerta de queda de volume por usuário, lida pela SF `alertasQuedaVolume`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| USER_ID | INT | NOT NULL | PK |
| PERCENTUAL_ALERTA | INT | 30 | |
| PERIODO_COMPARACAO | ENUM('semana','mes') | 'mes' | |
| ATIVO | BOOLEAN | TRUE | |
| ATUALIZADO_EM | TIMESTAMP | CURRENT_TIMESTAMP ON UPDATE | |

### `DICAS_PRO_LOG` — ativa
Dica Pro gerada por vendedor (SFs `dicaProObter` e `dicaProMarcarVisualizada`; card `DicaProCard`).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_VENDEDOR | INT | NOT NULL | INDEX (ID_VENDEDOR, CODFILIAL, DATA_GERACAO) |
| CODFILIAL | INT | NOT NULL | |
| ID_SECAO | VARCHAR(20) | NULL | |
| TIPO_DICA | VARCHAR(50) | NOT NULL | |
| TITULO | VARCHAR(200) | NOT NULL | |
| DESCRICAO | TEXT | NOT NULL | |
| DATA_GERACAO | DATE | NOT NULL | |
| VISUALIZADA | TINYINT(1) | 0 | |

### `RELATORIO_SEMANAL_COORDENADORES_LOG` — controle de rotina
Log do e-mail semanal enviado a cada coordenador.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| COD_SUPERVISOR | INT | NOT NULL | UNIQUE `UX_RELATORIO_SEMANAL_COORD`(COD_SUPERVISOR, SEMANA_REFERENCIA) |
| EMAIL_DESTINO | VARCHAR(200) | NOT NULL | |
| SEMANA_REFERENCIA | VARCHAR(30) | NOT NULL | INDEX |
| DATA_INICIO / DATA_FIM | VARCHAR(10) | NOT NULL | |
| FATURAMENTO_LIQUIDO | DECIMAL(14,2) | 0 | |
| TOTAL_PEDIDOS | INT | 0 | |
| ENVIADO_EM | DATETIME | NULL | |
| STATUS | VARCHAR(30) | NOT NULL | INDEX |
| ERRO | TEXT | NULL | |

---

## Agenda interna e Google Agenda

### `AGENDA_INTERNA` — ativa
Compromissos internos (spec 003).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| TITULO | VARCHAR(200) | NOT NULL | |
| DESCRICAO | TEXT | NULL | |
| DATA_AGENDADA | VARCHAR(10) | NOT NULL | |
| HORA_INICIO / HORA_FIM | VARCHAR(5) | NOT NULL | |
| TIPO | VARCHAR(50) | NULL | |
| ORIGEM_DESLOCAMENTO / DESTINO_DESLOCAMENTO | VARCHAR(200) | NULL | |
| STATUS | VARCHAR(20) | NULL | |
| CRIADOR_ID | INT | NOT NULL | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `AGENDA_INTERNA_PARTICIPANTES` — ativa

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| AGENDA_ID | INT | NOT NULL | FK→AGENDA_INTERNA(ID) |
| VENDEDOR_ID | INT | NOT NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |

### `GOOGLE_AGENDA_CONFIG` — ativa
Conexão do usuário com o Google Agenda. Gravada pela SF SQL `googleAgendaConfirmarConexao` (366). Guarda segredos em `TEXT` sem criptografia, que nunca podem chegar ao navegador (RNFT-006).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| USER_ID | INT | NOT NULL | UNIQUE `UX_GOOGLE_AGENDA_USER` |
| CLIENT_ID | VARCHAR(300) | NOT NULL | |
| CLIENT_SECRET | TEXT | NOT NULL | |
| REFRESH_TOKEN | TEXT | NOT NULL | |
| CALENDAR_ID | VARCHAR(300) | 'primary' | |
| INTEGRATION_SLUG | VARCHAR(180) | NULL | |
| STATUS | VARCHAR(30) | 'CONFIGURADO' | |
| ULTIMO_ERRO | TEXT | NULL | |
| CONFIGURADO_EM / ATUALIZADO_EM / ULTIMA_SYNC | VARCHAR(19) | NULL | |
| EMAIL_GOOGLE | VARCHAR(300) | NULL | (acrescentada) |

### `GOOGLE_OAUTH_APP` — somente leitura
Credencial OAuth da empresa, em linha única, gravada só pelo backend (TI). As SFs leem `ORDER BY ID DESC LIMIT 1`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENT_ID | VARCHAR(300) | NOT NULL | |
| CLIENT_SECRET | TEXT | NOT NULL | |
| REDIRECT_URI | VARCHAR(400) | NOT NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `GOOGLE_AGENDA_TICKET` — controle de rotina
Ticket de uso único (cerca de 5 min) que liga uma SF JavaScript ao usuário logado.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| TICKET | VARCHAR(160) | NOT NULL | UNIQUE `UX_GOOGLE_AGENDA_TICKET` |
| USER_ID | INT | NOT NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | (comparar com `REPLACE(…,'T',' ')`) |
| CONSUMIDO_EM | VARCHAR(19) | NULL | (acrescentada) |

### `GOOGLE_AGENDA_EVENTOS` — controle de rotina
Mapa entre a entidade local e o evento do Google.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| USER_ID | INT | NOT NULL | UNIQUE `UX_GOOGLE_AGENDA_EVENTO`(USER_ID, ENTIDADE, ENTIDADE_ID) |
| ENTIDADE | VARCHAR(20) | NOT NULL | |
| ENTIDADE_ID | INT | NOT NULL | |
| GOOGLE_EVENT_ID | VARCHAR(300) | NULL | |
| STATUS_SYNC | VARCHAR(30) | 'PENDENTE' | |
| ULTIMA_SYNC | VARCHAR(19) | NULL | |
| ULTIMO_ERRO | TEXT | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `GOOGLE_AGENDA_FILA` — controle de rotina
Fila de sincronização com o Google, processada por `googleAgendaProcessarFila`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ENTIDADE | VARCHAR(20) | NOT NULL | UNIQUE `UK_FILA_ITEM`(ENTIDADE, ENTIDADE_ID) |
| ENTIDADE_ID | INT | NOT NULL | |
| SOLICITADO_EM | VARCHAR(19) | NULL | |
| PROCESSADO_EM | VARCHAR(19) | NULL | (comparar com `REPLACE(…,'T',' ')`) |
| TENTATIVAS | INT | 0 | |
| ULTIMO_ERRO | VARCHAR(500) | NULL | |

### `GOOGLE_AGENDA_LOGS` — controle de rotina
Trilha das ações de sincronização.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| USER_ID | INT | NOT NULL | |
| ENTIDADE | VARCHAR(20) | NULL | |
| ENTIDADE_ID | INT | NULL | |
| ACAO | VARCHAR(30) | NULL | |
| STATUS | VARCHAR(30) | NOT NULL | |
| MENSAGEM | TEXT | NULL | |
| EXECUTADO_EM | VARCHAR(19) | NULL | |

### `GOOGLE_OAUTH_PENDENTE` — legada — não usar
Era a ponte do OAuth. Desde `fix-google-agenda-escrita-por-sf-sql.mjs`, `googleAgendaTrocarCodigo` devolve o token à tela e a SF 366 grava direto em `GOOGLE_AGENDA_CONFIG`. Nenhuma SF vigente grava aqui; só `googleAgendaManutencao` apaga linhas vencidas.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| STATE | VARCHAR(160) | NOT NULL | UNIQUE `UX_GOOGLE_OAUTH_PENDENTE` |
| REFRESH_TOKEN | TEXT | NULL | |
| EMAIL_GOOGLE | VARCHAR(300) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |

---

## Prospecção

### `PROSPECTS` — ativa

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| RAZAO_SOCIAL | VARCHAR(300) | NOT NULL | |
| NOME_FANTASIA | VARCHAR(300) | NULL | |
| CNPJ | VARCHAR(20) | NULL | |
| SEGMENTO | VARCHAR(120) | NULL | |
| PORTE | VARCHAR(60) | NULL | |
| ORIGEM | VARCHAR(100) | NULL | |
| CIDADE | VARCHAR(160) | NULL | |
| UF | VARCHAR(2) | NULL | |
| ENDERECO | VARCHAR(500) | NULL | |
| STATUS_PIPELINE | VARCHAR(40) | 'NOVO' | INDEX |
| POTENCIAL | DECIMAL(12,2) | 0 | |
| PROBABILIDADE | INT | 10 | |
| OBSERVACOES | TEXT | NULL | |
| RESPONSAVEL_ID | INT | NULL | INDEX |
| COD_CLIENTE_TOTVS | VARCHAR(60) | NULL | |
| CONVERTIDO_EM | VARCHAR(19) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | INDEX |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `PROSPECT_CONTATOS` — ativa

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| PROSPECT_ID | INT | NOT NULL | FK→PROSPECTS(ID); INDEX |
| NOME | VARCHAR(200) | NOT NULL | |
| CARGO | VARCHAR(120) | NULL | |
| TELEFONE | VARCHAR(40) | NULL | |
| EMAIL | VARCHAR(200) | NULL | |
| PRINCIPAL | BOOLEAN | TRUE | |
| CRIADO_EM | VARCHAR(19) | NULL | |

### `PROSPECT_VISITAS` — ativa

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| PROSPECT_ID | INT | NOT NULL | FK→PROSPECTS(ID) |
| EXECUTIVO_ID | INT | NULL | INDEX |
| DATA_VISITA | VARCHAR(10) | NOT NULL | INDEX |
| HORA_INICIO / HORA_FIM | VARCHAR(5) | NULL | |
| OBJETIVO | VARCHAR(200) | NULL | |
| STATUS | VARCHAR(30) | 'AGENDADA' | INDEX |
| RESUMO / OBJECOES / PROXIMO_PASSO | TEXT | NULL | |
| DATA_PROXIMO_PASSO | VARCHAR(10) | NULL | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

---

## Integrações (`INTG_` / `IMP_`)

### `INTG_BUSINESS_UNIT` / `INTG_REGION` / `INTG_ACTIVITY_SEGMENT` — somente leitura
Dimensões espelhadas do planejamento estratégico pela SF `syncIntegrationBillingTargets`. As três têm a mesma estrutura; o nome da coluna de origem muda conforme a tabela.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| SOURCE_BUSINESS_UNIT_ID / SOURCE_REGION_ID / SOURCE_ACTIVITY_SEGMENT_ID | INT | NOT NULL | UNIQUE |
| CODE | VARCHAR(80) | NOT NULL | UNIQUE |
| NAME | VARCHAR(200) | NOT NULL | |
| RAW_NAME | VARCHAR(200) | NULL | |
| ACTIVE | BOOLEAN | TRUE | INDEX |
| SOURCE_UPDATED_AT / SYNCED_AT | VARCHAR(19) | NULL | |

`INTG_REGION.CODE`: DF, GO, TO, RS, Outros Estados. Casa com `FILIAL.UF` (RNT-009).

### `INTG_MONTHLY_BILLING_TARGET` — somente leitura
Meta mensal do planejamento por BU, região e segmento.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| SOURCE_MONTHLY_TARGET_ID | INT | NOT NULL | UNIQUE |
| YEAR_REF / MONTH_REF | INT | NOT NULL | INDEX (YEAR_REF, MONTH_REF) |
| MONTH_LABEL | VARCHAR(30) | NULL | |
| QUARTER_LABEL | VARCHAR(10) | NULL | |
| SOURCE_BUSINESS_UNIT_ID | INT | NOT NULL | FK→INTG_BUSINESS_UNIT(SOURCE_BUSINESS_UNIT_ID) |
| SOURCE_REGION_ID | INT | NOT NULL | FK→INTG_REGION(SOURCE_REGION_ID) |
| SOURCE_ACTIVITY_SEGMENT_ID | INT | NOT NULL | FK→INTG_ACTIVITY_SEGMENT(SOURCE_ACTIVITY_SEGMENT_ID) |
| TARGET_VALUE | DECIMAL(15,2) | 0 | |
| STORED_RESULT_VALUE | DECIMAL(15,2) | NULL | |
| REALIZED_PERCENT / BW_PERCENT | DECIMAL(10,4) | NULL | |
| SOURCE_ROW_ID | INT | NULL | |
| SOURCE_FILE | VARCHAR(255) | NULL | |
| ACTIVE | BOOLEAN | TRUE | INDEX |
| SOURCE_UPDATED_AT / SYNCED_AT | VARCHAR(19) | NULL | |

### `INTG_BILLING_SYNC_LOG` — controle de rotina

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| STARTED_AT / FINISHED_AT | VARCHAR(19) | NULL | |
| STATUS | VARCHAR(30) | NULL | |
| YEAR_FILTER | INT | NULL | |
| DIMENSIONS_COUNT / TARGETS_COUNT | INT | 0 | |
| ERROR_MESSAGE | VARCHAR(500) | NULL | |

### Tabelas `IMP_*` de Data Loader — somente leitura (sem DDL no repo)
Criadas e recarregadas pelos Data Loaders da Mitra a partir do ERP Winthor (JDBC 2). Não há `CREATE TABLE`. Tipos, `AUTO_ID` e índices ficam **a verificar no Mitra**. As colunas abaixo saem da consulta do loader (quando está no repo) e do uso nas SFs.

| Tabela | Loader | Colunas | Uso |
|---|---|---|---|
| `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | `VENDAS_DASHBOARD_TOTVS_RCA` (`update-dataloader-vendas-dashboard-itens.mjs`; `view_vendas_resumo_faturamento`, `codoper='S'`) | NUMNOTA, NUMTRANSVENDA, NUMPED, DTSAIDA ('YYYY-MM-DD'), CODFILIAL, CODPROD, DESCRICAO, COD_RCA, RCA, SUPERVISOR, CODCLI, CLIENTE, CODFORNEC, CODEPTO, DEPARTAMENTO, CODSEC, SECAO, RAMO_CLIENTE, QT, VLUNIT, TOTAL; mais AUTO_ID, usado em SFs, de origem a verificar | Linhas de **venda bruta**, usadas em cerca de 190 arquivos de SF (RNT-007, RNT-008) |
| `IMP_DEVOLUCOES_TOTVS` | `DEVOLUCOES_TOTVS` (consulta **não está no repo**; agendada por `schedule-devolucoes-totvs-diario.mjs`) | Do uso nas SFs: AUTO_ID, NOTA_DEVOLUCAO, NOTA_VENDA_ORIGINAL, NUMPED, DATA_VENDA, DATA_DEVOLUCAO, CODFILIAL, CODEPTO, DEPARTAMENTO, CODSEC, SECAO, CODCLI, CLIENTE, COD_RCA, RCA, CODPROD, DESCRICAO, QT_DEVOLVIDA, VALOR_DEVOLVIDO, TIPODESCARGA, RAMO_CLIENTE; NUMTRANSENT aparece uma vez | **Devoluções** que o líquido desconta (RNT-008) |
| `IMP_CLIENTES_TOTVS` | `CLIENTES_TOTVS` (`add-metas-vendas-ramo-uf.mjs`: `PCCLIENT` ⋈ `PCATIVI`) | CODCLI, CLIENTE, RAMO, UF (`ESTENT`), CIDADE (`MUNICENT`). `UF VARCHAR(2)` e `CIDADE VARCHAR(120)` também ganharam `ALTER ADD COLUMN` | **Ramo**/UF/cidade do cliente (cerca de 40 SFs) |
| `IMP_FORNECEDORES_TOTVS` | (`add-fornecedores-totvs.mjs`: `PCFORNEC`) | CODFORNEC, FORNECEDOR | Nome do fornecedor no mix de produtos do Analytics |

### Tabelas de staging de scripts de carga — controle de rotina (existência a verificar)
Destinos de Data Loader usados só por scripts pontuais de carga: `IMP_CLIENTES_WINTHOR` (`import-clientes-winthor.mjs`), `IMP_RCAS_TOTVS_UNICOS` (`extrair-rcas-totvs.mjs`) e `IMP_RCA_CLIENTE_WINTHOR` (`add-associacao-vendedor-rca.mjs`). Nenhuma SF vigente os lê. Não aparecem na lista de tabelas do perfil.

---

## Suporte, notas de versão e solicitações

### `SUPORTE_BUGS` — legada — não usar (tela cancelada em 2026-10-30)

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| PROTOCOLO | VARCHAR(40) | NOT NULL | |
| USER_ID | INT | NULL | |
| USER_EMAIL / USER_NOME | VARCHAR(255) | NULL | |
| USER_STATUS | VARCHAR(50) | NULL | |
| USER_SUBSTITUTO_ID | INT | NULL | |
| TITULO | VARCHAR(200) | NOT NULL | |
| CATEGORIA | VARCHAR(80) | NULL | |
| PRIORIDADE | VARCHAR(30) | NULL | INDEX |
| TELA_AFETADA | VARCHAR(200) | NULL | |
| DESCRICAO, PASSOS_REPRODUCAO, RESULTADO_ESPERADO, RESULTADO_OBTIDO, IMPACTO | TEXT | NULL | |
| ANEXO_URL | TEXT | NULL | |
| ANEXO_NOME | VARCHAR(255) | NULL | |
| EMAIL_STATUS | VARCHAR(30) | NULL | |
| EMAIL_ERRO | TEXT | NULL | |
| CONTEXTO_JSON | TEXT | NULL | |
| STATUS | VARCHAR(30) | 'ABERTO' | INDEX |
| CRIADO_EM | VARCHAR(19) | NULL | INDEX |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `RELEASE_NOTES` — legada — não usar (tela cancelada em 2026-10-30)
DDL em migration `runddl-1793018560`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| VERSAO | VARCHAR(30) | NULL | |
| TIPO | VARCHAR(20) | NOT NULL, 'NOVIDADE' | (NOVIDADE / MELHORIA / CORRECAO) |
| TITULO | VARCHAR(200) | NOT NULL | |
| CONTEUDO | TEXT | NOT NULL | |
| PUBLICADO | TINYINT(1) | NOT NULL, 0 | INDEX (PUBLICADO, DATA_PUBLICACAO) |
| DATA_PUBLICACAO | VARCHAR(19) | NULL | |
| CRIADO_POR | INT | NULL | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `RELEASE_NOTES_LEITURA` — legada — não usar (tela cancelada em 2026-10-30)
DDL em migration `runddl-1793018562`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| RELEASE_ID | INT | NOT NULL | UNIQUE `uk_release_leitura`(RELEASE_ID, USER_ID) |
| USER_ID | INT | NOT NULL | |
| LIDO_EM | VARCHAR(19) | NULL | |

### `SOLICITACOES` — legada — não usar (tela cancelada em 2026-10-30)
Solicitações ao time de compras (spec 011).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE | VARCHAR(300) | NOT NULL | (texto livre, sem FK) |
| TIPO_SOLICITACAO | VARCHAR(120) | NOT NULL | |
| DESCRICAO | TEXT | NULL | |
| PRIORIDADE | VARCHAR(20) | 'MEDIA' | |
| STATUS | VARCHAR(30) | 'ABERTA' | INDEX |
| PRAZO_DESEJADO | VARCHAR(10) | NULL | |
| CODFILIAL | VARCHAR(20) **ou** VARCHAR(5) | NULL | (o CREATE diz 20, o `addColumnIfMissing` diz 5; a verificar no Mitra) |
| FILIAL_NOME | VARCHAR(200) | NULL | |
| EXECUTIVO_ID | INT | NULL | INDEX |
| EXECUTIVO_EMAIL | VARCHAR(200) | NULL | INDEX |
| REFERENCIA_COMERCIAL_ID | VARCHAR(80) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | INDEX |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

### `SOLICITACAO_ITENS` — legada — não usar (tela cancelada em 2026-10-30)
As colunas `COMPRAS_*` são gravadas pela integração bidirecional com o projeto de compras (`SGC_SOLICITACOES`, remoto).

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| SOLICITACAO_ID | INT | NOT NULL | INDEX (sem FK) |
| CODPROD | VARCHAR(50) | NULL | INDEX |
| CODFORNEC | INT | NULL | |
| PRODUTO | VARCHAR(300) | NOT NULL | |
| QUANTIDADE | DECIMAL(12,3) | 1 | |
| OBSERVACAO | VARCHAR(500) | NULL | |
| CRIADO_EM | VARCHAR(19) | NULL | |
| COMPRAS_SOLICITACAO_ID | INT | NULL | |
| COMPRAS_STATUS | VARCHAR(30) | NULL | |
| COMPRAS_CARD_ID | INT | NULL | |
| COMPRAS_AVALIADO_EM | VARCHAR(19) | NULL | |
| COMPRAS_OBS_AVALIACAO | TEXT | NULL | |
| COMPRAS_SYNC_EM | VARCHAR(19) | NULL | |
| COMPRAS_SYNC_ERRO | TEXT | NULL | |

---

## Titulares

### `CLIENTE_TITULAR_DEPTO` — ativa
Titular do cliente por filial + departamento + seção (spec 002). `ORIGEM='AUTO'` vem da sincronização (`titularesSincronizarLimpar` e `titularesSincronizarInserir`); a Gestão de Titulares grava manualmente. DDL em migrations `runddl-1792584652` e `runddl-1792586173`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| ID_CLIENTE | INT | NOT NULL | UNIQUE `UK_TITULAR`(ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO) |
| CODFILIAL | VARCHAR(10) | NOT NULL | |
| CODEPTO | VARCHAR(20) | NOT NULL | |
| ID_SECAO | INT | NOT NULL | |
| VENDEDOR_ID | INT | NOT NULL | INDEX `IX_TITULAR_VEND` |
| ORIGEM | VARCHAR(20) | 'AUTO' | |
| ATIVO | BOOLEAN | TRUE | |
| CRIADO_EM / ATUALIZADO_EM | VARCHAR(19) | NULL | |
| ALTERADO_POR | INT | NULL | |

---

## Acesso das executivas

### `USUARIO_BLOQUEIO` — ativa
Bloqueio de acesso por usuário (SFs `gestaoAcessoExecutivas*`, `meuAcessoBloqueado`). Também exclui usuários das rotinas de titulares e de várias análises. DDL em migrations `runddl-1792521098` e `runddl-1792521193`.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| USER_ID | INT | NOT NULL | PK |
| BLOQUEADO | INT | NOT NULL, 0 | (1 = bloqueado) |
| MOTIVO | VARCHAR(500) | NULL | |
| ATUALIZADO_POR | INT | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |

---

## Plataforma Mitra — da plataforma

Tabelas que a plataforma cria e mantém. O sistema novo só lê `INT_USER`; as demais só são tocadas pelo sistema de migrations e de permissões.

| Tabela | Colunas usadas no projeto | Observação |
|---|---|---|
| `INT_USER` | ID, DESCR (e-mail de login), **NOME** VARCHAR(200) NULL, ISDEV | `NOME` foi acrescentada pelo projeto (`ALTER TABLE INT_USER ADD COLUMN NOME VARCHAR(200) NULL AFTER DESCR`, `add-int-user-nome-column.mjs`). As demais colunas ficam a verificar no Mitra. É o alvo de todos os ids de usuário (C6). |
| `INT_SERVERFUNCTION` | NAME, DESCRIPTION, TYPE, JDBC_ID, CODE, PUBLIC_EXECUTION, CRON_EXPRESSION, CRON_INPUT_JSON | Alterada só pelas migrations `create-sf-*`/`update-sf-*` |
| `INT_PROFILEFREEDBTABLE` | PROFILEID, TABLENAME, JDBCCONNECTIONCONFIGID, QUERYALIAS | Migrations `set-profile-select-tables-*` |
| `INT_PROFILESERVERFUNCTION` | PROFILEID, SERVERFUNCTIONID | Migrations `set-profile-sf-*` |
| `INT_PROFILEUSER` | PROFILEID | Usada por scripts de perfil |
| `INT_SERVERFUNCTIONEXECUTION` | ID | Usada por script de monitoramento |

---

## Backups e utilitários

Todas existem em produção (lista do perfil, ou `CREATE TABLE … AS SELECT`). Nenhuma tem DDL de estrutura no repositório, e nenhuma SF vigente as lê.

| Tabela | Papel | Justificativa |
|---|---|---|
| `CLIENTES_BKP`, `CLIENTE_BU_VENDEDOR_BKP`, `EQUIPE_CLIENTE_BKP`, `PEDIDOS_SEMANAIS_BKP`, `PEDIDOS_SEMANAIS_SYNC_BKP`, `PEDIDOS_SEMANAIS_SYNC_RAW_BKP`, `PERFIL_COMPRA_CLIENTE_BKP`, `PRODUCT_MIX_BKP`, `SIMULACOES_BKP`, `VISITAS_BKP` | legada — não usar | Backups pontuais, provavelmente da migração de ID de cliente para o código Winthor (C5). Estrutura a verificar no Mitra. |
| `VENDEDOR_RCA_BKP_20260408` | legada — não usar | `CREATE TABLE … AS SELECT * FROM VENDEDOR_RCA` antes da 3ª redefinição de `VENDEDOR_RCA` |
| `MIGRACAO_USUARIO_LOG` | controle de rotina | Log da migração da conta 8 → 61 (`migrar-comunicacao-8-para-61.mjs`). DDL em migration `runddl-1792522394`: ID INT AI PK, TABELA VARCHAR(100), COLUNA VARCHAR(100), DE_USER INT, PARA_USER INT, QTD INT, EXECUTADO_EM VARCHAR(19) |

### `CLIENTE_BU_VENDEDOR` — legada — não usar
Antigo vínculo cliente ↔ BU ↔ vendedor, criado na importação do Winthor. Foi substituído por `EQUIPE_CLIENTE` + `BU_VENDEDOR`. Só aparece em scripts de carga e de ajuste; nenhuma SF versionada em `migrations/` o lê. Confirmar no Mitra que nenhuma SF antiga ainda o consulta.

| Coluna | Tipo | Nulo / default | Chave |
|---|---|---|---|
| ID | INT AUTO_INCREMENT | NOT NULL | PK |
| CLIENTE_ID | INT | NOT NULL | FK→CLIENTES(ID) ON UPDATE CASCADE |
| BU | VARCHAR(100) | NOT NULL | |
| VENDEDOR_ID | INT | NULL | |
| ATUALIZADO_EM | VARCHAR(19) | NULL | |
| WINTHOR_COD_RCA | INT | NULL | |
| RCA_NOME / SUPERVISOR_NOME | VARCHAR(200) | NULL | |

UNIQUE `UX_CLIENTE_BU_UNICO` (CLIENTE_ID, BU).

---

## Objetos externos com nome parecido (não estão no banco do projeto)

Não confundir com tabelas locais:
- **ERP Winthor (JDBC 2):** `PCCLIENT`, `PCATIVI`, `PCFORNEC`, `PCMOV`, `PCUSUARI`, `PCSUPERV`, `PCDEPTO`, `PCSECAO`, `view_vendas_resumo_faturamento`, `BENENUTRI.PCPEDC`/`PCPEDI`/`PCPRODUT`. São consultados por Data Loaders e por SFs com JDBC.
- **Projeto de custos (remoto):** `CUSTOPRODUTO`, `COST_POLICIES`, `POLICY_ITEMS`, `COST_POLICY_CLIENTS`, `PRODUTOS`, lidos via `queryRemoto` nas SFs de custo do mix. As tabelas locais de mesmo nome são legadas.
- **Projeto de compras (remoto):** `SGC_SOLICITACOES`.

---

## Índice alfabético

| Tabela | Domínio | Papel |
|---|---|---|
| ACOMP_SEMANAL_SYNC_ERRO | Vendas e acompanhamento | legada — não usar |
| ACOMP_SEMANAL_SYNC_ERRO_ATUAL | Vendas e acompanhamento | controle de rotina |
| ACOMP_SEMANAL_SYNC_LOG | Vendas e acompanhamento | controle de rotina |
| AGENDA_INTERNA | Agenda interna e Google | ativa |
| AGENDA_INTERNA_PARTICIPANTES | Agenda interna e Google | ativa |
| ALERTAS_EMAIL_SEMANAL | Alertas | controle de rotina |
| ALERTAS_INTELIGENTES | Alertas | ativa |
| ALERTAS_PROCESSAMENTO | Alertas | controle de rotina |
| ATIVIDADES_LOG | Núcleo CRM | ativa |
| BU | Organização e escopo | ativa |
| BU_VENDEDOR | Organização e escopo | ativa |
| CARGOS | Núcleo CRM | legada — não usar |
| CLIENTE_BU_VENDEDOR | Backups e utilitários | legada — não usar |
| CLIENTE_BU_VENDEDOR_BKP | Backups e utilitários | legada — não usar |
| CLIENTE_TITULAR_DEPTO | Titulares | ativa |
| CLIENTES | Núcleo CRM | somente leitura |
| CLIENTES_BKP | Backups e utilitários | legada — não usar |
| COMISSOES | Núcleo CRM | ativa |
| CONFIG_ALERTAS_VENDEDOR | Alertas | ativa |
| COORDENADORES | Organização e escopo | ativa |
| COORDENADORES_BU | Organização e escopo | ativa |
| COST_POLICIES | Mix e custos | legada — não usar |
| CUSTO_ESPECIAL_CLIENTES | Mix e custos | legada — não usar |
| CUSTO_ESPECIAL_CLIENTES_BIG | Mix e custos | somente leitura |
| CUSTO_ESPECIAL_PRODUTO | Mix e custos | somente leitura |
| CUSTO_ESPECIAL_PRODUTO_CLIENTE | Mix e custos | legada — não usar |
| CUSTO_PADRAO_PRODUTO | Mix e custos | somente leitura |
| CUSTOPRODUTO | Mix e custos | legada — não usar |
| DICAS_PRO_LOG | Alertas | ativa |
| EQUIPE_CLIENTE | Organização e escopo | ativa |
| EQUIPE_CLIENTE_BKP | Backups e utilitários | legada — não usar |
| FERIAS_VENDEDOR | Organização e escopo | ativa |
| FILIAL | Organização e escopo | somente leitura |
| FUNCIONARIOS | Organização e escopo | ativa |
| GOOGLE_AGENDA_CONFIG | Agenda interna e Google | ativa |
| GOOGLE_AGENDA_EVENTOS | Agenda interna e Google | controle de rotina |
| GOOGLE_AGENDA_FILA | Agenda interna e Google | controle de rotina |
| GOOGLE_AGENDA_LOGS | Agenda interna e Google | controle de rotina |
| GOOGLE_AGENDA_TICKET | Agenda interna e Google | controle de rotina |
| GOOGLE_OAUTH_APP | Agenda interna e Google | somente leitura |
| GOOGLE_OAUTH_PENDENTE | Agenda interna e Google | legada — não usar |
| IMP_CLIENTES_TOTVS | Integrações | somente leitura |
| IMP_CLIENTES_WINTHOR | Integrações (staging) | controle de rotina |
| IMP_DEVOLUCOES_TOTVS | Integrações | somente leitura |
| IMP_FORNECEDORES_TOTVS | Integrações | somente leitura |
| IMP_RCA_CLIENTE_WINTHOR | Integrações (staging) | controle de rotina |
| IMP_RCAS_TOTVS_UNICOS | Integrações (staging) | controle de rotina |
| IMP_VENDAS_DASHBOARD_TOTVS_RCA | Integrações | somente leitura |
| INT_PROFILEFREEDBTABLE | Plataforma | da plataforma |
| INT_PROFILESERVERFUNCTION | Plataforma | da plataforma |
| INT_PROFILEUSER | Plataforma | da plataforma |
| INT_SERVERFUNCTION | Plataforma | da plataforma |
| INT_SERVERFUNCTIONEXECUTION | Plataforma | da plataforma |
| INT_USER | Plataforma | da plataforma |
| INTG_ACTIVITY_SEGMENT | Integrações | somente leitura |
| INTG_BILLING_SYNC_LOG | Integrações | controle de rotina |
| INTG_BUSINESS_UNIT | Integrações | somente leitura |
| INTG_MONTHLY_BILLING_TARGET | Integrações | somente leitura |
| INTG_REGION | Integrações | somente leitura |
| METAS | Metas | legada — não usar |
| METAS_BU | Metas | legada — não usar |
| METAS_BU_VENDEDOR | Metas | ativa |
| METAS_BU_VENDEDOR_RAMO_UF | Metas | ativa |
| METAS_VENDEDOR | Metas | legada — não usar (só via view) |
| MIGRACAO_USUARIO_LOG | Backups e utilitários | controle de rotina |
| MIX_CUSTOS_SYNC | Mix e custos | controle de rotina |
| MIX_FOTOS_CONFIG | Mix e custos | controle de rotina |
| MIX_PRODUTO_FOTO | Mix e custos | somente leitura |
| PEDIDOS_SEMANAIS | Vendas e acompanhamento | legada — não usar |
| PEDIDOS_SEMANAIS_BKP | Backups e utilitários | legada — não usar |
| PEDIDOS_SEMANAIS_SYNC | Vendas e acompanhamento | somente leitura |
| PEDIDOS_SEMANAIS_SYNC_BKP | Backups e utilitários | legada — não usar |
| PEDIDOS_SEMANAIS_SYNC_RAW | Vendas e acompanhamento | somente leitura |
| PEDIDOS_SEMANAIS_SYNC_RAW_BKP | Backups e utilitários | legada — não usar |
| PERFIL_COMPRA_CLIENTE | Vendas e acompanhamento | somente leitura |
| PERFIL_COMPRA_CLIENTE_BKP | Backups e utilitários | legada — não usar |
| PERFIL_TELAS | Núcleo CRM | legada — não usar |
| POLICY_ITEMS | Mix e custos | legada — não usar |
| PRODUCT_MIX | Mix e custos | ativa |
| PRODUCT_MIX_BKP | Backups e utilitários | legada — não usar |
| PRODUCT_MIX_ITEMS | Mix e custos | ativa |
| PRODUTOS | Mix e custos | legada — não usar |
| PRODUTOS_CUSTOS | Mix e custos | somente leitura |
| PROSPECT_CONTATOS | Prospecção | ativa |
| PROSPECT_VISITAS | Prospecção | ativa |
| PROSPECTS | Prospecção | ativa |
| RCA_DEPARTAMENTO | Organização e escopo | somente leitura |
| RCA_TOTVS | Organização e escopo | somente leitura |
| RELATORIO_SEMANAL_COORDENADORES_LOG | Alertas | controle de rotina |
| RELATOS_CLIENTE | Núcleo CRM | ativa |
| RELEASE_NOTES | Suporte, notas e solicitações | legada — não usar (tela cancelada em 2026-10-30) |
| RELEASE_NOTES_LEITURA | Suporte, notas e solicitações | legada — não usar (tela cancelada em 2026-10-30) |
| SECAO | Organização e escopo | somente leitura |
| SEGMENTOS | Núcleo CRM | somente leitura |
| SIMULACAO_ITENS | Mix e custos | legada — não usar |
| SIMULACOES | Mix e custos | legada — não usar |
| SIMULACOES_BKP | Backups e utilitários | legada — não usar |
| SOLICITACAO_ITENS | Suporte, notas e solicitações | legada — não usar (tela cancelada em 2026-10-30) |
| SOLICITACOES | Suporte, notas e solicitações | legada — não usar (tela cancelada em 2026-10-30) |
| SUPORTE_BUGS | Suporte, notas e solicitações | legada — não usar (tela cancelada em 2026-10-30) |
| TAREFAS | Núcleo CRM | ativa |
| USUARIO_BLOQUEIO | Acesso das executivas | ativa |
| USUARIO_CARGO | Organização e escopo | ativa |
| USUARIO_PREFERENCIAS | Organização e escopo | ativa (sem DDL) |
| VENDEDOR_RCA | Organização e escopo | ativa |
| VENDEDOR_RCA_AUDITORIA | Organização e escopo | ativa |
| VENDEDOR_RCA_BKP_20260408 | Backups e utilitários | legada — não usar |
| VISITAS | Núcleo CRM | ativa |
| VISITAS_BKP | Backups e utilitários | legada — não usar |
| VW_META_VENDEDOR_MES *(view)* | Metas | legada — não usar |

Totais (110 objetos, 1 deles view): **ativa 32 · somente leitura 23 · controle de rotina 16 · legada — não usar 33 · da plataforma 6** (revisão de 2026-10-30: a view de meta e as 5 tabelas de Suporte, Notas de versão e Solicitações passaram a legadas).

---

## Lacunas

### Tabelas sem DDL no repositório (estrutura a verificar no Mitra)
- **L-01 — sem `CREATE`:**
  - `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS`, `IMP_CLIENTES_TOTVS` e `IMP_FORNECEDORES_TOTVS`, criadas por Data Loader. A consulta do loader de devoluções não está no repo.
  - `INT_USER` e demais `INT_*`, da plataforma.
  - `USUARIO_PREFERENCIAS`.
  - `CUSTO_ESPECIAL_PRODUTO_CLIENTE`.
  - os 10 `*_BKP`.
  - os stagings `IMP_CLIENTES_WINTHOR`, `IMP_RCAS_TOTVS_UNICOS` e `IMP_RCA_CLIENTE_WINTHOR`.

### Colunas citadas em SF que não aparecem em nenhum DDL
- **L-02 — `VENDEDOR_ID`:** `PEDIDOS_SEMANAIS_SYNC.VENDEDOR_ID` (a SF 107 vigente grava `0`) e `PEDIDOS_SEMANAIS_SYNC_RAW.VENDEDOR_ID` não constam de nenhum `CREATE`/`ALTER`. A existência em produção é atestada por `migrar-comunicacao-8-para-61.mjs`. Tipo e nulidade ficam a verificar.
- Uma varredura `alias.COLUNA` × DDL não achou outras colunas faltando com confiança; os demais casos eram colisão de alias entre CTEs.
- O tipo de `IMP_*.DTSAIDA`, `DATA_DEVOLUCAO` e `DATA_VENDA` (DATE ou VARCHAR) e a origem do `AUTO_ID` nas `IMP_*` ficam a verificar.

### Conflitos entre o schema e as regras da spec 000
- **L-03 — meta (RNT-009)** — *resolvido na revisão: opção (a), ver C3*:
  - `VW_META_VENDEDOR_MES` devolve a meta de `METAS_VENDEDOR` quando não há distribuição, e não diz a origem da linha;
  - `dashboardKpis` e `painelGestaoResumo` leem `META_MES` de `METAS` (cadastro manual da fase 1);
  - `metaRealizadoProjecao` e `analyticsRcaMetaResumo` leem `METAS_VENDEDOR` direto.

  Para cumprir "sem distribuição = zero", o plano da spec 007/010 precisa escolher: (a) filtrar na SF por `EXISTS` em `METAS_BU_VENDEDOR`, ou (b) uma view **nova**, criada por acréscimo, sem o `UNION`. Redefinir a view existente é alteração e precisa de decisão explícita.
- **L-04 — papéis (RNT-001):** `USUARIO_CARGO` só comporta um papel por usuário (`USER_ID` UNIQUE/PK), e não existe papel `TI` em dado nenhum. Acumular papéis exige tabela nova (acréscimo, spec 001). *Aprovado em 2026-10-30. Não existe papel `TI`: ADMIN é o papel da equipe técnica (RNT-001).* Também não se sabe qual dos dois DDLs prevaleceu (com ou sem `ID`).
- **L-05 — férias (RNT-010):** existem duas fontes:
  - `FERIAS_VENDEDOR`, por RCA, com período;
  - `FUNCIONARIOS.STATUS`/`ID_SUBSTITUTO`, por usuário e sem período, lido em cerca de 130 trechos de SF.

  Nenhuma constraint impede sobreposição. *Resolvido na revisão: a fonte única é `FERIAS_VENDEDOR`, e a sobreposição é validada na gravação (ver `FUNCIONARIOS`).*
- **L-06 — busca (RNT-014):** a collation `utf8mb3_bin` foi confirmada só para `CLIENTES` (por comentário). A de `PRODUTOS_CUSTOS`, `PROSPECTS` e demais tabelas buscadas fica a verificar. Acento só se resolve na consulta (C4).

### Migrations
- **L-07 — migrations 082–084 sem arquivo (`docs/pendencias.md`, item 3):** a pendência cita `082/083/084-*-sf-relatorioclientespfativosultimacompra.sql`. O `migrations.yaml` atual **não lista mais esses nomes**: as 338 entradas batem 1:1 com os 338 arquivos, todos nomeados por timestamp. Ou a pendência está defasada, ou a numeração `NNN-*` foi substituída. Confirmar com o sistema de migrations se a SF `relatorioClientesPfAtivosUltimaCompra` tem migration antes de qualquer replay dev↔prod. `docs/pendencias.md` (item 12) também cita uma "migration 091" que não existe com esse nome.
- **L-08 — o `migrations.yaml` está malformado:** a primeira linha é `migrations: []` (lista vazia inline), seguida de 338 itens `- file:`. É YAML inválido ou ambíguo. O arquivo é do sistema e não deve ser editado aqui; o problema deve ser reportado.
- **L-09 — as migrations não são baseline:**
  - só 13 tabelas têm `CREATE` em migration: `ACOMP_SEMANAL_SYNC_ERRO_ATUAL`, `USUARIO_BLOQUEIO`, `MIGRACAO_USUARIO_LOG`, `CLIENTE_TITULAR_DEPTO`, `CUSTO_PADRAO_PRODUTO`, `CUSTO_ESPECIAL_PRODUTO`, `CUSTO_ESPECIAL_CLIENTES_BIG`, `MIX_CUSTOS_SYNC`, `MIX_PRODUTO_FOTO`, `MIX_FOTOS_CONFIG`, `RELATOS_CLIENTE`, `RELEASE_NOTES` e `RELEASE_NOTES_LEITURA`, mais o `ALTER FILIAL ADD UF` e o `ALTER CLIENTE_TITULAR_DEPTO ADD ALTERADO_POR`. As demais (inclusive `CLIENTES`, `VISITAS`, `EQUIPE_CLIENTE`) e a view `VW_META_VENDEDOR_MES` não têm migration. Um replay num banco vazio falha já na primeira (`ALTER TABLE FILIAL`);
  - `runddl-1792521098` (`USUARIO_BLOQUEIO`), `runddl-1792522394` (`MIGRACAO_USUARIO_LOG`) e `runddl-1792584652` (`CLIENTE_TITULAR_DEPTO`) usam `CREATE TABLE` **sem** `IF NOT EXISTS`, então não são idempotentes;
  - pela regra C1, `mergeBaseline` continua proibido sem ordem explícita do usuário.

### Divergências entre `docs/banco-de-dados.md` e o DDL
- **L-10 — conteúdo:**
  - o doc diz que as migrations cobrem "~7 tabelas (bloco mix/custos e solicitações)". São 13 tabelas, e **nenhuma** de solicitações;
  - o doc diz `EQUIPE_CLIENTE.CURVA_CLASSIFICACAO CHAR(1)`, mas o DDL é `VARCHAR(1)`;
  - o doc cita `CUSTO_ESPECIAL_CLIENTES` como tabela atual, mas a vigente é `CUSTO_ESPECIAL_CLIENTES_BIG` e a outra é legada;
  - o doc diz que só `FERIAS_VENDEDOR`, `ALERTAS_*`, `METAS_BU*` e `COORDENADORES` têm data nativa. Também têm `DICAS_PRO_LOG`, `CONFIG_ALERTAS_VENDEDOR`, `METAS_VENDEDOR` e `RELATORIO_SEMANAL_COORDENADORES_LOG.ENVIADO_EM` (C2).
- **L-11 — tabelas que o doc omite:** `IMP_VENDAS_DASHBOARD_TOTVS_RCA` e `IMP_DEVOLUCOES_TOTVS` (as fontes de faturamento, ~190 e ~100 arquivos de SF), `IMP_FORNECEDORES_TOTVS`, `USUARIO_PREFERENCIAS`, `USUARIO_BLOQUEIO`, `CLIENTE_TITULAR_DEPTO`, `RELATOS_CLIENTE`, `GOOGLE_AGENDA_FILA`, `MIX_PRODUTO_FOTO`, `MIX_FOTOS_CONFIG`, `MIGRACAO_USUARIO_LOG`, `CUSTO_ESPECIAL_CLIENTES_BIG`, `CUSTO_ESPECIAL_PRODUTO_CLIENTE` e os `*_BKP`.
- **L-12 — `USUARIO_CARGO`:** o doc o descreve com `USER_ID PK`, mas há dois DDLs concorrentes (ver L-04).

### Outros pontos a verificar
- **L-13 — `SOLICITACOES.CODFILIAL`:** `VARCHAR(20)` (CREATE) ou `VARCHAR(5)` (`addColumnIfMissing`).
- **L-14 — `EQUIPE_CLIENTE`:** índice UNIQUE vigente; a sequência de 4 versões de índice depende da ordem de execução dos scripts.
- **L-15 — `IMP_CLIENTES_TOTVS`:** recebeu `ALTER … ADD COLUMN UF/CIDADE` numa tabela gerida por Data Loader. Conferir se a recarga do loader preserva o schema.
- **L-16 — `RCA_DEPARTAMENTO`:** não há rotina de atualização identificada no repo; parece ser carga só por script.
- **L-17 — fuso de `NOW()`/`CURRENT_TIMESTAMP` no MySQL da Mitra:** os timestamps gravados misturam hora do servidor, UTC e Brasília (C2).
