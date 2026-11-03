import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const SF104_ID = 104;
const __dirname = dirname(fileURLToPath(import.meta.url));

function extractCleanSf104Code() {
  const source = readFileSync(join(__dirname, 'update-realizado-secao-sfs.mjs'), 'utf8');
  const rawMatch = source.match(/const RAW_SECTION_MATCH = `([\s\S]*?)`;\n/);
  const codeMatch = source.match(/function buildBwSemanalCodeAligned\(\) \{\n  return `([\s\S]*?)`;\n\}/);

  if (!rawMatch || !codeMatch) {
    throw new Error('Nao foi possivel extrair a query limpa da SF 104 do builder local.');
  }

  const code = codeMatch[1].replaceAll('${RAW_SECTION_MATCH}', rawMatch[1]);

  if (!/RAMO_PARAM/i.test(code) || !/AS RAMO_CLIENTE/i.test(code) || !/CLIENTES_RAMO/i.test(code)) {
    throw new Error('Builder local da SF 104 ainda nao contem ramo do cliente.');
  }

  return code;
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID invalido.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: SF104_ID });
  const code = extractCleanSf104Code();

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: SF104_ID,
    code,
    description: 'Calcula B/W semanal alinhado ao Dashboard com ramo do cliente via TOTVS.',
  });

  console.log(JSON.stringify({
    updated: SF104_ID,
    name: current?.result?.name || 'calcular-bw-semanal',
    restoredFrom: 'update-realizado-secao-sfs.mjs',
    preserved: ['RAW + CODFILIAL + CODEPTO + CODSEC', 'RAMO_CLIENTE'],
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir ramo da SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
