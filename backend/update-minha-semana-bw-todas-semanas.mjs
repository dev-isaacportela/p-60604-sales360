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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DEV_WEEK_EXPR = "LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7)))";

function assertExpected(code) {
  const required = ['SEM_1_ANTERIOR', 'DELTA_BW_SEM_1', 'SEMANAS_ANTERIOR', 'SEMANA_ANTERIOR'];
  for (const token of required) {
    if (!code.includes(token)) throw new Error(`SF 104 sem trecho esperado: ${token}`);
  }
}

function transformSf104(code) {
  if (/DELTA_BW_SEM_1/i.test(code)) {
    assertExpected(code);
    return code;
  }

  let next = code;

  next = next.replace(
    `    BASE_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        R.CLIENTE_ID,
        ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_ANTERIOR`,
    `    BASE_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        R.CLIENTE_ID,
        R.SEMANA_NUMERO,
        ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_ANTERIOR`,
  );

  next = next.replace(
    `        AND R.SEMANA_NUMERO = I.SEMANA_REF
        AND R.CLIENTE_ID IS NOT NULL`,
    `        AND R.CLIENTE_ID IS NOT NULL`,
  );

  next = next.replace(
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID
    ),
    DEVOLUCOES_ANTERIOR_RAW AS (`,
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID, R.SEMANA_NUMERO
    ),
    DEVOLUCOES_ANTERIOR_RAW AS (`,
  );

  next = next.replace(
    `    DEVOLUCOES_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        CD.ID AS CLIENTE_ID,
        ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR_ANTERIOR`,
    `    DEVOLUCOES_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        CD.ID AS CLIENTE_ID,
        ${DEV_WEEK_EXPR} AS SEMANA_NUMERO,
        ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR_ANTERIOR`,
  );

  next = next.replace(
    `        AND ${DEV_WEEK_EXPR} = I.SEMANA_REF
        AND (I.SEGMENTO_PARAM IS NULL`,
    `        AND (I.SEGMENTO_PARAM IS NULL`,
  );

  next = next.replace(
    `      GROUP BY B.TARGET_USER_ID, CD.ID
    ),
    BASE_ANTERIOR_LIQUIDA AS (
      SELECT VENDEDOR_ID, CLIENTE_ID, ROUND(SUM(VALOR_ANTERIOR), 2) AS VALOR_ANTERIOR
      FROM (
        SELECT VENDEDOR_ID, CLIENTE_ID, VALOR_ANTERIOR FROM BASE_ANTERIOR_RAW
        UNION ALL
        SELECT VENDEDOR_ID, CLIENTE_ID, VALOR_ANTERIOR FROM DEVOLUCOES_ANTERIOR_RAW
      ) MOV
      GROUP BY VENDEDOR_ID, CLIENTE_ID
    )
    SELECT`,
    `      GROUP BY B.TARGET_USER_ID, CD.ID, ${DEV_WEEK_EXPR}
    ),
    BASE_ANTERIOR_LIQUIDA AS (
      SELECT VENDEDOR_ID, CLIENTE_ID, SEMANA_NUMERO, ROUND(SUM(VALOR_ANTERIOR), 2) AS VALOR_ANTERIOR
      FROM (
        SELECT VENDEDOR_ID, CLIENTE_ID, SEMANA_NUMERO, VALOR_ANTERIOR FROM BASE_ANTERIOR_RAW
        UNION ALL
        SELECT VENDEDOR_ID, CLIENTE_ID, SEMANA_NUMERO, VALOR_ANTERIOR FROM DEVOLUCOES_ANTERIOR_RAW
      ) MOV
      GROUP BY VENDEDOR_ID, CLIENTE_ID, SEMANA_NUMERO
    ),
    SEMANAS_ANTERIOR AS (
      SELECT
        VENDEDOR_ID,
        CLIENTE_ID,
        SUM(CASE WHEN SEMANA_NUMERO = 1 THEN VALOR_ANTERIOR ELSE 0 END) AS SEM_1_ANTERIOR,
        SUM(CASE WHEN SEMANA_NUMERO = 2 THEN VALOR_ANTERIOR ELSE 0 END) AS SEM_2_ANTERIOR,
        SUM(CASE WHEN SEMANA_NUMERO = 3 THEN VALOR_ANTERIOR ELSE 0 END) AS SEM_3_ANTERIOR,
        SUM(CASE WHEN SEMANA_NUMERO = 4 THEN VALOR_ANTERIOR ELSE 0 END) AS SEM_4_ANTERIOR,
        SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR_ANTERIOR ELSE 0 END) AS SEM_5_ANTERIOR
      FROM BASE_ANTERIOR_LIQUIDA
      GROUP BY VENDEDOR_ID, CLIENTE_ID
    ),
    SEMANA_ANTERIOR AS (
      SELECT BAL.VENDEDOR_ID, BAL.CLIENTE_ID, SUM(BAL.VALOR_ANTERIOR) AS VALOR_ANTERIOR
      FROM BASE_ANTERIOR_LIQUIDA BAL
      JOIN INPUTS I ON 1 = 1
      WHERE BAL.SEMANA_NUMERO = I.SEMANA_REF
      GROUP BY BAL.VENDEDOR_ID, BAL.CLIENTE_ID
    )
    SELECT`,
  );

  next = next.replace(
    `      COALESCE(SM.SEM_1, 0) AS SEM_1,
      COALESCE(SM.SEM_2, 0) AS SEM_2,
      COALESCE(SM.SEM_3, 0) AS SEM_3,
      COALESCE(SM.SEM_4, 0) AS SEM_4,
      COALESCE(SM.SEM_5, 0) AS SEM_5,
      COALESCE(SM.FECHAMENTO_MES, 0) AS FECHAMENTO_MES,`,
    `      COALESCE(SM.SEM_1, 0) AS SEM_1,
      COALESCE(SA_SEM.SEM_1_ANTERIOR, 0) AS SEM_1_ANTERIOR,
      CASE WHEN SA_SEM.SEM_1_ANTERIOR IS NULL OR SA_SEM.SEM_1_ANTERIOR = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_1, 0) - SA_SEM.SEM_1_ANTERIOR) / SA_SEM.SEM_1_ANTERIOR, 4) END AS DELTA_BW_SEM_1,
      COALESCE(SM.SEM_2, 0) AS SEM_2,
      COALESCE(SA_SEM.SEM_2_ANTERIOR, 0) AS SEM_2_ANTERIOR,
      CASE WHEN SA_SEM.SEM_2_ANTERIOR IS NULL OR SA_SEM.SEM_2_ANTERIOR = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_2, 0) - SA_SEM.SEM_2_ANTERIOR) / SA_SEM.SEM_2_ANTERIOR, 4) END AS DELTA_BW_SEM_2,
      COALESCE(SM.SEM_3, 0) AS SEM_3,
      COALESCE(SA_SEM.SEM_3_ANTERIOR, 0) AS SEM_3_ANTERIOR,
      CASE WHEN SA_SEM.SEM_3_ANTERIOR IS NULL OR SA_SEM.SEM_3_ANTERIOR = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_3, 0) - SA_SEM.SEM_3_ANTERIOR) / SA_SEM.SEM_3_ANTERIOR, 4) END AS DELTA_BW_SEM_3,
      COALESCE(SM.SEM_4, 0) AS SEM_4,
      COALESCE(SA_SEM.SEM_4_ANTERIOR, 0) AS SEM_4_ANTERIOR,
      CASE WHEN SA_SEM.SEM_4_ANTERIOR IS NULL OR SA_SEM.SEM_4_ANTERIOR = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_4, 0) - SA_SEM.SEM_4_ANTERIOR) / SA_SEM.SEM_4_ANTERIOR, 4) END AS DELTA_BW_SEM_4,
      COALESCE(SM.SEM_5, 0) AS SEM_5,
      COALESCE(SA_SEM.SEM_5_ANTERIOR, 0) AS SEM_5_ANTERIOR,
      CASE WHEN SA_SEM.SEM_5_ANTERIOR IS NULL OR SA_SEM.SEM_5_ANTERIOR = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_5, 0) - SA_SEM.SEM_5_ANTERIOR) / SA_SEM.SEM_5_ANTERIOR, 4) END AS DELTA_BW_SEM_5,
      COALESCE(SM.FECHAMENTO_MES, 0) AS FECHAMENTO_MES,`,
  );

  next = next.replace(
    `    LEFT JOIN SEMANAS_MES SM ON SM.VENDEDOR_ID = BC.VENDEDOR_ID AND SM.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ATUAL SA ON SA.VENDEDOR_ID = BC.VENDEDOR_ID AND SA.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN BASE_ANTERIOR_LIQUIDA SA2 ON SA2.VENDEDOR_ID = BC.VENDEDOR_ID AND SA2.CLIENTE_ID = BC.CLIENTE_ID`,
    `    LEFT JOIN SEMANAS_MES SM ON SM.VENDEDOR_ID = BC.VENDEDOR_ID AND SM.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANAS_ANTERIOR SA_SEM ON SA_SEM.VENDEDOR_ID = BC.VENDEDOR_ID AND SA_SEM.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ATUAL SA ON SA.VENDEDOR_ID = BC.VENDEDOR_ID AND SA.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ANTERIOR SA2 ON SA2.VENDEDOR_ID = BC.VENDEDOR_ID AND SA2.CLIENTE_ID = BC.CLIENTE_ID`,
  );

  next = next.replace(
    'Faturamento liquido: vendas menos devolucoes, com carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR',
    'Faturamento liquido com B/W por semana: cada semana compara vendas menos devolucoes contra a mesma semana do mes anterior, com carteira + BU_VENDEDOR',
  );

  assertExpected(next);
  return next;
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

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: 104 });
  const code = current?.result?.code || '';
  const nextCode = transformSf104(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: 104,
      code: nextCode,
      description: 'Calcula B/W semanal liquido para cada semana contra a mesma semana do mes anterior, exigindo territorio BU_VENDEDOR e carteira.',
    });
  }

  const smoke = await executeServerFunctionMitra({ projectId, serverFunctionId: 104, input: {} });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Status inesperado: ${status}`);
  }

  const rows = extractRows(smoke);
  const sample = rows[0] || {};
  console.log(JSON.stringify({
    changed: nextCode !== code,
    rows: rows.length,
    sample: {
      CLIENTE_ID: sample.CLIENTE_ID,
      DELTA_BW_SEM_1: sample.DELTA_BW_SEM_1,
      DELTA_BW_SEM_2: sample.DELTA_BW_SEM_2,
      DELTA_BW_SEM_3: sample.DELTA_BW_SEM_3,
      DELTA_BW_SEM_4: sample.DELTA_BW_SEM_4,
      DELTA_BW_SEM_5: sample.DELTA_BW_SEM_5,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar B/W por semana da Minha Semana:');
  console.error(error?.message || error);
  process.exit(1);
});
