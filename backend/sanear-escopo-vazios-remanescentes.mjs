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
const executionId = `SANEAESCOPO${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

async function q(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function dml(sql) {
  await runDmlMitra({ projectId, sql });
}

async function collectMetrics() {
  const rows = await q(`
    SELECT 'SYNC_ATIVO' AS BASE,
           COUNT(*) AS TOTAL,
           SUM(CASE WHEN CODFILIAL IS NULL THEN 1 ELSE 0 END) AS CODFILIAL_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODFILIAL, '')) = '' THEN 1 ELSE 0 END) AS CODFILIAL_VAZIO,
           SUM(CASE WHEN CODEPTO IS NULL THEN 1 ELSE 0 END) AS CODEPTO_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODEPTO, '')) = '' THEN 1 ELSE 0 END) AS CODEPTO_VAZIO,
           SUM(CASE WHEN ID_SECAO IS NULL THEN 1 ELSE 0 END) AS ID_SECAO_NULL
    FROM PEDIDOS_SEMANAIS_SYNC
    WHERE ATIVO = TRUE
    UNION ALL
    SELECT 'SYNC_TODOS' AS BASE,
           COUNT(*) AS TOTAL,
           SUM(CASE WHEN CODFILIAL IS NULL THEN 1 ELSE 0 END) AS CODFILIAL_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODFILIAL, '')) = '' THEN 1 ELSE 0 END) AS CODFILIAL_VAZIO,
           SUM(CASE WHEN CODEPTO IS NULL THEN 1 ELSE 0 END) AS CODEPTO_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODEPTO, '')) = '' THEN 1 ELSE 0 END) AS CODEPTO_VAZIO,
           SUM(CASE WHEN ID_SECAO IS NULL THEN 1 ELSE 0 END) AS ID_SECAO_NULL
    FROM PEDIDOS_SEMANAIS_SYNC
    UNION ALL
    SELECT 'RAW_ATIVO_OK' AS BASE,
           COUNT(*) AS TOTAL,
           SUM(CASE WHEN CODFILIAL IS NULL THEN 1 ELSE 0 END) AS CODFILIAL_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODFILIAL, '')) = '' THEN 1 ELSE 0 END) AS CODFILIAL_VAZIO,
           SUM(CASE WHEN CODEPTO IS NULL THEN 1 ELSE 0 END) AS CODEPTO_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODEPTO, '')) = '' THEN 1 ELSE 0 END) AS CODEPTO_VAZIO,
           SUM(CASE WHEN ID_SECAO IS NULL THEN 1 ELSE 0 END) AS ID_SECAO_NULL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW
    WHERE ATIVO = TRUE AND STATUS_INGESTAO = 'ATIVO'
    UNION ALL
    SELECT 'RAW_TODOS' AS BASE,
           COUNT(*) AS TOTAL,
           SUM(CASE WHEN CODFILIAL IS NULL THEN 1 ELSE 0 END) AS CODFILIAL_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODFILIAL, '')) = '' THEN 1 ELSE 0 END) AS CODFILIAL_VAZIO,
           SUM(CASE WHEN CODEPTO IS NULL THEN 1 ELSE 0 END) AS CODEPTO_NULL,
           SUM(CASE WHEN TRIM(COALESCE(CODEPTO, '')) = '' THEN 1 ELSE 0 END) AS CODEPTO_VAZIO,
           SUM(CASE WHEN ID_SECAO IS NULL THEN 1 ELSE 0 END) AS ID_SECAO_NULL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW
  `);
  return rows;
}

async function main() {
  const before = await collectMetrics();

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
      R.CODFILIAL = CASE
        WHEN TRIM(COALESCE(R.CODFILIAL, '')) = '' AND TRIM(COALESCE(M.CODFILIAL, '')) <> '' THEN M.CODFILIAL
        ELSE R.CODFILIAL
      END,
      R.CODEPTO = CASE
        WHEN TRIM(COALESCE(R.CODEPTO, '')) = '' AND TRIM(COALESCE(M.CODEPTO, '')) <> '' THEN M.CODEPTO
        ELSE R.CODEPTO
      END,
      R.CODSECAO = CASE
        WHEN R.CODSECAO IS NULL AND M.CODSECAO IS NOT NULL THEN M.CODSECAO
        ELSE R.CODSECAO
      END,
      R.SECAO_NOME = CASE
        WHEN TRIM(COALESCE(R.SECAO_NOME, '')) = '' AND TRIM(COALESCE(M.SECAO_NOME, '')) <> '' THEN M.SECAO_NOME
        ELSE R.SECAO_NOME
      END,
      R.ID_SECAO = CASE
        WHEN R.ID_SECAO IS NULL AND S.ID IS NOT NULL THEN S.ID
        ELSE R.ID_SECAO
      END,
      R.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE (
        TRIM(COALESCE(R.CODFILIAL, '')) = ''
        OR TRIM(COALESCE(R.CODEPTO, '')) = ''
        OR R.ID_SECAO IS NULL
      )
      AND (
        TRIM(COALESCE(M.CODFILIAL, '')) <> ''
        OR TRIM(COALESCE(M.CODEPTO, '')) <> ''
        OR S.ID IS NOT NULL
      )
  `);

  await dml(`
    UPDATE PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN BU B ON B.CODIGO = R.CODEPTO
    JOIN SECAO S ON S.ID = R.CODSECAO
      AND (S.ID_BU = B.ID OR S.ID_BU IS NULL)
    SET
      R.ID_SECAO = S.ID,
      R.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE R.ID_SECAO IS NULL
      AND R.CODSECAO IS NOT NULL
      AND TRIM(COALESCE(R.CODEPTO, '')) <> ''
  `);

  await dml(`
    UPDATE PEDIDOS_SEMANAIS_SYNC P
    JOIN (
      SELECT CLIENTE_ID, ANO, MES, SEMANA_NUMERO, CODFILIAL, CODEPTO, ID_SECAO
      FROM (
        SELECT
          R.CLIENTE_ID,
          R.ANO,
          R.MES,
          R.SEMANA_NUMERO,
          TRIM(COALESCE(R.CODFILIAL, '')) AS CODFILIAL,
          TRIM(COALESCE(R.CODEPTO, '')) AS CODEPTO,
          R.ID_SECAO,
          COUNT(*) AS TOTAL_ITENS,
          SUM(COALESCE(R.TOTAL, R.VALOR, 0)) AS TOTAL_VALOR,
          ROW_NUMBER() OVER (
            PARTITION BY R.CLIENTE_ID, R.ANO, R.MES, R.SEMANA_NUMERO
            ORDER BY COUNT(*) DESC, SUM(COALESCE(R.TOTAL, R.VALOR, 0)) DESC, TRIM(COALESCE(R.CODFILIAL, '')), TRIM(COALESCE(R.CODEPTO, '')), R.ID_SECAO
          ) AS RN
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE TRIM(COALESCE(R.CODFILIAL, '')) <> ''
          AND TRIM(COALESCE(R.CODEPTO, '')) <> ''
          AND R.ID_SECAO IS NOT NULL
          AND R.CLIENTE_ID IS NOT NULL
          AND R.ANO IS NOT NULL
          AND R.MES IS NOT NULL
          AND R.SEMANA_NUMERO IS NOT NULL
        GROUP BY R.CLIENTE_ID, R.ANO, R.MES, R.SEMANA_NUMERO, TRIM(COALESCE(R.CODFILIAL, '')), TRIM(COALESCE(R.CODEPTO, '')), R.ID_SECAO
      ) X
      WHERE RN = 1
    ) M
      ON M.CLIENTE_ID = P.CLIENTE_ID
     AND M.ANO = P.ANO
     AND M.MES = P.MES
     AND M.SEMANA_NUMERO = P.SEMANA_NUMERO
    SET
      P.CODFILIAL = M.CODFILIAL,
      P.CODEPTO = M.CODEPTO,
      P.ID_SECAO = M.ID_SECAO,
      P.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE TRIM(COALESCE(P.CODFILIAL, '')) = ''
       OR TRIM(COALESCE(P.CODEPTO, '')) = ''
       OR P.ID_SECAO IS NULL
  `);

  const after = await collectMetrics();

  console.log(
    JSON.stringify(
      {
        executionId,
        before,
        after,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha no saneamento de vazios remanescentes de escopo:');
  console.error(error?.message || error);
  process.exit(1);
});
