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
const serverFunctionId = 104;

const strictSectionJoin = `AND (
      TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(PS.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(PS.ID_SECAO AS CHAR))
    )`;

const nullableSectionJoin = `AND (
      E.ID_SECAO IS NULL
      OR TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(PS.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(PS.ID_SECAO AS CHAR))
    )`;

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const fn = current?.result || current;
  const originalCode = String(fn?.code || '');

  if (!originalCode.includes(strictSectionJoin) && originalCode.includes(nullableSectionJoin)) {
    console.log('SF 104 ja trata ID_SECAO nulo como todas as secoes.');
    return;
  }

  const nextCode = originalCode.split(strictSectionJoin).join(nullableSectionJoin);
  const replacements = originalCode.split(strictSectionJoin).length - 1;

  if (replacements !== 2) {
    throw new Error(`Esperava substituir 2 trechos de secao na SF 104, encontrei ${replacements}.`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: fn.description || 'Calcula B/W semanal por carteira e escopo de filial, departamento e seção do vendedor selecionado.',
  });

  console.log('SF 104 atualizada: ID_SECAO nulo agora cobre todas as secoes no acompanhamento semanal.');
}

main().catch((error) => {
  console.error('Falha ao atualizar SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
