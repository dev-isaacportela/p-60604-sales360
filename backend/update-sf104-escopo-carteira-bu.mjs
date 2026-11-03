import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 104;

const oldEscopo = `ESCOPO AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.CODFILIAL,
    BV.BU_CODIGO AS CODEPTO,
    EC.ID_SECAO,
    T.TARGET_USER_ID
  FROM TARGET T
  JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = T.TARGET_USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
    AND BV.CODFILIAL = EC.CODFILIAL
    AND BV.ID_SECAO = EC.ID_SECAO
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
  JOIN PARAMS P ON 1 = 1
  WHERE (EC.ID_VENDEDOR = T.TARGET_USER_ID OR F.ID_SUBSTITUTO = T.TARGET_USER_ID)
    AND (P.FILIAL_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(EC.CODFILIAL AS CHAR)), REPLACE(P.FILIAL_PARAM, '|', ',')) > 0)
    AND (P.DEPTO_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(BV.BU_CODIGO AS CHAR)), REPLACE(P.DEPTO_PARAM, '|', ',')) > 0)
    AND (P.SECAO_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(EC.ID_SECAO AS CHAR)), REPLACE(P.SECAO_PARAM, '|', ',')) > 0)
),`;

const newEscopo = `ESCOPO AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    BV.CODFILIAL,
    BV.BU_CODIGO AS CODEPTO,
    BV.ID_SECAO,
    T.TARGET_USER_ID
  FROM TARGET T
  JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = T.TARGET_USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = T.TARGET_USER_ID
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
  JOIN PARAMS P ON 1 = 1
  WHERE (EC.ID_VENDEDOR = T.TARGET_USER_ID OR F.ID_SUBSTITUTO = T.TARGET_USER_ID)
    AND (P.FILIAL_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(BV.CODFILIAL AS CHAR)), REPLACE(P.FILIAL_PARAM, '|', ',')) > 0)
    AND (P.DEPTO_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(BV.BU_CODIGO AS CHAR)), REPLACE(P.DEPTO_PARAM, '|', ',')) > 0)
    AND (P.SECAO_PARAM IS NULL OR FIND_IN_SET(TRIM(CAST(BV.ID_SECAO AS CHAR)), REPLACE(P.SECAO_PARAM, '|', ',')) > 0)
),`;

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current?.result?.code || '';

  if (!code.includes(oldEscopo)) {
    throw new Error('CTE ESCOPO esperada não encontrada. Nenhuma alteração aplicada.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: code.replace(oldEscopo, newEscopo),
    description: 'Calcula B/W semanal alinhado ao escopo de carteira e BU do Analytics.',
  });

  console.log('SF 104 atualizada com escopo de carteira + BU alinhado ao Analytics.');
}

main().catch((error) => {
  console.error('Falha ao atualizar SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
