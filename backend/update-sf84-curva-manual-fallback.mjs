import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL || decodeTokenPayload(process.env.MITRA_TOKEN)?.backURL || process.env.MITRA_BASE_URL_SPACE,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL || decodeTokenPayload(process.env.MITRA_TOKEN)?.backURL || process.env.MITRA_BASE_URL_SPACE,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_NAME = 'minhaCarteiraClientesRanking';

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

function patchSql(code) {
  let updated = code;

  if (!updated.includes('B.CURVA_MANUAL,')) {
    if (!updated.includes('B.TAG_COBERTURA,')) {
      throw new Error('Não foi possível localizar B.TAG_COBERTURA na SF alvo.');
    }
    updated = updated.replace('B.TAG_COBERTURA,', 'B.TAG_COBERTURA,\n    B.CURVA_MANUAL,');
  }

  if (!updated.includes('AS CURVA_MANUAL')) {
    const marker = 'END AS TAG_COBERTURA,\n      COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,';
    if (!updated.includes(marker)) {
      throw new Error('Não foi possível localizar bloco de TAG_COBERTURA para inserir CURVA_MANUAL.');
    }
    updated = updated.replace(
      marker,
      "END AS TAG_COBERTURA,\n      MAX(UPPER(TRIM(COALESCE(EC.CURVA_CLASSIFICACAO, '')))) AS CURVA_MANUAL,\n      COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,",
    );
  }

  if (!updated.includes("NULLIF(TRIM(B.CURVA_MANUAL), '') IN ('A', 'B', 'C')")) {
    const caseStart = 'CASE\n      WHEN ROUND(';
    if (!updated.includes(caseStart)) {
      throw new Error('Não foi possível localizar CASE de RANKING na SF alvo.');
    }
    updated = updated.replace(
      caseStart,
      "COALESCE(\n      CASE\n        WHEN NULLIF(TRIM(B.CURVA_MANUAL), '') IN ('A', 'B', 'C') THEN NULLIF(TRIM(B.CURVA_MANUAL), '')\n        ELSE NULL\n      END,\n      CASE\n      WHEN ROUND(",
    );
  }

  if (!updated.includes(') AS RANKING')) {
    const rankingEnd = 'END AS RANKING';
    if (!updated.includes(rankingEnd)) {
      throw new Error('Não foi possível localizar fim do CASE de RANKING na SF alvo.');
    }
    updated = updated.replace(rankingEnd, 'END\n    ) AS RANKING');
  }

  return updated;
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];
  const match = serverFunctions.find((item) => item.name === TARGET_NAME);

  if (!match?.id) {
    throw new Error(`SF não encontrada: ${TARGET_NAME}`);
  }

  const detail = await readServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
  });

  const currentCode = detail?.result?.code || '';
  if (!currentCode.trim()) {
    throw new Error(`A SF ${TARGET_NAME} está sem código.`);
  }

  const updatedCode = patchSql(currentCode);
  if (updatedCode === currentCode) {
    console.log(`SF ${TARGET_NAME} já estava com curva manual prioritária.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
    code: updatedCode,
    description: detail?.result?.description || match.description || '',
  });

  console.log(`SF ${TARGET_NAME} atualizada com curva manual prioritária e fallback automático.`);
}

main().catch((error) => {
  console.error('Erro ao atualizar regra de curva no ranking da carteira:', error);
  process.exit(1);
});
