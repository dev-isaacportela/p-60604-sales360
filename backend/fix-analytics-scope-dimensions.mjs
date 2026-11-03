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

const TARGET_IDS = [1, 2, 181, 182, 183, 184, 185, 186, 187, 188, 214];

const joinNeedle = 'FROM TARGET_USERS TU\n  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID\n  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE';
const joinReplacement = 'FROM TARGET_USERS TU\n  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID\n  JOIN INPUT_SCOPE I ON 1 = 1\n  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE';

const filterNeedle = "AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''";
const filterReplacement = `AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

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

function patchCode(code) {
  if (!code.includes('INPUT_SCOPE AS') || !code.includes('BU_SCOPE AS')) return null;
  if (code.includes('JOIN INPUT_SCOPE I ON 1 = 1')) return code;
  if (!code.includes(joinNeedle) || !code.includes(filterNeedle)) return null;

  return code
    .replace(joinNeedle, joinReplacement)
    .replace(filterNeedle, filterReplacement);
}

async function smoke(id) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      scopeMode: 'TEAM',
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
  const updated = [];
  const skipped = [];

  for (const id of TARGET_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const code = current?.result?.code || '';
    const nextCode = patchCode(code);

    if (!nextCode || nextCode === code) {
      skipped.push(id);
      continue;
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      code: nextCode,
      description: current?.result?.description || `SF ${id} com filtros de escopo do coordenador por BU`,
    });
    updated.push(id);
  }

  for (const id of updated) {
    const rows = await smoke(id);
    console.log(`SF ${id}: smoke OK (${rows} linha(s))`);
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir filtros dimensionais do coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
