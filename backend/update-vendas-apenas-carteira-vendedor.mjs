import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';

const SALES_SCOPE_CTE = `
  WITH CARTEIRA_LOGADA_RAW AS (
    SELECT
      EC.ID_CLIENTE,
      EC.ID_VENDEDOR
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    WHERE COALESCE(EC.ATIVO, TRUE) = TRUE
      AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
  ),
  CARTEIRA_LOGADA AS (
    SELECT
      BASE.ID_CLIENTE,
      BASE.ID_VENDEDOR AS VENDEDOR_ID
    FROM (
      SELECT
        CLR.ID_CLIENTE,
        CLR.ID_VENDEDOR,
        ROW_NUMBER() OVER (
          PARTITION BY CLR.ID_CLIENTE
          ORDER BY
            CASE WHEN CLR.ID_VENDEDOR = :VAR_USER THEN 0 ELSE 1 END,
            CLR.ID_VENDEDOR
        ) AS RN
      FROM CARTEIRA_LOGADA_RAW CLR
    ) BASE
    WHERE BASE.RN = 1
  ),
  RCA_USUARIO AS (
    SELECT DISTINCT VR.COD_RCA
    FROM VENDEDOR_RCA VR
    WHERE VR.USER_ID = :VAR_USER

    UNION

    SELECT DISTINCT VR.COD_RCA
    FROM FUNCIONARIOS F
    JOIN VENDEDOR_RCA VR ON VR.USER_ID = F.ID
    WHERE F.ID_SUBSTITUTO = :VAR_USER
  ),
  ESCOPO_DEPTO_USUARIO AS (
    SELECT DISTINCT
      RD.COD_RCA,
      TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) AS CODEPTO
    FROM RCA_DEPARTAMENTO RD
    JOIN RCA_USUARIO RU ON RU.COD_RCA = RD.COD_RCA
    WHERE COALESCE(RD.ATIVO, TRUE) = TRUE
  ),
  VENDAS_VALIDAS AS (
    SELECT
      V.*,
      CL.VENDEDOR_ID AS VENDEDOR_CARTEIRA
    FROM ${STAGING_TABLE} V
    JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = V.CODCLI
    JOIN ESCOPO_DEPTO_USUARIO E
      ON E.COD_RCA = V.COD_RCA
      AND E.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
  )
`;

function withSalesScope(selectSql) {
  return `${SALES_SCOPE_CTE}\n${selectSql}`;
}

