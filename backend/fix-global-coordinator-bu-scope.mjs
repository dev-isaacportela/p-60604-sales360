import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const COORD_LIMIT = `
    AND (
      I.SCOPE_MODE = 'ME'
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C_SCOPE
        JOIN COORDENADORES_BU CB_SCOPE ON CB_SCOPE.COD_SUPERVISOR = C_SCOPE.COD_SUPERVISOR
        WHERE C_SCOPE.USER_ID = :VAR_USER
          AND COALESCE(C_SCOPE.ATIVO, TRUE) = TRUE
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_SCOPE.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_SCOPE.CODEPTO AS CHAR)
      )
    )`;

const ACTIVE_FILTER = `WHERE COALESCE(BV.ATIVO, TRUE) = TRUE`;
const NONEMPTY_FILTER = `AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''`;

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
  if (!code.includes('INPUT_SCOPE AS') || !code.includes('SCOPE_MODE') || code.includes('C_SCOPE.USER_ID = :VAR_USER')) return code;
  if (!code.includes('JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID')) return code;

  let next = code;

  if (next.includes(NONEMPTY_FILTER)) {
    next = next.replaceAll(NONEMPTY_FILTER, `${NONEMPTY_FILTER}${COORD_LIMIT}`);
  } else if (next.includes(ACTIVE_FILTER)) {
    next = next.replace(ACTIVE_FILTER, `${ACTIVE_FILTER}${COORD_LIMIT}`);
  }

  return next;
}

async function smoke(id, input = {}) {
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
      departamentos: '',
      ramos: '',
      limit: '5',
      offset: '0',
      ANO: '2026',
      MES: '1',
      ...input,
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id}: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const candidates = (list?.result || []).filter((item) => item.type === 'SQL');
  const updated = [];

  for (const item of candidates) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: item.id });
    const code = current?.result?.code || '';
    const nextCode = patchCode(code);
    if (nextCode === code) continue;

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: item.id,
      code: nextCode,
      description: current?.result?.description || item.description || `SF ${item.id} com escopo BU do coordenador isolado`,
    });
    updated.push({ id: item.id, name: item.name });
  }

  const smokeIds = [1, 2, 16, 17, 18, 19, 27, 84, 104, 123, 124, 181, 182, 183, 184, 185, 186, 188, 214]
    .filter((id) => updated.some((item) => item.id === id));
  for (const id of smokeIds) {
    const rows = await smoke(id);
    console.log(`SF ${id}: smoke OK (${rows} linha(s)).`);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao aplicar isolamento global de BU do coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
