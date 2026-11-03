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
ESCOPO_BU AS (
  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
VENDEDORES_SCOPE_RAW AS (
  SELECT DISTINCT
    VR.USER_ID,
    VR.COD_RCA,
    COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(B.NOME), ''), CONCAT('Departamento ', BV.BU_CODIGO)) AS DEPARTAMENTO,
    BV.ID_SECAO,
    COALESCE(NULLIF(TRIM(S.NOME_SECAO), ''), CONCAT('Seção ', BV.ID_SECAO)) AS SECAO
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN BU B ON TRIM(CAST(B.CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
)
SELECT
  USER_ID,
  COD_RCA,
  RCA,
  CODFILIAL,
  CODEPTO,
  DEPARTAMENTO,
  ID_SECAO,
  SECAO
FROM VENDEDORES_SCOPE_RAW
ORDER BY RCA, CODFILIAL, CODEPTO, ID_SECAO
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
    description: 'Lista vendedores/RCA e dimensões de filial, departamento e seção dentro do escopo do coordenador logado.',
  });

  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    input: {},
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  console.log(`SF 158: opções de escopo OK (${extractRows(response).length} linha(s)).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar opções do filtro de escopo:');
  console.error(error?.message || error);
  process.exit(1);
});
