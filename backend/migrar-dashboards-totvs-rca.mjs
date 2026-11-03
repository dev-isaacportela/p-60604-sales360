import 'dotenv/config';
import {
  configureSdkMitra,
  createDataLoaderMitra,
  listDataLoadersMitra,
  updateDataLoaderMitra,
  executeDataLoaderMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'VENDAS_DASHBOARD_TOTVS_RCA';
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';

const QUERY_VENDAS_COMPLETA = `
  SELECT
      v.numnota,
      v.numtransvenda,
      v.numped,
      TO_CHAR(v.dtsaida, 'YYYY-MM-DD') AS dtsaida,
      v.codfilial,
      v.codprod,
      v.descricao,
      v.codusur AS cod_rca,
      u.nome AS rca,
      r.nome AS supervisor,
      v.codcli,
      v.cliente,
      v.codfornec,
      dpto.descricao AS departamento,
      s.descricao AS secao,
      SUM(v.vlvenda) - SUM(NVL(d.vldevolucao, 0)) AS total
  FROM view_vendas_resumo_faturamento v,
       view_devol_resumo_faturamento d,
       pcusuari u,
       pcsuperv r,
       pcdepto dpto,
       pcsecao s
  WHERE v.numtransvenda = d.numtransvenda(+)
    AND v.codusur = u.codusur
    AND v.codsupervisor = r.codsupervisor
    AND v.codepto = dpto.codepto
    AND v.codsec = s.codsec
    AND v.codoper = 'S'
  GROUP BY
      v.numnota,
      v.numtransvenda,
      v.numped,
      TO_CHAR(v.dtsaida, 'YYYY-MM-DD'),
      v.codfilial,
      v.codprod,
      v.descricao,
      v.codusur,
      u.nome,
      r.nome,
      v.codcli,
      v.cliente,
      v.codfornec,
      dpto.descricao,
      s.descricao
`;

function getDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
}

async function upsertDataLoader() {
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => {
    const name = loader?.name || loader?.NAME || '';
    return name === DATA_LOADER_NAME;
  });

  let dataLoaderId = existing ? Number(existing.id || existing.dataLoaderId || 0) : null;

  if (dataLoaderId) {
    try {
      await updateDataLoaderMitra({
        projectId,
        dataLoaderId,
        name: DATA_LOADER_NAME,
        jdbcId: WINTHOR_JDBC_ID,
        query: QUERY_VENDAS_COMPLETA,
      });
      return dataLoaderId;
    } catch {
      dataLoaderId = null;
    }
  }

  const created = await createDataLoaderMitra({
    projectId,
    jdbcId: WINTHOR_JDBC_ID,
    name: DATA_LOADER_NAME,
    query: QUERY_VENDAS_COMPLETA,
    runWhenCreate: false,
  });

  dataLoaderId = getDataLoaderId(created);
  if (!dataLoaderId) throw new Error('Não foi possível obter ID do Data Loader de vendas TOTVS.');
  return dataLoaderId;
}

