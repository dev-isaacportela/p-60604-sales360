
const sdk = require('mitra-sdk');

const localProjectId = 45654;
const planejamentoProjectId = 44515;
const remote = {"syncSchema":24,"dimensions":25,"targets":26,"summary":27};

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
    const values = chunk.map((row) => `(${columns.map((col) => row[col]).join(',')})`).join(',');
    const updates = updateColumns.map((col) => `${col}=VALUES(${col})`).join(', ');
    await runLocalDml(`INSERT INTO ${tableName} (${columns.join(',')}) VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`);
  }
}

const startedAt = new Date().toISOString().slice(0, 19);
const yearFilter = String(event.year || '').match(/^\d{4}$/) ? Number(event.year) : null;
let logId = null;

try {
  await runLocalDml(`INSERT INTO INTG_BILLING_SYNC_LOG (STARTED_AT, STATUS, YEAR_FILTER) VALUES ('${esc(startedAt)}', 'RUNNING', ${yearFilter == null ? 'NULL' : yearFilter})`);
  const logRows = await sdk.runQueryMitra({ projectId: localProjectId, sql: `SELECT MAX(ID) AS ID FROM INTG_BILLING_SYNC_LOG WHERE STARTED_AT='${esc(startedAt)}'` });
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
      CODE: `'${esc(row.CODE)}'`,
      NAME: `'${esc(row.NAME)}'`,
      RAW_NAME: `'${esc(row.RAW_NAME)}'`,
      ACTIVE: boolNum(row.ACTIVE),
      SOURCE_UPDATED_AT: `'${esc(dt(row.UPDATED_AT))}'`,
      SYNCED_AT: `'${esc(now)}'`,
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
      MONTH_LABEL: `'${esc(row.MONTH_LABEL)}'`,
      QUARTER_LABEL: `'${esc(row.QUARTER_LABEL)}'`,
      SOURCE_BUSINESS_UNIT_ID: num(row.BUSINESS_UNIT_ID),
      SOURCE_REGION_ID: num(row.REGION_ID),
      SOURCE_ACTIVITY_SEGMENT_ID: num(row.ACTIVITY_SEGMENT_ID),
      TARGET_VALUE: num(row.TARGET_VALUE),
      STORED_RESULT_VALUE: row.STORED_RESULT_VALUE == null ? 'NULL' : num(row.STORED_RESULT_VALUE),
      REALIZED_PERCENT: row.REALIZED_PERCENT == null ? 'NULL' : num(row.REALIZED_PERCENT),
      BW_PERCENT: row.BW_PERCENT == null ? 'NULL' : num(row.BW_PERCENT),
      SOURCE_ROW_ID: row.SOURCE_ROW_ID == null ? 'NULL' : num(row.SOURCE_ROW_ID),
      SOURCE_FILE: `'${esc(row.SOURCE_FILE)}'`,
      ACTIVE: boolNum(row.ACTIVE),
      SOURCE_UPDATED_AT: `'${esc(dt(row.UPDATED_AT))}'`,
      SYNCED_AT: `'${esc(now)}'`,
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
    await runLocalDml(`UPDATE INTG_BILLING_SYNC_LOG SET FINISHED_AT='${esc(finishedAt)}', STATUS='SUCCESS', DIMENSIONS_COUNT=${dimensionRows.length}, TARGETS_COUNT=${targetCount}, ERROR_MESSAGE=NULL WHERE ID=${num(logId)}`);
  }
  return { success: true, dimensions: dimensionRows.length, targets: targetCount, year: yearFilter };
} catch (error) {
  const finishedAt = new Date().toISOString().slice(0, 19);
  if (logId) {
    await runLocalDml(`UPDATE INTG_BILLING_SYNC_LOG SET FINISHED_AT='${esc(finishedAt)}', STATUS='ERROR', ERROR_MESSAGE='${esc(String(error && error.message || error).slice(0, 500))}' WHERE ID=${num(logId)}`);
  }
  throw error;
}
