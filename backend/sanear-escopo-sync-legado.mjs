import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

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

const payload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || payload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const executionId = `SANEAMENTO${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

async function q(sql) {
  const res = await runQueryMitra({ projectId, sql });
  return res?.result?.rows || [];
}

async function dml(sql) {
  await runDmlMitra({ projectId, sql });
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function collectBaseline() {
  const sync = await q(`
    SELECT
      COUNT(*) AS TOTAL_SYNC_ATIVO,
      SUM(CASE WHEN CODFILIAL IS NULL OR CODEPTO IS NULL OR ID_SECAO IS NULL THEN 1 ELSE 0 END) AS TOTAL_SYNC_NULOS
    FROM PEDIDOS_SEMANAIS_SYNC
    WHERE ATIVO = TRUE
  `);

  const raw = await q(`
    SELECT
      COUNT(*) AS TOTAL_RAW_ATIVO,
      SUM(CASE WHEN CODFILIAL IS NULL OR CODEPTO IS NULL OR ID_SECAO IS NULL THEN 1 ELSE 0 END) AS TOTAL_RAW_NULOS
    FROM PEDIDOS_SEMANAIS_SYNC_RAW
    WHERE ATIVO = TRUE
      AND STATUS_INGESTAO = 'ATIVO'
  `);

  return {
    sync: sync[0] || {},
    raw: raw[0] || {},
  };
}

async function main() {
  const baseline = await collectBaseline();

  await dml(`
    UPDATE PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN (
      SELECT
        CAST(I.NUMPED AS CHAR) AS NUMPED,
        CAST(I.CODPROD AS SIGNED) AS CODPROD,
        CAST(I.CODCLI AS SIGNED) AS CODCLI,
        MAX(LEFT(TRIM(COALESCE(CAST(I.CODFILIAL AS CHAR), '')), 10)) AS CODFILIAL,
        MAX(LEFT(TRIM(COALESCE(CAST(I.CODEPTO AS CHAR), '')), 50)) AS CODEPTO,
        MAX(CAST(I.CODSEC AS SIGNED)) AS CODSECAO,
        MAX(LEFT(TRIM(COALESCE(CAST(I.SECAO AS CHAR), '')), 150)) AS SECAO_NOME
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA I
      WHERE I.NUMPED IS NOT NULL
        AND I.CODPROD IS NOT NULL
        AND I.CODCLI IS NOT NULL
      GROUP BY CAST(I.NUMPED AS CHAR), CAST(I.CODPROD AS SIGNED), CAST(I.CODCLI AS SIGNED)
    ) M
      ON M.NUMPED = R.NUMPED
     AND M.CODPROD = R.CODPROD
     AND M.CODCLI = R.CODCLI
    LEFT JOIN BU B ON B.CODIGO = M.CODEPTO
    LEFT JOIN SECAO S ON S.ID = M.CODSECAO
      AND (S.ID_BU = B.ID OR S.ID_BU IS NULL)
    SET
      R.CODFILIAL = M.CODFILIAL,
      R.CODEPTO = M.CODEPTO,
      R.CODSECAO = M.CODSECAO,
      R.SECAO_NOME = M.SECAO_NOME,
      R.ID_SECAO = S.ID,
      R.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE R.ATIVO = TRUE
      AND (R.CODFILIAL IS NULL OR R.CODEPTO IS NULL OR R.ID_SECAO IS NULL)
  `);

  await dml(`
    INSERT INTO PEDIDOS_SEMANAIS_SYNC (
      CHAVE_AGREGADA,
      CLIENTE_ID,
      VENDEDOR_ID,
      CODFILIAL,
      CODEPTO,
      ID_SECAO,
      SEGMENTO,
      VALOR,
      QT,
      SEMANA_NUMERO,
      MES,
      ANO,
      ATIVO,
      ULTIMA_EXECUCAO_ID,
      ATUALIZADO_EM
    )
    SELECT
      CONCAT(
        CAST(R.CLIENTE_ID AS CHAR), '|',
        R.CODFILIAL, '|',
        R.CODEPTO, '|',
        CAST(R.ID_SECAO AS CHAR), '|',
        CAST(R.ANO AS CHAR), '|',
        CAST(R.MES AS CHAR), '|',
        CAST(R.SEMANA_NUMERO AS CHAR)
      ) AS CHAVE_AGREGADA,
      R.CLIENTE_ID,
      0 AS VENDEDOR_ID,
      R.CODFILIAL,
      R.CODEPTO,
      R.ID_SECAO,
      MAX(R.SEGMENTO) AS SEGMENTO,
      ROUND(SUM(COALESCE(R.TOTAL, R.VALOR, 0)), 2) AS VALOR,
      ROUND(SUM(COALESCE(R.QT, 0)), 6) AS QT,
      R.SEMANA_NUMERO,
      R.MES,
      R.ANO,
      TRUE,
      '${executionId}',
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID IS NOT NULL
      AND R.CODFILIAL IS NOT NULL
      AND R.CODFILIAL <> ''
      AND R.CODEPTO IS NOT NULL
      AND R.CODEPTO <> ''
      AND R.ID_SECAO IS NOT NULL
      AND R.ANO IS NOT NULL
      AND R.MES IS NOT NULL
      AND R.SEMANA_NUMERO BETWEEN 1 AND 5
    GROUP BY R.CLIENTE_ID, R.CODFILIAL, R.CODEPTO, R.ID_SECAO, R.ANO, R.MES, R.SEMANA_NUMERO
    ON DUPLICATE KEY UPDATE
      VENDEDOR_ID = VALUES(VENDEDOR_ID),
      SEGMENTO = VALUES(SEGMENTO),
      VALOR = VALUES(VALOR),
      QT = VALUES(QT),
      ATIVO = TRUE,
      ULTIMA_EXECUCAO_ID = VALUES(ULTIMA_EXECUCAO_ID),
      ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);

  await dml(`
    UPDATE PEDIDOS_SEMANAIS_SYNC
    SET
      ATIVO = FALSE,
      ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE ULTIMA_EXECUCAO_ID <> '${executionId}'
      AND ATIVO = TRUE
  `);

  const after = await collectBaseline();
  const unresolvedRaw = await q(`
    SELECT COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW
    WHERE ATIVO = TRUE
      AND STATUS_INGESTAO = 'ATIVO'
      AND (CODFILIAL IS NULL OR CODEPTO IS NULL OR ID_SECAO IS NULL)
  `);

  const topSyncScopes = await q(`
    SELECT CODFILIAL, CODEPTO, ID_SECAO, COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC
    WHERE ATIVO = TRUE
    GROUP BY CODFILIAL, CODEPTO, ID_SECAO
    ORDER BY TOTAL DESC
    LIMIT 15
  `);

  console.log(
    JSON.stringify(
      {
        executionId,
        baseline: {
          syncAtivo: toInt(baseline.sync.TOTAL_SYNC_ATIVO),
          syncNulos: toInt(baseline.sync.TOTAL_SYNC_NULOS),
          rawAtivo: toInt(baseline.raw.TOTAL_RAW_ATIVO),
          rawNulos: toInt(baseline.raw.TOTAL_RAW_NULOS),
        },
        after: {
          syncAtivo: toInt(after.sync.TOTAL_SYNC_ATIVO),
          syncNulos: toInt(after.sync.TOTAL_SYNC_NULOS),
          rawAtivo: toInt(after.raw.TOTAL_RAW_ATIVO),
          rawNulos: toInt(after.raw.TOTAL_RAW_NULOS),
        },
        unresolvedRawAtivos: toInt(unresolvedRaw?.[0]?.TOTAL),
        topSyncScopes,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha no saneamento de escopo legado:');
  console.error(error?.message || error);
  process.exit(1);
});
