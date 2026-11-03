import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
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

const sfDefinition = {
  name: 'sazonalidadeClienteProdutos',
  description: 'Retorna sazonalidade de compras do cliente por produto nos últimos 12 meses no escopo do vendedor logado.',
  code: `
    WITH CARTEIRA_LOGADA AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.ID_VENDEDOR,
        TRIM(COALESCE(EC.CODFILIAL, '')) AS CODFILIAL,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = :VAR_USER
         OR F.ID_SUBSTITUTO = :VAR_USER
    ),
    ESCOPO_EXPLICITO AS (
      SELECT DISTINCT
        CL.ID_CLIENTE,
        CL.CODFILIAL,
        TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
        CL.ID_SECAO
      FROM CARTEIRA_LOGADA CL
      JOIN BU_VENDEDOR BV
        ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
       AND TRIM(COALESCE(BV.CODFILIAL, '')) = CL.CODFILIAL
       AND BV.ID_SECAO = CL.ID_SECAO
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND CL.CODFILIAL <> ''
        AND CL.ID_SECAO IS NOT NULL
    ),
    ESCOPO_FALLBACK_BU AS (
      SELECT DISTINCT
        CL.ID_CLIENTE,
        NULL AS CODFILIAL,
        TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
        NULL AS ID_SECAO
      FROM CARTEIRA_LOGADA CL
      JOIN BU_VENDEDOR BV
        ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND (BV.CODFILIAL IS NULL OR TRIM(COALESCE(BV.CODFILIAL, '')) = '')
        AND BV.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV2
          WHERE BV2.VENDEDOR_ID = CL.ID_VENDEDOR
            AND COALESCE(BV2.ATIVO, TRUE) = TRUE
            AND BV2.CODFILIAL IS NOT NULL
            AND TRIM(COALESCE(BV2.CODFILIAL, '')) <> ''
            AND BV2.ID_SECAO IS NOT NULL
        )
    ),
    ESCOPO_VENDEDOR AS (
      SELECT * FROM ESCOPO_EXPLICITO
      UNION
      SELECT * FROM ESCOPO_FALLBACK_BU
    )
    SELECT
      R.ANO,
      R.MES,
      CONCAT(
        CASE R.MES
          WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
          WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
          WHEN 9 THEN 'Set' WHEN 10 THEN 'Out' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dez'
        END,
        '/',
        RIGHT(CAST(R.ANO AS CHAR), 2)
      ) AS NOME_MES,
      R.CODPROD,
      COALESCE(NULLIF(TRIM(R.DESCRICAO), ''), CONCAT('Produto ', CAST(R.CODPROD AS CHAR))) AS DESCRICAO,
      ROUND(SUM(COALESCE(R.QT, 0)), 3) AS QT_TOTAL,
      ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = {{ID_CLIENTE}}
      AND STR_TO_DATE(CONCAT(R.ANO, '-', LPAD(R.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 11 MONTH)
      AND EXISTS (
        SELECT 1
        FROM ESCOPO_VENDEDOR E
        WHERE E.ID_CLIENTE = R.CLIENTE_ID
          AND (
            (
              E.CODFILIAL IS NOT NULL
              AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
              AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
              AND R.ID_SECAO = E.ID_SECAO
            )
            OR (
              E.CODFILIAL IS NULL
              AND E.ID_SECAO IS NULL
              AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
            )
          )
      )
    GROUP BY R.ANO, R.MES, R.CODPROD, DESCRICAO
    ORDER BY R.CODPROD, R.ANO, R.MES
  `,
};

async function upsertSf() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((item) => item.name === sfDefinition.name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: sfDefinition.code,
      description: sfDefinition.description,
    });
    console.log(JSON.stringify({ action: 'updated', name: sfDefinition.name, id: existing.id }, null, 2));
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: sfDefinition.name,
    type: 'SQL',
    code: sfDefinition.code,
    description: sfDefinition.description,
  });

  const sfId = created?.result?.serverFunctionId
    || created?.result?.id
    || created?.serverFunctionId
    || created?.id
    || null;

  console.log(JSON.stringify({ action: 'created', name: sfDefinition.name, id: sfId }, null, 2));
  return sfId;
}

async function main() {
  const sfId = await upsertSf();
  console.log('Sazonalidade por produto do cliente configurada com sucesso.');
  console.log(JSON.stringify({ sazonalidadeClienteProdutos: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar sazonalidade por produto do cliente:');
  console.error(error?.message || error);
  process.exit(1);
});
