import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  deleteServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const USER_ID = 8;
const CODEPTO = 9;
const FILIAIS = ['1', '2', '6'];
const FUNCTION_NAME = 'sincronizarCarteiraComunicacaoDepto9';

function stripDashboardFallback(code) {
  return code
    .replaceAll('LEFT JOIN CARTEIRA_SCOPE CS', 'JOIN CARTEIRA_SCOPE CS')
    .replaceAll(`    AND (\n      CS.USER_ID IS NOT NULL\n      OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.USER_ID = BS.USER_ID)\n    )\n`, '')
    .replaceAll(`    AND (\n      CS.TARGET_USER_ID IS NOT NULL\n      OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.TARGET_USER_ID = B.TARGET_USER_ID)\n    )\n`, '')
    .replaceAll(`  WHERE (\n    CS.TARGET_USER_ID IS NOT NULL\n    OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.TARGET_USER_ID = B.TARGET_USER_ID)\n  )\n`, '');
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function restoreDashboardFunction(serverFunctionId, expectedName) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  if (current?.result?.name !== expectedName) {
    throw new Error(`SF ${serverFunctionId} esperada ${expectedName}, encontrada ${current?.result?.name || 'sem nome'}.`);
  }

  const original = current?.result?.code || '';
  const restored = stripDashboardFallback(original);
  if (restored !== original) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId,
      code: restored,
      description: current?.result?.description || expectedName,
    });
  }
}

const syncCode = `
const { runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = ${projectId};
const userId = ${USER_ID};
const codepto = '${CODEPTO}';
const filiaisSql = ${JSON.stringify(FILIAIS.map((filial) => `'${filial}'`).join(', '))};

async function main() {
  await runDmlMitra({
    projectId,
    sql: \`
      INSERT INTO CLIENTES (RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, CIDADE, UF, SEGMENTO, STATUS, VENDEDOR_ID, CRIADO_EM, WINTHOR_CODCLI)
      SELECT
        MAX(COALESCE(NULLIF(TRIM(IT.CLIENTE), ''), NULLIF(TRIM(V.CLIENTE), ''), CONCAT('Cliente ', V.CODCLI))) AS RAZAO_SOCIAL,
        MAX(COALESCE(NULLIF(TRIM(V.CLIENTE), ''), NULLIF(TRIM(IT.CLIENTE), ''), CONCAT('Cliente ', V.CODCLI))) AS NOME_FANTASIA,
        '' AS CNPJ,
        MAX(COALESCE(NULLIF(TRIM(IT.CIDADE), ''), '')) AS CIDADE,
        MAX(COALESCE(NULLIF(TRIM(IT.UF), ''), '')) AS UF,
        MAX(COALESCE(NULLIF(TRIM(IT.RAMO), ''), NULLIF(TRIM(V.RAMO_CLIENTE), ''), '')) AS SEGMENTO,
        'ATIVO' AS STATUS,
        ${USER_ID} AS VENDEDOR_ID,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS CRIADO_EM,
        V.CODCLI AS WINTHOR_CODCLI
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
      LEFT JOIN IMP_CLIENTES_TOTVS IT ON TRIM(CAST(IT.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      LEFT JOIN CLIENTES C ON TRIM(CAST(C.WINTHOR_CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      WHERE TRIM(CAST(V.CODEPTO AS CHAR)) = '${CODEPTO}'
        AND TRIM(CAST(V.CODFILIAL AS CHAR)) IN (${FILIAIS.map((filial) => `'${filial}'`).join(', ')})
        AND C.ID IS NULL
      GROUP BY V.CODCLI
    \`,
  });

  await runDmlMitra({
    projectId,
    sql: \`
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM, CODFILIAL, ID_SECAO)
      SELECT DISTINCT
        C.ID AS ID_CLIENTE,
        ${USER_ID} AS ID_VENDEDOR,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS CRIADO_EM,
        TRIM(CAST(V.CODFILIAL AS CHAR)) AS CODFILIAL,
        NULL AS ID_SECAO
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
      JOIN CLIENTES C ON TRIM(CAST(C.WINTHOR_CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      WHERE TRIM(CAST(V.CODEPTO AS CHAR)) = '${CODEPTO}'
        AND TRIM(CAST(V.CODFILIAL AS CHAR)) IN (${FILIAIS.map((filial) => `'${filial}'`).join(', ')})
        AND NOT EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = C.ID
            AND EC.ID_VENDEDOR = ${USER_ID}
            AND COALESCE(EC.CODFILIAL, '') = TRIM(CAST(V.CODFILIAL AS CHAR))
        )
    \`,
  });

  const result = await runQueryMitra({
    projectId,
    sql: \`
      SELECT
        COUNT(DISTINCT EC.ID_CLIENTE) AS CLIENTES_CARTEIRA,
        COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(TRIM(IT.RAMO), ''), 'Sem ramo') = 'PESSOA FISICA' THEN EC.ID_CLIENTE END) AS CLIENTES_PF_CARTEIRA,
        COUNT(DISTINCT V.CODCLI) AS CLIENTES_VENDAS_DEPTO9
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
      JOIN CLIENTES C ON TRIM(CAST(C.WINTHOR_CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      LEFT JOIN IMP_CLIENTES_TOTVS IT ON TRIM(CAST(IT.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      LEFT JOIN EQUIPE_CLIENTE EC
        ON EC.ID_CLIENTE = C.ID
       AND EC.ID_VENDEDOR = ${USER_ID}
       AND COALESCE(EC.CODFILIAL, '') = TRIM(CAST(V.CODFILIAL AS CHAR))
      WHERE TRIM(CAST(V.CODEPTO AS CHAR)) = '${CODEPTO}'
        AND TRIM(CAST(V.CODFILIAL AS CHAR)) IN (${FILIAIS.map((filial) => `'${filial}'`).join(', ')})
    \`,
  });

  return result?.result?.rows?.[0] || {};
}

return main();
`;

