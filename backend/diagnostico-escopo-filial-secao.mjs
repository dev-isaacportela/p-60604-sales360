import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, readServerFunctionMitra } from 'mitra-sdk';

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

async function main() {
  const tableColumns = await q(`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('BU_VENDEDOR', 'EQUIPE_CLIENTE', 'IMP_VENDAS_DASHBOARD_TOTVS_RCA')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const tableIndexes = await q(`
    SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('BU_VENDEDOR', 'EQUIPE_CLIENTE')
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);

  const fkConstraints = await q(`
    SELECT
      KCU.TABLE_NAME,
      KCU.CONSTRAINT_NAME,
      KCU.COLUMN_NAME,
      KCU.REFERENCED_TABLE_NAME,
      KCU.REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU
    WHERE KCU.TABLE_SCHEMA = DATABASE()
      AND KCU.TABLE_NAME IN ('BU_VENDEDOR', 'EQUIPE_CLIENTE')
      AND KCU.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY KCU.TABLE_NAME, KCU.CONSTRAINT_NAME, KCU.ORDINAL_POSITION
  `);

  const sfIds = [39, 40, 41, 25, 104];
  const sfs = [];
  for (const id of sfIds) {
    const sf = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    sfs.push({
      id,
      name: sf?.result?.name || null,
      type: sf?.result?.type || null,
      description: sf?.result?.description || null,
      code: sf?.result?.code || null,
    });
  }

  const rawColumns = tableColumns.filter((row) => row.TABLE_NAME === 'IMP_VENDAS_DASHBOARD_TOTVS_RCA');
  const hasCodSecao = rawColumns.some((row) => String(row.COLUMN_NAME).toUpperCase() === 'CODSECAO');

  const output = {
    generatedAt: new Date().toISOString(),
    schema: {
      columns: tableColumns,
      indexes: tableIndexes,
      foreignKeys: fkConstraints,
    },
    raw: {
      table: 'IMP_VENDAS_DASHBOARD_TOTVS_RCA',
      hasCodSecao,
      columns: rawColumns,
    },
    serverFunctions: sfs,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('Erro no diagnóstico:', err?.message || err);
  process.exit(1);
});
