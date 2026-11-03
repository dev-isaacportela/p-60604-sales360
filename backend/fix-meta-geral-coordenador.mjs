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
const TARGET_SF = 182;

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
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: TARGET_SF });
  let code = String(current?.result?.code || '');

  const replacements = [
    ['WHERE MBV.VENDEDOR_ID = :VAR_USER', 'WHERE MBV.VENDEDOR_ID IN (SELECT USER_ID FROM TARGET_USERS)'],
    ['WHERE M.VENDEDOR_ID = :VAR_USER', 'WHERE M.VENDEDOR_ID IN (SELECT USER_ID FROM TARGET_USERS)'],
  ];

  let changed = false;
  for (const [from, to] of replacements) {
    if (code.includes(from)) {
      code = code.replaceAll(from, to);
      changed = true;
    }
  }

  if (!changed) {
    console.log('Nenhuma alteração necessária na meta geral do coordenador.');
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: TARGET_SF,
    code,
    description: current?.result?.description || 'Resumo de meta consolidada por escopo do coordenador.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: TARGET_SF,
    input: {
      scopeMode: 'TEAM',
      scopeUserId: '',
      scopeCodRca: '',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      departamentos: '',
      ramos: '',
      limit: '5',
      offset: '0',
    },
  });

  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  console.log(`SF ${TARGET_SF}: meta geral por escopo OK (${extractRows(smoke).length} linha).`);
}

main().catch((error) => {
  console.error('Falha ao ajustar meta geral do coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
