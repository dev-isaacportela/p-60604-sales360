import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
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

function replaceOnce(code, search, replacement, label) {
  const idx = code.indexOf(search);
  if (idx === -1) throw new Error(`Trecho nao encontrado: ${label}`);
  return code.slice(0, idx) + replacement + code.slice(idx + search.length);
}

function transformSf104(code) {
  if (code.includes('FROM BASE_ATUAL\n    UNION ALL\n    SELECT VENDEDOR_ID, CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO')) {
    return code;
  }

  let next = code;

  next = replaceOnce(
    next,
    `BASE_ANTERIOR AS (
  SELECT
    CASE WHEN P.SCOPE_MODE = 'TEAM' THEN 0 ELSE E.TARGET_USER_ID END AS VENDEDOR_ID,
    PS.CLIENTE_ID,
    PS.SEMANA_NUMERO,
    PS.VALOR`,
    `BASE_ANTERIOR AS (
  SELECT
    CASE WHEN P.SCOPE_MODE = 'TEAM' THEN 0 ELSE E.TARGET_USER_ID END AS VENDEDOR_ID,
    PS.CLIENTE_ID,
    PS.SEGMENTO,
    PS.SEMANA_NUMERO,
    PS.VALOR,
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo') AS RAMO_CLIENTE_FILTRADO`,
    'BASE_ANTERIOR com segmento e ramo',
  );

  next = replaceOnce(
    next,
    `BASE_CLIENTES AS (
  SELECT VENDEDOR_ID, CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO, MAX(RAMO_CLIENTE_FILTRADO) AS RAMO_CLIENTE
  FROM BASE_ATUAL
  GROUP BY VENDEDOR_ID, CLIENTE_ID
),`,
    `BASE_CLIENTES AS (
  SELECT VENDEDOR_ID, CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO, MAX(RAMO_CLIENTE_FILTRADO) AS RAMO_CLIENTE
  FROM (
    SELECT VENDEDOR_ID, CLIENTE_ID, SEGMENTO, RAMO_CLIENTE_FILTRADO
    FROM BASE_ATUAL
    UNION ALL
    SELECT VENDEDOR_ID, CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO, MAX(RAMO_CLIENTE_FILTRADO) AS RAMO_CLIENTE_FILTRADO
    FROM BASE_ANTERIOR
    GROUP BY VENDEDOR_ID, CLIENTE_ID
  ) CLIENTES_MOV
  GROUP BY VENDEDOR_ID, CLIENTE_ID
),`,
    'BASE_CLIENTES atual + anterior',
  );

  if (!next.includes('RAMO_CLIENTE_FILTRADO') || !next.includes('CLIENTES_MOV')) {
    throw new Error('Patch de clientes do mes anterior nao foi aplicado corretamente.');
  }

  return next;
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

async function smoke(input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId: 104, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Status inesperado: ${status}`);
  }
  return extractRows(response);
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: 104 });
  const code = current?.result?.code || '';
  const nextCode = transformSf104(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: 104,
      code: nextCode,
      description: 'Calcula B/W semanal incluindo clientes com compra no mes anterior e zero no mes atual.',
    });
  }

  const rows = await smoke({ mes: '6', ano: '2026', semanaNumero: '5' });
  console.log(JSON.stringify({ changed: nextCode !== code, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir SF 104 para clientes do mes anterior:');
  console.error(error?.message || error);
  process.exit(1);
});
