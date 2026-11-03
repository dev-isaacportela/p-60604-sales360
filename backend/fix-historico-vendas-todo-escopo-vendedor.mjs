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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const targets = [
  { id: 25, name: 'historicoPedidosCliente' },
  { id: 26, name: 'detalhesPedidoCliente' },
];

const buScopeRegex = /,\nBU_SCOPE AS \([\s\S]*?\n\),\nBASE_VENDAS AS \(/;
const buScopeJoinRegex = /\n  JOIN BU_SCOPE B\n    ON B\.TARGET_USER_ID = CS\.VENDEDOR_DONO_CLIENTE[\s\S]*?\n   \)/;

function relaxSalesScope(code) {
  let next = String(code || '');
  next = next.replace(buScopeRegex, ',\nBASE_VENDAS AS (');
  next = next.replace(buScopeJoinRegex, '');
  return next;
}

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao identificado.');

  const updated = [];
  for (const target of targets) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
    const code = String(current?.result?.code || '');
    if (!code) throw new Error(`Codigo atual da SF ${target.name} nao encontrado.`);

    const nextCode = relaxSalesScope(code);
    if (nextCode === code) {
      console.log(`${target.name}: sem alteracao necessaria.`);
      continue;
    }

    if (/\bBU_SCOPE\b/.test(nextCode)) {
      throw new Error(`A SF ${target.name} ainda referencia BU_SCOPE apos transformacao.`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: target.id,
      code: nextCode,
      description: `${current?.result?.description || target.name} Vendas exibidas por cliente na carteira e RCA do vendedor, sem restringir por BU/secao da linha de venda.`,
    });
    updated.push(target.name);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar historico de vendas para todo escopo do vendedor:');
  console.error(error?.message || error);
  process.exit(1);
});
