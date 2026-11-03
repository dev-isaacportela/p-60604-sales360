import 'dotenv/config';
import {
  configureSdkMitra,
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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function replaceAllOrFail(code, search, replacement, label) {
  const count = code.split(search).length - 1;
  if (count === 0) throw new Error(`Trecho nao encontrado: ${label}`);
  return { code: code.split(search).join(replacement), count };
}

function assertHasCarteiraJoin(code, expectedCount, label) {
  const count = (code.match(/JOIN\s+CARTEIRA_SCOPE\s+CS/gi) || []).length;
  if (count < expectedCount) {
    throw new Error(`${label}: esperado ao menos ${expectedCount} JOIN CARTEIRA_SCOPE, encontrado ${count}`);
  }
}

function addCarteiraScopeToSf104(code) {
  let next = code;

  if (!/CARTEIRA_SCOPE\s+AS/i.test(next)) {
    next = next.replace(
      '    BASE_ATUAL_RAW AS (',
      `    CARTEIRA_SCOPE AS (
      SELECT DISTINCT
        TU.USER_ID AS TARGET_USER_ID,
        EC.ID_CLIENTE
      FROM TARGET_USERS TU
      JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = TU.USER_ID
    ),
    BASE_ATUAL_RAW AS (`,
    );
  }

  if (!/BASE_ATUAL_RAW[\s\S]*JOIN\s+CARTEIRA_SCOPE\s+CS/i.test(next)) {
    const replaced = replaceAllOrFail(
      next,
      `

      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID`,
      `
      JOIN CARTEIRA_SCOPE CS
        ON CS.TARGET_USER_ID = B.TARGET_USER_ID
       AND CS.ID_CLIENTE = R.CLIENTE_ID

      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID`,
      'SF 104 carteira nas bases atual e anterior',
    );
    next = replaced.code;
    if (replaced.count < 2) {
      throw new Error(`SF 104: esperado atualizar bases atual e anterior, atualizado ${replaced.count}`);
    }
  }

  next = next.replace(
    'Escopo semanal alinhado ao Dashboard: RAW + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR',
    'Escopo semanal: carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR',
  );

  assertHasCarteiraJoin(next, 2, 'SF 104');
  return next;
}

function addCarteiraScopeToDetailSf(code, id) {
  let next = code;

  if (!/CARTEIRA_SCOPE\s+AS/i.test(next)) {
    next = next.replace(
      '    BASE_RAW AS (',
      `    CARTEIRA_SCOPE AS (
      SELECT DISTINCT
        TU.USER_ID AS TARGET_USER_ID,
        EC.ID_CLIENTE
      FROM TARGET_USERS TU
      JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = TU.USER_ID
    ),
    BASE_RAW AS (`,
    );
  }

  if (!/BASE_RAW[\s\S]*JOIN\s+CARTEIRA_SCOPE\s+CS/i.test(next)) {
    const replaced = replaceAllOrFail(
      next,
      `

      WHERE R.ATIVO = TRUE`,
      `
      JOIN CARTEIRA_SCOPE CS
        ON CS.TARGET_USER_ID = B.TARGET_USER_ID
       AND CS.ID_CLIENTE = R.CLIENTE_ID

      WHERE R.ATIVO = TRUE`,
      `SF ${id} carteira na base de detalhe`,
    );
    next = replaced.code;
  }

  assertHasCarteiraJoin(next, 1, `SF ${id}`);
  return next;
}

async function updateSf(id, transform, description) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
  const code = current?.result?.code || '';
  const nextCode = transform(code, id);

  if (nextCode === code) {
    return { id, name: current?.result?.name, changed: false };
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    code: nextCode,
    description,
  });

  return { id, name: current?.result?.name, changed: true };
}

async function main() {
  const updated = [];

  updated.push(await updateSf(
    104,
    addCarteiraScopeToSf104,
    'Calcula B/W semanal exigindo territorio BU_VENDEDOR e cliente na carteira do mesmo vendedor.',
  ));

  for (const id of [109, 110, 111]) {
    updated.push(await updateSf(
      id,
      addCarteiraScopeToDetailSf,
      'Detalha pedidos do cliente exigindo territorio BU_VENDEDOR e cliente na carteira do mesmo vendedor.',
    ));
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao aplicar regra completa de atribuicao da Minha Semana:');
  console.error(error?.message || error);
  process.exit(1);
});
