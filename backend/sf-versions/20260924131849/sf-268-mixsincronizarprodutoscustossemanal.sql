
const {
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');

const projectId = 45654;
const remoteCostProjectId = 46967;
const pageSize = 500;

function sqlString(value) {
  if (value == null) return 'NULL';
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function sqlNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(fallback);
}

function sqlBoolean(value) {
  if (value == null || value === '') return 'TRUE';
  const normalized = String(value).toLowerCase();
  return normalized === 'false' || normalized === '0' ? 'FALSE' : 'TRUE';
}

async function remoteQuery(sql) {
  const response = await runQueryMitra({ projectId: remoteCostProjectId, sql });
  return response?.result?.rows || [];
}

async function ensureMirrorTable() {
  await runDdlMitra({
    projectId,
    sql:
      'CREATE TABLE IF NOT EXISTS PRODUTOS_CUSTOS (' +
      'CODPROD INT NOT NULL PRIMARY KEY, ' +
      'CODFAB VARCHAR(60) NOT NULL, ' +
      'CODAUXILIAR VARCHAR(60), ' +
      'NOME VARCHAR(255) NOT NULL, ' +
      'FORNECEDOR_ID INT NOT NULL, ' +
      'DEPARTAMENTO_ID INT NOT NULL, ' +
      'SECAO_ID INT NOT NULL, ' +
      'ATIVO BOOLEAN' +
      ')',
  });

  const auxiliarColumn = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRODUTOS_CUSTOS' AND COLUMN_NAME = 'CODAUXILIAR'",
  });
  if (Number(auxiliarColumn?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE PRODUTOS_CUSTOS ADD COLUMN CODAUXILIAR VARCHAR(60) AFTER CODFAB' });
  }

  const ativoColumn = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRODUTOS_CUSTOS' AND COLUMN_NAME = 'ATIVO'",
  });
  if (Number(ativoColumn?.result?.rows?.[0]?.TOTAL || 0) === 0) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE PRODUTOS_CUSTOS ADD COLUMN ATIVO BOOLEAN AFTER SECAO_ID' });
  }
}

async function importProducts() {
  const countRows = await remoteQuery('SELECT COUNT(*) AS TOTAL FROM PRODUTOS');
  const total = Number(countRows?.[0]?.TOTAL || 0);
  let imported = 0;

  for (let offset = 0; offset < total; offset += pageSize) {
    const rows = await remoteQuery(
      'SELECT CODPROD, CODFAB, CODAUXILIAR, NOME, FORNECEDOR_ID, DEPARTAMENTO_ID, SECAO_ID, ATIVO ' +
      'FROM PRODUTOS ORDER BY CODPROD LIMIT ' + pageSize + ' OFFSET ' + offset
    );

    if (!rows.length) continue;

    const values = rows.map((row) =>
      '(' +
      sqlNumber(row.CODPROD) + ', ' +
      sqlString(row.CODFAB || String(row.CODPROD || '')) + ', ' +
      sqlString(row.CODAUXILIAR || '') + ', ' +
      sqlString(row.NOME || ('Produto ' + row.CODPROD)) + ', ' +
      sqlNumber(row.FORNECEDOR_ID) + ', ' +
      sqlNumber(row.DEPARTAMENTO_ID) + ', ' +
      sqlNumber(row.SECAO_ID) + ', ' +
      sqlBoolean(row.ATIVO) +
      ')'
    ).join(',');

    await runDmlMitra({
      projectId,
      sql:
        'INSERT INTO PRODUTOS_CUSTOS (CODPROD, CODFAB, CODAUXILIAR, NOME, FORNECEDOR_ID, DEPARTAMENTO_ID, SECAO_ID, ATIVO) VALUES ' + values + ' ' +
        'ON DUPLICATE KEY UPDATE CODFAB = VALUES(CODFAB), CODAUXILIAR = VALUES(CODAUXILIAR), NOME = VALUES(NOME), ' +
        'FORNECEDOR_ID = VALUES(FORNECEDOR_ID), DEPARTAMENTO_ID = VALUES(DEPARTAMENTO_ID), SECAO_ID = VALUES(SECAO_ID), ATIVO = VALUES(ATIVO)',
    });

    imported += rows.length;
  }

  return { total, imported };
}

await ensureMirrorTable();
const startedAt = new Date().toISOString().slice(0, 19);
const result = await importProducts();
const finishedAt = new Date().toISOString().slice(0, 19);

return {
  ok: true,
  startedAt,
  finishedAt,
  total: result.total,
  imported: result.imported,
};
