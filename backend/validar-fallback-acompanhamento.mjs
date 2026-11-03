import 'dotenv/config';
import { configureSdkMitra, runQueryMitra } from 'mitra-sdk';

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

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const CTE_ESCOPO_FALLBACK = (userId) => `
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
  WHERE (EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId})
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
  WHERE (EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId})
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
`;

async function main() {
  const isaac = firstRow(await q(`
    SELECT ID
    FROM INT_USER
    WHERE UPPER(COALESCE(NOME, '')) LIKE '%ISAAC%'
       OR UPPER(COALESCE(DESCR, '')) LIKE '%ISAAC%'
    ORDER BY ID
    LIMIT 1
  `));

  if (!isaac) throw new Error('Usuario Isaac nao encontrado.');
  const isaacId = toInt(isaac.ID);

  const cliente = firstRow(await q(`
    SELECT C.ID, C.NOME_FANTASIA
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
    WHERE (EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId})
      AND (
        UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE '%VIVENTI%'
        OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE '%VIVENTI%'
      )
    ORDER BY C.ID DESC
    LIMIT 1
  `));

  if (!cliente) throw new Error('Cliente Viventi nao encontrado na carteira do Isaac.');
  const clienteId = toInt(cliente.ID);

  const periodo = firstRow(await q(`
    SELECT YEAR(CURRENT_DATE) AS ANO_REF, MONTH(CURRENT_DATE) AS MES_REF, CEIL(DAY(CURRENT_DATE)/7) AS SEMANA_REF
  `));
  const ano = toInt(periodo.ANO_REF);
  const mes = toInt(periodo.MES_REF);

  const estrito104 = firstRow(await q(`
    WITH ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = ${isaacId} OR F.ID_SUBSTITUTO = ${isaacId})
    )
    SELECT COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC PS
    JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
      AND E.CODFILIAL = PS.CODFILIAL
      AND E.CODEPTO = PS.CODEPTO
      AND E.ID_SECAO = PS.ID_SECAO
    WHERE PS.ATIVO = TRUE
      AND PS.ANO = ${ano}
      AND PS.MES = ${mes}
  `));

  const fallback104 = firstRow(await q(`
    ${CTE_ESCOPO_FALLBACK(isaacId)}
    SELECT COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC PS
    JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
      AND (
        (
          E.CODFILIAL IS NOT NULL
          AND TRIM(COALESCE(CAST(PS.CODFILIAL AS CHAR), '')) = E.CODFILIAL
          AND CAST(PS.CODEPTO AS CHAR) = E.CODEPTO
          AND PS.ID_SECAO = E.ID_SECAO
        )
        OR (
          E.CODFILIAL IS NULL
          AND E.ID_SECAO IS NULL
          AND CAST(PS.CODEPTO AS CHAR) = E.CODEPTO
        )
      )
    WHERE PS.ATIVO = TRUE
      AND PS.ANO = ${ano}
      AND PS.MES = ${mes}
  `));

  const detalhe109 = firstRow(await q(`
    ${CTE_ESCOPO_FALLBACK(isaacId)}
    SELECT COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND (
        (
          E.CODFILIAL IS NOT NULL
          AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
          AND R.ID_SECAO = E.ID_SECAO
        )
        OR (
          E.CODFILIAL IS NULL
          AND E.ID_SECAO IS NULL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
        )
      )
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = ${clienteId}
      AND R.ANO = ${ano}
  `));

  const semanaMaisRecente = firstRow(await q(`
    ${CTE_ESCOPO_FALLBACK(isaacId)}
    SELECT R.ANO, R.MES, R.SEMANA_NUMERO
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND (
        (
          E.CODFILIAL IS NOT NULL
          AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
          AND R.ID_SECAO = E.ID_SECAO
        )
        OR (
          E.CODFILIAL IS NULL
          AND E.ID_SECAO IS NULL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
        )
      )
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = ${clienteId}
    ORDER BY R.ANO DESC, R.MES DESC, R.SEMANA_NUMERO DESC
    LIMIT 1
  `));

  const anoSemana = toInt(semanaMaisRecente?.ANO || ano);
  const mesSemana = toInt(semanaMaisRecente?.MES || mes);
  const semanaNumero = toInt(semanaMaisRecente?.SEMANA_NUMERO || periodo.SEMANA_REF);

  const detalhe110 = firstRow(await q(`
    ${CTE_ESCOPO_FALLBACK(isaacId)}
    SELECT COUNT(DISTINCT R.CODPROD) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND (
        (
          E.CODFILIAL IS NOT NULL
          AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
          AND R.ID_SECAO = E.ID_SECAO
        )
        OR (
          E.CODFILIAL IS NULL
          AND E.ID_SECAO IS NULL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
        )
      )
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = ${clienteId}
      AND R.ANO = ${anoSemana}
      AND R.MES = ${mesSemana}
      AND R.SEMANA_NUMERO = ${semanaNumero}
  `));

  const detalhe111 = firstRow(await q(`
    ${CTE_ESCOPO_FALLBACK(isaacId)}
    SELECT COUNT(DISTINCT CAST(R.NUMPED AS CHAR)) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND (
        (
          E.CODFILIAL IS NOT NULL
          AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
          AND R.ID_SECAO = E.ID_SECAO
        )
        OR (
          E.CODFILIAL IS NULL
          AND E.ID_SECAO IS NULL
          AND CAST(R.CODEPTO AS CHAR) = E.CODEPTO
        )
      )
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = ${clienteId}
      AND R.ANO = ${anoSemana}
      AND R.MES = ${mesSemana}
      AND R.SEMANA_NUMERO = ${semanaNumero}
  `));

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        isaacId,
        clienteId,
        clienteNome: cliente.NOME_FANTASIA,
        periodoAtual: { ano, mes },
        semanaValidada: { ano: anoSemana, mes: mesSemana, semanaNumero },
        sf104: {
          totalEstritoAntigo: toInt(estrito104?.TOTAL),
          totalComFallbackNovo: toInt(fallback104?.TOTAL),
        },
        sf109: { totalLinhasDetalheSemanal: toInt(detalhe109?.TOTAL) },
        sf110: { totalProdutosSemana: toInt(detalhe110?.TOTAL) },
        sf111: { totalPedidosSemana: toInt(detalhe111?.TOTAL) },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha na validacao complementar do fallback de acompanhamento:');
  console.error(error?.message || error);
  process.exit(1);
});
