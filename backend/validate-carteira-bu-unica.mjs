import 'dotenv/config';
import {
  configureSdkMitra,
  runQueryMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
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

async function q(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

function extractRows(output) {
  if (!output) return [];
  if (Array.isArray(output?.rows)) return output.rows;
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed?.rows)) return parsed.rows;
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

async function main() {
  const indexes = await q(`
    SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUNAS
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'EQUIPE_CLIENTE'
    GROUP BY INDEX_NAME, NON_UNIQUE
    ORDER BY INDEX_NAME
  `);

  const sf41 = await readServerFunctionMitra({ projectId, serverFunctionId: 41 });
  const sf39 = await readServerFunctionMitra({ projectId, serverFunctionId: 39 });
  const sf40 = await readServerFunctionMitra({ projectId, serverFunctionId: 40 });
  const sf25 = await readServerFunctionMitra({ projectId, serverFunctionId: 25 });

  const sameBuCandidates = await q(`
    SELECT EC.ID_CLIENTE, EC.ID_VENDEDOR
    FROM EQUIPE_CLIENTE EC
    WHERE COALESCE(
      (
        SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
        FROM BU_VENDEDOR BV
        WHERE BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
      ),
      'PADRAO'
    ) = COALESCE(
      (
        SELECT MIN(COALESCE(NULLIF(TRIM(BM.BU_CODIGO), ''), 'PADRAO'))
        FROM BU_VENDEDOR BM
        WHERE BM.VENDEDOR_ID = :VAR_USER
          AND COALESCE(BM.ATIVO, TRUE) = TRUE
      ),
      'PADRAO'
    )
      AND EC.ID_VENDEDOR <> :VAR_USER
    LIMIT 1
  `);

  let blockedTest = null;
  if (sameBuCandidates.length > 0) {
    const candidate = sameBuCandidates[0];
    const before = await q(
      `SELECT COUNT(*) AS TOTAL FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${Number(candidate.ID_CLIENTE)} AND ID_VENDEDOR = :VAR_USER`,
    );

    const exec = await executeServerFunctionMitra({
      projectId,
      serverFunctionId: 41,
      input: {
        clienteId: String(candidate.ID_CLIENTE),
        idBu: '',
      },
    });

    const after = await q(
      `SELECT COUNT(*) AS TOTAL FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${Number(candidate.ID_CLIENTE)} AND ID_VENDEDOR = :VAR_USER`,
    );

    blockedTest = {
      clienteId: Number(candidate.ID_CLIENTE),
      donoAtual: Number(candidate.ID_VENDEDOR),
      before: Number(before[0]?.TOTAL || 0),
      after: Number(after[0]?.TOTAL || 0),
      executionStatus: exec?.result?.executionStatus || null,
      error: exec?.result?.error || null,
    };
  }

  const otherBuAvailable = await q(`
    SELECT C.ID AS ID_CLIENTE
    FROM CLIENTES C
    WHERE EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = C.ID
        AND COALESCE(
          (
            SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
            FROM BU_VENDEDOR BV
            WHERE BV.VENDEDOR_ID = EC.ID_VENDEDOR
              AND COALESCE(BV.ATIVO, TRUE) = TRUE
          ),
          'PADRAO'
        ) <> COALESCE(
          (
            SELECT MIN(COALESCE(NULLIF(TRIM(BM.BU_CODIGO), ''), 'PADRAO'))
            FROM BU_VENDEDOR BM
            WHERE BM.VENDEDOR_ID = :VAR_USER
              AND COALESCE(BM.ATIVO, TRUE) = TRUE
          ),
          'PADRAO'
        )
    )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC2
        WHERE EC2.ID_CLIENTE = C.ID
          AND COALESCE(
            (
              SELECT MIN(COALESCE(NULLIF(TRIM(BV2.BU_CODIGO), ''), 'PADRAO'))
              FROM BU_VENDEDOR BV2
              WHERE BV2.VENDEDOR_ID = EC2.ID_VENDEDOR
                AND COALESCE(BV2.ATIVO, TRUE) = TRUE
            ),
            'PADRAO'
          ) = COALESCE(
            (
              SELECT MIN(COALESCE(NULLIF(TRIM(BM2.BU_CODIGO), ''), 'PADRAO'))
              FROM BU_VENDEDOR BM2
              WHERE BM2.VENDEDOR_ID = :VAR_USER
                AND COALESCE(BM2.ATIVO, TRUE) = TRUE
            ),
            'PADRAO'
          )
      )
    LIMIT 1
  `);

  let otherBuDisponivelCheck = null;
  if (otherBuAvailable.length > 0) {
    const clientId = Number(otherBuAvailable[0].ID_CLIENTE);
    const exec39 = await executeServerFunctionMitra({
      projectId,
      serverFunctionId: 39,
      input: {
        busca: String(clientId),
        idBu: '',
        segmento: '',
        status: '',
        cidade: '',
        uf: '',
        limit: '5000',
        offset: '0',
      },
    });
    const rows39 = extractRows(exec39?.result?.output);
    otherBuDisponivelCheck = {
      clienteId: clientId,
      apareceNaDisponiveis: rows39.some((row) => Number(row.ID) === clientId),
      quantidadeRetornada: rows39.length,
    };
  }

  const viventiCarteira = await q(`
    SELECT EC.ID_VENDEDOR
    FROM EQUIPE_CLIENTE EC
    WHERE EC.ID_CLIENTE = 430
    ORDER BY EC.ID_VENDEDOR
  `);

  const viventiRcasRaw = await q(`
    SELECT DISTINCT CAST(VT.COD_RCA AS SIGNED) AS COD_RCA
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = 430
    ORDER BY COD_RCA
  `);

  const viventiRcasScoped = await q(`
    SELECT DISTINCT CAST(VT.COD_RCA AS SIGNED) AS COD_RCA
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = 430
      AND EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
        WHERE EC.ID_CLIENTE = 430
          AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
      )
    ORDER BY COD_RCA
  `);

  const viventiSf25 = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 25,
    input: {
      clienteId: '430',
      offset: '0',
      limit: '200',
    },
  });

  const viventiRows = extractRows(viventiSf25?.result?.output);

  console.log(
    JSON.stringify(
      {
        indexes,
        sfNames: {
          41: sf41?.result?.name,
          39: sf39?.result?.name,
          40: sf40?.result?.name,
          25: sf25?.result?.name,
        },
        blockedTest,
        otherBuDisponivelCheck,
        viventiCarteira,
        viventiRcasRaw,
        viventiRcasScoped,
        viventiHistoricoTotalPedidos: viventiRows.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha na validação da regra de carteira por BU:');
  console.error(error?.message || error);
  process.exit(1);
});
