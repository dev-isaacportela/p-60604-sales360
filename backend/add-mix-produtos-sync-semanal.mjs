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
const FUNCTION_NAME = 'mixSincronizarProdutosCustosSemanal';
const CRON_SEGUNDA_MANHA = '0 0 8 * * MON';
const PAGE_SIZE = 500;
const REMOTE_COST_PROJECT_ID = 46967;

const CATALOG_SQL =
  'SELECT ' +
  'P.CODPROD AS PRODUCT_ID, ' +
  'P.CODPROD, ' +
  'CAST(P.CODPROD AS CHAR) AS CODIGO, ' +
  'P.CODAUXILIAR, ' +
  'P.NOME, ' +
  "CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA, " +
  '0 AS CUSTO_STD, ' +
  'NULL AS POLICY_ID, ' +
  'NULL AS CUSTO_POLICY, ' +
  '0 AS CUSTO_APLICADO, ' +
  "'SEM_CUSTO' AS TIPO_CUSTO, " +
  '0 AS PRECO_TABELA, ' +
  'NULL AS DATA_CUSTO_STD ' +
  'FROM PRODUTOS_CUSTOS P ' +
  "WHERE ('{{busca}}' = '' " +
  "OR UPPER(P.NOME) LIKE CONCAT('%', UPPER('{{busca}}'), '%') " +
  "OR CAST(P.CODPROD AS CHAR) LIKE CONCAT('%', '{{busca}}', '%') " +
  "OR UPPER(P.CODFAB) LIKE CONCAT('%', UPPER('{{busca}}'), '%') " +
  "OR UPPER(COALESCE(P.CODAUXILIAR, '')) LIKE CONCAT('%', UPPER('{{busca}}'), '%')) " +
  'AND COALESCE(P.ATIVO, TRUE) = TRUE ' +
  'ORDER BY P.CODPROD ' +
  'LIMIT {{limit}} OFFSET {{offset}}';

const serverFunctionCode = String.raw`
const {
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');

const projectId = ${projectId};
const remoteCostProjectId = ${REMOTE_COST_PROJECT_ID};
const pageSize = ${PAGE_SIZE};

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
`;

function extractServerFunctionId(response) {
  return Number(response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id);
}

function extractOutput(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  return output;
}

async function upsertSyncFunction() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);
  const description = 'Sincroniza produtos do projeto de gestao de custos toda segunda-feira pela manha.';

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: serverFunctionCode,
      description,
      cronExpression: CRON_SEGUNDA_MANHA,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'JAVASCRIPT',
    code: serverFunctionCode,
    description,
    cronExpression: CRON_SEGUNDA_MANHA,
  });

  return extractServerFunctionId(created);
}

async function updateCatalogFunction() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    code: CATALOG_SQL,
    description: 'Catálogo local do Mix Builder usando a tabela espelhada PRODUTOS_CUSTOS.',
  });
}

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input: {} });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou com status ${status}`);
  console.log(JSON.stringify({ serverFunctionId, cronExpression: CRON_SEGUNDA_MANHA, output: extractOutput(response) }, null, 2));
}

async function main() {
  console.log('Etapa: configurar funcao semanal');
  const serverFunctionId = await upsertSyncFunction();
  console.log('Etapa: atualizar catalogo');
  await updateCatalogFunction();
  console.log('Etapa: executar smoke');
  await smoke(serverFunctionId);
  console.log('Sincronizacao semanal de produtos configurada.');
}

main().catch((error) => {
  console.error('Falha ao configurar sincronizacao semanal de produtos:');
  console.error(error?.message || error);
  process.exit(1);
});
