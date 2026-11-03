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

const TARGET_USER_IDS = [
  1, 2, 214,
  123, 124,
  181, 182, 183, 184, 185, 186, 187, 188,
];

const NEW_TARGET_USERS = `INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO
),
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT F.ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
)`;

function replaceTargetUsers(code) {
  const marker = '),\nBU_SCOPE AS';
  const inputStart = code.indexOf('INPUT_SCOPE AS (');
  const targetStart = code.indexOf('TARGET_USERS AS (');
  const start = inputStart !== -1 ? inputStart : targetStart;
  if (start === -1) return null;
  const end = code.indexOf(marker, start);
  if (end === -1) return null;
  return `${code.slice(0, start)}${NEW_TARGET_USERS}${code.slice(end + 1)}`;
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
    input: { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '', dataInicio: '2026-01-01', dataFim: '2026-01-31', departamentos: '', ramos: '', limit: '5', offset: '0', ANO: '2026', MES: '1' },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou no smoke: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  const updated = [];
  const skipped = [];

  for (const id of TARGET_USER_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const code = current?.result?.code || '';
    const nextCode = replaceTargetUsers(code);
    if (!nextCode || nextCode === code) {
      skipped.push(id);
      continue;
    }
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      code: nextCode,
      description: current?.result?.description || `SF ${id} com escopo de coordenador`,
    });
    updated.push(id);
  }

  for (const id of updated.slice(0, 4)) {
    const rows = await smoke(id);
    console.log(`SF ${id}: smoke OK (${rows} linha(s))`);
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar escopo de coordenador nas telas operacionais:');
  console.error(error?.message || error);
  process.exit(1);
});
