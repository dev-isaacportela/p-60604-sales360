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
const FUNCTION_NAME = 'mixAtualizarCustosSeNecessario';
const REMOTE_COST_PROJECT_ID = 46967;
const TTL_SECONDS = 120;
const PAGE_SIZE = 500;

const serverFunctionCode = String.raw`
const {
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');

const projectId = ${projectId};
const remoteCostProjectId = ${REMOTE_COST_PROJECT_ID};
const ttlSeconds = Number(event.ttlSeconds || ${TTL_SECONDS});
const pageSize = ${PAGE_SIZE};

function sqlString(value) {
  if (value == null || value === '') return 'NULL';
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function sqlNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(fallback);
}

function secondsSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const time = new Date(String(iso).replace(' ', 'T')).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / 1000);
}

async function ensureTables() {
  await runDdlMitra({
    projectId,
    sql:
      'CREATE TABLE IF NOT EXISTS CUSTO_PADRAO_PRODUTO (' +
      'CODPROD INT NOT NULL PRIMARY KEY, ' +
      'CUSTO DECIMAL(12,4) NOT NULL, ' +
      'DATA_REF VARCHAR(19) NOT NULL, ' +
      'ATUALIZADO_EM VARCHAR(19) NOT NULL' +
      ')',
  });

  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY CUSTO DECIMAL(12,4) NOT NULL' });
  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY DATA_REF VARCHAR(19) NOT NULL' });

  await runDdlMitra({
    projectId,
    sql:
      'CREATE TABLE IF NOT EXISTS CUSTO_ESPECIAL_PRODUTO (' +
      'ITEM_ID BIGINT NOT NULL PRIMARY KEY, ' +
      'CODPROD INT NOT NULL, ' +
      'CLIENTE_ID INT NULL, ' +
      'CUSTO DECIMAL(12,4) NOT NULL, ' +
      'POLITICA_ID INT NOT NULL, ' +
      'POLITICA_NOME VARCHAR(180) NOT NULL, ' +
      'STATUS VARCHAR(20) NOT NULL, ' +
      'FILIAL_ID INT NULL, ' +
      'DATA_INICIO VARCHAR(10) NOT NULL, ' +
      'DATA_FIM VARCHAR(10) NOT NULL, ' +
      'ATUALIZADO_EM VARCHAR(19) NOT NULL, ' +
      'INDEX IDX_CUSTO_ESPECIAL_PRODUTO_CODPROD (CODPROD), ' +
      'INDEX IDX_CUSTO_ESPECIAL_PRODUTO_CLIENTE (CLIENTE_ID), ' +
      'INDEX IDX_CUSTO_ESPECIAL_PRODUTO_FILIAL (FILIAL_ID), ' +
      'INDEX IDX_CUSTO_ESPECIAL_PRODUTO_POLITICA (POLITICA_ID)' +
      ')',
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
    sql:
      'CREATE TABLE IF NOT EXISTS CUSTO_ESPECIAL_CLIENTES (' +
      'CUSTO_ESPECIAL_ID INT NOT NULL, ' +
      'CLIENTE_ID INT NOT NULL, ' +
      'PRIMARY KEY (CUSTO_ESPECIAL_ID, CLIENTE_ID), ' +
      'INDEX IDX_CUSTO_ESPECIAL_CLIENTES_CLIENTE (CLIENTE_ID)' +
      ')',
  });

  await runDdlMitra({
    projectId,
    sql:
      'CREATE TABLE IF NOT EXISTS MIX_CUSTOS_SYNC (' +
      'CHAVE VARCHAR(80) NOT NULL PRIMARY KEY, ' +
      'VALOR VARCHAR(255), ' +
      'ATUALIZADO_EM VARCHAR(19) NOT NULL' +
      ')',
  });
}

async function getLastSuccessAt() {
  const result = await runQueryMitra({
    projectId,
    sql: "SELECT VALOR FROM MIX_CUSTOS_SYNC WHERE CHAVE = 'LAST_SUCCESS_AT' LIMIT 1",
  });
  return result?.result?.rows?.[0]?.VALOR || '';
}

async function setStatus(key, value, now) {
  await runDmlMitra({
    projectId,
    sql:
      'INSERT INTO MIX_CUSTOS_SYNC (CHAVE, VALOR, ATUALIZADO_EM) VALUES ' +
      '(' + sqlString(key) + ', ' + sqlString(value) + ', ' + sqlString(now) + ') ' +
      'ON DUPLICATE KEY UPDATE VALOR = VALUES(VALOR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
  });
}

async function importStandardCosts(now) {
  let imported = 0;

  for (let offset = 0; ; offset += pageSize) {
    const response = await runQueryMitra({
      projectId: remoteCostProjectId,
      sql:
        'SELECT C.CODPROD, C.CUSTO, C.DATA_REF ' +
        'FROM CUSTOPRODUTO C ' +
        'JOIN (SELECT CODPROD, MAX(DATA_REF) AS DATA_REF FROM CUSTOPRODUTO GROUP BY CODPROD) U ' +
        'ON U.CODPROD = C.CODPROD AND U.DATA_REF = C.DATA_REF ' +
        'ORDER BY C.CODPROD ' +
        'LIMIT ' + pageSize + ' OFFSET ' + offset,
    });

    const rows = response?.result?.rows || [];
    if (!rows.length) break;

    const values = rows.map((row) =>
      '(' +
      sqlNumber(row.CODPROD) + ', ' +
      sqlNumber(row.CUSTO) + ', ' +
      sqlString(String(row.DATA_REF || now).slice(0, 19)) + ', ' +
      sqlString(now) +
      ')'
    ).join(',');

    await runDmlMitra({
      projectId,
      sql:
        'INSERT INTO CUSTO_PADRAO_PRODUTO (CODPROD, CUSTO, DATA_REF, ATUALIZADO_EM) VALUES ' + values + ' ' +
        'ON DUPLICATE KEY UPDATE CUSTO = VALUES(CUSTO), DATA_REF = VALUES(DATA_REF), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
    });

    imported += rows.length;
    if (rows.length < pageSize) break;
  }

  return imported;
}

async function importSpecialCosts(now) {
  let imported = 0;

  for (let offset = 0; ; offset += pageSize) {
    const response = await runQueryMitra({
      projectId: remoteCostProjectId,
      sql:
        'SELECT CASE WHEN COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) IS NULL THEN PI.ID ELSE (PI.ID * 1000000 + COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID)) END AS ITEM_ID, ' +
        'PI.ID AS SOURCE_ITEM_ID, PI.PRODUCT_ID AS CODPROD, COALESCE(CP.CLIENTE_ID, CPC.CLIENTE_ID) AS CLIENTE_ID, PI.SPECIAL_COST AS CUSTO, ' +
        'CP.ID AS POLITICA_ID, CP.NAME AS POLITICA_NOME, CP.FILIAL_ID, CP.STATUS, CP.DT_START AS DATA_INICIO, CP.DT_END AS DATA_FIM ' +
        'FROM COST_POLICIES CP ' +
        'JOIN POLICY_ITEMS PI ON PI.POLICY_ID = CP.ID ' +
        'LEFT JOIN COST_POLICY_CLIENTS CPC ON CPC.POLICY_ID = CP.ID ' +
        "WHERE CP.STATUS = 'ACTIVE' AND CURRENT_DATE BETWEEN CP.DT_START AND CP.DT_END " +
        'ORDER BY PI.PRODUCT_ID, CP.ID, PI.ID, CLIENTE_ID ' +
        'LIMIT ' + pageSize + ' OFFSET ' + offset,
    });

    const rows = response?.result?.rows || [];
    if (!rows.length) break;

    const values = rows.map((row) =>
      '(' +
      sqlNumber(row.ITEM_ID) + ', ' +
      sqlNumber(row.CODPROD) + ', ' +
      (row.CLIENTE_ID == null || row.CLIENTE_ID === '' ? 'NULL' : sqlNumber(row.CLIENTE_ID)) + ', ' +
      sqlNumber(row.CUSTO) + ', ' +
      sqlNumber(row.POLITICA_ID) + ', ' +
      sqlString(row.POLITICA_NOME || ('Política ' + row.POLITICA_ID)) + ', ' +
      sqlString(row.STATUS || 'ACTIVE') + ', ' +
      (row.FILIAL_ID == null || row.FILIAL_ID === '' ? 'NULL' : sqlNumber(row.FILIAL_ID)) + ', ' +
      sqlString(row.DATA_INICIO || now.slice(0, 10)) + ', ' +
      sqlString(row.DATA_FIM || now.slice(0, 10)) + ', ' +
      sqlString(now) +
      ')'
    ).join(',');

    await runDmlMitra({
      projectId,
      sql:
        'INSERT INTO CUSTO_ESPECIAL_PRODUTO ' +
        '(ITEM_ID, CODPROD, CLIENTE_ID, CUSTO, POLITICA_ID, POLITICA_NOME, STATUS, FILIAL_ID, DATA_INICIO, DATA_FIM, ATUALIZADO_EM) VALUES ' + values + ' ' +
        'ON DUPLICATE KEY UPDATE CODPROD = VALUES(CODPROD), CLIENTE_ID = VALUES(CLIENTE_ID), CUSTO = VALUES(CUSTO), POLITICA_ID = VALUES(POLITICA_ID), ' +
        'POLITICA_NOME = VALUES(POLITICA_NOME), STATUS = VALUES(STATUS), FILIAL_ID = VALUES(FILIAL_ID), DATA_INICIO = VALUES(DATA_INICIO), ' +
        'DATA_FIM = VALUES(DATA_FIM), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
    });

    const policyIds = [...new Set(rows.map((row) => Number(row.POLITICA_ID)).filter(Number.isFinite))];
    if (policyIds.length) {
      const linksResponse = await runQueryMitra({
        projectId: remoteCostProjectId,
        sql:
          'SELECT (PI.ID * 1000000 + CPC.CLIENTE_ID) AS CUSTO_ESPECIAL_ID, CPC.CLIENTE_ID ' +
          'FROM POLICY_ITEMS PI ' +
          'JOIN COST_POLICY_CLIENTS CPC ON CPC.POLICY_ID = PI.POLICY_ID ' +
          'WHERE PI.POLICY_ID IN (' + policyIds.join(',') + ') ' +
          'UNION ' +
          'SELECT (PI.ID * 1000000 + CP.CLIENTE_ID) AS CUSTO_ESPECIAL_ID, CP.CLIENTE_ID ' +
          'FROM POLICY_ITEMS PI ' +
          'JOIN COST_POLICIES CP ON CP.ID = PI.POLICY_ID ' +
          'WHERE PI.POLICY_ID IN (' + policyIds.join(',') + ') AND CP.CLIENTE_ID IS NOT NULL',
      });

      const links = (linksResponse?.result?.rows || [])
        .map((row) => ({ custoEspecialId: Number(row.CUSTO_ESPECIAL_ID), clienteId: Number(row.CLIENTE_ID) }))
        .filter((row) => Number.isFinite(row.custoEspecialId) && Number.isFinite(row.clienteId));

      if (links.length) {
        await runDmlMitra({
          projectId,
          sql:
            'INSERT INTO CUSTO_ESPECIAL_CLIENTES (CUSTO_ESPECIAL_ID, CLIENTE_ID) VALUES ' +
            links.map((row) => '(' + row.custoEspecialId + ', ' + row.clienteId + ')').join(',') + ' ' +
            'ON DUPLICATE KEY UPDATE CLIENTE_ID = VALUES(CLIENTE_ID)',
        });
      }
    }

    imported += rows.length;
    if (rows.length < pageSize) break;
  }

  await runDmlMitra({
    projectId,
    sql: "UPDATE CUSTO_ESPECIAL_PRODUTO SET STATUS = 'INACTIVE' WHERE ATUALIZADO_EM <> " + sqlString(now),
  });

  return imported;
}

await ensureTables();

const force = String(event.force || '').toLowerCase() === 'true';
const lastSuccessAt = await getLastSuccessAt();
const ageSeconds = secondsSince(lastSuccessAt);

if (!force && ageSeconds <= ttlSeconds) {
  return {
    updated: false,
    skipped: true,
    reason: 'CACHE_FRESH',
    lastSuccessAt,
    ageSeconds,
    ttlSeconds,
  };
}

const now = new Date().toISOString().slice(0, 19);
try {
  await setStatus('LAST_ATTEMPT_AT', now, now);
  const standardCount = await importStandardCosts(now);
  const specialCount = await importSpecialCosts(now);
  await setStatus('LAST_SUCCESS_AT', now, now);
  await setStatus('LAST_RESULT', JSON.stringify({ standardCount, specialCount }), now);
  await setStatus('LAST_ERROR', '', now);

  return {
    updated: true,
    skipped: false,
    standardCount,
    specialCount,
    lastSuccessAt: now,
    ttlSeconds,
  };
} catch (error) {
  await setStatus('LAST_ERROR', String(error?.message || error), now);
  return {
    updated: false,
    skipped: false,
    fallback: true,
    error: String(error?.message || error),
    lastSuccessAt,
    ageSeconds,
    ttlSeconds,
  };
}
`;

async function upsertFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Atualiza o cache local de custos do Mix quando estiver vencido, antes das pesquisas.';

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: serverFunctionCode,
      description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'JAVASCRIPT',
    code: serverFunctionCode,
    description,
  });

  return Number(created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id);
}

function extractOutput(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  return output;
}

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { ttlSeconds: String(TTL_SECONDS) },
  });

  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  console.log(JSON.stringify({ serverFunctionId, output: extractOutput(response) }, null, 2));
}

async function main() {
  const serverFunctionId = await upsertFunction();
  await smoke(serverFunctionId);
  console.log(`SF_${FUNCTION_NAME}=${serverFunctionId}`);
}

main().catch((error) => {
  console.error('Falha ao configurar atualização automática de custos do Mix:');
  console.error(error?.message || error);
  process.exit(1);
});
