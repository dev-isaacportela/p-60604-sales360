import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
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
  B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
  AND B.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
  AND (
    (
      B.ID_SECAO IS NOT NULL
      AND (
        TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
        OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
      )
    )
    OR (
      B.ID_SECAO IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM BU_SCOPE B2
        WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
          AND B2.CODFILIAL = B.CODFILIAL
          AND B2.CODEPTO = B.CODEPTO
          AND B2.ID_SECAO IS NOT NULL
          AND (
            TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
            OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
          )
      )
    )
  )
`;

const DEV_SECTION_MATCH = `
  B.CODFILIAL = TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), ''))
  AND B.CODEPTO = TRIM(CAST(D.CODEPTO AS CHAR))
  AND (
    (
      B.ID_SECAO IS NOT NULL
      AND (
        TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
        OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
      )
    )
    OR (
      B.ID_SECAO IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM BU_SCOPE B2
        WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
          AND B2.CODFILIAL = B.CODFILIAL
          AND B2.CODEPTO = B.CODEPTO
          AND B2.ID_SECAO IS NOT NULL
          AND (
            TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
            OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
          )
      )
    )
  )
`;

const RAW_CARTEIRA_MATCH = `
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND (
    (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
    OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
  )
`;

const DEV_CARTEIRA_MATCH = `
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))
`;

const COMMON_CTE = `
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
  SELECT R.*
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN BU_SCOPE B ON ${RAW_SECTION_MATCH}
  JOIN CARTEIRA_SCOPE CS ON ${RAW_CARTEIRA_MATCH}
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
),
DEVOLUCOES_ATRIBUIDAS AS (
  SELECT D.*
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN BU_SCOPE B ON ${DEV_SECTION_MATCH}
  JOIN CARTEIRA_SCOPE CS ON ${DEV_CARTEIRA_MATCH}
)
`;

const dashboardKpisCode = `WITH ${COMMON_CTE},
  VENDAS_MES_ATUAL AS (
    SELECT COALESCE(SUM(V.TOTAL), 0) AS VENDAS_BRUTAS_MES
    FROM VENDAS_ATRIBUIDAS V
    WHERE V.ANO = YEAR(CURRENT_DATE)
      AND V.MES = MONTH(CURRENT_DATE)
  ),
  DEVOLUCOES_MES_ATUAL AS (
    SELECT COALESCE(SUM(D.VALOR_DEVOLVIDO), 0) AS DEVOLUCOES_MES
    FROM DEVOLUCOES_ATRIBUIDAS D
    WHERE SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 7) = DATE_FORMAT(CURRENT_DATE, '%Y-%m')
  )
  SELECT
    ROUND(V.VENDAS_BRUTAS_MES - D.DEVOLUCOES_MES, 2) AS VENDAS_MES,
    ROUND(V.VENDAS_BRUTAS_MES, 2) AS VENDAS_BRUTAS_MES,
    ROUND(D.DEVOLUCOES_MES, 2) AS DEVOLUCOES_MES,
    (
      SELECT COALESCE(SUM(M.VALOR_META), 0)
      FROM METAS M
      WHERE M.MES = MONTH(CURRENT_DATE)
        AND M.ANO = YEAR(CURRENT_DATE)
        AND M.VENDEDOR_ID = :VAR_USER
    ) AS META_MES,
    (
      SELECT COUNT(*)
      FROM VISITAS VI
      WHERE VI.VENDEDOR_ID = :VAR_USER
        AND VI.STATUS = 'CONCLUIDA'
        AND SUBSTRING(VI.DATA_AGENDADA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
    ) AS VISITAS_MES,
    (
      SELECT COUNT(DISTINCT EC.ID_CLIENTE)
      FROM EQUIPE_CLIENTE EC
      JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
      WHERE C.STATUS = 'ATIVO'
        AND EC.ID_VENDEDOR = :VAR_USER
    ) AS CLIENTES_ATIVOS
  FROM VENDAS_MES_ATUAL V
  CROSS JOIN DEVOLUCOES_MES_ATUAL D`;

const vendasMensaisCode = `WITH ${COMMON_CTE},
  VENDAS_MENSAL AS (
    SELECT
      V.ANO AS ANO,
      V.MES AS MES,
      ROUND(SUM(V.TOTAL), 2) AS VENDAS_BRUTAS
    FROM VENDAS_ATRIBUIDAS V
    GROUP BY V.ANO, V.MES
  ),
  DEVOLUCOES_MENSAL AS (
    SELECT
      CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED) AS ANO,
      CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED) AS MES,
      ROUND(SUM(D.VALOR_DEVOLVIDO), 2) AS DEVOLUCOES
    FROM DEVOLUCOES_ATRIBUIDAS D
    WHERE CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}'
    GROUP BY CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED),
             CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED)
  ),
  PERIODOS AS (
    SELECT ANO, MES FROM VENDAS_MENSAL
    UNION
    SELECT ANO, MES FROM DEVOLUCOES_MENSAL
  )
  SELECT
    P.ANO AS ANO,
    LPAD(P.MES, 2, '0') AS MES,
    CONCAT(P.ANO, '-', LPAD(P.MES, 2, '0')) AS PERIODO,
    0 AS META,
    COALESCE(V.VENDAS_BRUTAS, 0) AS VENDAS_BRUTAS,
    COALESCE(D.DEVOLUCOES, 0) AS DEVOLUCOES,
    ROUND(COALESCE(V.VENDAS_BRUTAS, 0) - COALESCE(D.DEVOLUCOES, 0), 2) AS REALIZADO
  FROM PERIODOS P
  LEFT JOIN VENDAS_MENSAL V ON V.ANO = P.ANO AND V.MES = P.MES
  LEFT JOIN DEVOLUCOES_MENSAL D ON D.ANO = P.ANO AND D.MES = P.MES
  ORDER BY P.ANO, P.MES`;

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

async function updateNamedSf(serverFunctionId, expectedName, code, description) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentName = current?.result?.name;
  if (currentName !== expectedName) {
    throw new Error(`SF ${serverFunctionId} esperada ${expectedName}, encontrada ${currentName || 'sem nome'}.`);
  }

  await updateServerFunctionMitra({ projectId, serverFunctionId, code, description });
}

async function smoke(serverFunctionId, input = {}) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou: ${error || status}`);
  }
  return extractRows(response);
}

async function main() {
  await updateNamedSf(
    1,
    'dashboardKpis',
    dashboardKpisCode,
    'KPIs do dashboard inicial com performance de venda liquida (vendas - devolucoes) atribuida por BU_VENDEDOR + carteira.',
  );
  await updateNamedSf(
    2,
    'vendasMensais',
    vendasMensaisCode,
    'Serie mensal do dashboard inicial com realizado liquido (vendas - devolucoes) atribuido por BU_VENDEDOR + carteira.',
  );

  const kpis = await smoke(1);
  const serie = await smoke(2);
  console.log(`dashboardKpis OK (${kpis.length} linha). vendasMensais OK (${serie.length} linhas).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar dashboard de vendas liquidas:');
  console.error(error?.message || error);
  process.exit(1);
});
