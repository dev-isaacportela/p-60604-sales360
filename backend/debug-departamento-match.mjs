import 'dotenv/config';
import { configureSdkMitra, runQueryMitra } from 'mitra-sdk';

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

const summary = await runQueryMitra({
  projectId,
  sql: `
    SELECT
      (SELECT COUNT(*) FROM RCA_DEPARTAMENTO WHERE ATIVO = TRUE) AS TOTAL_RCA_DEP,
      (SELECT COUNT(*) FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA) AS TOTAL_FONTE,
      (
        SELECT COUNT(*)
        FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA I
        WHERE EXISTS (
          SELECT 1
          FROM RCA_DEPARTAMENTO RD
          WHERE RD.ATIVO = TRUE
            AND RD.COD_RCA = I.COD_RCA
            AND UPPER(TRIM(RD.COD_DEPARTAMENTO)) = UPPER(TRIM(COALESCE(I.DEPARTAMENTO, '')))
        )
      ) AS TOTAL_MATCH
  `,
});

const sampleFonte = await runQueryMitra({
  projectId,
  sql: `
    SELECT
      COD_RCA,
      COALESCE(TRIM(DEPARTAMENTO), 'SEM_DEPARTAMENTO') AS DEPARTAMENTO,
      COUNT(*) AS TOTAL
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA
    GROUP BY COD_RCA, COALESCE(TRIM(DEPARTAMENTO), 'SEM_DEPARTAMENTO')
    ORDER BY TOTAL DESC
    LIMIT 20
  `,
});

const sampleVinculos = await runQueryMitra({
  projectId,
  sql: `
    SELECT
      COD_RCA,
      COD_DEPARTAMENTO,
      COD_FILIAL,
      ATIVO
    FROM RCA_DEPARTAMENTO
    ORDER BY COD_RCA, COD_DEPARTAMENTO, COD_FILIAL
    LIMIT 50
  `,
});

console.log(JSON.stringify({
  summary: summary?.result?.rows || [],
  sampleFonte: sampleFonte?.result?.rows || [],
  sampleVinculos: sampleVinculos?.result?.rows || [],
}, null, 2));
