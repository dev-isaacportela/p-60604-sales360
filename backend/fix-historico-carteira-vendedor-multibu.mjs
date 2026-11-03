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
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;
const projectId = Number(process.env.MITRA_PROJECT_ID);
const MINHA_CARTEIRA_ID = 27;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const oldFilter = `WHERE COALESCE(
    (
      SELECT MIN(COALESCE(NULLIF(TRIM(BV2.BU_CODIGO), ''), 'PADRAO'))
      FROM BU_VENDEDOR BV2
      WHERE BV2.VENDEDOR_ID = CL.VENDEDOR_DONO_CLIENTE
        AND COALESCE(BV2.ATIVO, TRUE) = TRUE
        AND TRIM(COALESCE(CAST(BV2.CODFILIAL AS CHAR), '')) <> ''
    ),
    'PADRAO'
  ) = COALESCE(
  NULLIF(TRIM('{{idBu}}'), ''),
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = :VAR_USER
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
  ),
  'PADRAO'
)`;

const newFilter = `WHERE (EXISTS (
        SELECT 1
        FROM INPUT_SCOPE I_SELLER
        JOIN BU_SCOPE BS_SELLER ON BS_SELLER.TARGET_USER_ID = CL.VENDEDOR_DONO_CLIENTE
        WHERE I_SELLER.SCOPE_MODE = 'SELLER'
      )
      OR COALESCE(
    (
      SELECT MIN(COALESCE(NULLIF(TRIM(BV2.BU_CODIGO), ''), 'PADRAO'))
      FROM BU_VENDEDOR BV2
      WHERE BV2.VENDEDOR_ID = CL.VENDEDOR_DONO_CLIENTE
        AND COALESCE(BV2.ATIVO, TRUE) = TRUE
        AND TRIM(COALESCE(CAST(BV2.CODFILIAL AS CHAR), '')) <> ''
    ),
    'PADRAO'
  ) = COALESCE(
  NULLIF(TRIM('{{idBu}}'), ''),
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = :VAR_USER
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
  ),
  'PADRAO'
))`;

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao identificado.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: MINHA_CARTEIRA_ID });
  const code = String(current?.result?.code || '');
  if (!code) throw new Error('Codigo atual da funcao minhaCarteiraClientes nao encontrado.');
  if (code.includes('I_SELLER.SCOPE_MODE')) {
    console.log('Funcao minhaCarteiraClientes ja estava corrigida.');
    return;
  }

  const nextCode = code.replace(oldFilter, newFilter);
  if (nextCode === code) throw new Error('Padrao antigo de filtro por BU nao encontrado.');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: MINHA_CARTEIRA_ID,
    code: nextCode,
    description: current.result.description,
  });

  console.log('SF 27 minhaCarteiraClientes atualizada para vendedor com multiplas BUs.');
}

main().catch((error) => {
  console.error('Falha ao corrigir carteira por vendedor multibu:');
  console.error(error?.message || error);
  process.exit(1);
});
