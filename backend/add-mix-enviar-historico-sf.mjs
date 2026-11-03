import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const FUNCTION_NAME = 'mixEnviarHistorico';

const SQL = `
UPDATE PRODUCT_MIX
SET ENVIADO_HISTORICO = TRUE,
    DT_ENVIO_HISTORICO = '{{dtEnvio}}'
WHERE ID = {{mixId}}
  AND ID_USUARIO_CRIACAO = :VAR_USER
`;

async function ensureColumns() {
  const enviadoColumn = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRODUCT_MIX' AND COLUMN_NAME = 'ENVIADO_HISTORICO'",
  });
  if (Number(enviadoColumn?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE PRODUCT_MIX ADD COLUMN ENVIADO_HISTORICO BOOLEAN DEFAULT FALSE' });
  }

  const dataColumn = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRODUCT_MIX' AND COLUMN_NAME = 'DT_ENVIO_HISTORICO'",
  });
  if (Number(dataColumn?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE PRODUCT_MIX ADD COLUMN DT_ENVIO_HISTORICO VARCHAR(19)' });
  }
}

async function upsertFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Marca um mix do vendedor logado como enviado para o histórico do cliente.';

  if (existing?.id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code: SQL, description });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'SQL',
    code: SQL,
    description,
  });

  return Number(created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id);
}

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { mixId: '0', dtEnvio: '2000-01-01T00:00:00' },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
}

async function main() {
  await ensureColumns();
  const id = await upsertFunction();
  await smoke(id);
  console.log(`SF_${FUNCTION_NAME}=${id}`);
}

main().catch((error) => {
  console.error('Falha ao criar função de envio do mix ao histórico:');
  console.error(error?.message || error);
  process.exit(1);
});
