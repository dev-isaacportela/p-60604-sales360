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
const SF_META_REALIZADO = 123;

function patchCode(code) {
  return code;
}

function extractOutputRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function smoke(input, label) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: SF_META_REALIZADO,
    input,
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`${label} falhou: ${error || status}`);
  }
  const row = extractOutputRows(response)[0] || {};
  console.log(`${label}:`, JSON.stringify(row));
  return row;
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: SF_META_REALIZADO });
  const original = current?.result?.code || '';
  const next = patchCode(original);
  if (next !== original) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: SF_META_REALIZADO,
      code: next,
      description: current?.result?.description || 'Meta realizada com escopo de carteira',
    });
  }

  await smoke({
    ANO: '2026',
    MES: '7',
    scopeMode: 'GLOBAL',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodSupervisor: '913',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  }, 'Joao diretoria');
}

main().catch((error) => {
  console.error('Falha ao corrigir meta do dashboard:');
  console.error(error?.message || error);
  process.exit(1);
});
