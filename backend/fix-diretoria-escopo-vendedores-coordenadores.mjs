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
PERMISSAO AS (
  SELECT
    CASE
      WHEN UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA') THEN 1
      WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
      ELSE 0
    END AS PODE_DIRETORIA,
    C.COD_SUPERVISOR
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  LEFT JOIN COORDENADORES C ON C.USER_ID = U.ID AND COALESCE(C.ATIVO, TRUE) = TRUE
  WHERE U.ID = :VAR_USER
),
ESCOPO_BU AS (
  SELECT DISTINCT BV.CODFILIAL, BV.BU_CODIGO AS CODEPTO
  FROM BU_VENDEDOR BV
  JOIN PERMISSAO P ON P.PODE_DIRETORIA = 1
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE

  UNION

  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN PERMISSAO P ON P.COD_SUPERVISOR = CB.COD_SUPERVISOR

  UNION

  SELECT DISTINCT BV.CODFILIAL, BV.BU_CODIGO AS CODEPTO
  FROM BU_VENDEDOR BV
  WHERE BV.VENDEDOR_ID = :VAR_USER
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
),
VENDEDORES_SCOPE_RAW AS (
  SELECT DISTINCT
    VR.USER_ID,
    VR.COD_RCA,
    COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(B.NOME), ''), CONCAT('Departamento ', BV.BU_CODIGO)) AS DEPARTAMENTO,
    CB.COD_SUPERVISOR,
    COALESCE(NULLIF(TRIM(CU.NOME), ''), NULLIF(TRIM(CU.DESCR), ''), CONCAT('Coordenador ', CB.COD_SUPERVISOR)) AS COORDENADOR,
    BV.ID_SECAO,
    COALESCE(NULLIF(TRIM(S.NOME_SECAO), ''), CONCAT('Seção ', BV.ID_SECAO)) AS SECAO,
    CASE WHEN BV.VENDEDOR_ID = :VAR_USER THEN 1 ELSE 0 END AS IS_OWN_SCOPE,
    CASE WHEN C2.AUTO_ID IS NULL THEN 0 ELSE 1 END AS IS_COORDENADOR
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN INT_USER U ON U.ID = VR.USER_ID
  LEFT JOIN COORDENADORES_BU CB
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN COORDENADORES C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR AND COALESCE(C.ATIVO, TRUE) = TRUE
  LEFT JOIN INT_USER CU ON CU.ID = C.USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN BU B ON TRIM(CAST(B.CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  LEFT JOIN COORDENADORES C2 ON C2.USER_ID = BV.VENDEDOR_ID AND COALESCE(C2.ATIVO, TRUE) = TRUE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (
      EXISTS (SELECT 1 FROM PERMISSAO P_DIR WHERE P_DIR.PODE_DIRETORIA = 1)
      OR C2.AUTO_ID IS NULL
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
  COD_SUPERVISOR,
  COORDENADOR,
  ID_SECAO,
  SECAO,
  IS_OWN_SCOPE,
  IS_COORDENADOR
FROM VENDEDORES_SCOPE_RAW
ORDER BY COORDENADOR, RCA, CODFILIAL, CODEPTO, ID_SECAO
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
    description: 'Lista vendedores/RCA, coordenadores e dimensões para escopo de vendedor, coordenador e diretoria.',
  });

  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    input: {},
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  const rows = extractRows(response);
  const coordenadores = new Set(rows.map((row) => String(row.COD_SUPERVISOR || '').trim()).filter(Boolean));
  const vendedores = new Set(rows.map((row) => String(row.COD_RCA || '').trim()).filter(Boolean));
  console.log(`SF 158 corrigida: ${vendedores.size} vendedor(es) e ${coordenadores.size} coordenador(es) no escopo atual.`);
}

main().catch((error) => {
  console.error('Falha ao corrigir escopo da diretoria:');
  console.error(error?.message || error);
  process.exit(1);
});
