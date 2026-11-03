import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const tokenBackUrl = tokenPayload?.backURL || '';

const baseURL = process.env.MITRA_BASE_URL || tokenBackUrl || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const sfName = 'acompanhamento-semanal-sincronizar-manual';

async function main() {
  const codePath = resolve(process.cwd(), 'acompanhamento-semanal-sincronizar-manual-escopo.sf.js');
  const sfCode = readFileSync(codePath, 'utf8');

  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === sfName);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: sfCode,
      description: 'Dispara sincronizacao manual TOTVS do Acompanhamento Semanal e retorna metricas.',
    });
    console.log(`SF atualizada: ${sfName} -> ID ${existing.id}`);
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: sfName,
    type: 'JAVASCRIPT',
    code: sfCode,
    description: 'Dispara sincronizacao manual TOTVS do Acompanhamento Semanal e retorna metricas.',
  });

  const sfId = created?.result?.serverFunctionId
    || created?.result?.id
    || created?.serverFunctionId
    || created?.id;
  console.log(`SF criada: ${sfName} -> ID ${sfId}`);
}

main().catch((error) => {
  console.error('Falha ao criar/atualizar SF de sincronizacao manual:');
  console.error(error?.message || error);
  process.exit(1);
});
