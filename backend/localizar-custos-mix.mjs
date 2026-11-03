import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const REMOTE_COST_PROJECT_ID = 46967;
const PAGE_SIZE = 500;

const MIX_CATALOGO_CUSTO_LOCAL_SQL = `
SELECT
  P.CODPROD AS PRODUCT_ID,
  P.CODPROD,
  CAST(P.CODPROD AS CHAR) AS CODIGO,
  P.CODAUXILIAR,
  P.NOME,
  CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA,
  COALESCE(CP.CUSTO, 0) AS CUSTO_STD,
  NULL AS POLICY_ID,
  NULL AS CUSTO_POLICY,
  COALESCE(CP.CUSTO, 0) AS CUSTO_APLICADO,
  CASE WHEN CP.CUSTO IS NOT NULL THEN 'PADRAO' ELSE 'SEM_CUSTO' END AS TIPO_CUSTO,
  0 AS PRECO_TABELA,
  CP.DATA_REF AS DATA_CUSTO_STD
FROM PRODUTOS_CUSTOS P
LEFT JOIN CUSTO_PADRAO_PRODUTO CP ON CP.CODPROD = P.CODPROD
WHERE (
  '{{busca}}' = ''
  OR UPPER(P.NOME) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR CAST(P.CODPROD AS CHAR) LIKE CONCAT('%', '{{busca}}', '%')
  OR UPPER(P.CODFAB) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR UPPER(COALESCE(P.CODAUXILIAR, '')) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
)
AND COALESCE(P.ATIVO, TRUE) = TRUE
ORDER BY P.CODPROD
LIMIT {{limit}} OFFSET {{offset}}
`;

const MIX_CUSTOS_ESPECIAIS_LOCAL_SQL = `
SELECT
  CE.CODPROD,
  CE.CLIENTE_ID,
  CE.CUSTO,
  'ESPECIAL' AS TIPO_CUSTO,
  CONCAT('ESPECIAL:', CE.POLITICA_ID, ':', CE.ITEM_ID) AS CUSTO_ID,
  CONCAT(CE.POLITICA_NOME, ' - ', CAST(CE.CUSTO AS CHAR)) AS LABEL,
  CE.POLITICA_ID,
  CE.POLITICA_NOME,
  CE.FILIAL_ID,
  CE.DATA_INICIO AS DATA_REF
FROM CUSTO_ESPECIAL_PRODUTO CE
WHERE CE.CODPROD = {{codprod}}
  AND CE.STATUS = 'ACTIVE'
  AND (
    '{{filialId}}' = ''
    OR CE.FILIAL_ID IS NULL
    OR CE.FILIAL_ID = CAST('{{filialId}}' AS UNSIGNED)
  )
  AND (
    '{{clienteId}}' = ''
    OR CE.CLIENTE_ID IS NULL
    OR CE.CLIENTE_ID = CAST('{{clienteId}}' AS UNSIGNED)
    OR NOT EXISTS (
      SELECT 1
      FROM CUSTO_ESPECIAL_CLIENTES CEC_ANY
      WHERE CEC_ANY.CUSTO_ESPECIAL_ID = CE.ITEM_ID
    )
    OR EXISTS (
      SELECT 1
      FROM CUSTO_ESPECIAL_CLIENTES CEC
      WHERE CEC.CUSTO_ESPECIAL_ID = CE.ITEM_ID
        AND CEC.CLIENTE_ID = CAST('{{clienteId}}' AS UNSIGNED)
    )
  )
ORDER BY CE.POLITICA_NOME, CE.CUSTO
`;

function importStandardCostCode() {
  return JSON.stringify({
    connection: 'gestao-de-custos',
    method: 'POST',
    endpoint: 'runQuery',
    body: {
      sql: `
SELECT C.CODPROD, C.CUSTO, C.DATA_REF
FROM CUSTOPRODUTO C
JOIN (
  SELECT CODPROD, MAX(DATA_REF) AS DATA_REF
  FROM CUSTOPRODUTO
  GROUP BY CODPROD
) U ON U.CODPROD = C.CODPROD AND U.DATA_REF = C.DATA_REF
ORDER BY C.CODPROD
LIMIT event.limit OFFSET event.offset`,
    },
  });
}

