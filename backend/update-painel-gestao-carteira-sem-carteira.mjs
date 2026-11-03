import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const RAW_SECTION_MATCH = `
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

const painelGestaoResumo = `
  WITH INPUTS AS (
    SELECT CASE WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN CAST('{{vendedorId}}' AS UNSIGNED) ELSE NULL END AS VENDEDOR_PARAM
  ),
  PERMISSAO AS (
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM USUARIO_CARGO UC WHERE UC.USER_ID = :VAR_USER AND UC.CARGO IN ('GESTOR', 'ADMIN')
    ) THEN 1 ELSE 0 END AS EH_GESTAO
  ),
  TARGET_USERS AS (
    SELECT DISTINCT BASE.USER_ID
    FROM (
      SELECT CASE
        WHEN P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NOT NULL THEN I.VENDEDOR_PARAM
        WHEN P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NULL THEN BV.VENDEDOR_ID
        ELSE :VAR_USER
      END AS USER_ID
      FROM INPUTS I
      CROSS JOIN PERMISSAO P
      LEFT JOIN BU_VENDEDOR BV ON P.EH_GESTAO = 1 AND I.VENDEDOR_PARAM IS NULL
    ) BASE
    WHERE BASE.USER_ID IS NOT NULL
  ),
  BU_SCOPE AS (
    SELECT DISTINCT
      TU.USER_ID AS TARGET_USER_ID,
      BV.VENDEDOR_ID,
      TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
      TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
      BV.ID_SECAO
    FROM TARGET_USERS TU
    JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = TU.USER_ID
    WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
      AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
      AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
  ),
  CLIENTE_MAP AS (
    SELECT
      MIN(C.ID) AS ID,
      TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
    FROM CLIENTES C
    WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
    GROUP BY TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR))
  ),
  CLIENTES_CARTEIRA_TARGET AS (
    SELECT
      EC.ID_CLIENTE,
      MIN(EC.ID_VENDEDOR) AS ID_VENDEDOR
    FROM EQUIPE_CLIENTE EC
    JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
    GROUP BY EC.ID_CLIENTE
  ),
  CLIENTES_COM_CARTEIRA AS (
    SELECT DISTINCT EC.ID_CLIENTE
    FROM EQUIPE_CLIENTE EC
  ),
  VENDAS_BASE AS (
    SELECT
      R.*,
      COALESCE(R.CLIENTE_ID, CM.ID) AS ID_CLIENTE_RESOLVIDO
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    LEFT JOIN CLIENTE_MAP CM
      ON CM.ID = R.CLIENTE_ID
      OR (R.CLIENTE_ID IS NULL AND CM.CODCLI = TRIM(CAST(R.CODCLI AS CHAR)))
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
  ),
  VENDAS_ATRIBUIDAS AS (
    SELECT
      R.*,
      CCT.ID_VENDEDOR AS VENDEDOR_ATRIBUIDO
    FROM VENDAS_BASE R
    JOIN CLIENTES_CARTEIRA_TARGET CCT ON CCT.ID_CLIENTE = R.ID_CLIENTE_RESOLVIDO
    WHERE EXISTS (
      SELECT 1
      FROM BU_SCOPE B
      WHERE B.TARGET_USER_ID = CCT.ID_VENDEDOR
        AND ${RAW_SECTION_MATCH}
    )

    UNION ALL

    SELECT
      R.*,
      NULL AS VENDEDOR_ATRIBUIDO
    FROM VENDAS_BASE R
    LEFT JOIN CLIENTES_COM_CARTEIRA CCG ON CCG.ID_CLIENTE = R.ID_CLIENTE_RESOLVIDO
    WHERE CCG.ID_CLIENTE IS NULL
      AND EXISTS (
        SELECT 1
        FROM BU_SCOPE B
        WHERE ${RAW_SECTION_MATCH}
      )
  )
  SELECT
    BASE.REALIZADO_MES,
    BASE.META_MES,
    CASE WHEN BASE.META_MES > 0 THEN ROUND((BASE.REALIZADO_MES / BASE.META_MES) * 100, 1) ELSE 0 END AS ATINGIMENTO_PERC,
    (BASE.META_MES - BASE.REALIZADO_MES) AS GAP_META,
    BASE.CLIENTES_ATIVOS,
    BASE.ATIVIDADES_PENDENTES
  FROM (
    SELECT
      (
        SELECT COALESCE(SUM(V.TOTAL), 0)
        FROM VENDAS_ATRIBUIDAS V
        WHERE V.ANO = YEAR(CURRENT_DATE)
          AND V.MES = MONTH(CURRENT_DATE)
          AND ('{{vendedorId}}' = '' OR V.VENDEDOR_ATRIBUIDO = CAST('{{vendedorId}}' AS UNSIGNED))
      ) AS REALIZADO_MES,
      (
        SELECT COALESCE(SUM(M.VALOR_META), 0)
        FROM METAS M
        JOIN TARGET_USERS TU ON TU.USER_ID = M.VENDEDOR_ID
        WHERE M.MES = MONTH(CURRENT_DATE)
          AND M.ANO = YEAR(CURRENT_DATE)
      ) AS META_MES,
      (
        SELECT COUNT(DISTINCT EC.ID_CLIENTE)
        FROM EQUIPE_CLIENTE EC
        JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
        JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
        WHERE C.STATUS = 'ATIVO'
      ) AS CLIENTES_ATIVOS,
      (
        SELECT COUNT(*)
        FROM VISITAS VI
        JOIN TARGET_USERS TU ON TU.USER_ID = VI.VENDEDOR_ID
        WHERE VI.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
          AND VI.DATA_AGENDADA <= CURRENT_DATE
      ) AS ATIVIDADES_PENDENTES
  ) BASE
`;

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === 'painelGestaoResumo');
  if (!existing) throw new Error('SF painelGestaoResumo nao encontrada.');

  const detail = await readServerFunctionMitra({ projectId, serverFunctionId: 31 });
  if ((detail?.result?.name || existing.name) !== 'painelGestaoResumo') {
    throw new Error('SF 31 nao corresponde a painelGestaoResumo.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 31,
    code: painelGestaoResumo,
    description: 'Resumo gerencial com realizado por carteira dos vendedores do gestor e clientes sem carteira.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 31,
    input: { vendedorId: '' },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`painelGestaoResumo falhou no smoke: ${error || status}`);
  }

  console.log(`painelGestaoResumo atualizado. Smoke OK (${extractRows(smoke).length} linha(s)).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar Painel de Gestao:');
  console.error(error?.message || error);
  process.exit(1);
});
