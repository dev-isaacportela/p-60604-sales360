import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const scopeCte = `INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER', 'GLOBAL') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO
),
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT F.ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
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

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (
      I.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES_BU CB_GLOBAL
        WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_COORD_ALVO
      WHERE C_COORD_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_COORD_ALVO.ATIVO, TRUE) = TRUE
        AND C_COORD_ALVO.USER_ID <> :VAR_USER
    )
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (
      I.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES_BU CB_GLOBAL
        WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
)`;

const listarTarefas = `WITH ${scopeCte}
SELECT
  T.ID,
  T.VENDEDOR_ID,
  COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('#', T.VENDEDOR_ID)) AS RESPONSAVEL,
  T.TITULO,
  T.DESCRICAO,
  T.STATUS,
  T.PRIORIDADE,
  T.DATA_LIMITE,
  T.CRIADO_EM,
  T.CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE
FROM TAREFAS T
LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
LEFT JOIN INT_USER U ON U.ID = T.VENDEDOR_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = T.VENDEDOR_ID
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = T.VENDEDOR_ID
WHERE T.VENDEDOR_ID IN (SELECT USER_ID FROM TARGET_USERS)
  AND ('{{status}}' = '' OR T.STATUS = '{{status}}')
  AND ('{{prioridade}}' = '' OR T.PRIORIDADE = '{{prioridade}}')
ORDER BY
  CASE T.STATUS WHEN 'PENDENTE' THEN 1 WHEN 'EM_ANDAMENTO' THEN 2 WHEN 'CONCLUIDA' THEN 3 END,
  CASE T.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'BAIXA' THEN 3 END,
  T.DATA_LIMITE`;

const contarTarefasPendentes = `WITH ${scopeCte}
SELECT COUNT(*) AS TOTAL
FROM TAREFAS T
WHERE T.VENDEDOR_ID IN (SELECT USER_ID FROM TARGET_USERS)
  AND T.STATUS IN ('PENDENTE','EM_ANDAMENTO')`;

const alertasListar = `WITH ${scopeCte},
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
  WHERE ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR COALESCE(AI.RAMO_CLIENTE, 'Sem ramo') = '{{ramoCliente}}')
    AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)
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
)
SELECT
  ID,
  ID_VENDEDOR,
  CODFILIAL,
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

const alertasContar = `WITH ${scopeCte}
SELECT COUNT(*) AS TOTAL
FROM ALERTAS_INTELIGENTES AI
WHERE ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR COALESCE(AI.RAMO_CLIENTE, 'Sem ramo') = '{{ramoCliente}}')
  AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)
  AND AI.LIDO = 0
  AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR AI.CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
  AND (
    '{{idSecao}}' = ''
    OR LOCATE('{', '{{idSecao}}') > 0
    OR ('{{idSecao}}' = 'NULL' AND AI.ID_SECAO IS NULL)
    OR AI.ID_SECAO = '{{idSecao}}'
  )`;

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function update(id, code, description) {
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, code, description });
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input: { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '', status: '', prioridade: '', limite: '5' } });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
  console.log(`SF ${id}: smoke OK (${extractRows(response).length} linha(s))`);
}

async function main() {
  await update(11, listarTarefas, 'Lista atividades respeitando escopo do coordenador, time ou vendedor selecionado.');
  await update(12, contarTarefasPendentes, 'Conta atividades pendentes respeitando escopo do coordenador.');
  await update(131, alertasListar, 'Lista alertas respeitando escopo do coordenador, time ou vendedor selecionado.');
  await update(134, alertasContar, 'Conta alertas nao lidos respeitando escopo do coordenador.');
}

main().catch((error) => {
  console.error('Falha ao atualizar escopo de atividades e alertas:');
  console.error(error?.message || error);
  process.exit(1);
});
