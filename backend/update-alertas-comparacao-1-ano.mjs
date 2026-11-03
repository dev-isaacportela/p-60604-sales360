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

const meses12Sql = `SELECT 12 AS N UNION ALL SELECT 11 UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8
        UNION ALL SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4
        UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0`;

const updates = {
  alertasInteligentesPopular(code) {
    return code
      .replaceAll('INTERVAL 24 MONTH', 'INTERVAL 12 MONTH')
      .replaceAll('YEAR(BV.DATA_REF) BETWEEN YEAR(CURRENT_DATE) - 2 AND YEAR(CURRENT_DATE) - 1', 'YEAR(BV.DATA_REF) = YEAR(CURRENT_DATE) - 1')
      .replaceAll('Nos últimos 2 anos', 'No último ano');
  },
  alertasInteligentesDetalheGrafico(code) {
    return code
      .replace(/SELECT 23 AS N[\s\S]*?UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0/, meses12Sql)
      .replaceAll('INTERVAL 23 MONTH', 'INTERVAL 12 MONTH')
      .replaceAll('INTERVAL 11 MONTH', 'INTERVAL 12 MONTH');
  },
  sazonalidadeClienteProdutos(code) {
    return code.replaceAll('INTERVAL 23 MONTH', 'INTERVAL 12 MONTH');
  },
  dicaProObter(code) {
    return code.replaceAll('INTERVAL 24 MONTH', 'INTERVAL 12 MONTH');
  },
};

const descriptions = {
  alertasInteligentesDetalheGrafico: 'Retorna o ciclo anual de compras do cliente para um produto, iniciando no mesmo mes do ano anterior.',
  sazonalidadeClienteProdutos: 'Retorna sazonalidade de compras do cliente por produto no ciclo anual do vendedor logado.',
};

function assertNoLongWindow(name, code) {
  const forbidden = ['INTERVAL 24 MONTH', 'INTERVAL 23 MONTH', 'últimos 2 anos'];
  const found = forbidden.filter((term) => code.includes(term));
  if (found.length > 0) {
    throw new Error(`${name} ainda contem janela acima de 1 ano: ${found.join(', ')}`);
  }
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const results = [];

  for (const [name, transform] of Object.entries(updates)) {
    const found = existing.find((item) => item.name === name);
    if (!found) {
      results.push({ name, status: 'not_found' });
      continue;
    }

    const current = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
    const currentCode = String(current?.result?.code || '');
    const nextCode = transform(currentCode);
    const description = descriptions[name] || current?.result?.description || found.description || '';

    assertNoLongWindow(name, nextCode);

    if (nextCode === currentCode && description === (current?.result?.description || found.description || '')) {
      results.push({ name, id: found.id, status: 'unchanged' });
      continue;
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: found.id,
      code: nextCode,
      description,
    });

    results.push({ name, id: found.id, status: 'updated' });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error('Falha ao limitar comparacao dos alertas a 1 ano:');
  console.error(error?.message || error);
  process.exit(1);
});
