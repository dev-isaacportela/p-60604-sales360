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

async function query(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

const SHARED_QUERY = `
WITH BU_SCOPE AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM BU_VENDEDOR BV
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
ATRIB AS (
  SELECT
    R.NUMPED,
    R.CLIENTE_ID,
    R.COD_RCA AS COD_RCA_CABECALHO,
    B.VENDEDOR_ID AS VENDEDOR_ATRIBUIDO,
    R.CODFILIAL,
    R.CODEPTO,
    COALESCE(R.ID_SECAO, R.CODSECAO) AS CODSECAO,
    SUM(COALESCE(R.TOTAL, 0)) AS TOTAL_ATRIBUIDO,
    COUNT(*) AS ITENS
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN BU_SCOPE B
    ON B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
   AND B.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
   AND (
     (
       B.ID_SECAO IS NOT NULL
       AND (
         TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
         OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
       )
     )
     OR (
       B.ID_SECAO IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM BU_VENDEDOR B2
         WHERE B2.VENDEDOR_ID = B.VENDEDOR_ID
           AND COALESCE(B2.ATIVO, TRUE) = TRUE
           AND TRIM(COALESCE(CAST(B2.CODFILIAL AS CHAR), '')) = B.CODFILIAL
           AND TRIM(CAST(B2.BU_CODIGO AS CHAR)) = B.CODEPTO
           AND B2.ID_SECAO IS NOT NULL
           AND (
             TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
             OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
           )
       )
     )
   )
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.ANO = 2026
    AND R.MES = 4
  GROUP BY R.NUMPED, R.CLIENTE_ID, R.COD_RCA, B.VENDEDOR_ID, R.CODFILIAL, R.CODEPTO, COALESCE(R.ID_SECAO, R.CODSECAO)
)
SELECT
  A.*,
  C.NOME_FANTASIA AS CLIENTE,
  COALESCE(F.NOME, U.DESCR) AS VENDEDOR_ATRIBUIDO_NOME
FROM ATRIB A
LEFT JOIN VENDEDOR_RCA VR
  ON VR.USER_ID = A.VENDEDOR_ATRIBUIDO
 AND VR.COD_RCA = A.COD_RCA_CABECALHO
LEFT JOIN CLIENTES C ON C.ID = A.CLIENTE_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = A.VENDEDOR_ATRIBUIDO
LEFT JOIN INT_USER U ON U.ID = A.VENDEDOR_ATRIBUIDO
WHERE VR.COD_RCA IS NULL
  AND A.COD_RCA_CABECALHO IS NOT NULL
ORDER BY A.TOTAL_ATRIBUIDO DESC
LIMIT 10
`;

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID invalido.');

  const candidates = await query(SHARED_QUERY);
  const first = candidates[0] || null;
  let comparison = null;

  if (first) {
    const numped = String(first.NUMPED).replace(/'/g, "''");
    const vendedor = Number(first.VENDEDOR_ATRIBUIDO);
    const headerRca = String(first.COD_RCA_CABECALHO).replace(/'/g, "''");
    const currentSfScope = await query(`
      SELECT
        ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS TOTAL_SF_ATUAL_RCA_DEPTO
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      JOIN VENDEDOR_RCA VR ON VR.USER_ID = ${vendedor} AND VR.COD_RCA = R.COD_RCA
      JOIN RCA_DEPARTAMENTO RD ON RD.COD_RCA = VR.COD_RCA
        AND TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) = TRIM(CAST(R.CODEPTO AS CHAR))
        AND COALESCE(RD.ATIVO, TRUE) = TRUE
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.NUMPED = '${numped}'
        AND R.COD_RCA = '${headerRca}'
    `);

    comparison = {
      numped: first.NUMPED,
      vendedorAtribuido: first.VENDEDOR_ATRIBUIDO,
      vendedorAtribuidoNome: first.VENDEDOR_ATRIBUIDO_NOME,
      codRcaCabecalho: first.COD_RCA_CABECALHO,
      totalPorBuSecao: Number(first.TOTAL_ATRIBUIDO || 0),
      totalNaLogicaAtualRcaDepartamento: Number(currentSfScope[0]?.TOTAL_SF_ATUAL_RCA_DEPTO || 0),
    };
  }

  console.log(JSON.stringify({
    periodo: '2026-04',
    candidates: candidates.length,
    firstComparison: comparison,
    sample: candidates,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha no diagnostico de pedidos compartilhados:');
  console.error(error?.message || error);
  process.exit(1);
});
