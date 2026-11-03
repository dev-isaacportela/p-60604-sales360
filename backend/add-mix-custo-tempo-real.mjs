import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const FUNCTION_NAME = 'mixCustoTempoReal';

const integrationCode = JSON.stringify({
  connection: 'gestao-de-custos',
  method: 'POST',
  endpoint: 'runQuery',
  body: {
    sql: `
SELECT
  C.CODPROD,
  C.CUSTO,
  C.TIPO_CUSTO,
  C.POLITICA_ID,
  C.POLITICA_NOME,
  C.DATA_REF
FROM (
  SELECT
    PI.PRODUCT_ID AS CODPROD,
    PI.SPECIAL_COST AS CUSTO,
    'POLICY' AS TIPO_CUSTO,
    CP.ID AS POLITICA_ID,
    CP.NAME AS POLITICA_NOME,
    CP.DT_START AS DATA_REF,
    1 AS PRIORIDADE
  FROM COST_POLICIES CP
  JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID
  WHERE CP.STATUS = 'ACTIVE'
    AND UPPER('event.tipoCusto') = 'ESPECIAL'
    AND PI.PRODUCT_ID = event.codprod
    AND CP.CLIENTE_ID = event.clienteId
    AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END

  UNION ALL

  SELECT
    CPD.CODPROD,
    CPD.CUSTO,
    'BASE' AS TIPO_CUSTO,
    NULL AS POLITICA_ID,
    NULL AS POLITICA_NOME,
    CPD.DATA_REF,
    2 AS PRIORIDADE
  FROM CUSTOPRODUTO CPD
  WHERE UPPER('event.tipoCusto') = 'PADRAO'
    AND CPD.CODPROD = event.codprod
) C
ORDER BY C.DATA_REF DESC
LIMIT 1`,
  },
});

function extractOutput(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    output = JSON.parse(output);
  }
  return output;
}

async function upsertFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Consulta custo em tempo real para o Mix Builder usando CODPROD e clienteId.';

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: integrationCode,
      description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'INTEGRATION',
    code: integrationCode,
    description,
  });

  return Number(created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id);
}

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { codprod: 91, clienteId: 100946, tipoCusto: 'PADRAO' },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Status inesperado: ${status}`);
  }

  const output = extractOutput(response);
  const specialResponse = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { codprod: 128, clienteId: 100946, tipoCusto: 'ESPECIAL' },
  });
  const specialOutput = extractOutput(specialResponse);
  console.log(JSON.stringify({ serverFunctionId, output, specialOutput }, null, 2));
}

async function main() {
  const serverFunctionId = await upsertFunction();
  await smoke(serverFunctionId);
  console.log(`SF_${FUNCTION_NAME}=${serverFunctionId}`);
}

main().catch((error) => {
  console.error('Falha ao configurar custo em tempo real do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
