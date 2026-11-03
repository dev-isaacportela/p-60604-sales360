import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ANALYTICS_IDS = [181, 182, 183, 184, 185, 186, 187, 188];

const scopeOptionsSql = `
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
    COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(B.NOME), ''), CONCAT('Departamento ', BV.BU_CODIGO)) AS DEPARTAMENTO,
    BV.ID_SECAO,
    COALESCE(NULLIF(TRIM(S.NOME_SECAO), ''), CONCAT('Seção ', BV.ID_SECAO)) AS SECAO,
    CASE WHEN BV.VENDEDOR_ID = :VAR_USER THEN 1 ELSE 0 END AS IS_OWN_SCOPE,
    CASE WHEN C.AUTO_ID IS NULL THEN 0 ELSE 1 END AS IS_COORDENADOR
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN BU B ON TRIM(CAST(B.CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  LEFT JOIN COORDENADORES C ON C.USER_ID = BV.VENDEDOR_ID AND COALESCE(C.ATIVO, TRUE) = TRUE
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
  SECAO,
  IS_OWN_SCOPE,
  IS_COORDENADOR
FROM VENDEDORES_SCOPE_RAW
ORDER BY RCA, CODFILIAL, CODEPTO, ID_SECAO
`;

const globalTargetUsersUnion = `

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

function patchScopeMode(code) {
  return code
    .replaceAll("'TEAM', 'SELLER'", "'TEAM', 'SELLER', 'GLOBAL'")
    .replaceAll("'ME', 'TEAM', 'SELLER'", "'ME', 'TEAM', 'SELLER', 'GLOBAL'");
}

function patchTargetUsers(code) {
  if (!code.includes('INPUT_SCOPE AS') || !code.includes('TARGET_USERS AS') || code.includes("I.SCOPE_MODE = 'GLOBAL'")) return code;
  const marker = '),\nBU_SCOPE AS';
  const targetStart = code.indexOf('TARGET_USERS AS (');
  const end = code.indexOf(marker, targetStart);
  if (targetStart === -1 || end === -1) return code;
  return `${code.slice(0, end)}${globalTargetUsersUnion}${code.slice(end)}`;
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

async function smoke(id) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      scopeMode: 'GLOBAL',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      filiais: '',
      departamentos: '',
      secoes: '',
      ramos: '',
      cliente: '',
      limit: '5',
      offset: '0',
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    code: scopeOptionsSql,
    description: 'Lista vendedores/RCA e dimensões para escopo de vendedor, coordenador e diretoria.',
  });

  const updated = [];
  for (const id of ANALYTICS_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const original = current?.result?.code || '';
    const next = patchTargetUsers(patchScopeMode(original));
    if (next !== original) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: id,
        code: next,
        description: current?.result?.description || `Analytics ${id} com escopo global da diretoria`,
      });
      updated.push(id);
    }
  }

  const optionsRows = await smoke(158);
  console.log(`SF 158: escopo diretoria OK (${optionsRows} linha(s)).`);

  for (const id of [181, 182, 184, 188]) {
    const rows = await smoke(id);
    console.log(`SF ${id}: GLOBAL OK (${rows} linha(s)).`);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ativar visão global de diretoria no Analytics:');
  console.error(error?.message || error);
  process.exit(1);
});
