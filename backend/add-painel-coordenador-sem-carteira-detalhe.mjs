import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

const projectId = Number(process.env.MITRA_PROJECT_ID);

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const payload = raw.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
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

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

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

const semCarteiraDetalheCode = `
WITH
PARAMS AS (
  SELECT
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF
),
PERIODO AS (
  SELECT
    P.MES_REF,
    P.ANO_REF,
    DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS DATA_INICIO,
    DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d') AS DATA_FIM
  FROM PARAMS P
),
COORD AS (
  SELECT
    C.COD_SUPERVISOR,
    C.NOME,
    C.EMAIL,
    C.USER_ID
  FROM COORDENADORES C
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
  LIMIT 1
),
ESCOPO_BU AS (
  SELECT DISTINCT
    CB.COD_SUPERVISOR,
    CB.CODFILIAL,
    CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
CLIENTE_MAP AS (
  SELECT
    MIN(C.ID) AS ID,
    TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
  FROM CLIENTES C
  WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
  GROUP BY TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR))
),
CLIENTES_COM_CARTEIRA AS (
  SELECT DISTINCT EC.ID_CLIENTE
  FROM EQUIPE_CLIENTE EC
),
VENDAS_SEM_CARTEIRA AS (
  SELECT
    V.AUTO_ID,
    V.NUMPED,
    SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) AS DATA_VENDA,
    TRIM(CAST(V.CODFILIAL AS CHAR)) AS CODFILIAL,
    V.CODEPTO,
    V.CODSEC,
    V.COD_RCA,
    COALESCE(NULLIF(TRIM(CAST(V.RCA AS CHAR)), ''), CONCAT('RCA ', V.COD_RCA)) AS RCA,
    V.CODCLI,
    COALESCE(NULLIF(TRIM(CAST(V.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', V.CODCLI)) AS CLIENTE,
    COALESCE(V.TOTAL, 0) AS TOTAL,
    CCLI.ID AS ID_CLIENTE_INTERNO,
    E.COD_SUPERVISOR
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PERIODO P ON 1 = 1
  JOIN ESCOPO_BU E
    ON TRIM(CAST(V.CODFILIAL AS CHAR)) = CAST(E.CODFILIAL AS CHAR)
   AND V.CODEPTO = E.CODEPTO
  LEFT JOIN CLIENTE_MAP CCLI ON CCLI.CODCLI = TRIM(CAST(V.CODCLI AS CHAR))
  LEFT JOIN CLIENTES_COM_CARTEIRA CCG ON CCG.ID_CLIENTE = CCLI.ID
  WHERE SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= P.DATA_INICIO
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < P.DATA_FIM
    AND CCG.ID_CLIENTE IS NULL
)
SELECT
  DATA_VENDA,
  NUMPED,
  CODCLI,
  CLIENTE,
  CODFILIAL,
  CODEPTO,
  CODSEC,
  COD_RCA,
  RCA,
  ROUND(TOTAL, 2) AS TOTAL,
  CASE
    WHEN ID_CLIENTE_INTERNO IS NULL THEN 'Cliente sem mapeamento interno'
    ELSE 'Cliente sem carteira em EQUIPE_CLIENTE'
  END AS MOTIVO_SEM_CARTEIRA,
  COUNT(*) OVER () AS TOTAL_REGISTROS,
  ROUND(SUM(TOTAL) OVER (), 2) AS TOTAL_SEM_CARTEIRA
FROM VENDAS_SEM_CARTEIRA
ORDER BY TOTAL DESC, DATA_VENDA DESC, NUMPED DESC
LIMIT {{limit}} OFFSET {{offset}}
`;

async function upsertServerFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const found = existing.find((item) => item.name === 'painelCoordenadorSemCarteiraDetalhe');

  if (found) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: found.id,
      code: semCarteiraDetalheCode,
      description: 'Detalhamento pedido a pedido das vendas sem carteira no escopo de BU e filial do coordenador.',
    });
    return found.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: 'painelCoordenadorSemCarteiraDetalhe',
    type: 'SQL',
    code: semCarteiraDetalheCode,
    description: 'Detalhamento pedido a pedido das vendas sem carteira no escopo de BU e filial do coordenador.',
  });

  return extractSfId(created);
}

async function main() {
  const id = await upsertServerFunction();
  if (!id) throw new Error('Nao foi possivel obter o ID da SF painelCoordenadorSemCarteiraDetalhe.');

  const now = new Date();
  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      mes: String(now.getMonth() + 1),
      ano: String(now.getFullYear()),
      limit: '5',
      offset: '0',
    },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`Smoke da SF painelCoordenadorSemCarteiraDetalhe falhou: ${error || status}`);
  }

  console.log(JSON.stringify({
    painelCoordenadorSemCarteiraDetalhe: id,
    smokeStatus: status,
    smokeLinhas: extractRows(smoke).length,
  }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar detalhe de SEM CARTEIRA do Painel Coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
