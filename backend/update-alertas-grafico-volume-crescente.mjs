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

function updateGraficoCode(code) {
  if (code.includes("PA.PRODUTO_REF = ''")) return code;

  const produtoConditionStart = /AND\s*\(\s*\(PA\.PRODUTO_REF REGEXP '\^\[0-9\]\+\$' AND CAST\((V|R)\.CODPROD AS CHAR\) = PA\.PRODUTO_REF\)/;
  return code.replace(produtoConditionStart, (match) => match.replace('(', "(\n        PA.PRODUTO_REF = ''\n        OR "));
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === 'alertasInteligentesDetalheGrafico');
  if (!found) throw new Error('Funcao alertasInteligentesDetalheGrafico nao encontrada.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  const currentCode = String(current?.result?.code || '');
  const nextCode = updateGraficoCode(currentCode);

  if (!nextCode.includes("PA.PRODUTO_REF = ''")) {
    throw new Error('Filtro sem produto nao foi aplicado ao grafico.');
  }

  if (nextCode === currentCode) {
    console.log(JSON.stringify({ alertasInteligentesDetalheGrafico: found.id, status: 'unchanged' }, null, 2));
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    code: nextCode,
    description: current?.result?.description || found.description || 'Retorna o ciclo anual de compras do cliente para um produto ou total do cliente.',
  });

  console.log(JSON.stringify({ alertasInteligentesDetalheGrafico: found.id, status: 'updated' }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao habilitar grafico para volume crescente:');
  console.error(error?.message || error);
  process.exit(1);
});
