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
const FUNCTION_NAME = 'mixCatalogoProdutosCustosRemoto';

const integrationCode = JSON.stringify({
  connection: 'gestao-de-custos',
  method: 'POST',
  endpoint: 'runQuery',
  body: {
    sql: `
SELECT
  P.CODPROD AS PRODUCT_ID,
  P.CODPROD,
  CAST(P.CODPROD AS CHAR) AS CODIGO,
  P.NOME,
  CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA,
  0 AS PRECO_TABELA,
  COALESCE(CB.CUSTO, 0) AS CUSTO_STD,
  CPOL.CUSTO AS CUSTO_POLICY,
  COALESCE(CPOL.CUSTO, CB.CUSTO, 0) AS CUSTO_APLICADO,
  CASE
    WHEN CPOL.CUSTO IS NOT NULL THEN 'POLICY'
    WHEN CB.CUSTO IS NOT NULL THEN 'BASE'
    ELSE 'SEM_CUSTO'
  END AS TIPO_CUSTO
FROM PRODUTOS P
LEFT JOIN (
  SELECT C1.CODPROD, C1.CUSTO
  FROM CUSTOPRODUTO C1
  JOIN (
    SELECT CODPROD, MAX(DATA_REF) AS DATA_REF
    FROM CUSTOPRODUTO
    GROUP BY CODPROD
  ) U ON U.CODPROD = C1.CODPROD AND U.DATA_REF = C1.DATA_REF
) CB ON CB.CODPROD = P.CODPROD
LEFT JOIN (
  SELECT PI.PRODUCT_ID AS CODPROD, PI.SPECIAL_COST AS CUSTO
  FROM COST_POLICIES CP
  JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID
  WHERE CP.STATUS = 'ACTIVE'
    AND CP.CLIENTE_ID = event.clienteId
    AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END
) CPOL ON CPOL.CODPROD = P.CODPROD
WHERE (
  'event.busca' = ''
  OR UPPER(P.NOME) LIKE CONCAT('%', UPPER('event.busca'), '%')
  OR CAST(P.CODPROD AS CHAR) LIKE CONCAT('%', 'event.busca', '%')
  OR UPPER(P.CODFAB) LIKE CONCAT('%', UPPER('event.busca'), '%')
)
ORDER BY P.NOME
LIMIT event.limit OFFSET event.offset`,
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
  const description = 'Lista produtos do projeto de gestão de custos para o Mix Builder.';

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
    input: { busca: 'whey', clienteId: 100946, limit: 5, offset: 0 },
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
  console.error('Falha ao configurar catálogo remoto de custos:');
  console.error(error?.message || error);
  process.exit(1);
});
