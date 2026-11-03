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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const mesesAnuaisSql = `SELECT 12 AS N UNION ALL SELECT 11 UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8
        UNION ALL SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4
        UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0`;

function updateGraficoCode(code) {
  return code
    .replace(/SELECT 11 AS N\s+UNION ALL SELECT 10\s+UNION ALL SELECT 9\s+UNION ALL SELECT 8\s+UNION ALL SELECT 7\s+UNION ALL SELECT 6\s+UNION ALL SELECT 5\s+UNION ALL SELECT 4\s+UNION ALL SELECT 3\s+UNION ALL SELECT 2\s+UNION ALL SELECT 1\s+UNION ALL SELECT 0/i, mesesAnuaisSql)
    .replaceAll('INTERVAL 11 MONTH', 'INTERVAL 12 MONTH');
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === 'alertasInteligentesDetalheGrafico');
  if (!found) throw new Error('Funcao alertasInteligentesDetalheGrafico nao encontrada.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  const currentCode = String(current?.result?.code || '');
  const nextCode = updateGraficoCode(currentCode);

  if (nextCode === currentCode) {
    console.log(JSON.stringify({ alertasInteligentesDetalheGrafico: found.id, status: 'unchanged' }, null, 2));
    return;
  }

  if (!nextCode.includes('SELECT 12 AS N') || !nextCode.includes('INTERVAL 12 MONTH')) {
    throw new Error('A janela anual do grafico nao foi aplicada corretamente.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    code: nextCode,
    description: 'Retorna o ciclo anual de compras do cliente para um produto, iniciando no mesmo mes do ano anterior.',
  });

  console.log(JSON.stringify({ alertasInteligentesDetalheGrafico: found.id, status: 'updated' }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar periodo do grafico de avisos:');
  console.error(error?.message || error);
  process.exit(1);
});
