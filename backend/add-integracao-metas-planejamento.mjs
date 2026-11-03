import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const planejamentoProjectId = 44515;
const remote = {
  syncSchema: 24,
  dimensions: 25,
  targets: 26,
  summary: 27,
};

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

async function upsertServerFunction(definition) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((fn) => fn.name === definition.name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: definition.code,
      description: definition.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: definition.type || 'SQL',
    code: definition.code,
    description: definition.description,
  });
  return extractSfId(created);
}

async function createTables() {
  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS INTG_BUSINESS_UNIT (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      SOURCE_BUSINESS_UNIT_ID INT NOT NULL,
      CODE VARCHAR(80) NOT NULL,
      NAME VARCHAR(200) NOT NULL,
      RAW_NAME VARCHAR(200),
      ACTIVE BOOLEAN DEFAULT TRUE,
      SOURCE_UPDATED_AT VARCHAR(19),
      SYNCED_AT VARCHAR(19),
      UNIQUE KEY uk_intg_bu_source (SOURCE_BUSINESS_UNIT_ID),
      UNIQUE KEY uk_intg_bu_code (CODE),
      INDEX idx_intg_bu_active (ACTIVE)
    );`,
  });

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS INTG_REGION (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      SOURCE_REGION_ID INT NOT NULL,
      CODE VARCHAR(80) NOT NULL,
      NAME VARCHAR(200) NOT NULL,
      RAW_NAME VARCHAR(200),
      ACTIVE BOOLEAN DEFAULT TRUE,
      SOURCE_UPDATED_AT VARCHAR(19),
      SYNCED_AT VARCHAR(19),
      UNIQUE KEY uk_intg_region_source (SOURCE_REGION_ID),
      UNIQUE KEY uk_intg_region_code (CODE),
      INDEX idx_intg_region_active (ACTIVE)
    );`,
  });

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS INTG_ACTIVITY_SEGMENT (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      SOURCE_ACTIVITY_SEGMENT_ID INT NOT NULL,
      CODE VARCHAR(80) NOT NULL,
      NAME VARCHAR(200) NOT NULL,
      RAW_NAME VARCHAR(200),
      ACTIVE BOOLEAN DEFAULT TRUE,
      SOURCE_UPDATED_AT VARCHAR(19),
      SYNCED_AT VARCHAR(19),
      UNIQUE KEY uk_intg_segment_source (SOURCE_ACTIVITY_SEGMENT_ID),
      UNIQUE KEY uk_intg_segment_code (CODE),
      INDEX idx_intg_segment_active (ACTIVE)
    );`,
  });

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS INTG_MONTHLY_BILLING_TARGET (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      SOURCE_MONTHLY_TARGET_ID INT NOT NULL,
      YEAR_REF INT NOT NULL,
      MONTH_REF INT NOT NULL,
      MONTH_LABEL VARCHAR(30),
      QUARTER_LABEL VARCHAR(10),
      SOURCE_BUSINESS_UNIT_ID INT NOT NULL,
      SOURCE_REGION_ID INT NOT NULL,
      SOURCE_ACTIVITY_SEGMENT_ID INT NOT NULL,
      TARGET_VALUE DECIMAL(15,2) DEFAULT 0,
      STORED_RESULT_VALUE DECIMAL(15,2),
      REALIZED_PERCENT DECIMAL(10,4),
      BW_PERCENT DECIMAL(10,4),
      SOURCE_ROW_ID INT,
      SOURCE_FILE VARCHAR(255),
      ACTIVE BOOLEAN DEFAULT TRUE,
      SOURCE_UPDATED_AT VARCHAR(19),
      SYNCED_AT VARCHAR(19),
      UNIQUE KEY uk_intg_monthly_target_source (SOURCE_MONTHLY_TARGET_ID),
      INDEX idx_intg_target_period (YEAR_REF, MONTH_REF),
      INDEX idx_intg_target_bu (SOURCE_BUSINESS_UNIT_ID),
      INDEX idx_intg_target_region (SOURCE_REGION_ID),
      INDEX idx_intg_target_segment (SOURCE_ACTIVITY_SEGMENT_ID),
      INDEX idx_intg_target_active (ACTIVE),
      CONSTRAINT fk_intg_target_bu FOREIGN KEY (SOURCE_BUSINESS_UNIT_ID) REFERENCES INTG_BUSINESS_UNIT(SOURCE_BUSINESS_UNIT_ID),
      CONSTRAINT fk_intg_target_region FOREIGN KEY (SOURCE_REGION_ID) REFERENCES INTG_REGION(SOURCE_REGION_ID),
      CONSTRAINT fk_intg_target_segment FOREIGN KEY (SOURCE_ACTIVITY_SEGMENT_ID) REFERENCES INTG_ACTIVITY_SEGMENT(SOURCE_ACTIVITY_SEGMENT_ID)
    );`,
  });

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS INTG_BILLING_SYNC_LOG (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      STARTED_AT VARCHAR(19),
      FINISHED_AT VARCHAR(19),
      STATUS VARCHAR(30),
      YEAR_FILTER INT,
      DIMENSIONS_COUNT INT DEFAULT 0,
      TARGETS_COUNT INT DEFAULT 0,
      ERROR_MESSAGE VARCHAR(500)
    );`,
  });
}

const syncCode = `
const sdk = require('mitra-sdk');

