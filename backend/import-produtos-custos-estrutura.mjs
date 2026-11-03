import 'dotenv/config';
import {
  callIntegrationMitra,
  configureSdkMitra,
  executeServerFunctionMitra,
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
const PAGE_SIZE = 500;

const MIX_CATALOGO_ESPELHO_SQL = `
SELECT
  P.CODPROD AS PRODUCT_ID,
  P.CODPROD,
  CAST(P.CODPROD AS CHAR) AS CODIGO,
  P.CODAUXILIAR,
  P.NOME,
  CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA,
  0 AS CUSTO_STD,
  NULL AS POLICY_ID,
  NULL AS CUSTO_POLICY,
  0 AS CUSTO_APLICADO,
  'SEM_CUSTO' AS TIPO_CUSTO,
  0 AS PRECO_TABELA,
  NULL AS DATA_CUSTO_STD
FROM PRODUTOS_CUSTOS P
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

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(fallback);
}

async function remoteQuery(sql) {
  const response = await callIntegrationMitra({
    projectId,
    connection: 'gestao-de-custos',
    method: 'POST',
    endpoint: 'runQuery',
    body: { sql },
  });

  if (response?.error) throw new Error(String(response.error));
  const bodyError = response?.body?.error;
  if (bodyError) throw new Error(bodyError?.message || JSON.stringify(bodyError));
  return response?.body?.result?.rows || [];
}

async function ensureMirrorTable() {
  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS PRODUTOS_CUSTOS (
        CODPROD INT NOT NULL PRIMARY KEY,
        CODFAB VARCHAR(60) NOT NULL,
        CODAUXILIAR VARCHAR(60),
        NOME VARCHAR(255) NOT NULL,
        FORNECEDOR_ID INT NOT NULL,
        DEPARTAMENTO_ID INT NOT NULL,
        SECAO_ID INT NOT NULL,
        ATIVO BOOLEAN
      )
    `,
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

  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const rows = await remoteQuery(`
      SELECT CODPROD, CODFAB, CODAUXILIAR, NOME, FORNECEDOR_ID, DEPARTAMENTO_ID, SECAO_ID, ATIVO
      FROM PRODUTOS
      ORDER BY CODPROD
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    if (!rows.length) continue;

    const values = rows.map((row) => `(
      ${sqlNumber(row.CODPROD)},
      ${sqlString(row.CODFAB || String(row.CODPROD || ''))},
      ${sqlString(row.CODAUXILIAR || '')},
      ${sqlString(row.NOME || `Produto ${row.CODPROD}`)},
      ${sqlNumber(row.FORNECEDOR_ID)},
      ${sqlNumber(row.DEPARTAMENTO_ID)},
      ${sqlNumber(row.SECAO_ID)},
      ${row.ATIVO == null || row.ATIVO === '' ? 'TRUE' : (String(row.ATIVO).toLowerCase() === 'false' || String(row.ATIVO) === '0' ? 'FALSE' : 'TRUE')}
    )`).join(',');

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO PRODUTOS_CUSTOS (CODPROD, CODFAB, CODAUXILIAR, NOME, FORNECEDOR_ID, DEPARTAMENTO_ID, SECAO_ID, ATIVO)
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          CODFAB = VALUES(CODFAB),
          CODAUXILIAR = VALUES(CODAUXILIAR),
          NOME = VALUES(NOME),
          FORNECEDOR_ID = VALUES(FORNECEDOR_ID),
          DEPARTAMENTO_ID = VALUES(DEPARTAMENTO_ID),
          SECAO_ID = VALUES(SECAO_ID),
          ATIVO = VALUES(ATIVO)
      `,
    });

    imported += rows.length;
    console.log(`Produtos importados: ${imported}/${total}`);
  }

  return imported;
}

async function updateCatalogFunction() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    code: MIX_CATALOGO_ESPELHO_SQL,
    description: 'Catálogo local do Mix Builder usando a tabela espelhada PRODUTOS_CUSTOS.',
  });
}

async function smoke() {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    input: { busca: 'whey', limit: '5', offset: '0' },
  });

  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  console.log(JSON.stringify({ rows: output?.rows || [] }, null, 2));
}

async function main() {
  await ensureMirrorTable();
  const imported = await importProducts();
  await updateCatalogFunction();
  await smoke();
  console.log(`Importação concluída: ${imported} produto(s) em PRODUTOS_CUSTOS.`);
}

main().catch((error) => {
  console.error('Falha ao importar produtos da gestão de custos:');
  console.error(error?.message || error);
  process.exit(1);
});
