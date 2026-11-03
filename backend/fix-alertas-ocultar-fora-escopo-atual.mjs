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

function getCode(response) {
  return String(response?.result?.code || response?.code || '');
}

async function readCode(serverFunctionId) {
  return getCode(await readServerFunctionMitra({ projectId, serverFunctionId }));
}

function addCurrentScopeCte(sql) {
  if (sql.includes('CURRENT_ALERT_SCOPE AS (')) return sql;
  return sql.replace(
    `)
SELECT COUNT(*) AS TOTAL`,
    `),
CURRENT_ALERT_SCOPE AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
  WHERE EC.ID_CLIENTE IS NOT NULL
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
)
SELECT COUNT(*) AS TOTAL`,
  ).replace(
    `),
FILTRADO AS (`,
    `),
CURRENT_ALERT_SCOPE AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
  WHERE EC.ID_CLIENTE IS NOT NULL
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
FILTRADO AS (`,
  );
}

function addCurrentScopeFilter(sql) {
  if (sql.includes('FROM CURRENT_ALERT_SCOPE CAS')) return sql;
  return sql.replace(
    `AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)`,
    `AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)
    AND EXISTS (
      SELECT 1
      FROM CURRENT_ALERT_SCOPE CAS
      WHERE CAS.ID_CLIENTE = AI.ID_CLIENTE
        AND CAS.ID_VENDEDOR = AI.ID_VENDEDOR
        AND CAS.CODFILIAL = TRIM(COALESCE(CAST(AI.CODFILIAL AS CHAR), ''))
        AND (COALESCE(AI.CODEPTO, '') = '' OR CAS.CODEPTO = AI.CODEPTO)
        AND (
          AI.ID_SECAO IS NULL
          OR TRIM(CAST(CAS.ID_SECAO AS CHAR)) = TRIM(CAST(AI.ID_SECAO AS CHAR))
          OR LPAD(TRIM(CAST(CAS.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(AI.ID_SECAO AS CHAR))
        )
    )`,
  );
}

async function update(serverFunctionId, description) {
  const original = await readCode(serverFunctionId);
  const next = addCurrentScopeFilter(addCurrentScopeCte(original));
  await updateServerFunctionMitra({ projectId, serverFunctionId, code: next, description });
  console.log(`SF ${serverFunctionId} atualizada.`);
}

async function main() {
  await update(131, 'Lista alertas respeitando escopo atual da carteira, ocultando clientes removidos ou fora da BU.');
  await update(134, 'Conta alertas nao lidos respeitando escopo atual da carteira.');
  console.log('Listagem de alertas alinhada ao escopo atual.');
}

main().catch((error) => {
  console.error('Falha ao alinhar listagem de alertas ao escopo atual:');
  console.error(error?.message || error);
  process.exit(1);
});
