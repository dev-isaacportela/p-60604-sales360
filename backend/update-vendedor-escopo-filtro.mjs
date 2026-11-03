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

const code = `
WITH
COORD AS (
  SELECT C.COD_SUPERVISOR
  FROM COORDENADORES C
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
  LIMIT 1
),
ESCOPO_COORD AS (
  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
ESCOPO_BASE AS (
  SELECT DISTINCT
    VR.USER_ID,
    VR.COD_RCA,
    COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(B.NOME), ''), CONCAT('Departamento ', BV.BU_CODIGO)) AS DEPARTAMENTO,
    BV.ID_SECAO,
    COALESCE(NULLIF(TRIM(S.NOME_SECAO), ''), CONCAT('Seção ', BV.ID_SECAO)) AS SECAO,
    CASE WHEN BV.VENDEDOR_ID = :VAR_USER THEN 1 ELSE 0 END AS IS_OWN_SCOPE,
    CASE WHEN C2.USER_ID IS NOT NULL THEN 1 ELSE 0 END AS IS_COORDENADOR
  FROM BU_VENDEDOR BV
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN INT_USER U ON U.ID = VR.USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN BU B ON TRIM(CAST(B.CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  LEFT JOIN COORDENADORES C2 ON C2.USER_ID = BV.VENDEDOR_ID AND COALESCE(C2.ATIVO, TRUE) = TRUE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (
      EXISTS (
        SELECT 1
        FROM ESCOPO_COORD E
        WHERE TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
      )
      OR BV.VENDEDOR_ID = :VAR_USER
    )
)
SELECT
  USER_ID,
  COD_RCA,
  RCA,
  CODFILIAL,
  CODEPTO,
  DEPARTAMENTO,
  ID_SECAO,
  SECAO,
  IS_OWN_SCOPE,
  IS_COORDENADOR
FROM ESCOPO_BASE
ORDER BY IS_OWN_SCOPE DESC, IS_COORDENADOR DESC, RCA, CODFILIAL, CODEPTO, ID_SECAO
`;

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
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    code,
    description: 'Lista escopos de coordenador e marca coordenadores ativos para filtros e metas semanais.',
  });

  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    input: {},
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  console.log(`SF 158 atualizada: ${extractRows(response).length} escopo(s) disponível(is).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar filtro de escopo para vendedores:');
  console.error(error?.message || error);
  process.exit(1);
});
