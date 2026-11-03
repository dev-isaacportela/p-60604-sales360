import 'dotenv/config';
import {
  callIntegrationMitra,
  configureSdkMitra,
  executeServerFunctionMitra,
  runDmlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const PAGE_SIZE = 500;

const MIX_CATALOGO_LOCAL_SQL = `
SELECT
  P.ID AS PRODUCT_ID,
  P.ID AS CODPROD,
  CAST(P.ID AS CHAR) AS CODIGO,
  P.NOME,
  P.CATEGORIA,
  COALESCE(P.CUSTO, 0) AS CUSTO_STD,
  NULL AS POLICY_ID,
  NULL AS CUSTO_POLICY,
  COALESCE(P.CUSTO, 0) AS CUSTO_APLICADO,
  CASE WHEN COALESCE(P.CUSTO, 0) > 0 THEN 'CACHE' ELSE 'SEM_CUSTO' END AS TIPO_CUSTO,
  COALESCE(P.PRECO_TABELA, 0) AS PRECO_TABELA,
  NULL AS DATA_CUSTO_STD
FROM PRODUTOS P
WHERE COALESCE(P.ATIVO, 1) = 1
  AND (
    '{{busca}}' = ''
    OR UPPER(P.NOME) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
    OR CAST(P.ID AS CHAR) LIKE CONCAT('%', '{{busca}}', '%')
    OR UPPER(P.CODIGO) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  )
ORDER BY P.NOME
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

  if (response?.error) {
    throw new Error(String(response.error));
  }

  return response?.body?.result?.rows || [];
}

async function syncProducts() {
  const countRows = await remoteQuery('SELECT COUNT(*) AS TOTAL FROM PRODUTOS');
  const total = Number(countRows?.[0]?.TOTAL || 0);
  let imported = 0;

  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const rows = await remoteQuery(`
      SELECT
        P.CODPROD,
        P.NOME,
        CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA,
        COALESCE(CB.CUSTO, 0) AS CUSTO
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
      ORDER BY P.CODPROD
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    if (!rows.length) continue;

    const values = rows.map((row) => `(
      ${sqlNumber(row.CODPROD)},
      ${sqlString(String(row.CODPROD || ''))},
      ${sqlString(row.NOME || `Produto ${row.CODPROD}`)},
      ${sqlString(row.CATEGORIA || 'Gestão de custos')},
      0,
      ${sqlNumber(row.CUSTO)},
      'UN',
      1
    )`).join(',');

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO PRODUTOS (ID, CODIGO, NOME, CATEGORIA, PRECO_TABELA, CUSTO, UNIDADE, ATIVO)
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          CODIGO = VALUES(CODIGO),
          NOME = VALUES(NOME),
          CATEGORIA = VALUES(CATEGORIA),
          CUSTO = VALUES(CUSTO),
          UNIDADE = VALUES(UNIDADE),
          ATIVO = VALUES(ATIVO)
      `,
    });

    imported += rows.length;
    console.log(`Produtos sincronizados: ${imported}/${total}`);
  }

  return imported;
}

async function smokeCatalog() {
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
  const imported = await syncProducts();
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    code: MIX_CATALOGO_LOCAL_SQL,
    description: 'Catálogo local persistido do Mix Builder, sincronizado da gestão de custos.',
  });
  await smokeCatalog();
  console.log(`Cache local de produtos atualizado: ${imported} produto(s).`);
}

main().catch((error) => {
  console.error('Falha ao sincronizar cache local de produtos:');
  console.error(error?.message || error);
  process.exit(1);
});