function importSpecialCostCode() {
  return JSON.stringify({
    connection: 'gestao-de-custos',
    method: 'POST',
    endpoint: 'runQuery',
    body: {
      sql: `
SELECT
  CASE WHEN COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) IS NULL THEN PI.ID ELSE (PI.ID * 1000000 + COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID)) END AS ITEM_ID,
  PI.ID AS SOURCE_ITEM_ID,
  PI.PRODUCT_ID AS CODPROD,
  COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) AS CLIENTE_ID,
  PI.SPECIAL_COST AS CUSTO,
  CP.ID AS POLITICA_ID,
  CP.NAME AS POLITICA_NOME,
  CP.FILIAL_ID,
  CP.STATUS,
  CP.DT_START AS DATA_INICIO,
  CP.DT_END AS DATA_FIM
FROM COST_POLICIES CP
JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID
LEFT JOIN COST_POLICY_CLIENTS CPC ON CPC.POLICY_ID = CP.ID
WHERE CP.STATUS = 'ACTIVE'
  AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END
ORDER BY PI.PRODUCT_ID, CP.ID, PI.ID, CLIENTE_ID
LIMIT event.limit OFFSET event.offset`,
    },
  });
}

function extractRows(response) {
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  if (output?.error) throw new Error(String(output.error));
  return output?.body?.result?.rows || output?.rows || [];
}

function sqlString(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(fallback);
}

