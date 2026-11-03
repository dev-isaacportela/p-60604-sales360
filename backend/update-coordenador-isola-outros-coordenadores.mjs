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

const TARGET_IDS = [
  5, 11, 12, 20, 42, 43, 104, 123, 124, 131, 134, 154, 155, 156,
  158, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192,
  193, 194, 195, 196, 213, 215,
];

const TEAM_COORD_EXCLUSION = `
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_COORD_ALVO
      WHERE C_COORD_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_COORD_ALVO.ATIVO, TRUE) = TRUE
        AND C_COORD_ALVO.USER_ID <> :VAR_USER
    )`;

const SCOPE_OPTIONS_COORD_EXCLUSION = `
    AND (
      EXISTS (SELECT 1 FROM PERMISSAO P_DIR WHERE P_DIR.PODE_DIRETORIA = 1)
      OR C2.AUTO_ID IS NULL
      OR BV.VENDEDOR_ID = :VAR_USER
    )`;

function insertAfterOnce(code, marker, insertion) {
  if (code.includes(insertion.trim())) return code;
  const idx = code.indexOf(marker);
  if (idx === -1) return code;
  return `${code.slice(0, idx + marker.length)}${insertion}${code.slice(idx + marker.length)}`;
}

function patchScopeOptions(code) {
  const cleaned = code.replaceAll(SCOPE_OPTIONS_COORD_EXCLUSION, '');
  return insertAfterOnce(
    cleaned,
    `  LEFT JOIN COORDENADORES C2 ON C2.USER_ID = BV.VENDEDOR_ID AND COALESCE(C2.ATIVO, TRUE) = TRUE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE`,
    SCOPE_OPTIONS_COORD_EXCLUSION,
  );
}

function patchTargetUsers(code) {
  let next = code;
  const teamMarker = `  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE`;
  const sellerMarker = `  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE`;
  next = insertAfterOnce(next, teamMarker, TEAM_COORD_EXCLUSION);
  next = insertAfterOnce(next, sellerMarker, TEAM_COORD_EXCLUSION);
  return next;
}

function patchWeeklyScope(code) {
  const marker = `  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE`;
  return insertAfterOnce(code, marker, TEAM_COORD_EXCLUSION);
}

function patchPanelCoordinatorScope(code) {
  const marker = `  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE`;
  return insertAfterOnce(code, marker, TEAM_COORD_EXCLUSION);
}

function patchCode(id, code) {
  let next = code;
  if (id === 158) next = patchScopeOptions(next);
  if (next.includes('TARGET_USERS AS')) next = patchTargetUsers(next);
  if (id === 104 || next.includes('COORD_SCOPE_USERS AS')) next = patchWeeklyScope(next);
  if (next.includes('VENDEDORES_COORDENADOR AS')) next = patchPanelCoordinatorScope(next);
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

async function smoke(id, input = {}) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      scopeMode: 'TEAM',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodSupervisor: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      mes: '7',
      ano: '2026',
      semanaNumero: '1',
      dataInicio: '2026-07-01',
      dataFim: '2026-07-31',
      limite: '5',
      limit: '5',
      offset: '0',
      ...input,
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${id} falhou: ${error || status}`);
  }
  return extractRows(response).length;
}

async function main() {
  const updated = [];
  const skipped = [];

  for (const id of TARGET_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const original = current?.result?.code || '';
    const next = patchCode(id, original);
    if (!next || next === original) {
      skipped.push(id);
      continue;
    }
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      code: next,
      description: current?.result?.description || `SF ${id} com isolamento entre coordenadores`,
    });
    updated.push(id);
  }

  for (const id of [104, 154, 155, 158, 181, 182, 215]) {
    const rows = await smoke(id);
    console.log(`SF ${id}: OK (${rows} linha(s)).`);
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao isolar vendas entre coordenadores:');
  console.error(error?.message || error);
  process.exit(1);
});
