import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
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

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;
const projectId = Number(process.env.MITRA_PROJECT_ID);
const cronExpression = '0 0 6 * * *';

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === 'alertasInteligentesPopular');
  if (!found) throw new Error('Funcao alertasInteligentesPopular nao encontrada.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  const code = String(current?.result?.code || '');
  if (!code.trim()) throw new Error('Codigo atual da funcao de alertas nao encontrado.');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    code,
    description: current?.result?.description || found.description || 'Gera alertas inteligentes para vendedores.',
    cronExpression,
  });

  console.log(JSON.stringify({
    serverFunctionId: found.id,
    name: found.name,
    cronExpression,
    status: 'scheduled',
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao agendar alertas inteligentes:');
  console.error(error?.message || error);
  process.exit(1);
});