const sfDefinitions = [
  {
    name: 'dashboardKpis',
    description: 'KPIs do dashboard principal com base na query TOTVS e mapeamento por RCA.',
    code: `
      SELECT
        COALESCE(SUM(CASE WHEN SUBSTRING(V.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7) THEN V.TOTAL ELSE 0 END), 0) AS VENDAS_MES,
        (
          SELECT COALESCE(SUM(M.VALOR_META), 0)
          FROM METAS M
          WHERE M.MES = MONTH(CURRENT_DATE)
            AND M.ANO = YEAR(CURRENT_DATE)
            AND (
              NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
              OR M.VENDEDOR_ID = :VAR_USER
            )
        ) AS META_MES,
        (
          SELECT COUNT(*)
          FROM VISITAS VI
          WHERE VI.STATUS = 'CONCLUIDA'
            AND SUBSTRING(VI.DATA_AGENDADA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
            AND (
              NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
              OR VI.VENDEDOR_ID = :VAR_USER
            )
        ) AS VISITAS_MES,
        (
          SELECT COUNT(*)
          FROM CLIENTES C
          WHERE C.STATUS = 'ATIVO'
            AND (
              NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
              OR C.VENDEDOR_ID = :VAR_USER
            )
        ) AS CLIENTES_ATIVOS
      FROM ${STAGING_TABLE} V
      WHERE (
        NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
        OR V.COD_RCA IN (SELECT COD_RCA FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
      )
    `,
  },
  {
    name: 'vendasMensais',
    description: 'Vendas mensais por RCA com base na query TOTVS.',
    code: `
      SELECT
        SUBSTRING(V.DTSAIDA, 1, 4) AS ANO,
        SUBSTRING(V.DTSAIDA, 6, 2) AS MES,
        SUBSTRING(V.DTSAIDA, 1, 7) AS PERIODO,
        0 AS META,
        ROUND(SUM(V.TOTAL), 2) AS REALIZADO
      FROM ${STAGING_TABLE} V
      WHERE (
        NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
        OR V.COD_RCA IN (SELECT COD_RCA FROM VENDEDOR_RCA WHERE USER_ID = :VAR_USER)
      )
      GROUP BY SUBSTRING(V.DTSAIDA, 1, 7), SUBSTRING(V.DTSAIDA, 1, 4), SUBSTRING(V.DTSAIDA, 6, 2)
      ORDER BY PERIODO
    `,
  },
  {
    name: 'analyticsVendasVendedor',
    description: 'Vendas por RCA (pessoa) para analytics.',
    code: `
      SELECT
        CONCAT(V.COD_RCA, ' - ', MAX(V.RCA)) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM ${STAGING_TABLE} V
      GROUP BY V.COD_RCA
      ORDER BY value DESC
    `,
  },
  {
    name: 'analyticsVendasCategoria',
    description: 'Vendas por departamento da query TOTVS.',
    code: `
      SELECT
        COALESCE(V.DEPARTAMENTO, 'SEM_DEPARTAMENTO') AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM ${STAGING_TABLE} V
      GROUP BY COALESCE(V.DEPARTAMENTO, 'SEM_DEPARTAMENTO')
      ORDER BY value DESC
    `,
  },
  {
    name: 'analyticsEvolucaoMensal',
    description: 'Evolução mensal de vendas com base na query TOTVS.',
    code: `
      SELECT
        SUBSTRING(V.DTSAIDA, 1, 7) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM ${STAGING_TABLE} V
      GROUP BY SUBSTRING(V.DTSAIDA, 1, 7)
      ORDER BY name
    `,
  },
  {
    name: 'analyticsMixProdutos',
    description: 'Mix de produtos por RCA com base na query TOTVS.',
    code: `
      SELECT
        CONCAT(V.CODPROD, ' - ', MAX(V.DESCRICAO)) AS name,
        ROUND(SUM(V.TOTAL), 2) AS value
      FROM ${STAGING_TABLE} V
      GROUP BY V.CODPROD
      ORDER BY value DESC
      LIMIT 8
    `,
  },
  {
    name: 'painelGestaoResumo',
    description: 'KPIs gerenciais por vendedor mapeado ao RCA.',
    code: `
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
            FROM ${STAGING_TABLE} V
            LEFT JOIN VENDEDOR_RCA VR ON VR.COD_RCA = V.COD_RCA
            WHERE SUBSTRING(V.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
              AND ('{{vendedorId}}' = '' OR VR.USER_ID = CAST('{{vendedorId}}' AS UNSIGNED))
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
            WHERE C.STATUS = 'ATIVO'
              AND ('{{vendedorId}}' = '' OR C.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS CLIENTES_ATIVOS,
          (
            SELECT COUNT(*)
            FROM VISITAS VI
            WHERE VI.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
              AND VI.DATA_AGENDADA <= CURRENT_DATE
              AND ('{{vendedorId}}' = '' OR VI.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          ) AS ATIVIDADES_PENDENTES
      ) BASE
    `,
  },
];

async function upsertSf(def, existingList) {
  const existing = existingList.find((sf) => sf.name === def.name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: def.code,
      description: def.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: def.name,
    type: 'SQL',
    code: def.code,
    description: def.description,
  });

  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id || null;
}

async function main() {
  const dataLoaderId = await upsertDataLoader();
  await executeDataLoaderMitra({ projectId, dataLoaderId });

  const listed = await listServerFunctionsMitra({ projectId });
  const existingList = listed?.result || [];
  const sfIds = {};

  for (const def of sfDefinitions) {
    sfIds[def.name] = await upsertSf(def, existingList);
  }

  console.log('Dashboards migrados para base TOTVS com eixo RCA.');
  console.log(JSON.stringify({ dataLoaderId, sfIds }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao migrar dashboards para TOTVS RCA:');
  console.error(error?.message || error);
  process.exit(1);
});