async function ensureTables() {
  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS CUSTO_PADRAO_PRODUTO (
        CODPROD INT NOT NULL PRIMARY KEY,
        CUSTO DECIMAL(12,4) NOT NULL,
        DATA_REF VARCHAR(19) NOT NULL,
        ATUALIZADO_EM VARCHAR(19) NOT NULL
      )
    `,
  });

  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY CUSTO DECIMAL(12,4) NOT NULL' });
  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY DATA_REF VARCHAR(19) NOT NULL' });

  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS CUSTO_ESPECIAL_PRODUTO (
        ITEM_ID BIGINT NOT NULL PRIMARY KEY,
        CODPROD INT NOT NULL,
        CLIENTE_ID INT NULL,
        CUSTO DECIMAL(12,4) NOT NULL,
        POLITICA_ID INT NOT NULL,
        POLITICA_NOME VARCHAR(180) NOT NULL,
        STATUS VARCHAR(20) NOT NULL,
        FILIAL_ID INT NULL,
        DATA_INICIO VARCHAR(10) NOT NULL,
        DATA_FIM VARCHAR(10) NOT NULL,
        ATUALIZADO_EM VARCHAR(19) NOT NULL,
        INDEX IDX_CUSTO_ESPECIAL_PRODUTO_CODPROD (CODPROD),
        INDEX IDX_CUSTO_ESPECIAL_PRODUTO_CLIENTE (CLIENTE_ID),
        INDEX IDX_CUSTO_ESPECIAL_PRODUTO_FILIAL (FILIAL_ID),
        INDEX IDX_CUSTO_ESPECIAL_PRODUTO_POLITICA (POLITICA_ID)
      )
    `,
  });

  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO MODIFY CUSTO DECIMAL(12,4) NOT NULL' });
  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO MODIFY ITEM_ID BIGINT NOT NULL' });

  const columns = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CUSTO_ESPECIAL_PRODUTO' AND COLUMN_NAME = 'FILIAL_ID'",
  });
  if (Number(columns?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO ADD COLUMN FILIAL_ID INT NULL AFTER STATUS',
    });
    await runDdlMitra({
      projectId,
      sql: 'CREATE INDEX IDX_CUSTO_ESPECIAL_PRODUTO_FILIAL ON CUSTO_ESPECIAL_PRODUTO (FILIAL_ID)',
    });
  }

  const clienteColumn = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CUSTO_ESPECIAL_PRODUTO' AND COLUMN_NAME = 'CLIENTE_ID'",
  });
  if (Number(clienteColumn?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO ADD COLUMN CLIENTE_ID INT NULL AFTER CODPROD' });
    await runDdlMitra({ projectId, sql: 'CREATE INDEX IDX_CUSTO_ESPECIAL_PRODUTO_CLIENTE ON CUSTO_ESPECIAL_PRODUTO (CLIENTE_ID)' });
  }

  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS CUSTO_ESPECIAL_CLIENTES (
        CUSTO_ESPECIAL_ID INT NOT NULL,
        CLIENTE_ID INT NOT NULL,
        PRIMARY KEY (CUSTO_ESPECIAL_ID, CLIENTE_ID),
        INDEX IDX_CUSTO_ESPECIAL_CLIENTES_CLIENTE (CLIENTE_ID)
      )
    `,
  });
}

async function upsertIntegrationFunction(name, code, description) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === name);
  if (existing?.id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code, description });
    return existing.id;
  }

  const created = await createServerFunctionMitra({ projectId, name, type: 'INTEGRATION', code, description });
  return Number(created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id);
}

async function importStandardCosts(serverFunctionId) {
  let imported = 0;
  const now = new Date().toISOString().slice(0, 19);

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let rows = [];
    try {
      const response = await runQueryMitra({
        projectId: REMOTE_COST_PROJECT_ID,
        sql: `
          SELECT C.CODPROD, C.CUSTO, C.DATA_REF
          FROM CUSTOPRODUTO C
          JOIN (
            SELECT CODPROD, MAX(DATA_REF) AS DATA_REF
            FROM CUSTOPRODUTO
            GROUP BY CODPROD
          ) U ON U.CODPROD = C.CODPROD AND U.DATA_REF = C.DATA_REF
          ORDER BY C.CODPROD
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `,
      });
      rows = response?.result?.rows || [];
    } catch (error) {
      console.warn(`Carga remota de custos padrão indisponível: ${error?.message || error}`);
      break;
    }

    if (!rows.length) break;

    const values = rows.map((row) => `(
      ${sqlNumber(row.CODPROD)},
      ${sqlNumber(row.CUSTO)},
      ${sqlString(String(row.DATA_REF || now).slice(0, 19))},
      ${sqlString(now)}
    )`).join(',');

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO CUSTO_PADRAO_PRODUTO (CODPROD, CUSTO, DATA_REF, ATUALIZADO_EM)
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          CUSTO = VALUES(CUSTO),
          DATA_REF = VALUES(DATA_REF),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    imported += rows.length;
    console.log(`Custos padrão importados: ${imported}`);
    if (rows.length < PAGE_SIZE) break;
  }

  return imported;
}

async function importSpecialCosts(serverFunctionId) {
  let imported = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let rows = [];
    try {
      const response = await runQueryMitra({
        projectId: REMOTE_COST_PROJECT_ID,
        sql: `
          SELECT
            CASE WHEN COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) IS NULL THEN PI.ID ELSE (PI.ID * 1000000 + COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID)) END AS ITEM_ID,
            PI.ID AS SOURCE_ITEM_ID,
            PI.PRODUCT_ID AS CODPROD,
            COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) AS CLIENTE_ID,
            PI.SPECIAL_COST AS CUSTO,
            CP.ID AS POLITICA_ID,
            CP.NAME AS POLITICA_NOME,
            CP.FILIAL_ID,
            CP.STATUS,
            CP.DT_START AS DATA_INICIO,
            CP.DT_END AS DATA_FIM
          FROM COST_POLICIES CP
          JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID
          LEFT JOIN COST_POLICY_CLIENTS CPC ON CPC.POLICY_ID = CP.ID
          WHERE CP.STATUS = 'ACTIVE'
            AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END
          ORDER BY PI.PRODUCT_ID, CP.ID, PI.ID, CLIENTE_ID
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `,
      });
      rows = response?.result?.rows || [];
    } catch (error) {
      console.warn(`Carga remota de custos especiais indisponível: ${error?.message || error}`);
      break;
    }

    if (!rows.length) break;

    const now = new Date().toISOString().slice(0, 19);
    const values = rows.map((row) => {
      return `(
        ${sqlNumber(row.ITEM_ID)},
        ${sqlNumber(row.CODPROD)},
        ${row.CLIENTE_ID == null || row.CLIENTE_ID === '' ? 'NULL' : sqlNumber(row.CLIENTE_ID)},
        ${sqlNumber(row.CUSTO)},
        ${sqlNumber(row.POLITICA_ID)},
        ${sqlString(row.POLITICA_NOME || `Política ${row.POLITICA_ID}`)},
        ${sqlString(row.STATUS || 'ACTIVE')},
        ${row.FILIAL_ID == null || row.FILIAL_ID === '' ? 'NULL' : sqlNumber(row.FILIAL_ID)},
        ${sqlString(row.DATA_INICIO || now.slice(0, 10))},
        ${sqlString(row.DATA_FIM || now.slice(0, 10))},
        ${sqlString(now)}
      )`;
    }).join(',');

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO CUSTO_ESPECIAL_PRODUTO
          (ITEM_ID, CODPROD, CLIENTE_ID, CUSTO, POLITICA_ID, POLITICA_NOME, STATUS, FILIAL_ID, DATA_INICIO, DATA_FIM, ATUALIZADO_EM)
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          CODPROD = VALUES(CODPROD),
          CLIENTE_ID = VALUES(CLIENTE_ID),
          CUSTO = VALUES(CUSTO),
          POLITICA_ID = VALUES(POLITICA_ID),
          POLITICA_NOME = VALUES(POLITICA_NOME),
          STATUS = VALUES(STATUS),
          FILIAL_ID = VALUES(FILIAL_ID),
          DATA_INICIO = VALUES(DATA_INICIO),
          DATA_FIM = VALUES(DATA_FIM),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    const policyIds = [...new Set(rows.map((row) => Number(row.POLITICA_ID)).filter(Number.isFinite))];
    const clientLinks = [];
    if (policyIds.length) {
      try {
        const linksResponse = await runQueryMitra({
          projectId: REMOTE_COST_PROJECT_ID,
          sql: `
            SELECT (PI.ID * 1000000 + CPC.CLIENTE_ID) AS CUSTO_ESPECIAL_ID, CPC.CLIENTE_ID
            FROM POLICY_ITEMS PI
            JOIN COST_POLICY_CLIENTS CPC ON CPC.POLICY_ID = PI.POLICY_ID
            WHERE PI.POLICY_ID IN (${policyIds.join(',')})
            UNION
            SELECT (PI.ID * 1000000 + CP.CLIENTE_ID) AS CUSTO_ESPECIAL_ID, CP.CLIENTE_ID
            FROM POLICY_ITEMS PI
            JOIN COST_POLICIES CP ON CP.ID = PI.POLICY_ID
            WHERE PI.POLICY_ID IN (${policyIds.join(',')})
              AND CP.CLIENTE_ID IS NOT NULL
          `,
        });
        clientLinks.push(...(linksResponse?.result?.rows || []));
      } catch (error) {
        console.warn(`Carga remota de vínculos cliente-custo indisponível: ${error?.message || error}`);
      }
    }

    const validLinks = clientLinks
      .map((row) => ({ custoEspecialId: Number(row.CUSTO_ESPECIAL_ID), clienteId: Number(row.CLIENTE_ID) }))
      .filter((row) => Number.isFinite(row.custoEspecialId) && Number.isFinite(row.clienteId));

    if (validLinks.length) {
      await runDmlMitra({
        projectId,
        sql: `
          INSERT INTO CUSTO_ESPECIAL_CLIENTES (CUSTO_ESPECIAL_ID, CLIENTE_ID)
          VALUES ${validLinks.map((row) => `(${row.custoEspecialId}, ${row.clienteId})`).join(',')}
          ON DUPLICATE KEY UPDATE CLIENTE_ID = VALUES(CLIENTE_ID)
        `,
      });
    }

    imported += rows.length;
    console.log(`Custos especiais importados: ${imported}`);
    if (rows.length < PAGE_SIZE) break;
  }

  return imported;
}

async function updateRuntimeFunctions() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    code: MIX_CATALOGO_CUSTO_LOCAL_SQL,
    description: 'Catálogo do Mix Builder usando produtos locais e custo padrão local.',
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 228,
    type: 'SQL',
    jdbcId: null,
    code: MIX_CUSTOS_ESPECIAIS_LOCAL_SQL,
    description: 'Lista custos especiais locais por produto e cliente para o Mix Builder.',
  });
}

async function smoke() {
  extractRows(await executeServerFunctionMitra({ projectId, serverFunctionId: 91, input: { busca: '1', clienteId: '', limit: '5', offset: '0' } }));
  extractRows(await executeServerFunctionMitra({ projectId, serverFunctionId: 228, input: { codprod: '128', clienteId: '100946', filialId: '' } }));
}

async function main() {
  await ensureTables();
  const importPadraoId = await upsertIntegrationFunction(
    'mixImportarCustosPadraoRemoto',
    importStandardCostCode(),
    'Importa custos padrão para cache local do Mix Builder.',
  );
  const importEspecialId = await upsertIntegrationFunction(
    'mixImportarCustosEspeciaisRemoto',
    importSpecialCostCode(),
    'Importa custos especiais para cache local do Mix Builder.',
  );

  const standardCount = await importStandardCosts(importPadraoId);
  const specialCount = await importSpecialCosts(importEspecialId);
  await updateRuntimeFunctions();
  await smoke();

  console.log(`Importação concluída: ${standardCount} custo(s) padrão e ${specialCount} custo(s) especial(is).`);
}

main().catch((error) => {
  console.error('Falha ao importar custos do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
