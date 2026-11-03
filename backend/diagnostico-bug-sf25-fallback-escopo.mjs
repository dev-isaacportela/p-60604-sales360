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
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function tableHasColumn(tableName, columnName) {
  const rows = await q(`
    SELECT COUNT(*) AS TOTAL
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
  `);
  return Number(rows?.[0]?.TOTAL || 0) > 0;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findIsaac() {
  const rows = await q(`
    SELECT
      U.ID,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', U.ID)) AS NOME_EXIBICAO,
      U.DESCR AS EMAIL
    FROM INT_USER U
    WHERE UPPER(COALESCE(U.NOME, '')) LIKE '%ISAAC%'
       OR UPPER(COALESCE(U.DESCR, '')) LIKE '%ISAAC%'
    ORDER BY U.ID
    LIMIT 1
  `);
  return firstRow(rows);
}

async function findClienteCarteiraPreferenciaViventi(isaacId) {
  const rows = await q(`
    SELECT
      C.ID,
      C.NOME_FANTASIA,
      C.RAZAO_SOCIAL,
      CASE
        WHEN UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE '%VIVENTI%'
          OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE '%VIVENTI%'
        THEN 1
        ELSE 0
      END AS PRIORIDADE_VIVENTI,
      COUNT(*) AS TOTAL_VINCULOS
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
    WHERE EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId}
    GROUP BY C.ID, C.NOME_FANTASIA, C.RAZAO_SOCIAL
    ORDER BY PRIORIDADE_VIVENTI DESC, TOTAL_VINCULOS DESC, C.ID DESC
    LIMIT 1
  `);
  return firstRow(rows);
}

async function main() {
  const isaac = await findIsaac();
  if (!isaac) {
    throw new Error('Nao foi possivel localizar o usuario Isaac em INT_USER.');
  }

  const isaacId = toInt(isaac.ID);

  const hasUserId = await tableHasColumn('BU_VENDEDOR', 'USER_ID');
  const vendedorColumn = hasUserId ? 'USER_ID' : 'VENDEDOR_ID';

  const escopoAtual = await q(`
    SELECT
      bv.${vendedorColumn} AS USER_ID,
      bu.ID AS ID_BU,
      bv.BU_CODIGO,
      bv.CODFILIAL,
      bv.ID_SECAO,
      s.NOME_SECAO,
      f.NOME_FILIAL,
      bu.NOME AS NOME_BU
    FROM BU_VENDEDOR bv
    LEFT JOIN SECAO s ON s.ID = bv.ID_SECAO
    LEFT JOIN FILIAL f ON f.CODFILIAL = bv.CODFILIAL
    LEFT JOIN BU bu ON bu.CODIGO = bv.BU_CODIGO
    WHERE bv.${vendedorColumn} = ${isaacId}
    ORDER BY bv.BU_CODIGO, bv.CODFILIAL, bv.ID_SECAO
  `);

  const sf25 = await readServerFunctionMitra({ projectId, serverFunctionId: 25 });

  const cliente = await findClienteCarteiraPreferenciaViventi(isaacId);
  if (!cliente) {
    throw new Error('Nao foi possivel localizar cliente na carteira do Isaac para teste da SF 25.');
  }

  const clienteId = toInt(cliente.ID);

  const totalComEscopo = firstRow(await q(`
    SELECT COUNT(DISTINCT VT.NUMPED) AS TOTAL_COM_ESCOPO
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    JOIN CLIENTES C ON C.WINTHOR_CODCLI = VT.CODCLI
    WHERE C.ID = ${clienteId}
      AND EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        JOIN SECAO S ON S.ID = EC.ID_SECAO
        WHERE EC.ID_CLIENTE = ${clienteId}
          AND (EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId})
          AND TRIM(COALESCE(CAST(VT.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(EC.CODFILIAL, ''))
          AND CAST(VT.CODEPTO AS CHAR) = CAST(BV.BU_CODIGO AS CHAR)
          AND CAST(VT.CODSEC AS SIGNED) = S.ID
      )
  `));

  const totalSemEscopo = firstRow(await q(`
    SELECT COUNT(DISTINCT VT.NUMPED) AS TOTAL_SEM_ESCOPO
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    JOIN CLIENTES C ON C.WINTHOR_CODCLI = VT.CODCLI
    WHERE C.ID = ${clienteId}
  `));

  const totalComFallback = firstRow(await q(`
    WITH ESCOPO_COMPLETO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        TRIM(COALESCE(EC.CODFILIAL, '')) AS CODFILIAL,
        COALESCE(
          (
            SELECT B.CODIGO
            FROM BU B
            WHERE UPPER(TRIM(B.CODIGO)) = UPPER(TRIM(BV.BU_CODIGO))
            LIMIT 1
          ),
          (
            SELECT B.CODIGO
            FROM BU B
            WHERE UPPER(TRIM(B.NOME)) = UPPER(TRIM(BV.BU_CODIGO))
            LIMIT 1
          ),
          CASE
            WHEN TRIM(BV.BU_CODIGO) REGEXP '^[0-9]+$' THEN CAST(CAST(BV.BU_CODIGO AS UNSIGNED) AS CHAR)
            ELSE TRIM(BV.BU_CODIGO)
          END
        ) AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId})
        AND BV.CODFILIAL IS NOT NULL
        AND TRIM(COALESCE(BV.CODFILIAL, '')) <> ''
        AND BV.ID_SECAO IS NOT NULL
    ),
    ESCOPO_FALLBACK_BU AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        NULL AS CODFILIAL,
        COALESCE(
          (
            SELECT B.CODIGO
            FROM BU B
            WHERE UPPER(TRIM(B.CODIGO)) = UPPER(TRIM(BV.BU_CODIGO))
            LIMIT 1
          ),
          (
            SELECT B.CODIGO
            FROM BU B
            WHERE UPPER(TRIM(B.NOME)) = UPPER(TRIM(BV.BU_CODIGO))
            LIMIT 1
          ),
          CASE
            WHEN TRIM(BV.BU_CODIGO) REGEXP '^[0-9]+$' THEN CAST(CAST(BV.BU_CODIGO AS UNSIGNED) AS CHAR)
            ELSE TRIM(BV.BU_CODIGO)
          END
        ) AS CODEPTO,
        NULL AS ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId})
        AND (BV.CODFILIAL IS NULL OR TRIM(COALESCE(BV.CODFILIAL, '')) = '')
        AND BV.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV2
          WHERE BV2.VENDEDOR_ID = EC.ID_VENDEDOR
            AND COALESCE(BV2.ATIVO, TRUE) = TRUE
            AND BV2.CODFILIAL IS NOT NULL
            AND TRIM(COALESCE(BV2.CODFILIAL, '')) <> ''
            AND BV2.ID_SECAO IS NOT NULL
        )
    ),
    ESCOPO AS (
      SELECT * FROM ESCOPO_COMPLETO
      UNION
      SELECT * FROM ESCOPO_FALLBACK_BU
    )
    SELECT COUNT(DISTINCT VT.NUMPED) AS TOTAL_COM_FALLBACK
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    JOIN CLIENTES C ON C.WINTHOR_CODCLI = VT.CODCLI
    WHERE C.ID = ${clienteId}
      AND EXISTS (
        SELECT 1
        FROM ESCOPO E
        WHERE E.ID_CLIENTE = ${clienteId}
          AND (
            (
              E.CODFILIAL IS NOT NULL
              AND TRIM(COALESCE(CAST(VT.CODFILIAL AS CHAR), '')) = E.CODFILIAL
              AND CAST(VT.CODEPTO AS CHAR) = E.CODEPTO
              AND CAST(VT.CODSEC AS SIGNED) = E.ID_SECAO
            )
            OR (
              E.CODFILIAL IS NULL
              AND E.ID_SECAO IS NULL
              AND CAST(VT.CODEPTO AS CHAR) = E.CODEPTO
            )
          )
      )
  `));

  const amostraSemEscopo = await q(`
    SELECT
      CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
      SUBSTRING(VT.DTSAIDA, 1, 10) AS DATA_PEDIDO,
      CAST(VT.CODFILIAL AS CHAR) AS CODFILIAL,
      CAST(VT.CODEPTO AS CHAR) AS CODEPTO,
      CAST(VT.CODSEC AS SIGNED) AS ID_SECAO,
      ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    JOIN CLIENTES C ON C.WINTHOR_CODCLI = VT.CODCLI
    WHERE C.ID = ${clienteId}
    GROUP BY VT.NUMPED, SUBSTRING(VT.DTSAIDA, 1, 10), VT.CODFILIAL, VT.CODEPTO, VT.CODSEC
    ORDER BY SUBSTRING(VT.DTSAIDA, 1, 10) DESC, CAST(VT.NUMPED AS SIGNED) DESC
    LIMIT 10
  `);

  const syncRaw = firstRow(await q(`
    WITH CARTEIRA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId}
    )
    SELECT
      COUNT(*) AS TOTAL_REGISTROS,
      SUM(
        CASE
          WHEN R.CODFILIAL IS NOT NULL AND TRIM(CAST(R.CODFILIAL AS CHAR)) <> ''
            AND R.CODEPTO IS NOT NULL AND TRIM(CAST(R.CODEPTO AS CHAR)) <> ''
            AND R.ID_SECAO IS NOT NULL
          THEN 1
          ELSE 0
        END
      ) AS REGISTROS_ESCOPO_PREENCHIDO,
      SUM(
        CASE
          WHEN R.CODFILIAL IS NULL OR TRIM(CAST(R.CODFILIAL AS CHAR)) = ''
            OR R.CODEPTO IS NULL OR TRIM(CAST(R.CODEPTO AS CHAR)) = ''
            OR R.ID_SECAO IS NULL
          THEN 1
          ELSE 0
        END
      ) AS REGISTROS_ESCOPO_INCOMPLETO
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN CARTEIRA C ON C.ID_CLIENTE = R.CLIENTE_ID
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
  `));

  const syncAgregado = firstRow(await q(`
    WITH CARTEIRA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId}
    )
    SELECT
      COUNT(*) AS TOTAL_REGISTROS,
      SUM(
        CASE
          WHEN P.CODFILIAL IS NOT NULL AND TRIM(CAST(P.CODFILIAL AS CHAR)) <> ''
            AND P.CODEPTO IS NOT NULL AND TRIM(CAST(P.CODEPTO AS CHAR)) <> ''
            AND P.ID_SECAO IS NOT NULL
          THEN 1
          ELSE 0
        END
      ) AS REGISTROS_ESCOPO_PREENCHIDO,
      SUM(
        CASE
          WHEN P.CODFILIAL IS NULL OR TRIM(CAST(P.CODFILIAL AS CHAR)) = ''
            OR P.CODEPTO IS NULL OR TRIM(CAST(P.CODEPTO AS CHAR)) = ''
            OR P.ID_SECAO IS NULL
          THEN 1
          ELSE 0
        END
      ) AS REGISTROS_ESCOPO_INCOMPLETO
    FROM PEDIDOS_SEMANAIS_SYNC P
    JOIN CARTEIRA C ON C.ID_CLIENTE = P.CLIENTE_ID
    WHERE P.ATIVO = TRUE
  `));

  const syncEscoposTop = await q(`
    WITH CARTEIRA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId}
    )
    SELECT
      P.CODFILIAL,
      P.CODEPTO,
      P.ID_SECAO,
      COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC P
    JOIN CARTEIRA C ON C.ID_CLIENTE = P.CLIENTE_ID
    WHERE P.ATIVO = TRUE
    GROUP BY P.CODFILIAL, P.CODEPTO, P.ID_SECAO
    ORDER BY TOTAL DESC
    LIMIT 20
  `);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    vendedorIsaac: {
      id: isaacId,
      nome: isaac.NOME_EXIBICAO || null,
      email: isaac.EMAIL || null,
    },
    diagnostico1EscopoBuVendedor: escopoAtual,
    diagnostico2Sf25: {
      id: 25,
      name: sf25?.result?.name || null,
      type: sf25?.result?.type || null,
      code: sf25?.result?.code || null,
    },
    clienteTeste: {
      id: clienteId,
      nomeFantasia: cliente.NOME_FANTASIA || null,
      razaoSocial: cliente.RAZAO_SOCIAL || null,
      prioridadeViventi: toInt(cliente.PRIORIDADE_VIVENTI),
      totalVinculosCarteira: toInt(cliente.TOTAL_VINCULOS),
    },
    diagnostico3Sf25Manual: {
      totalComFiltroEscopo: toInt(totalComEscopo?.TOTAL_COM_ESCOPO),
      totalComFallbackEscopo: toInt(totalComFallback?.TOTAL_COM_FALLBACK),
      totalSemFiltroEscopo: toInt(totalSemEscopo?.TOTAL_SEM_ESCOPO),
      amostraPedidosSemEscopo: amostraSemEscopo,
    },
    diagnostico4SyncEscopoPreenchido: {
      raw: {
        totalRegistros: toInt(syncRaw?.TOTAL_REGISTROS),
        registrosEscopoPreenchido: toInt(syncRaw?.REGISTROS_ESCOPO_PREENCHIDO),
        registrosEscopoIncompleto: toInt(syncRaw?.REGISTROS_ESCOPO_INCOMPLETO),
      },
      agregado: {
        totalRegistros: toInt(syncAgregado?.TOTAL_REGISTROS),
        registrosEscopoPreenchido: toInt(syncAgregado?.REGISTROS_ESCOPO_PREENCHIDO),
        registrosEscopoIncompleto: toInt(syncAgregado?.REGISTROS_ESCOPO_INCOMPLETO),
      },
      topEscoposSync: syncEscoposTop,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha no diagnostico do bug da SF 25:');
  console.error(error?.message || error);
  process.exit(1);
});
