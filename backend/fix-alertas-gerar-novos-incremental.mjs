import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ALERTAS_POPULAR_ID = 130;

function getCode(response) {
  return String(response?.result?.code || response?.code || '');
}

function patchProcessingMode(code) {
  let next = code;

  const oldBlock = `const vendedoresParaProcessar = refresh || force ? vendedores : vendedores.filter((id) => !existentes.has(id));`;
  const newBlock = `const vendedorFiltro = Number(evt.vendedorId || evt.idVendedor || evt.sellerId || 0);
  const batchLimit = Number(evt.limit || evt.limite || 0);
  const batchOffset = Number(evt.offset || 0);
  let vendedoresParaProcessar = Number.isFinite(vendedorFiltro) && vendedorFiltro > 0
    ? vendedores.filter((id) => id === vendedorFiltro)
    : vendedores;
  if (Number.isFinite(batchOffset) && batchOffset > 0) {
    vendedoresParaProcessar = vendedoresParaProcessar.slice(batchOffset);
  }
  if (Number.isFinite(batchLimit) && batchLimit > 0) {
    vendedoresParaProcessar = vendedoresParaProcessar.slice(0, batchLimit);
  }`;

  if (next.includes(oldBlock)) {
    next = next.replace(oldBlock, newBlock);
  } else if (!next.includes('const vendedorFiltro = Number(evt.vendedorId')) {
    throw new Error('Nao foi possivel localizar o bloco de vendedoresParaProcessar.');
  }

  const oldMode = `MODO: refresh ? 'REFRESH' : (force ? 'FORCE' : 'INCREMENTAL'),`;
  const newMode = `MODO: vendedorFiltro > 0 ? 'VENDEDOR' : (refresh ? 'REFRESH' : (force ? 'FORCE' : 'INCREMENTAL_ATUALIZA_NOVOS')),`;
  if (next.includes(oldMode)) {
    next = next.replace(oldMode, newMode);
  }

  return next;
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: ALERTAS_POPULAR_ID });
  const currentCode = getCode(current);
  const nextCode = patchProcessingMode(currentCode);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: ALERTAS_POPULAR_ID,
    code: nextCode,
    description: 'Gera alertas inteligentes processando novos clientes em modo incremental sem duplicar avisos existentes.',
  });

  console.log('Geracao incremental de novos alertas habilitada.');
}

main().catch((error) => {
  console.error('Falha ao habilitar geracao incremental de novos alertas:');
  console.error(error?.message || error);
  process.exit(1);
});
