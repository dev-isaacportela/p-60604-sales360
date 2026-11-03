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

const payload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || payload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 110;

const LEGACY_BLOCK = `ROUND(SUM(COALESCE(R.QT, 0)), 6) AS QT_TOTAL_SEMANA,
  ROUND(
    CASE
      WHEN SUM(COALESCE(R.QT, 0)) = 0 THEN 0
      ELSE SUM(COALESCE(R.TOTAL, 0)) / SUM(COALESCE(R.QT, 0))
    END,
    6
  ) AS VALOR_UNITARIO,`;

const EFFECTIVE_BLOCK = `ROUND(
    SUM(
      CASE
        WHEN COALESCE(R.QT, 0) > 0 THEN COALESCE(R.QT, 0)
        WHEN COALESCE(R.VLUNIT, 0) > 0 AND COALESCE(R.TOTAL, 0) <> 0 THEN COALESCE(R.TOTAL, 0) / COALESCE(R.VLUNIT, 0)
        WHEN COALESCE(R.TOTAL, 0) > 0 THEN 1
        ELSE 0
      END
    ),
    6
  ) AS QT_TOTAL_SEMANA,
  ROUND(
    CASE
      WHEN SUM(
        CASE
          WHEN COALESCE(R.QT, 0) > 0 THEN COALESCE(R.QT, 0)
          WHEN COALESCE(R.VLUNIT, 0) > 0 AND COALESCE(R.TOTAL, 0) <> 0 THEN COALESCE(R.TOTAL, 0) / COALESCE(R.VLUNIT, 0)
          WHEN COALESCE(R.TOTAL, 0) > 0 THEN 1
          ELSE 0
        END
      ) = 0 THEN 0
      ELSE SUM(COALESCE(R.TOTAL, 0)) / SUM(
        CASE
          WHEN COALESCE(R.QT, 0) > 0 THEN COALESCE(R.QT, 0)
          WHEN COALESCE(R.VLUNIT, 0) > 0 AND COALESCE(R.TOTAL, 0) <> 0 THEN COALESCE(R.TOTAL, 0) / COALESCE(R.VLUNIT, 0)
          WHEN COALESCE(R.TOTAL, 0) > 0 THEN 1
          ELSE 0
        END
      )
    END,
    6
  ) AS VALOR_UNITARIO,`;

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentCode = String(current?.result?.code || '');

  let updatedCode = currentCode;
  if (updatedCode.includes(LEGACY_BLOCK)) {
    updatedCode = updatedCode.replace(LEGACY_BLOCK, EFFECTIVE_BLOCK);
  } else {
    const needle = `WHEN COALESCE(R.VLUNIT, 0) > 0 AND COALESCE(R.TOTAL, 0) <> 0 THEN COALESCE(R.TOTAL, 0) / COALESCE(R.VLUNIT, 0)\n          ELSE 0`;
    const replacement = `WHEN COALESCE(R.VLUNIT, 0) > 0 AND COALESCE(R.TOTAL, 0) <> 0 THEN COALESCE(R.TOTAL, 0) / COALESCE(R.VLUNIT, 0)\n          WHEN COALESCE(R.TOTAL, 0) > 0 THEN 1\n          ELSE 0`;

    const occurrences = (updatedCode.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (occurrences === 0) {
      throw new Error('Trecho de fallback de quantidade nao encontrado na SF 110.');
    }
    updatedCode = updatedCode.split(needle).join(replacement);
  }

  if (updatedCode === currentCode) {
    throw new Error('Substituicao nao aplicada na SF 110.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: updatedCode,
    description: current?.result?.description || 'Detalhe de itens semanais por cliente',
  });

  console.log('SF 110 atualizada com fallback de quantidade efetiva (QT/TOTAL/VLUNIT).');
}

main().catch((error) => {
  console.error('Falha ao atualizar SF 110:');
  console.error(error?.message || error);
  process.exit(1);
});
