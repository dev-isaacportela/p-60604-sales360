import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const jdbcId = 1;

const BU_EFETIVA_SQL = `COALESCE(
  NULLIF(TRIM('{{idBu}}'), ''),
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = :VAR_USER
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
  ),
  'PADRAO'
)`;

const BU_POR_VENDEDOR_SQL = (vendedorExpr) => `COALESCE(
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = ${vendedorExpr}
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
  ),
  'PADRAO'
)`;

const SQL_ADICIONAR_CARTEIRA = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM)
  SELECT
    {{clienteId}},
    :VAR_USER,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE EXISTS (
    SELECT 1
    FROM CLIENTES C
    WHERE C.ID = {{clienteId}}
  )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR = :VAR_USER
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
    )
`;

const SQL_LISTAR_DISPONIVEIS = `
  SELECT
    C.ID,
    C.RAZAO_SOCIAL,
    C.NOME_FANTASIA,
    C.CNPJ,
    C.CIDADE,
    C.UF,
    C.SEGMENTO,
    C.STATUS,
    ${BU_EFETIVA_SQL} AS ID_BU,
    0 AS IS_COBERTURA,
    '' AS TAG_COBERTURA
  FROM CLIENTES C
  WHERE (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
    )
    AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
    AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
    AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
    AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = C.ID
        AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
    )
  ORDER BY C.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_DISPONIVEIS = `
  SELECT COUNT(*) AS TOTAL
  FROM CLIENTES C
  WHERE (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
    )
    AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
    AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
    AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
    AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = C.ID
        AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
    )
`;

const SQL_HISTORICO_PEDIDOS = `
  SELECT
    BASE.PEDIDO_ID,
    BASE.DATA_PEDIDO,
    BASE.STATUS_PEDIDO,
    BASE.VALOR_TOTAL,
    BASE.MARGEM_MEDIA,
    BASE.TOTAL_ITENS
  FROM (
    SELECT
      CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
      MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
      'FATURADO' AS STATUS_PEDIDO,
      ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
      0 AS MARGEM_MEDIA,
      COUNT(*) AS TOTAL_ITENS,
      ROW_NUMBER() OVER (ORDER BY MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) DESC, CAST(VT.NUMPED AS SIGNED) DESC) AS RN
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = {{clienteId}}
      AND EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
      )
    GROUP BY VT.NUMPED
  ) BASE
  WHERE BASE.RN > {{offset}}
    AND BASE.RN <= ({{offset}} + {{limit}})
  ORDER BY BASE.RN
`;

async function runDdlSafe(sql, okPatterns = []) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`DDL OK: ${sql}`);
    return true;
  } catch (error) {
    const message = String(error?.message || error || '');
    const tolerated = okPatterns.some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
    if (tolerated) {
      console.log(`DDL ignorado (estado já aplicado): ${sql}`);
      console.log(`Motivo: ${message}`);
      return false;
    }
    throw error;
  }
}

async function listIndexes() {
  const response = await runQueryMitra({
    projectId,
    sql: `
      SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUNAS
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'EQUIPE_CLIENTE'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
    `,
  });

  return response?.result?.rows || [];
}

async function applyMigration() {
  const before = await listIndexes();
  const indexNames = new Set(before.map((row) => String(row.INDEX_NAME || '')));

  if (!indexNames.has('IX_EQUIPE_CLIENTE_CLIENTE')) {
    await runDdlSafe('CREATE INDEX IX_EQUIPE_CLIENTE_CLIENTE ON EQUIPE_CLIENTE (ID_CLIENTE)', [
      'duplicate key name',
      'already exists',
    ]);
  }

  const beforeDrop = await listIndexes();
  const beforeDropNames = new Set(beforeDrop.map((row) => String(row.INDEX_NAME || '')));

  if (beforeDropNames.has('UX_EQUIPE_CLIENTE_CLIENTE')) {
    await runDdlSafe('ALTER TABLE EQUIPE_CLIENTE DROP INDEX UX_EQUIPE_CLIENTE_CLIENTE', [
      'check that column/key exists',
      'can\'t drop',
      'doesn\'t exist',
    ]);
  }

  const afterDrop = await listIndexes();
  const afterDropNames = new Set(afterDrop.map((row) => String(row.INDEX_NAME || '')));

  if (!afterDropNames.has('UX_EQUIPE_CLIENTE_CLIENTE_VENDEDOR')) {
    await runDdlSafe(
      'CREATE UNIQUE INDEX UX_EQUIPE_CLIENTE_CLIENTE_VENDEDOR ON EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR)',
      ['duplicate key name', 'already exists'],
    );
  }

}

async function updateServerFunctions() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 41,
    code: SQL_ADICIONAR_CARTEIRA,
    description:
      'Adiciona cliente à carteira do usuário logado somente quando não existe vendedor da mesma BU para o cliente.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 39,
    code: SQL_LISTAR_DISPONIVEIS,
    description:
      'Lista clientes disponíveis para a BU efetiva do usuário: bloqueia apenas quando já existe vendedor da mesma BU para o cliente.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 40,
    code: SQL_CONTAR_DISPONIVEIS,
    description:
      'Conta clientes disponíveis para a BU efetiva do usuário: bloqueia apenas quando já existe vendedor da mesma BU para o cliente.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 25,
    code: SQL_HISTORICO_PEDIDOS,
    description:
      'Histórico paginado de pedidos TOTVS do cliente para usuário da carteira, sem restringir por RCA específico.',
    jdbcId,
  });
}

async function main() {
  await applyMigration();
  await updateServerFunctions();

  const indexes = await listIndexes();
  const duplicatePairs = await runQueryMitra({
    projectId,
    sql: `
      SELECT ID_CLIENTE, ID_VENDEDOR, COUNT(*) AS QTD
      FROM EQUIPE_CLIENTE
      GROUP BY ID_CLIENTE, ID_VENDEDOR
      HAVING COUNT(*) > 1
      LIMIT 10
    `,
  });

  console.log('Atualização concluída com sucesso.');
  console.log(
    JSON.stringify(
      {
        projectId,
        updatedServerFunctions: [41, 39, 40, 25],
        indexes,
        duplicatePairs: duplicatePairs?.result?.rows || [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Erro ao aplicar correção arquitetural de carteira por BU:');
  console.error(error?.message || error);
  process.exit(1);
});