async function upsertSyncFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const functions = listed?.result || [];
  const existing = functions.find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Sincroniza automaticamente a carteira do usuario comunicacao com clientes do departamento 9 nas filiais 1, 2 e 6.';

  if (existing) {
    if (existing.type === 'JAVASCRIPT') {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: existing.id,
        code: syncCode,
        description,
        cronExpression: '0 */30 * * * *',
      });
      return existing.id;
    }

    await deleteServerFunctionMitra({ projectId, serverFunctionId: existing.id });
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'JAVASCRIPT',
    code: syncCode,
    description,
    cronExpression: '0 */30 * * * *',
  });
  return created?.result?.serverFunctionId || created?.result?.id;
}

async function validate(serverFunctionId) {
  const before = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {},
  });
  const status = String(before?.result?.executionStatus || '');
  const error = String(before?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`Sync falhou: ${error || status}`);
  }

  const check = await runQueryMitra({
    projectId,
    sql: `
      SELECT
        COUNT(DISTINCT EC.ID_CLIENTE) AS CLIENTES_CARTEIRA,
        COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(TRIM(IT.RAMO), ''), 'Sem ramo') = 'PESSOA FISICA' THEN EC.ID_CLIENTE END) AS CLIENTES_PF_CARTEIRA,
        COUNT(DISTINCT V.CODCLI) AS CLIENTES_VENDAS_DEPTO9
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
      JOIN CLIENTES C ON TRIM(CAST(C.WINTHOR_CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      LEFT JOIN IMP_CLIENTES_TOTVS IT ON TRIM(CAST(IT.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
      LEFT JOIN EQUIPE_CLIENTE EC
        ON EC.ID_CLIENTE = C.ID
       AND EC.ID_VENDEDOR = ${USER_ID}
       AND COALESCE(EC.CODFILIAL, '') = TRIM(CAST(V.CODFILIAL AS CHAR))
      WHERE TRIM(CAST(V.CODEPTO AS CHAR)) = '${CODEPTO}'
        AND TRIM(CAST(V.CODFILIAL AS CHAR)) IN (${FILIAIS.map((filial) => `'${filial}'`).join(', ')})
    `,
  });
  const rows = check?.result?.rows || [];
  console.log(JSON.stringify({ serverFunctionId, resultado: rows[0] || {} }, null, 2));
}

async function main() {
  await restoreDashboardFunction(182, 'analyticsRcaMetaResumo');
  await restoreDashboardFunction(214, 'dashboardVendasDiarias');
  const serverFunctionId = await upsertSyncFunction();
  await validate(serverFunctionId);
}

main().catch((error) => {
  console.error('Falha ao configurar sincronizacao de carteira do departamento 9:');
  console.error(error?.message || error);
  process.exit(1);
});
