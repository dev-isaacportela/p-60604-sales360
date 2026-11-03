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

const SF = {
  historicoPedidosCliente: 25,
  detalhesPedidoCliente: 26,
};

const QUANTIDADE_EFETIVA_SQL = `CASE
          WHEN COALESCE(VT.QT, 0) > 0 THEN COALESCE(VT.QT, 0)
          WHEN COALESCE(VT.VLUNIT, 0) > 0 THEN COALESCE(VT.TOTAL, 0) / COALESCE(VT.VLUNIT, 0)
          ELSE 1
        END`;

async function updateCode(serverFunctionId, updater) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current?.result?.code;
  if (!code) throw new Error(`Codigo da SF ${serverFunctionId} nao encontrado.`);

  const nextCode = updater(code);
  if (nextCode === code) throw new Error(`Nenhuma alteracao aplicada na SF ${serverFunctionId}.`);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: current.result.description,
  });

  return nextCode;
}

function updateHistoricoPedidos(code) {
  return code.replace(
    'COUNT(*) AS TOTAL_ITENS,',
    `ROUND(SUM(${QUANTIDADE_EFETIVA_SQL}), 6) AS TOTAL_ITENS,`,
  );
}

function updateDetalhesPedido(code) {
  return code
    .replace(
      '1 AS QUANTIDADE,',
      `ROUND(${QUANTIDADE_EFETIVA_SQL}, 6) AS QUANTIDADE,`,
    )
    .replace(
      'ROUND(COALESCE(VT.TOTAL, 0), 2) AS PRECO_UNITARIO,',
      `ROUND(CASE WHEN ${QUANTIDADE_EFETIVA_SQL} = 0 THEN 0 ELSE COALESCE(VT.TOTAL, 0) / ${QUANTIDADE_EFETIVA_SQL} END, 6) AS PRECO_UNITARIO,`,
    );
}

function validateCode(name, code) {
  if (name === 'historicoPedidosCliente' && !code.includes('ROUND(SUM(CASE')) {
    throw new Error('historicoPedidosCliente nao soma quantidade efetiva.');
  }

  if (name === 'detalhesPedidoCliente') {
    if (code.includes('1 AS QUANTIDADE')) throw new Error('detalhesPedidoCliente ainda retorna quantidade fixa.');
    if (!code.includes('ROUND(CASE') || !code.includes('AS QUANTIDADE')) {
      throw new Error('detalhesPedidoCliente nao calcula quantidade efetiva.');
    }
    if (!code.includes('/ CASE')) throw new Error('detalhesPedidoCliente nao recalcula preco unitario pela quantidade.');
  }
}

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao identificado.');

  const historicoCode = await updateCode(SF.historicoPedidosCliente, updateHistoricoPedidos);
  validateCode('historicoPedidosCliente', historicoCode);
  console.log(`SF ${SF.historicoPedidosCliente} historicoPedidosCliente atualizada.`);

  const detalhesCode = await updateCode(SF.detalhesPedidoCliente, updateDetalhesPedido);
  validateCode('detalhesPedidoCliente', detalhesCode);
  console.log(`SF ${SF.detalhesPedidoCliente} detalhesPedidoCliente atualizada.`);
}

main().catch((error) => {
  console.error('Falha ao corrigir quantidade de produtos nos pedidos:');
  console.error(error?.message || error);
  process.exit(1);
});
