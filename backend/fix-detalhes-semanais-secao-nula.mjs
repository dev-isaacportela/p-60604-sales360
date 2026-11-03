import 'dotenv/config';
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
const detailFunctionIds = [109, 110, 111];

const replacements = [
  {
    from: `AND E.ID_SECAO = R.ID_SECAO`,
    to: `AND (
      E.ID_SECAO IS NULL
      OR E.ID_SECAO = R.ID_SECAO
    )`,
  },
  {
    from: `AND (
      E.ID_SECAO = CAST(D.CODSEC AS SIGNED)
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
    )`,
    to: `AND (
      E.ID_SECAO IS NULL
      OR E.ID_SECAO = CAST(D.CODSEC AS SIGNED)
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
    )`,
  },
];

async function updateFunction(serverFunctionId) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const fn = current?.result || current;
  let code = String(fn?.code || '');
  let changed = false;

  for (const replacement of replacements) {
    if (code.includes(replacement.to)) continue;
    if (!code.includes(replacement.from)) continue;
    code = code.split(replacement.from).join(replacement.to);
    changed = true;
  }

  if (!changed) {
    console.log(`SF ${serverFunctionId}: sem alteracao necessaria.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code,
    description: fn.description || '',
  });
  console.log(`SF ${serverFunctionId}: detalhe semanal aceita ID_SECAO nulo como todas as secoes.`);
}

async function main() {
  for (const serverFunctionId of detailFunctionIds) {
    await updateFunction(serverFunctionId);
  }
}

main().catch((error) => {
  console.error('Falha ao atualizar detalhes semanais:');
  console.error(error?.message || error);
  process.exit(1);
});
