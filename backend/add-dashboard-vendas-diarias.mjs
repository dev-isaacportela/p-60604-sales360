import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const RAW_SECTION_MATCH = `
  B.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
  AND B.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
  AND (
    B.ID_SECAO IS NULL
    OR TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
    OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
  )
`;

const DEV_SECTION_MATCH = `
  B.CODFILIAL = TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), ''))
  AND B.CODEPTO = TRIM(CAST(D.CODEPTO AS CHAR))
  AND (
    B.ID_SECAO IS NULL
    OR TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
    OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
  )
`;

const RAW_CARTEIRA_MATCH = `
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
`;

const DEV_CARTEIRA_MATCH = `
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))
`;

const code = `WITH
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID

  UNION

  SELECT F.ID AS USER_ID
  FROM FUNCIONARIOS F
  WHERE F.ID_SUBSTITUTO = :VAR_USER

  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM VENDEDOR_RCA VR_SUB
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE VR_SUB.USER_ID = :VAR_USER
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
),
BU_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    BV.VENDEDOR_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM TARGET_USERS TU
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
CARTEIRA_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    C.ID AS CLIENTE_ID,
    TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
  FROM TARGET_USERS TU
  JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = TU.USER_ID
  JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
  WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
),
VENDAS_ATRIBUIDAS AS (
  SELECT V.*
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN BU_SCOPE B ON ${RAW_SECTION_MATCH}
  JOIN CARTEIRA_SCOPE CS ON ${RAW_CARTEIRA_MATCH}
),
DEVOLUCOES_ATRIBUIDAS AS (
  SELECT D.*
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN BU_SCOPE B ON ${DEV_SECTION_MATCH}
  JOIN CARTEIRA_SCOPE CS ON ${DEV_CARTEIRA_MATCH}
),
DIAS_BASE AS (
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 20 DAY) AS DATA_REF UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 19 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 18 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 17 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 16 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 15 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 14 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 13 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 12 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 11 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 10 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 9 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 8 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 4 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 3 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY) UNION ALL
  SELECT CURRENT_DATE
),
DIAS AS (
  SELECT DATA_REF
  FROM (
    SELECT DATA_REF
    FROM DIAS_BASE
    WHERE WEEKDAY(DATA_REF) < 5
    ORDER BY DATA_REF DESC
    LIMIT 7
  ) ULTIMOS_DIAS_UTEIS
),
VENDAS_DIA AS (
  SELECT
    STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d') AS DATA_REF,
    ROUND(SUM(V.TOTAL), 2) AS VENDAS_BRUTAS
  FROM VENDAS_ATRIBUIDAS V
  WHERE V.DTSAIDA IS NOT NULL
    AND V.DTSAIDA <> ''
    AND STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d') BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 20 DAY) AND CURRENT_DATE
  GROUP BY STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d')
),
DEVOLUCOES_DIA AS (
  SELECT
    STR_TO_DATE(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10), '%Y-%m-%d') AS DATA_REF,
    ROUND(SUM(D.VALOR_DEVOLVIDO), 2) AS DEVOLUCOES
  FROM DEVOLUCOES_ATRIBUIDAS D
  WHERE CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    AND STR_TO_DATE(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10), '%Y-%m-%d') BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 20 DAY) AND CURRENT_DATE
  GROUP BY STR_TO_DATE(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10), '%Y-%m-%d')
),
SERIE AS (
  SELECT
    D.DATA_REF,
    DATE_FORMAT(D.DATA_REF, '%d/%m') AS DIA_LABEL,
    ROUND(COALESCE(V.VENDAS_BRUTAS, 0) - COALESCE(DEV.DEVOLUCOES, 0), 2) AS VALOR_ATUAL
  FROM DIAS D
  LEFT JOIN VENDAS_DIA V ON V.DATA_REF = D.DATA_REF
  LEFT JOIN DEVOLUCOES_DIA DEV ON DEV.DATA_REF = D.DATA_REF
)
SELECT
  DATE_FORMAT(S.DATA_REF, '%Y-%m-%d') AS DATA_REF,
  S.DIA_LABEL,
  S.VALOR_ATUAL,
  P.VALOR_ATUAL AS VALOR_ANTERIOR,
  CASE
    WHEN P.VALOR_ATUAL IS NULL THEN NULL
    WHEN P.VALOR_ATUAL = 0 AND S.VALOR_ATUAL = 0 THEN 0
    WHEN P.VALOR_ATUAL = 0 THEN NULL
    ELSE ROUND(((S.VALOR_ATUAL - P.VALOR_ATUAL) / P.VALOR_ATUAL) * 100, 1)
  END AS VARIACAO_DIA
FROM SERIE S
LEFT JOIN SERIE P ON P.DATA_REF = (
  SELECT MAX(D2.DATA_REF)
  FROM DIAS D2
  WHERE D2.DATA_REF < S.DATA_REF
)
ORDER BY S.DATA_REF`;

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

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input: {} });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou: ${error || status}`);
  }
  return extractRows(response);
}

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const functions = Array.isArray(list?.result) ? list.result : [];
  const existing = functions.find((fn) => fn.name === 'dashboardVendasDiarias');
  const description = 'Serie dos ultimos 7 dias uteis do dashboard inicial usando a mesma base de faturamento do resumo mensal.';

  let serverFunctionId = existing?.id;
  if (serverFunctionId) {
    await updateServerFunctionMitra({ projectId, serverFunctionId, code, description });
  } else {
    const created = await createServerFunctionMitra({
      projectId,
      name: 'dashboardVendasDiarias',
      type: 'SQL',
      code,
      description,
    });
    serverFunctionId = created?.result?.serverFunctionId || created?.result?.id;
  }

  if (!serverFunctionId) throw new Error('Nao foi possivel identificar o ID da SF dashboardVendasDiarias.');
  const rows = await smoke(serverFunctionId);
  console.log(`dashboardVendasDiarias ID ${serverFunctionId} OK (${rows.length} linha(s)).`);
}

main().catch((error) => {
  console.error('Falha ao criar/atualizar dashboardVendasDiarias:');
  console.error(error?.message || error);
  process.exit(1);
});