const localProjectId = ${projectId};
const planejamentoProjectId = ${planejamentoProjectId};
const remote = ${JSON.stringify(remote)};

function esc(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolNum(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true' ? 1 : 0;
}

function dt(value) {
  return String(value || '').replace(' ', 'T').slice(0, 19);
}

function outputRows(response) {
  let output = response && response.result && response.result.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch (error) { output = {}; }
  }
  return (output && (output.rows || output.result)) || [];
}

async function runLocalDml(sql) {
  await sdk.runDmlMitra({ projectId: localProjectId, sql });
}

async function runRemote(serverFunctionId, input = {}) {
  const response = await sdk.executeServerFunctionMitra({
    projectId: planejamentoProjectId,
    serverFunctionId,
    input,
  });
  const status = String(response && response.result && response.result.executionStatus || '');
  const error = String(response && response.result && response.result.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status || 'Falha na funcao remota.');
  return outputRows(response);
}

async function insertChunks(tableName, columns, rows, updateColumns) {
  if (!rows.length) return;
  const size = 100;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const values = chunk.map((row) => \`(\${columns.map((col) => row[col]).join(',')})\`).join(',');
    const updates = updateColumns.map((col) => \`\${col}=VALUES(\${col})\`).join(', ');
    await runLocalDml(\`INSERT INTO \${tableName} (\${columns.join(',')}) VALUES \${values} ON DUPLICATE KEY UPDATE \${updates}\`);
  }
}

const startedAt = new Date().toISOString().slice(0, 19);
const yearFilter = String(event.year || '').match(/^\\d{4}$/) ? Number(event.year) : null;
let logId = null;

try {
  await runLocalDml(\`INSERT INTO INTG_BILLING_SYNC_LOG (STARTED_AT, STATUS, YEAR_FILTER) VALUES ('\${esc(startedAt)}', 'RUNNING', \${yearFilter == null ? 'NULL' : yearFilter})\`);
  const logRows = await sdk.runQueryMitra({ projectId: localProjectId, sql: \`SELECT MAX(ID) AS ID FROM INTG_BILLING_SYNC_LOG WHERE STARTED_AT='\${esc(startedAt)}'\` });
  logId = ((logRows && logRows.result && logRows.result.rows) || logRows.rows || [])[0]?.ID || null;

  await runRemote(remote.syncSchema, {});

  const dimensionRows = await runRemote(remote.dimensions, {});
  const now = new Date().toISOString().slice(0, 19);
  const dimsByType = {
    BUSINESS_UNIT: [],
    REGION: [],
    ACTIVITY_SEGMENT: [],
  };

  for (const row of dimensionRows) {
    const type = String(row.DIMENSION_TYPE || '');
    if (!dimsByType[type]) continue;
    dimsByType[type].push({
      SOURCE_ID: num(row.ID),
      CODE: \`'\${esc(row.CODE)}'\`,
      NAME: \`'\${esc(row.NAME)}'\`,
      RAW_NAME: \`'\${esc(row.RAW_NAME)}'\`,
      ACTIVE: boolNum(row.ACTIVE),
      SOURCE_UPDATED_AT: \`'\${esc(dt(row.UPDATED_AT))}'\`,
      SYNCED_AT: \`'\${esc(now)}'\`,
    });
  }

  await insertChunks('INTG_BUSINESS_UNIT', ['SOURCE_BUSINESS_UNIT_ID', 'CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT'], dimsByType.BUSINESS_UNIT.map((row) => ({ ...row, SOURCE_BUSINESS_UNIT_ID: row.SOURCE_ID })), ['CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT']);
  await insertChunks('INTG_REGION', ['SOURCE_REGION_ID', 'CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT'], dimsByType.REGION.map((row) => ({ ...row, SOURCE_REGION_ID: row.SOURCE_ID })), ['CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT']);
  await insertChunks('INTG_ACTIVITY_SEGMENT', ['SOURCE_ACTIVITY_SEGMENT_ID', 'CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT'], dimsByType.ACTIVITY_SEGMENT.map((row) => ({ ...row, SOURCE_ACTIVITY_SEGMENT_ID: row.SOURCE_ID })), ['CODE', 'NAME', 'RAW_NAME', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT']);

  let offset = 0;
  const limit = 500;
  let targetCount = 0;
  while (true) {
    const input = { limit, offset, includeInactive: 'true' };
    if (yearFilter != null) input.year = yearFilter;
    const targetRows = await runRemote(remote.targets, input);
    if (!targetRows.length) break;

    const mapped = targetRows.map((row) => ({
      SOURCE_MONTHLY_TARGET_ID: num(row.SOURCE_MONTHLY_TARGET_ID || row.ID),
      YEAR_REF: num(row.YEAR_REF),
      MONTH_REF: num(row.MONTH_REF),
      MONTH_LABEL: \`'\${esc(row.MONTH_LABEL)}'\`,
      QUARTER_LABEL: \`'\${esc(row.QUARTER_LABEL)}'\`,
      SOURCE_BUSINESS_UNIT_ID: num(row.BUSINESS_UNIT_ID),
      SOURCE_REGION_ID: num(row.REGION_ID),
      SOURCE_ACTIVITY_SEGMENT_ID: num(row.ACTIVITY_SEGMENT_ID),
      TARGET_VALUE: num(row.TARGET_VALUE),
      STORED_RESULT_VALUE: row.STORED_RESULT_VALUE == null ? 'NULL' : num(row.STORED_RESULT_VALUE),
      REALIZED_PERCENT: row.REALIZED_PERCENT == null ? 'NULL' : num(row.REALIZED_PERCENT),
      BW_PERCENT: row.BW_PERCENT == null ? 'NULL' : num(row.BW_PERCENT),
      SOURCE_ROW_ID: row.SOURCE_ROW_ID == null ? 'NULL' : num(row.SOURCE_ROW_ID),
      SOURCE_FILE: \`'\${esc(row.SOURCE_FILE)}'\`,
      ACTIVE: boolNum(row.ACTIVE),
      SOURCE_UPDATED_AT: \`'\${esc(dt(row.UPDATED_AT))}'\`,
      SYNCED_AT: \`'\${esc(now)}'\`,
    }));

    await insertChunks(
      'INTG_MONTHLY_BILLING_TARGET',
      ['SOURCE_MONTHLY_TARGET_ID', 'YEAR_REF', 'MONTH_REF', 'MONTH_LABEL', 'QUARTER_LABEL', 'SOURCE_BUSINESS_UNIT_ID', 'SOURCE_REGION_ID', 'SOURCE_ACTIVITY_SEGMENT_ID', 'TARGET_VALUE', 'STORED_RESULT_VALUE', 'REALIZED_PERCENT', 'BW_PERCENT', 'SOURCE_ROW_ID', 'SOURCE_FILE', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT'],
      mapped,
      ['YEAR_REF', 'MONTH_REF', 'MONTH_LABEL', 'QUARTER_LABEL', 'SOURCE_BUSINESS_UNIT_ID', 'SOURCE_REGION_ID', 'SOURCE_ACTIVITY_SEGMENT_ID', 'TARGET_VALUE', 'STORED_RESULT_VALUE', 'REALIZED_PERCENT', 'BW_PERCENT', 'SOURCE_ROW_ID', 'SOURCE_FILE', 'ACTIVE', 'SOURCE_UPDATED_AT', 'SYNCED_AT']
    );

    targetCount += targetRows.length;
    if (targetRows.length < limit) break;
    offset += limit;
  }

  const finishedAt = new Date().toISOString().slice(0, 19);
  if (logId) {
    await runLocalDml(\`UPDATE INTG_BILLING_SYNC_LOG SET FINISHED_AT='\${esc(finishedAt)}', STATUS='SUCCESS', DIMENSIONS_COUNT=\${dimensionRows.length}, TARGETS_COUNT=\${targetCount}, ERROR_MESSAGE=NULL WHERE ID=\${num(logId)}\`);
  }
  return { success: true, dimensions: dimensionRows.length, targets: targetCount, year: yearFilter };
} catch (error) {
  const finishedAt = new Date().toISOString().slice(0, 19);
  if (logId) {
    await runLocalDml(\`UPDATE INTG_BILLING_SYNC_LOG SET FINISHED_AT='\${esc(finishedAt)}', STATUS='ERROR', ERROR_MESSAGE='\${esc(String(error && error.message || error).slice(0, 500))}' WHERE ID=\${num(logId)}\`);
  }
  throw error;
}
`;

const listDimensionsCode = `
SELECT 'BUSINESS_UNIT' AS DIMENSION_TYPE, SOURCE_BUSINESS_UNIT_ID AS SOURCE_ID, CODE, NAME, RAW_NAME, ACTIVE, SOURCE_UPDATED_AT, SYNCED_AT
FROM INTG_BUSINESS_UNIT
WHERE ('{{includeInactive}}' = 'true' OR ACTIVE = TRUE)
UNION ALL
SELECT 'REGION' AS DIMENSION_TYPE, SOURCE_REGION_ID AS SOURCE_ID, CODE, NAME, RAW_NAME, ACTIVE, SOURCE_UPDATED_AT, SYNCED_AT
FROM INTG_REGION
WHERE ('{{includeInactive}}' = 'true' OR ACTIVE = TRUE)
UNION ALL
SELECT 'ACTIVITY_SEGMENT' AS DIMENSION_TYPE, SOURCE_ACTIVITY_SEGMENT_ID AS SOURCE_ID, CODE, NAME, RAW_NAME, ACTIVE, SOURCE_UPDATED_AT, SYNCED_AT
FROM INTG_ACTIVITY_SEGMENT
WHERE ('{{includeInactive}}' = 'true' OR ACTIVE = TRUE)
ORDER BY DIMENSION_TYPE, NAME
`;

const listTargetsCode = `
WITH PARAMS AS (
  SELECT
    CASE WHEN '{{limit}}' REGEXP '^[0-9]+$' THEN LEAST(CAST('{{limit}}' AS UNSIGNED), 500) ELSE 100 END AS LIM,
    CASE WHEN '{{offset}}' REGEXP '^[0-9]+$' THEN CAST('{{offset}}' AS UNSIGNED) ELSE 0 END AS OFFS
)
SELECT
  T.ID,
  T.SOURCE_MONTHLY_TARGET_ID,
  T.YEAR_REF,
  T.MONTH_REF,
  T.MONTH_LABEL,
  T.QUARTER_LABEL,
  BU.SOURCE_BUSINESS_UNIT_ID AS BUSINESS_UNIT_ID,
  BU.CODE AS BUSINESS_UNIT_CODE,
  BU.NAME AS BUSINESS_UNIT_NAME,
  R.SOURCE_REGION_ID AS REGION_ID,
  R.CODE AS REGION_CODE,
  R.NAME AS REGION_NAME,
  S.SOURCE_ACTIVITY_SEGMENT_ID AS ACTIVITY_SEGMENT_ID,
  S.CODE AS ACTIVITY_SEGMENT_CODE,
  S.NAME AS ACTIVITY_SEGMENT_NAME,
  T.TARGET_VALUE,
  T.STORED_RESULT_VALUE,
  T.REALIZED_PERCENT,
  T.BW_PERCENT,
  T.SOURCE_ROW_ID,
  T.SOURCE_FILE,
  T.ACTIVE,
  T.SOURCE_UPDATED_AT,
  T.SYNCED_AT,
  COUNT(*) OVER() AS TOTAL_ROWS
FROM INTG_MONTHLY_BILLING_TARGET T
JOIN INTG_BUSINESS_UNIT BU ON BU.SOURCE_BUSINESS_UNIT_ID = T.SOURCE_BUSINESS_UNIT_ID
JOIN INTG_REGION R ON R.SOURCE_REGION_ID = T.SOURCE_REGION_ID
JOIN INTG_ACTIVITY_SEGMENT S ON S.SOURCE_ACTIVITY_SEGMENT_ID = T.SOURCE_ACTIVITY_SEGMENT_ID
JOIN PARAMS P ON 1 = 1
WHERE ('{{year}}' = '' OR T.YEAR_REF = CAST('{{year}}' AS UNSIGNED))
  AND ('{{month}}' = '' OR T.MONTH_REF = CAST('{{month}}' AS UNSIGNED))
  AND ('{{businessUnitCode}}' = '' OR BU.CODE = '{{businessUnitCode}}')
  AND ('{{regionCode}}' = '' OR R.CODE = '{{regionCode}}')
  AND ('{{activitySegmentCode}}' = '' OR S.CODE = '{{activitySegmentCode}}')
  AND ('{{includeInactive}}' = 'true' OR T.ACTIVE = TRUE)
ORDER BY T.YEAR_REF DESC, T.MONTH_REF DESC, BU.NAME, R.NAME, S.NAME
LIMIT {{limit}} OFFSET {{offset}}
`;

const summaryCode = `
SELECT
  CASE
    WHEN '{{groupBy}}' = 'YEAR_MONTH' THEN CONCAT(T.YEAR_REF, '-', LPAD(T.MONTH_REF, 2, '0'))
    WHEN '{{groupBy}}' = 'BUSINESS_UNIT' THEN BU.CODE
    WHEN '{{groupBy}}' = 'REGION' THEN R.CODE
    WHEN '{{groupBy}}' = 'ACTIVITY_SEGMENT' THEN S.CODE
    ELSE CAST(T.YEAR_REF AS CHAR)
  END AS GROUP_KEY,
  CASE
    WHEN '{{groupBy}}' = 'YEAR_MONTH' THEN CONCAT(T.MONTH_LABEL, '/', T.YEAR_REF)
    WHEN '{{groupBy}}' = 'BUSINESS_UNIT' THEN BU.NAME
    WHEN '{{groupBy}}' = 'REGION' THEN R.NAME
    WHEN '{{groupBy}}' = 'ACTIVITY_SEGMENT' THEN S.NAME
    ELSE CAST(T.YEAR_REF AS CHAR)
  END AS GROUP_LABEL,
  COUNT(*) AS TARGET_COUNT,
  ROUND(SUM(COALESCE(T.TARGET_VALUE, 0)), 2) AS TARGET_VALUE,
  ROUND(SUM(COALESCE(T.STORED_RESULT_VALUE, 0)), 2) AS STORED_RESULT_VALUE,
  CASE WHEN SUM(COALESCE(T.TARGET_VALUE, 0)) = 0 THEN NULL
       ELSE ROUND((SUM(COALESCE(T.STORED_RESULT_VALUE, 0)) / SUM(COALESCE(T.TARGET_VALUE, 0))) * 100, 4)
  END AS REALIZED_PERCENT
FROM INTG_MONTHLY_BILLING_TARGET T
JOIN INTG_BUSINESS_UNIT BU ON BU.SOURCE_BUSINESS_UNIT_ID = T.SOURCE_BUSINESS_UNIT_ID
JOIN INTG_REGION R ON R.SOURCE_REGION_ID = T.SOURCE_REGION_ID
JOIN INTG_ACTIVITY_SEGMENT S ON S.SOURCE_ACTIVITY_SEGMENT_ID = T.SOURCE_ACTIVITY_SEGMENT_ID
WHERE ('{{year}}' = '' OR T.YEAR_REF = CAST('{{year}}' AS UNSIGNED))
  AND ('{{month}}' = '' OR T.MONTH_REF = CAST('{{month}}' AS UNSIGNED))
  AND ('{{businessUnitCode}}' = '' OR BU.CODE = '{{businessUnitCode}}')
  AND ('{{regionCode}}' = '' OR R.CODE = '{{regionCode}}')
  AND ('{{activitySegmentCode}}' = '' OR S.CODE = '{{activitySegmentCode}}')
  AND ('{{includeInactive}}' = 'true' OR T.ACTIVE = TRUE)
GROUP BY GROUP_KEY, GROUP_LABEL
ORDER BY GROUP_KEY
`;

const syncLogsCode = `
SELECT ID, STARTED_AT, FINISHED_AT, STATUS, YEAR_FILTER, DIMENSIONS_COUNT, TARGETS_COUNT, ERROR_MESSAGE
FROM INTG_BILLING_SYNC_LOG
ORDER BY ID DESC
LIMIT 20
`;

async function main() {
  await createTables();

  const ids = {};
  ids.syncIntegrationBillingTargets = await upsertServerFunction({
    name: 'syncIntegrationBillingTargets',
    type: 'JAVASCRIPT',
    code: syncCode,
    description: 'Sincroniza localmente dimensoes e metas de faturamento do projeto de planejamento estrategico.',
  });
  ids.listIntegrationBillingDimensionsLocal = await upsertServerFunction({
    name: 'listIntegrationBillingDimensionsLocal',
    code: listDimensionsCode,
    description: 'Lista dimensoes de metas de faturamento sincronizadas localmente.',
  });
  ids.listIntegrationMonthlyBillingTargetsLocal = await upsertServerFunction({
    name: 'listIntegrationMonthlyBillingTargetsLocal',
    code: listTargetsCode,
    description: 'Lista metas mensais de faturamento sincronizadas localmente com filtros e paginacao.',
  });
  ids.getIntegrationBillingTargetSummaryLocal = await upsertServerFunction({
    name: 'getIntegrationBillingTargetSummaryLocal',
    code: summaryCode,
    description: 'Retorna resumo agregado das metas de faturamento sincronizadas localmente.',
  });
  ids.listIntegrationBillingSyncLogs = await upsertServerFunction({
    name: 'listIntegrationBillingSyncLogs',
    code: syncLogsCode,
    description: 'Lista as ultimas execucoes da sincronizacao local de metas de faturamento.',
  });

  const syncResult = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: ids.syncIntegrationBillingTargets,
    input: {},
  });

  console.log(JSON.stringify({ ids, sync: syncResult?.result?.output, status: syncResult?.result?.executionStatus, error: syncResult?.result?.error }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
