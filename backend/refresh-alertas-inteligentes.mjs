import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
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

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;
const projectId = Number(process.env.MITRA_PROJECT_ID);

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === 'alertasInteligentesPopular');
  if (!found) throw new Error('Funcao alertasInteligentesPopular nao encontrada.');

  const result = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    input: { refresh: 'true' },
  });

  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Atualizacao dos avisos falhou com status ${status}`);
  }

  const rows = extractRows(result);
  console.log('Avisos atualizados.');
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar avisos:');
  console.error(error?.message || error);
  process.exit(1);
});
