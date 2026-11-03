import 'dotenv/config';
import {
  configureSdkMitra,
  runQueryMitra,
  readServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
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

async function q(sql) {
  const res = await runQueryMitra({ projectId, sql });
  return res?.result?.rows || [];
}

function pickVendorColumn(rows) {
  const names = new Set(rows.map((r) => String(r.COLUMN_NAME || '').toUpperCase()));
  if (names.has('VENDEDOR_ID')) return 'VENDEDOR_ID';
  if (names.has('USER_ID')) return 'USER_ID';
  return 'VENDEDOR_ID';
}

async function main() {
  const columns = await q(`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('CLIENTES', 'BU_VENDEDOR', 'EQUIPE_CLIENTE', 'INT_USER')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const vendorColumn = pickVendorColumn(columns.filter((r) => r.TABLE_NAME === 'BU_VENDEDOR'));

  const sf39 = await readServerFunctionMitra({ projectId, serverFunctionId: 39 });
  const sf40 = await readServerFunctionMitra({ projectId, serverFunctionId: 40 });

  const counts = await q(`
    SELECT
      (SELECT COUNT(*) FROM CLIENTES) AS TOTAL_CLIENTES,
      (SELECT COUNT(*) FROM EQUIPE_CLIENTE) AS TOTAL_EQUIPE_CLIENTE,
      (SELECT COUNT(*) FROM BU_VENDEDOR WHERE COALESCE(ATIVO, TRUE) = TRUE) AS TOTAL_BU_VENDEDOR_ATIVOS,
      (SELECT COUNT(*) FROM BU_VENDEDOR WHERE COALESCE(ATIVO, TRUE) = TRUE AND CODFILIAL IS NOT NULL AND TRIM(COALESCE(CODFILIAL, '')) <> '' AND ID_SECAO IS NOT NULL) AS TOTAL_BU_VENDEDOR_COM_ESCOPO
  `);

  const usersWithScope = await q(`
    SELECT
      BV.${vendorColumn} AS USER_ID,
      COALESCE(U.DESCR, CONCAT('usuario-', BV.${vendorColumn})) AS EMAIL,
      COUNT(*) AS TOTAL_VINCULOS,
      SUM(CASE WHEN BV.CODFILIAL IS NULL OR TRIM(COALESCE(BV.CODFILIAL, '')) = '' OR BV.ID_SECAO IS NULL THEN 1 ELSE 0 END) AS VINCULOS_INCOMPLETOS,
      SUM(CASE WHEN BV.CODFILIAL IS NOT NULL AND TRIM(COALESCE(BV.CODFILIAL, '')) <> '' AND BV.ID_SECAO IS NOT NULL THEN 1 ELSE 0 END) AS VINCULOS_COMPLETOS
    FROM BU_VENDEDOR BV
    LEFT JOIN INT_USER U ON U.ID = BV.${vendorColumn}
    WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    GROUP BY BV.${vendorColumn}, U.DESCR
    ORDER BY TOTAL_VINCULOS DESC, USER_ID
    LIMIT 50
  `);

  const sampleEscopos = await q(`
    SELECT
      BV.${vendorColumn} AS USER_ID,
      COALESCE(U.DESCR, CONCAT('usuario-', BV.${vendorColumn})) AS EMAIL,
      BV.BU_CODIGO,
      BV.CODFILIAL,
      BV.ID_SECAO,
      COUNT(*) AS QTDE
    FROM BU_VENDEDOR BV
    LEFT JOIN INT_USER U ON U.ID = BV.${vendorColumn}
    WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    GROUP BY BV.${vendorColumn}, U.DESCR, BV.BU_CODIGO, BV.CODFILIAL, BV.ID_SECAO
    ORDER BY USER_ID, BV.BU_CODIGO, BV.CODFILIAL, BV.ID_SECAO
    LIMIT 100
  `);

  const disponibilidadePorUsuario = await q(`
    WITH USUARIOS AS (
      SELECT DISTINCT BV.${vendorColumn} AS USER_ID
      FROM BU_VENDEDOR BV
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    ),
    ESCOPO AS (
      SELECT DISTINCT
        BV.${vendorColumn} AS USER_ID,
        BV.CODFILIAL,
        BV.ID_SECAO,
        BV.BU_CODIGO
      FROM BU_VENDEDOR BV
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND BV.CODFILIAL IS NOT NULL
        AND TRIM(COALESCE(BV.CODFILIAL, '')) <> ''
        AND BV.ID_SECAO IS NOT NULL
    ),
    DISP AS (
      SELECT
        E.USER_ID,
        C.ID AS CLIENTE_ID
      FROM ESCOPO E
      JOIN CLIENTES C ON 1=1
      WHERE NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV2 ON BV2.${vendorColumn} = EC.ID_VENDEDOR
          AND BV2.CODFILIAL = EC.CODFILIAL
          AND BV2.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV2.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = C.ID
          AND EC.CODFILIAL = E.CODFILIAL
          AND EC.ID_SECAO = E.ID_SECAO
          AND BV2.BU_CODIGO = E.BU_CODIGO
      )
    )
    SELECT
      U.USER_ID,
      COALESCE(IU.DESCR, CONCAT('usuario-', U.USER_ID)) AS EMAIL,
      COUNT(DISTINCT D.CLIENTE_ID) AS TOTAL_DISPONIVEIS_ESTIMADO
    FROM USUARIOS U
    LEFT JOIN DISP D ON D.USER_ID = U.USER_ID
    LEFT JOIN INT_USER IU ON IU.ID = U.USER_ID
    GROUP BY U.USER_ID, IU.DESCR
    ORDER BY TOTAL_DISPONIVEIS_ESTIMADO DESC, U.USER_ID
    LIMIT 100
  `);

  const output = {
    generatedAt: new Date().toISOString(),
    tokenPayloadPreview: {
      sub: tokenPayload?.sub ?? null,
      userId: tokenPayload?.userId ?? tokenPayload?.id ?? null,
      email: tokenPayload?.email ?? tokenPayload?.username ?? null,
    },
    schema: {
      vendorColumn,
      columns,
    },
    sf: {
      sf39: {
        id: 39,
        name: sf39?.result?.name ?? null,
        type: sf39?.result?.type ?? null,
        description: sf39?.result?.description ?? null,
        code: sf39?.result?.code ?? null,
      },
      sf40: {
        id: 40,
        name: sf40?.result?.name ?? null,
        type: sf40?.result?.type ?? null,
        description: sf40?.result?.description ?? null,
        code: sf40?.result?.code ?? null,
      },
    },
    data: {
      globalCounts: counts,
      usersWithScope,
      sampleEscopos,
      disponibilidadePorUsuario,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('Erro no diagnostico de clientes disponiveis:', err?.message || err);
  process.exit(1);
});
