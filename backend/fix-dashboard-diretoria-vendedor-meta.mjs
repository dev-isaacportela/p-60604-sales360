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
const serverFunctionId = 182;

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

function patchSellerTargetForDirector(code) {
  const sellerBlockRegex = /SELECT DISTINCT BV\.VENDEDOR_ID AS USER_ID\s+FROM INPUT_SCOPE I\s+JOIN COORDENADORES C ON C\.USER_ID = :VAR_USER AND COALESCE\(C\.ATIVO, TRUE\) = TRUE\s+JOIN COORDENADORES_BU CB ON CB\.COD_SUPERVISOR = C\.COD_SUPERVISOR\s+JOIN BU_VENDEDOR BV\s+ON TRIM\(COALESCE\(CAST\(BV\.CODFILIAL AS CHAR\), ''\)\) = CAST\(CB\.CODFILIAL AS CHAR\)\s+AND TRIM\(CAST\(BV\.BU_CODIGO AS CHAR\)\) = CAST\(CB\.CODEPTO AS CHAR\)\s+LEFT JOIN VENDEDOR_RCA VR ON VR\.USER_ID = BV\.VENDEDOR_ID\s+WHERE I\.SCOPE_MODE = 'SELLER'[\s\S]*?(?=\n\n  UNION\n\n  SELECT DISTINCT BV\.VENDEDOR_ID AS USER_ID\s+FROM INPUT_SCOPE I\s+JOIN INT_USER U ON U\.ID = :VAR_USER)/;

  const replacement = `SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C
        JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
        WHERE C.USER_ID = :VAR_USER
          AND COALESCE(C.ATIVO, TRUE) = TRUE
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

  if (!sellerBlockRegex.test(code)) return code;
  return code.replace(sellerBlockRegex, replacement);
}

function patchMetaForTargetUsers(code) {
  return code.replace(
    'WHERE MBV.VENDEDOR_ID = :VAR_USER',
    'WHERE MBV.VENDEDOR_ID IN (SELECT USER_ID FROM TARGET_USERS)',
  );
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = String(current?.result?.code || '');
  if (current?.result?.name !== 'analyticsRcaMetaResumo') {
    throw new Error(`SF ${serverFunctionId} esperada analyticsRcaMetaResumo, encontrada ${current?.result?.name || 'sem nome'}.`);
  }

  const next = patchMetaForTargetUsers(patchSellerTargetForDirector(code));
  if (next === code) {
    console.log('Nenhuma alteração necessária em analyticsRcaMetaResumo.');
  } else {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId,
      code: next,
      description: current?.result?.description || 'Resumo de meta e faturamento por escopo.',
    });
    console.log('analyticsRcaMetaResumo atualizado para respeitar vendedor selecionado pela diretoria.');
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {
      scopeMode: 'SELLER',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      scopeCodSupervisor: '',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      departamentos: '',
      ramos: '',
      cliente: '',
      limit: '1',
      offset: '0',
    },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  console.log(`Smoke OK: ${extractRows(smoke).length} linha(s).`);
}

main().catch((error) => {
  console.error('Falha ao corrigir analyticsRcaMetaResumo:', error);
  process.exit(1);
});
