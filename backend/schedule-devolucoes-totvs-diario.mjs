import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listDataLoadersMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DATA_LOADER_NAME = 'DEVOLUCOES_TOTVS';
const SYNC_SF_NAME = 'syncDevolucoesTotvsDiario';
const CRON_DIARIO_0430 = '0 30 4 * * *';

function getServerFunctionId(payload) {
  return (
    payload?.result?.serverFunctionId
    || payload?.serverFunctionId
    || payload?.result?.id
    || payload?.id
    || null
  );
}

function buildSyncCode(dataLoaderId) {
  return `
    const { executeDataLoaderMitra } = require('mitra-sdk');
    const projectId = Number(process.env.MITRA_PROJECT_ID);

    await executeDataLoaderMitra({ projectId, dataLoaderId: ${dataLoaderId} });

    return {
      message: 'Carga de devoluções TOTVS concluída',
      dataLoaderId: ${dataLoaderId},
      syncedAt: new Date().toISOString(),
    };
  `;
}

async function resolveDataLoaderId() {
  const listed = await listDataLoadersMitra({ projectId });
  const loaders = listed?.result || listed?.data || [];
  const loader = loaders.find((item) => (item.name || item.NAME) === DATA_LOADER_NAME);
  const dataLoaderId = Number(loader?.id || loader?.dataLoaderId || 0) || 0;

  if (!dataLoaderId) {
    throw new Error(`Data Loader ${DATA_LOADER_NAME} nao encontrado.`);
  }

  return { dataLoaderId, loader };
}

async function upsertScheduledFunction(dataLoaderId) {
  const functions = await listServerFunctionsMitra({ projectId });
  const existing = (functions?.result || []).find((fn) => fn.name === SYNC_SF_NAME);
  const code = buildSyncCode(dataLoaderId);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code,
      description: 'Executa diariamente a carga de devoluções TOTVS usada no faturamento líquido.',
      cronExpression: CRON_DIARIO_0430,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SYNC_SF_NAME,
    type: 'JAVASCRIPT',
    code,
    description: 'Executa diariamente a carga de devoluções TOTVS usada no faturamento líquido.',
    cronExpression: CRON_DIARIO_0430,
  });

  const serverFunctionId = getServerFunctionId(created);
  if (!serverFunctionId) throw new Error('Server Function de sincronizacao criada sem ID retornado.');
  return serverFunctionId;
}

async function main() {
  const { dataLoaderId, loader } = await resolveDataLoaderId();
  const serverFunctionId = await upsertScheduledFunction(dataLoaderId);

  console.log(JSON.stringify({
    dataLoader: {
      id: dataLoaderId,
      name: loader?.name || loader?.NAME || DATA_LOADER_NAME,
      cronExpression: loader?.cronExpression || loader?.CRON_EXPRESSION || null,
    },
    scheduledFunction: {
      id: serverFunctionId,
      name: SYNC_SF_NAME,
      cronExpression: CRON_DIARIO_0430,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao agendar carga de devolucoes TOTVS:');
  console.error(error?.message || error);
  process.exit(1);
});
