import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra, executeServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 104;

function rowsFromExecution(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return [];
    }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  return [];
}

const oldAnterior = `BASE_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        R.CLIENTE_ID,
        ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_ANTERIOR
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      JOIN INPUTS I ON 1 = 1
      JOIN PERIODO_ANTERIOR PA ON 1 = 1
      JOIN BU_SCOPE B ON 
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
      JOIN CARTEIRA_SCOPE CS ON CS.TARGET_USER_ID = B.TARGET_USER_ID
        AND (
          (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
          OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
        )
      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
      LEFT JOIN CLIENTES_RAMO CR_FILTRO ON CR_FILTRO.CODCLI = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.ANO = PA.ANO_ANT
        AND R.MES = PA.MES_ANT
        AND R.SEMANA_NUMERO = I.SEMANA_REF
        AND R.CLIENTE_ID IS NOT NULL
        AND (I.SEGMENTO_PARAM IS NULL OR UPPER(R.SEGMENTO) = I.SEGMENTO_PARAM)
        AND (I.CODFILIAL_PARAM IS NULL OR TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = I.CODFILIAL_PARAM)
        AND (I.IDSECAO_PARAM IS NULL OR COALESCE(R.ID_SECAO, R.CODSECAO) = I.IDSECAO_PARAM)
        AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR_FILTRO.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID
    )`;

const newAnterior = `BASE_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        R.CLIENTE_ID,
        R.SEMANA_NUMERO,
        ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      JOIN INPUTS I ON 1 = 1
      JOIN PERIODO_ANTERIOR PA ON 1 = 1
      JOIN BU_SCOPE B ON 
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
      JOIN CARTEIRA_SCOPE CS ON CS.TARGET_USER_ID = B.TARGET_USER_ID
        AND (
          (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
          OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
        )
      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
      LEFT JOIN CLIENTES_RAMO CR_FILTRO ON CR_FILTRO.CODCLI = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.ANO = PA.ANO_ANT
        AND R.MES = PA.MES_ANT
        AND R.CLIENTE_ID IS NOT NULL
        AND (I.SEGMENTO_PARAM IS NULL OR UPPER(R.SEGMENTO) = I.SEGMENTO_PARAM)
        AND (I.CODFILIAL_PARAM IS NULL OR TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = I.CODFILIAL_PARAM)
        AND (I.IDSECAO_PARAM IS NULL OR COALESCE(R.ID_SECAO, R.CODSECAO) = I.IDSECAO_PARAM)
        AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR_FILTRO.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID, R.SEMANA_NUMERO
    ),
    SEMANAS_ANTERIOR AS (
      SELECT
        VENDEDOR_ID,
        CLIENTE_ID,
        SUM(CASE WHEN SEMANA_NUMERO = 1 THEN VALOR ELSE 0 END) AS SEM_1_ANT,
        SUM(CASE WHEN SEMANA_NUMERO = 2 THEN VALOR ELSE 0 END) AS SEM_2_ANT,
        SUM(CASE WHEN SEMANA_NUMERO = 3 THEN VALOR ELSE 0 END) AS SEM_3_ANT,
        SUM(CASE WHEN SEMANA_NUMERO = 4 THEN VALOR ELSE 0 END) AS SEM_4_ANT,
        SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5_ANT
      FROM BASE_ANTERIOR_RAW
      GROUP BY VENDEDOR_ID, CLIENTE_ID
    ),
    SEMANA_ANTERIOR AS (
      SELECT BAR.VENDEDOR_ID, BAR.CLIENTE_ID, SUM(BAR.VALOR) AS VALOR_ANTERIOR
      FROM BASE_ANTERIOR_RAW BAR
      JOIN INPUTS I ON 1 = 1
      WHERE BAR.SEMANA_NUMERO = I.SEMANA_REF
      GROUP BY BAR.VENDEDOR_ID, BAR.CLIENTE_ID
    )`;

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current?.result?.code || '';
  if (!code.includes(oldAnterior)) throw new Error('Trecho BASE_ANTERIOR_RAW esperado nao encontrado.');

  let nextCode = code.replace(oldAnterior, newAnterior);
  nextCode = nextCode.replace(
    `COALESCE(SM.SEM_1, 0) AS SEM_1,
      COALESCE(SM.SEM_2, 0) AS SEM_2,
      COALESCE(SM.SEM_3, 0) AS SEM_3,
      COALESCE(SM.SEM_4, 0) AS SEM_4,
      COALESCE(SM.SEM_5, 0) AS SEM_5,`,
    `COALESCE(SM.SEM_1, 0) AS SEM_1,
      CASE WHEN COALESCE(SA3.SEM_1_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_1, 0) - SA3.SEM_1_ANT) / SA3.SEM_1_ANT, 4) END AS DELTA_BW_SEM_1,
      COALESCE(SM.SEM_2, 0) AS SEM_2,
      CASE WHEN COALESCE(SA3.SEM_2_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_2, 0) - SA3.SEM_2_ANT) / SA3.SEM_2_ANT, 4) END AS DELTA_BW_SEM_2,
      COALESCE(SM.SEM_3, 0) AS SEM_3,
      CASE WHEN COALESCE(SA3.SEM_3_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_3, 0) - SA3.SEM_3_ANT) / SA3.SEM_3_ANT, 4) END AS DELTA_BW_SEM_3,
      COALESCE(SM.SEM_4, 0) AS SEM_4,
      CASE WHEN COALESCE(SA3.SEM_4_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_4, 0) - SA3.SEM_4_ANT) / SA3.SEM_4_ANT, 4) END AS DELTA_BW_SEM_4,
      COALESCE(SM.SEM_5, 0) AS SEM_5,
      CASE WHEN COALESCE(SA3.SEM_5_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_5, 0) - SA3.SEM_5_ANT) / SA3.SEM_5_ANT, 4) END AS DELTA_BW_SEM_5,`,
  );
  nextCode = nextCode.replace(
    `LEFT JOIN SEMANA_ATUAL SA ON SA.VENDEDOR_ID = BC.VENDEDOR_ID AND SA.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN BASE_ANTERIOR_RAW SA2 ON SA2.VENDEDOR_ID = BC.VENDEDOR_ID AND SA2.CLIENTE_ID = BC.CLIENTE_ID`,
    `LEFT JOIN SEMANA_ATUAL SA ON SA.VENDEDOR_ID = BC.VENDEDOR_ID AND SA.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANAS_ANTERIOR SA3 ON SA3.VENDEDOR_ID = BC.VENDEDOR_ID AND SA3.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ANTERIOR SA2 ON SA2.VENDEDOR_ID = BC.VENDEDOR_ID AND SA2.CLIENTE_ID = BC.CLIENTE_ID`,
  );

  if (!nextCode.includes('DELTA_BW_SEM_1') || !nextCode.includes('SEMANAS_ANTERIOR')) {
    throw new Error('Patch de B/W semanal nao foi aplicado.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: current?.result?.description || 'Calcula B/W semanal por carteira e escopo.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { mes: '5', ano: '2026', semanaNumero: '3' },
  });
  const rows = rowsFromExecution(smoke);
  const first = rows[0] || {};
  console.log(JSON.stringify({
    updated: true,
    smokeRows: rows.length,
    sampleDeltas: {
      DELTA_BW_SEM_1: first.DELTA_BW_SEM_1,
      DELTA_BW_SEM_2: first.DELTA_BW_SEM_2,
      DELTA_BW_SEM_3: first.DELTA_BW_SEM_3,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar B/W semanal da SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
