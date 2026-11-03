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
const executionId = `SANEAQT${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

async function q(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function dml(sql) {
  await runDmlMitra({ projectId, sql });
}

async function main() {
  const before = await q(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN COALESCE(VALOR,0)>0 AND COALESCE(QT,0)=0 THEN 1 ELSE 0 END) AS VALOR_POS_QT_ZERO
    FROM PEDIDOS_SEMANAIS_SYNC
  `);

  await dml(`
    UPDATE PEDIDOS_SEMANAIS_SYNC P
    JOIN (
      SELECT
        CLIENTE_ID,
        CODFILIAL,
        CODEPTO,
        ID_SECAO,
        ANO,
        MES,
        SEMANA_NUMERO,
        ROUND(
          SUM(
            CASE
              WHEN COALESCE(QT, 0) > 0 THEN COALESCE(QT, 0)
              WHEN COALESCE(VLUNIT, 0) > 0 AND COALESCE(TOTAL, 0) <> 0 THEN COALESCE(TOTAL, 0) / COALESCE(VLUNIT, 0)
              WHEN COALESCE(TOTAL, 0) > 0 THEN 1
              ELSE 0
            END
          ),
          6
        ) AS QT_CALCULADA
      FROM PEDIDOS_SEMANAIS_SYNC_RAW
      WHERE STATUS_INGESTAO = 'ATIVO'
        AND CLIENTE_ID IS NOT NULL
        AND TRIM(COALESCE(CODFILIAL, '')) <> ''
        AND TRIM(COALESCE(CODEPTO, '')) <> ''
        AND ID_SECAO IS NOT NULL
        AND ANO IS NOT NULL
        AND MES IS NOT NULL
        AND SEMANA_NUMERO IS NOT NULL
      GROUP BY CLIENTE_ID, CODFILIAL, CODEPTO, ID_SECAO, ANO, MES, SEMANA_NUMERO
    ) R
      ON R.CLIENTE_ID = P.CLIENTE_ID
     AND R.CODFILIAL = P.CODFILIAL
     AND R.CODEPTO = P.CODEPTO
     AND R.ID_SECAO = P.ID_SECAO
     AND R.ANO = P.ANO
     AND R.MES = P.MES
     AND R.SEMANA_NUMERO = P.SEMANA_NUMERO
    SET
      P.QT = R.QT_CALCULADA,
      P.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
      P.ULTIMA_EXECUCAO_ID = '${executionId}'
    WHERE COALESCE(P.VALOR, 0) > 0
      AND COALESCE(P.QT, 0) = 0
      AND COALESCE(R.QT_CALCULADA, 0) > 0
  `);

  const after = await q(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN COALESCE(VALOR,0)>0 AND COALESCE(QT,0)=0 THEN 1 ELSE 0 END) AS VALOR_POS_QT_ZERO
    FROM PEDIDOS_SEMANAIS_SYNC
  `);

  const unresolved = await q(`
    SELECT COUNT(*) AS TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC
    WHERE COALESCE(VALOR,0)>0
      AND COALESCE(QT,0)=0
  `);

  console.log(
    JSON.stringify(
      {
        executionId,
        before: before[0] || {},
        after: after[0] || {},
        unresolved: unresolved[0] || {},
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha no saneamento de QT do agregado semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
