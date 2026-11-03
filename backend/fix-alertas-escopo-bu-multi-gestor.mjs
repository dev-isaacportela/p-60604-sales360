import 'dotenv/config';
import { configureSdkMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// Escopo agora e por BU (vendedor + filial + departamento), nao apenas por vendedor.
// Vendedor com mais de um departamento filtra pelo seletor de escopo do topo da tela;
// coordenador so enxerga os alertas das BUs que sao dele (COORDENADORES_BU).
const ESCOPO_CTE = `WITH INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER', 'GLOBAL') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR
),
TARGET_SCOPES AS (
  SELECT
    :VAR_USER AS USER_ID,
    I.SCOPE_CODFILIAL AS CODFILIAL,
    I.SCOPE_CODEPTO AS CODEPTO
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT
    F.ID AS USER_ID,
    I.SCOPE_CODFILIAL AS CODFILIAL,
    I.SCOPE_CODEPTO AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT
    VR_DONO.USER_ID AS USER_ID,
    I.SCOPE_CODFILIAL AS CODFILIAL,
    I.SCOPE_CODEPTO AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM

  UNION

  SELECT DISTINCT
    BV.VENDEDOR_ID AS USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_COORD_ALVO
      WHERE C_COORD_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_COORD_ALVO.ATIVO, TRUE) = TRUE
        AND C_COORD_ALVO.USER_ID <> :VAR_USER
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT
    BV.VENDEDOR_ID AS USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT
    BV.VENDEDOR_ID AS USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND I.SCOPE_COD_SUPERVISOR IS NOT NULL
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND EXISTS (
      SELECT 1
      FROM COORDENADORES_BU CB_GLOBAL
      WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
        AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
        AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT
    BV.VENDEDOR_ID AS USER_ID,
    I.SCOPE_CODFILIAL AS CODFILIAL,
    I.SCOPE_CODEPTO AS CODEPTO
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND I.SCOPE_COD_SUPERVISOR IS NULL
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
)`;

// Alerta so entra se o par (vendedor + filial + departamento) estiver no escopo atual.
const ESCOPO_MATCH = `EXISTS (
      SELECT 1
      FROM TARGET_SCOPES TS
      WHERE TS.USER_ID = AI.ID_VENDEDOR
        AND (TS.CODFILIAL IS NULL OR TS.CODFILIAL = TRIM(COALESCE(CAST(AI.CODFILIAL AS CHAR), '')))
        AND (TS.CODEPTO IS NULL OR TS.CODEPTO = TRIM(COALESCE(CAST(AI.CODEPTO AS CHAR), '')))
    )`;

const ESCOPO_SECAO = `(
      ESC.SCOPE_ID_SECAO IS NULL
      OR TRIM(COALESCE(AI.ID_SECAO, '')) = ESC.SCOPE_ID_SECAO
      OR LPAD(TRIM(COALESCE(AI.ID_SECAO, '')), 2, '0') = ESC.SCOPE_ID_SECAO
    )`;

const listarCode = `${ESCOPO_CTE},
FILTRADO AS (
  SELECT
    AI.*,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE AI.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        AI.DATA_GERACAO DESC,
        AI.ID DESC
    ) AS RN
  FROM ALERTAS_INTELIGENTES AI
  CROSS JOIN INPUT_SCOPE ESC
  WHERE ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR COALESCE(AI.RAMO_CLIENTE, 'Sem ramo') = '{{ramoCliente}}')
    AND ${ESCOPO_MATCH}
    AND ${ESCOPO_SECAO}
    AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR AI.CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
    AND (
      '{{idSecao}}' = ''
      OR LOCATE('{', '{{idSecao}}') > 0
      OR ('{{idSecao}}' = 'NULL' AND AI.ID_SECAO IS NULL)
      OR AI.ID_SECAO = '{{idSecao}}'
    )
    AND ('{{tipoAlerta}}' = '' OR LOCATE('{', '{{tipoAlerta}}') > 0 OR AI.TIPO_ALERTA = '{{tipoAlerta}}')
    AND ('{{prioridade}}' = '' OR LOCATE('{', '{{prioridade}}') > 0 OR AI.PRIORIDADE = '{{prioridade}}')
    AND ('{{idCliente}}' = '' OR LOCATE('{', '{{idCliente}}') > 0 OR AI.ID_CLIENTE = CAST('{{idCliente}}' AS UNSIGNED))
    AND (
      LOWER('{{somenteNaoLidos}}') NOT IN ('true', '1', 'sim', 's')
      OR AI.LIDO = 0
    )
    AND (
      LOWER('{{somenteLidos}}') NOT IN ('true', '1', 'sim', 's')
      OR AI.LIDO = 1
    )
)
SELECT
  ID,
  ID_VENDEDOR,
  CODFILIAL,
  CODEPTO,
  ID_SECAO,
  ID_CLIENTE,
  NOME_CLIENTE,
  RAMO_CLIENTE,
  TIPO_ALERTA,
  TITULO,
  DESCRICAO,
  VALOR_REFERENCIA,
  PRIORIDADE,
  LIDO,
  DATE_FORMAT(DATA_GERACAO, '%Y-%m-%d %H:%i:%s') AS DATA_GERACAO,
  DATE_FORMAT(DATA_LEITURA, '%Y-%m-%d %H:%i:%s') AS DATA_LEITURA,
  MES_REFERENCIA,
  PRODUTO_REFERENCIA
FROM FILTRADO
WHERE RN <= CASE WHEN '{{limite}}' REGEXP '^[0-9]+$' THEN CAST('{{limite}}' AS UNSIGNED) ELSE 50 END
ORDER BY RN`;

const contarCode = `${ESCOPO_CTE}
SELECT COUNT(*) AS TOTAL
FROM ALERTAS_INTELIGENTES AI
CROSS JOIN INPUT_SCOPE ESC
WHERE ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR COALESCE(AI.RAMO_CLIENTE, 'Sem ramo') = '{{ramoCliente}}')
  AND ${ESCOPO_MATCH}
  AND ${ESCOPO_SECAO}
  AND AI.LIDO = 0
  AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR AI.CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
  AND (
    '{{idSecao}}' = ''
    OR LOCATE('{', '{{idSecao}}') > 0
    OR ('{{idSecao}}' = 'NULL' AND AI.ID_SECAO IS NULL)
    OR AI.ID_SECAO = '{{idSecao}}'
  )`;

// Marcar todos como lidos respeita o escopo aberto na tela (nao marca departamento que o usuario nao esta vendo).
const marcarTodosCode = `UPDATE ALERTAS_INTELIGENTES AI
SET AI.LIDO = 1,
    AI.DATA_LEITURA = CURRENT_TIMESTAMP
WHERE AI.ID_VENDEDOR = CASE
    WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED)
    ELSE :VAR_USER
  END
  AND AI.LIDO = 0
  AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR AI.CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
  AND (
    '{{idSecao}}' = ''
    OR LOCATE('{', '{{idSecao}}') > 0
    OR ('{{idSecao}}' = 'NULL' AND AI.ID_SECAO IS NULL)
    OR AI.ID_SECAO = '{{idSecao}}'
  )
  AND (
    '{{scopeCodFilial}}' = ''
    OR LOCATE('{', '{{scopeCodFilial}}') > 0
    OR TRIM(COALESCE(CAST(AI.CODFILIAL AS CHAR), '')) = TRIM('{{scopeCodFilial}}')
  )
  AND (
    '{{scopeCodepto}}' = ''
    OR LOCATE('{', '{{scopeCodepto}}') > 0
    OR TRIM(COALESCE(CAST(AI.CODEPTO AS CHAR), '')) = TRIM('{{scopeCodepto}}')
  )
  AND (
    '{{scopeIdSecao}}' = ''
    OR LOCATE('{', '{{scopeIdSecao}}') > 0
    OR TRIM(COALESCE(AI.ID_SECAO, '')) = TRIM('{{scopeIdSecao}}')
    OR LPAD(TRIM(COALESCE(AI.ID_SECAO, '')), 2, '0') = TRIM('{{scopeIdSecao}}')
  )`;

async function run() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 131,
    code: listarCode,
    description: 'Lista alertas inteligentes por escopo de BU (vendedor + filial + departamento), tipo, prioridade, cliente, ramo e situacao de leitura.',
  });
  console.log('SF 131 alertasInteligentesListar atualizada');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 134,
    code: contarCode,
    description: 'Conta alertas nao lidos respeitando o escopo de BU (vendedor + filial + departamento).',
  });
  console.log('SF 134 alertasInteligentesContarNaoLidos atualizada');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 133,
    code: marcarTodosCode,
    description: 'Marca como lidos os alertas nao lidos do usuario dentro do escopo aberto na tela (filial/departamento/secao).',
  });
  console.log('SF 133 alertasInteligentesMarcarTodosLidos atualizada');
}

run();