const sfDefinitions = [
  {
    name: 'dashboardKpis',
    description: 'KPIs do dashboard considerando somente vendas da carteira vinculadas ao departamento do RCA.',
    code: withSalesScope(`
      SELECT
        COALESCE(SUM(CASE WHEN SUBSTRING(V.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7) THEN V.TOTAL ELSE 0 END), 0) AS VENDAS_MES,
        (
          SELECT COALESCE(SUM(M.VALOR_META), 0)
          FROM METAS M
          WHERE M.MES = MONTH(CURRENT_DATE)
            AND M.ANO = YEAR(CURRENT_DATE)
            AND M.VENDEDOR_ID = :VAR_USER
        ) AS META_MES,
        (
          SELECT COUNT(*)
          FROM VISITAS VI
          JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = VI.CLIENTE_ID
          WHERE VI.STATUS = 'CONCLUIDA'
            AND SUBSTRING(VI.DATA_AGENDADA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
        ) AS VISITAS_MES,
        (
          SELECT COUNT(*)
          FROM CLIENTES C
          JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = C.ID
          WHERE C.STATUS = 'ATIVO'
        ) AS CLIENTES_ATIVOS
      FROM VENDAS_VALIDAS V
    `),
  },
  {
    name: 'vendasMensais',
    description: 'Vendas mensais da carteira considerando apenas itens dentro do departamento vinculado ao RCA.',
    code: withSalesScope(`
      SELECT
        SUBSTRING(V.DTSAIDA, 1, 4) AS ANO,
        SUBSTRING(V.DTSAIDA, 6, 2) AS MES,
        SUBSTRING(V.DTSAIDA, 1, 7) AS PERIODO,
        0 AS META,
        ROUND(SUM(V.TOTAL), 2) AS REALIZADO
      FROM VENDAS_VALIDAS V
      GROUP BY SUBSTRING(V.DTSAIDA, 1, 7), SUBSTRING(V.DTSAIDA, 1, 4), SUBSTRING(V.DTSAIDA, 6, 2)
      ORDER BY PERIODO
    `),
  },
  {
    name: 'analyticsVendasVendedor',
    description: 'Vendas por vendedor considerando carteira e regra de departamento vinculada ao RCA.',
    code: withSalesScope(`
      SELECT
        COALESCE(F.NOME, U.DESCR, CONCAT('Usuario ', V.VENDEDOR_CARTEIRA)) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM VENDAS_VALIDAS V
      LEFT JOIN FUNCIONARIOS F ON F.ID = V.VENDEDOR_CARTEIRA
      LEFT JOIN INT_USER U ON U.ID = V.VENDEDOR_CARTEIRA
      GROUP BY V.VENDEDOR_CARTEIRA, COALESCE(F.NOME, U.DESCR, CONCAT('Usuario ', V.VENDEDOR_CARTEIRA))
      ORDER BY value DESC
    `),
  },
  {
    name: 'analyticsVendasCategoria',
    description: 'Vendas por categoria considerando carteira e regra de departamento vinculada ao RCA.',
    code: withSalesScope(`
      SELECT
        COALESCE(V.DEPARTAMENTO, 'SEM_DEPARTAMENTO') AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM VENDAS_VALIDAS V
      GROUP BY COALESCE(V.DEPARTAMENTO, 'SEM_DEPARTAMENTO')
      ORDER BY value DESC
    `),
  },
  {
    name: 'analyticsEvolucaoMensal',
    description: 'Evolucao mensal de vendas considerando carteira e regra de departamento vinculada ao RCA.',
    code: withSalesScope(`
      SELECT
        SUBSTRING(V.DTSAIDA, 1, 7) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM VENDAS_VALIDAS V
      GROUP BY SUBSTRING(V.DTSAIDA, 1, 7)
      ORDER BY name
    `),
  },
  {
    name: 'analyticsMixProdutos',
    description: 'Mix de produtos considerando carteira e regra de departamento vinculada ao RCA.',
    code: withSalesScope(`
      SELECT
        CONCAT(V.CODPROD, ' - ', COALESCE(MAX(V.DESCRICAO), 'SEM DESCRICAO')) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM VENDAS_VALIDAS V
      GROUP BY V.CODPROD
      ORDER BY value DESC
      LIMIT 8
    `),
  },
  {
    name: 'painelGestaoResumo',
    description: 'KPIs gerenciais de receita/meta contando apenas vendas da carteira dentro do departamento do RCA.',
    code: withSalesScope(`
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
            FROM VENDAS_VALIDAS V
            WHERE SUBSTRING(V.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
              AND ('{{vendedorId}}' = '' OR V.VENDEDOR_CARTEIRA = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS REALIZADO_MES,
          (
            SELECT COALESCE(SUM(M.VALOR_META), 0)
            FROM METAS M
            WHERE M.MES = MONTH(CURRENT_DATE)
              AND M.ANO = YEAR(CURRENT_DATE)
              AND ('{{vendedorId}}' = '' OR M.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS META_MES,
          (
            SELECT COUNT(*)
            FROM CLIENTES C
            JOIN CARTEIRA_CLIENTE CC ON CC.ID_CLIENTE = C.ID
            WHERE C.STATUS = 'ATIVO'
              AND ('{{vendedorId}}' = '' OR CC.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS CLIENTES_ATIVOS,
          (
            SELECT COUNT(*)
            FROM VISITAS VI
            JOIN CARTEIRA_CLIENTE CC ON CC.ID_CLIENTE = VI.CLIENTE_ID
            WHERE VI.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
              AND VI.DATA_AGENDADA <= CURRENT_DATE
              AND ('{{vendedorId}}' = '' OR CC.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS ATIVIDADES_PENDENTES
      ) BASE
    `),
  },
];

function extractSfId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function upsertSf(definition, sfMap) {
  const existing = sfMap.get(definition.name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: definition.code,
      description: definition.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });

  const createdId = extractSfId(created);
  if (!createdId) {
    throw new Error(`Nao foi possivel identificar o ID da SF ${definition.name}.`);
  }

  return createdId;
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const sfMap = new Map((listed?.result || []).map((sf) => [sf.name, sf]));
  const updatedIds = {};

  for (const definition of sfDefinitions) {
    updatedIds[definition.name] = await upsertSf(definition, sfMap);
  }

  console.log('SFs de vendas atualizadas para regra de carteira do vendedor.');
  console.log(JSON.stringify(updatedIds, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar regra de vendas por carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
