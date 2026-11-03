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
const FUNCTION_NAME = 'mixCustosDisponiveis';

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
  C.CUSTO_ID,
  C.LABEL,
  C.POLITICA_ID,
  C.POLITICA_NOME,
  C.DATA_REF
FROM (
  SELECT
    CPD.CODPROD,
    CPD.CUSTO,
    'PADRAO' AS TIPO_CUSTO,
    CONCAT('PADRAO:', CPD.CODPROD) AS CUSTO_ID,
    CONCAT('Padrão - ', CAST(CPD.CUSTO AS CHAR)) AS LABEL,
    NULL AS POLITICA_ID,
    NULL AS POLITICA_NOME,
    CPD.DATA_REF,
    1 AS ORDEM
  FROM CUSTOPRODUTO CPD
  JOIN (
    SELECT CODPROD, MAX(DATA_REF) AS DATA_REF
    FROM CUSTOPRODUTO
    WHERE CODPROD = event.codprod
    GROUP BY CODPROD
  ) U ON U.CODPROD = CPD.CODPROD AND U.DATA_REF = CPD.DATA_REF

  UNION ALL

  SELECT
    PI.PRODUCT_ID AS CODPROD,
    PI.SPECIAL_COST AS CUSTO,
    'ESPECIAL' AS TIPO_CUSTO,
    CONCAT('ESPECIAL:', CP.ID, ':', PI.ID) AS CUSTO_ID,
    CONCAT(CP.NAME, ' - ', CAST(PI.SPECIAL_COST AS CHAR)) AS LABEL,
    CP.ID AS POLITICA_ID,
    CP.NAME AS POLITICA_NOME,
    CP.DT_START AS DATA_REF,
    2 AS ORDEM
  FROM COST_POLICIES CP
  JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID
  WHERE CP.STATUS = 'ACTIVE'
    AND PI.PRODUCT_ID = event.codprod
    AND (CP.CLIENTE_ID = event.clienteId OR CP.CLIENTE_ID IS NULL)
    AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END
) C
ORDER BY C.ORDEM, C.POLITICA_NOME, C.CUSTO`,
  },
});

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  return output?.body?.result?.rows || [];
}

async function upsertFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Lista custos padrão e especiais disponíveis por produto para o Mix Builder.';

  if (existing?.id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code: integrationCode, description });
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
    input: { codprod: 128, clienteId: 100946 },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  console.log(JSON.stringify({ serverFunctionId, rows: extractRows(response) }, null, 2));
}

async function main() {
  const serverFunctionId = await upsertFunction();
  await smoke(serverFunctionId);
  console.log(`SF_${FUNCTION_NAME}=${serverFunctionId}`);
}

main().catch((error) => {
  console.error('Falha ao configurar custos disponíveis do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
