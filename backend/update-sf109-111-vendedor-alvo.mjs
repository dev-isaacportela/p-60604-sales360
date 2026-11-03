import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

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

const BASE_SCOPE_CTE = `
WITH INPUTS AS (
  SELECT
    CASE WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN CAST('{{vendedorId}}' AS UNSIGNED) ELSE NULL END AS VENDEDOR_PARAM,
    CASE WHEN '{{ID_CLIENTE}}' REGEXP '^[0-9]+$' THEN CAST('{{ID_CLIENTE}}' AS UNSIGNED) ELSE 0 END AS CLIENTE_PARAM,
    CASE WHEN '{{ANO}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ANO}}' AS UNSIGNED) ELSE NULL END AS ANO_PARAM,
    CASE WHEN '{{MES}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{MES}}' AS UNSIGNED) ELSE NULL END AS MES_PARAM,
    CASE WHEN '{{SEMANA_NUMERO}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{SEMANA_NUMERO}}' AS UNSIGNED) ELSE NULL END AS SEMANA_PARAM
),
TARGET_USER AS (
  SELECT COALESCE(I.VENDEDOR_PARAM, :VAR_USER) AS USER_ID
  FROM INPUTS I
),
CARTEIRA_SCOPE AS (
  SELECT DISTINCT EC.ID_CLIENTE
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  JOIN TARGET_USER TU ON 1 = 1
  WHERE (EC.ID_VENDEDOR = TU.USER_ID OR F.ID_SUBSTITUTO = TU.USER_ID)
),
RCA_SCOPE AS (
  SELECT DISTINCT VR.COD_RCA
  FROM VENDEDOR_RCA VR
  JOIN TARGET_USER TU ON TU.USER_ID = VR.USER_ID

  UNION

  SELECT DISTINCT VR.COD_RCA
  FROM FUNCIONARIOS F
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = F.ID
  JOIN TARGET_USER TU ON TU.USER_ID = F.ID_SUBSTITUTO
),
ESCOPO_RCA_DEPTO AS (
  SELECT DISTINCT
    RD.COD_RCA,
    TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) AS CODEPTO
  FROM RCA_DEPARTAMENTO RD
  JOIN RCA_SCOPE RS ON RS.COD_RCA = RD.COD_RCA
  WHERE COALESCE(RD.ATIVO, TRUE) = TRUE
),
BASE_RAW AS (
  SELECT R.*
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN INPUTS I ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  JOIN ESCOPO_RCA_DEPTO E
    ON E.COD_RCA = R.COD_RCA
    AND E.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.CLIENTE_ID = I.CLIENTE_PARAM
    AND (I.ANO_PARAM IS NULL OR R.ANO = I.ANO_PARAM)
    AND (I.MES_PARAM IS NULL OR R.MES = I.MES_PARAM)
)
`;

const SF109_CODE = `
${BASE_SCOPE_CTE}
SELECT
  R.ANO,
  R.MES,
  R.SEMANA_NUMERO,
  DATE_FORMAT(MIN(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_INICIO_SEMANA,
  DATE_FORMAT(MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_FIM_SEMANA,
  COUNT(DISTINCT COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))) AS TOTAL_PEDIDOS,
  ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_SEMANA
FROM BASE_RAW R
GROUP BY R.ANO, R.MES, R.SEMANA_NUMERO
ORDER BY R.ANO DESC, R.MES DESC, R.SEMANA_NUMERO DESC
`;

const SF110_CODE = `
${BASE_SCOPE_CTE}
SELECT
  R.CODPROD,
  R.DESCRICAO AS DESCRICAO_PRODUTO,
  ROUND(SUM(COALESCE(R.QT, 0)), 6) AS QT_TOTAL_SEMANA,
  ROUND(
    CASE
      WHEN SUM(COALESCE(R.QT, 0)) = 0 THEN 0
      ELSE SUM(COALESCE(R.TOTAL, 0)) / SUM(COALESCE(R.QT, 0))
    END,
    6
  ) AS VALOR_UNITARIO,
  ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_PRODUTO_SEMANA
FROM BASE_RAW R
JOIN INPUTS I ON 1 = 1
WHERE (I.SEMANA_PARAM IS NULL OR R.SEMANA_NUMERO = I.SEMANA_PARAM)
GROUP BY R.CODPROD, R.DESCRICAO
ORDER BY R.CODPROD
`;

const SF111_CODE = `
${BASE_SCOPE_CTE}
SELECT
  COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR)) AS NUMPEDIDO,
  ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_PEDIDO,
  DATE_FORMAT(MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_PEDIDO
FROM BASE_RAW R
JOIN INPUTS I ON 1 = 1
WHERE (I.SEMANA_PARAM IS NULL OR R.SEMANA_NUMERO = I.SEMANA_PARAM)
GROUP BY COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))
ORDER BY DATA_PEDIDO DESC, NUMPEDIDO DESC
`;

async function updateSf(serverFunctionId, code, fallbackDescription) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code,
    description: current?.result?.description || fallbackDescription,
  });
  console.log(`SF ${serverFunctionId} atualizada.`);
}

async function main() {
  await updateSf(109, SF109_CODE, 'Detalhe semanal por cliente com vendedor alvo.');
  await updateSf(110, SF110_CODE, 'Detalhe de itens da semana por cliente com vendedor alvo.');
  await updateSf(111, SF111_CODE, 'Resumo de pedidos da semana por cliente com vendedor alvo.');
  console.log('SFs 109/110/111 atualizadas com suporte a vendedor alvo.');
}

main().catch((error) => {
  console.error('Falha ao atualizar SFs de detalhe semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
