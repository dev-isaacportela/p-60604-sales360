import 'dotenv/config';
import {
  configureSdkMitra,
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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function mustReplace(code, search, replacement, label) {
  if (!code.includes(search)) {
    throw new Error(`Trecho não encontrado para substituir: ${label}`);
  }
  return code.replace(search, replacement);
}

function updateSf104(code) {
  let next = code;

  next = mustReplace(
    next,
    `        WHEN P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NULL THEN VR.USER_ID
        ELSE :VAR_USER
      END AS USER_ID
    FROM INPUTS I
    CROSS JOIN PERMISSAO P
    LEFT JOIN VENDEDOR_RCA VR ON P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NULL`,
    `        WHEN P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NULL THEN BV.VENDEDOR_ID
        ELSE :VAR_USER
      END AS USER_ID
    FROM INPUTS I
    CROSS JOIN PERMISSAO P
    LEFT JOIN BU_VENDEDOR BV
      ON P.EH_GESTAO = 1
     AND I.VENDEDOR_PARAM IS NULL
     AND COALESCE(BV.ATIVO, TRUE) = TRUE`,
    'SF 104 TARGET_USERS por BU_VENDEDOR',
  );

  next = mustReplace(
    next,
    `RCA_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    VR.COD_RCA
  FROM TARGET_USERS TU
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = TU.USER_ID

  UNION

  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    VR.COD_RCA
  FROM TARGET_USERS TU
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = TU.USER_ID
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = F.ID
),
ESCOPO_RCA_DEPTO AS (
  SELECT DISTINCT
    RS.TARGET_USER_ID,
    RD.COD_RCA,
    TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) AS CODEPTO
  FROM RCA_SCOPE RS
  JOIN RCA_DEPARTAMENTO RD ON RD.COD_RCA = RS.COD_RCA
  WHERE COALESCE(RD.ATIVO, TRUE) = TRUE
),`,
    `BU_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM TARGET_USERS TU
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) <> ''
),
BU_MATCH_RAW AS (
  SELECT DISTINCT
    R.ID,
    B.TARGET_USER_ID
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN BU_SCOPE B
    ON B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
   AND B.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
   AND (B.ID_SECAO = COALESCE(R.ID_SECAO, R.CODSECAO) OR B.ID_SECAO IS NULL)
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
),`,
    'SF 104 escopo RCA por BU_MATCH_RAW',
  );

  const oldJoin = `  JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID
    AND E.COD_RCA = R.COD_RCA
    AND E.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))`;
  const newJoin = `  JOIN BU_MATCH_RAW BM ON BM.ID = R.ID
    AND BM.TARGET_USER_ID = CS.TARGET_USER_ID`;
  next = mustReplace(next, oldJoin, newJoin, 'SF 104 BASE_ATUAL_RAW BU match');
  next = mustReplace(next, oldJoin, newJoin, 'SF 104 BASE_ANTERIOR_RAW BU match');

  next = mustReplace(
    next,
    `'Escopo semanal robusto: carteira + COD_RCA + departamento por vendedor alvo' AS NOTA_ESCOPO`,
    `'Escopo semanal: carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR' AS NOTA_ESCOPO`,
    'SF 104 nota de escopo',
  );

  return next;
}

function updateDetailSf(code) {
  const currentScope = `TARGET_USER AS (
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
)`;

  const buScope = `TARGET_USERS AS (
  SELECT COALESCE(I.VENDEDOR_PARAM, :VAR_USER) AS USER_ID
  FROM INPUTS I

  UNION

  SELECT F.ID AS USER_ID
  FROM FUNCIONARIOS F
  JOIN INPUTS I ON F.ID_SUBSTITUTO = COALESCE(I.VENDEDOR_PARAM, :VAR_USER)
),
CARTEIRA_SCOPE AS (
  SELECT DISTINCT EC.ID_CLIENTE, TU.USER_ID AS TARGET_USER_ID
  FROM TARGET_USERS TU
  JOIN EQUIPE_CLIENTE EC ON 1 = 1
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE (EC.ID_VENDEDOR = TU.USER_ID OR F.ID_SUBSTITUTO = TU.USER_ID)
),
BU_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM TARGET_USERS TU
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) <> ''
),
BU_MATCH_RAW AS (
  SELECT DISTINCT
    R.ID,
    B.TARGET_USER_ID
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN BU_SCOPE B
    ON B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
   AND B.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
   AND (B.ID_SECAO = COALESCE(R.ID_SECAO, R.CODSECAO) OR B.ID_SECAO IS NULL)
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
),
BASE_RAW AS (
  SELECT DISTINCT R.*
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN INPUTS I ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  JOIN BU_MATCH_RAW BM ON BM.ID = R.ID
    AND BM.TARGET_USER_ID = CS.TARGET_USER_ID
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.CLIENTE_ID = I.CLIENTE_PARAM
    AND (I.ANO_PARAM IS NULL OR R.ANO = I.ANO_PARAM)
    AND (I.MES_PARAM IS NULL OR R.MES = I.MES_PARAM)
)`;

  return mustReplace(code, currentScope, buScope, 'SF detalhe escopo RCA por BU_VENDEDOR');
}

async function updateSf(id, transform, description) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
  const code = current?.result?.code || '';
  const nextCode = transform(code);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    code: nextCode,
    description,
  });

  return {
    id,
    name: current?.result?.name,
    removedCodRcaFilter: !/RCA_SCOPE|ESCOPO_RCA_DEPTO|RCA_DEPARTAMENTO/.test(nextCode),
    hasBuVendedor: /BU_VENDEDOR/.test(nextCode),
  };
}

async function main() {
  const updated = [];

  updated.push(await updateSf(
    104,
    updateSf104,
    'Calcula B/W semanal com atribuição por CODFILIAL + BU + seção via BU_VENDEDOR, sem filtro principal por COD_RCA.',
  ));
  updated.push(await updateSf(
    109,
    updateDetailSf,
    'Detalha vendas semanais do cliente com atribuição por CODFILIAL + BU + seção via BU_VENDEDOR.',
  ));
  updated.push(await updateSf(
    110,
    updateDetailSf,
    'Detalha itens da semana por cliente com atribuição por CODFILIAL + BU + seção via BU_VENDEDOR.',
  ));
  updated.push(await updateSf(
    111,
    updateDetailSf,
    'Resumo de pedidos da semana por cliente com atribuição por CODFILIAL + BU + seção via BU_VENDEDOR.',
  ));

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar SFs semanais para BU_VENDEDOR:');
  console.error(error?.message || error);
  process.exit(1);
});
