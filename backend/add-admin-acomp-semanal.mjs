import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
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
const ADMIN_EMAIL = 'ti@benenutri.com';

const sectionMatch = `
  B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
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
        FROM BU_SCOPE B2
        WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
          AND B2.CODFILIAL = B.CODFILIAL
          AND B2.CODEPTO = B.CODEPTO
          AND B2.ID_SECAO IS NOT NULL
          AND (
            TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
            OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
          )
      )
    )
  )
`;

const adminListarVendedoresSql = `
WITH ADMIN AS (
  SELECT CASE WHEN LOWER(COALESCE(DESCR, '')) = '${ADMIN_EMAIL}' THEN 1 ELSE 0 END AS PODE_ACESSAR
  FROM INT_USER
  WHERE ID = :VAR_USER
),
VENDEDORES AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID AS USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', BV.VENDEDOR_ID)) AS NOME,
    U.DESCR AS EMAIL,
    COUNT(*) AS TOTAL_ESCOPOS
  FROM BU_VENDEDOR BV
  JOIN ADMIN A ON A.PODE_ACESSAR = 1
  LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
  LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND BV.VENDEDOR_ID IS NOT NULL
  GROUP BY BV.VENDEDOR_ID, F.NOME, U.NOME, U.DESCR
)
SELECT USER_ID, NOME, EMAIL, TOTAL_ESCOPOS
FROM VENDEDORES
ORDER BY NOME, USER_ID
`;

const adminAcompSemanalListarSql = `
WITH INPUTS AS (
  SELECT
    CASE WHEN '{{userId}}' REGEXP '^[0-9]+$' THEN CAST('{{userId}}' AS UNSIGNED) ELSE NULL END AS VENDEDOR_PARAM,
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE 2026 END AS ANO_REF,
    CASE WHEN '{{ramoCliente}}' = '' OR LOCATE('{', '{{ramoCliente}}') > 0 THEN NULL ELSE UPPER('{{ramoCliente}}') END AS RAMO_PARAM
),
ADMIN AS (
  SELECT CASE WHEN LOWER(COALESCE(DESCR, '')) = '${ADMIN_EMAIL}' THEN 1 ELSE 0 END AS PODE_ACESSAR
  FROM INT_USER
  WHERE ID = :VAR_USER
),
BU_SCOPE AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM BU_VENDEDOR BV
  JOIN INPUTS I ON I.VENDEDOR_PARAM = BV.VENDEDOR_ID
  JOIN ADMIN A ON A.PODE_ACESSAR = 1
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
CLIENTES_RAMO AS (
  SELECT
    ICT.CODCLI,
    MAX(NULLIF(TRIM(CAST(ICT.CLIENTE AS CHAR)), '')) AS CLIENTE_TOTVS,
    COALESCE(NULLIF(TRIM(MAX(CAST(ICT.RAMO AS CHAR))), ''), 'Sem ramo') AS RAMO_CLIENTE
  FROM IMP_CLIENTES_TOTVS ICT
  GROUP BY ICT.CODCLI
),
BASE AS (
  SELECT
    COALESCE(R.CLIENTE_ID, R.CODCLI) AS CLIENTE_ID,
    COALESCE(R.CODCLI, R.CLIENTE_ID) AS CODCLI,
    COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CR.CLIENTE_TOTVS, CONCAT('Cliente ', COALESCE(R.CODCLI, R.CLIENTE_ID))) AS CLIENTE,
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo') AS RAMO_CLIENTE,
    R.SEMANA_NUMERO,
    R.COD_RCA,
    B.TARGET_USER_ID AS VENDEDOR_BU_USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', B.TARGET_USER_ID)) AS VENDEDOR_BU_NOME,
    ROUND(SUM(COALESCE(R.TOTAL, R.VALOR, 0)), 2) AS TOTAL,
    MAX(CASE WHEN EC.ID IS NULL THEN 0 ELSE 1 END) AS NA_CARTEIRA_FLAG
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  JOIN INPUTS I ON 1 = 1
  JOIN BU_SCOPE B ON ${sectionMatch}
  LEFT JOIN CLIENTES C ON C.ID = COALESCE(R.CLIENTE_ID, R.CODCLI)
  LEFT JOIN CLIENTES_RAMO CR ON CR.CODCLI = COALESCE(R.CODCLI, C.WINTHOR_CODCLI, R.CLIENTE_ID)
  LEFT JOIN EQUIPE_CLIENTE EC
    ON EC.ID_VENDEDOR = I.VENDEDOR_PARAM
   AND EC.ID_CLIENTE = COALESCE(R.CLIENTE_ID, R.CODCLI)
  LEFT JOIN FUNCIONARIOS F ON F.ID = B.TARGET_USER_ID
  LEFT JOIN INT_USER U ON U.ID = B.TARGET_USER_ID
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.ANO = I.ANO_REF
    AND R.MES = I.MES_REF
    AND COALESCE(R.CLIENTE_ID, R.CODCLI) IS NOT NULL
    AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
  GROUP BY
    COALESCE(R.CLIENTE_ID, R.CODCLI),
    COALESCE(R.CODCLI, R.CLIENTE_ID),
    COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CR.CLIENTE_TOTVS, CONCAT('Cliente ', COALESCE(R.CODCLI, R.CLIENTE_ID))),
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo'),
    R.SEMANA_NUMERO,
    R.COD_RCA,
    B.TARGET_USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', B.TARGET_USER_ID))
)
SELECT
  CLIENTE,
  CODCLI,
  RAMO_CLIENTE,
  SEMANA_NUMERO AS SEMANA,
  TOTAL,
  COD_RCA,
  VENDEDOR_BU_USER_ID,
  VENDEDOR_BU_NOME,
  CASE WHEN NA_CARTEIRA_FLAG = 1 THEN 'Sim' ELSE 'Nao' END AS NA_CARTEIRA
FROM BASE
ORDER BY CLIENTE, SEMANA, COD_RCA
`;

const definitions = [
  {
    name: 'adminListarVendedores',
    code: adminListarVendedoresSql,
    description: 'Admin: lista vendedores ativos configurados em BU_VENDEDOR para validacao semanal interna.',
  },
  {
    name: 'adminAcompSemanalListar',
    code: adminAcompSemanalListarSql,
    description: 'Admin: lista compras semanais por vendedor via BU_VENDEDOR, com ramo e flag de carteira.',
  },
];

function extractSfId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id || null;
}

async function upsertServerFunction(definition) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((item) => item.name === definition.name);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: Number(existing.id),
      code: definition.code,
      description: definition.description,
    });
    return { id: Number(existing.id), name: definition.name, action: 'updated' };
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });

  const id = Number(extractSfId(created) || 0);
  if (!id) throw new Error(`Nao foi possivel obter o ID da SF ${definition.name}.`);
  return { id, name: definition.name, action: 'created' };
}

async function main() {
  const result = [];
  for (const definition of definitions) {
    result.push(await upsertServerFunction(definition));
  }
  console.log(JSON.stringify({ serverFunctions: result }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao criar SFs admin do acompanhamento semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
