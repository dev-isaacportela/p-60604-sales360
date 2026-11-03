import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

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

const PERMISSAO_CTE = `
PERMISSAO AS (
  SELECT
    CASE
      WHEN COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN') THEN 1
      WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
      ELSE 0
    END AS PODE_ACESSAR
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  WHERE U.ID = :VAR_USER
)
`;

const PARAMS_CTE = `
PARAMS AS (
  SELECT
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF,
    CASE WHEN '{{codSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{codSupervisor}}' AS UNSIGNED) ELSE NULL END AS COD_SUPERVISOR_PARAM,
    CASE WHEN '{{codfilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codfilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_PARAM,
    CASE WHEN '{{codRca}}' REGEXP '^[0-9]+$' THEN CAST('{{codRca}}' AS UNSIGNED) ELSE NULL END AS COD_RCA_PARAM,
    CASE WHEN TRIM('{{codCli}}') REGEXP '^[0-9]+(,[0-9]+)*$' THEN TRIM('{{codCli}}') ELSE '' END AS CODCLI_PARAM,
    CASE WHEN '{{codProd}}' REGEXP '^[0-9]+$' THEN CAST('{{codProd}}' AS UNSIGNED) ELSE NULL END AS CODPROD_PARAM
),
PERIODO AS (
  SELECT
    DATE_FORMAT(STR_TO_DATE(CONCAT(ANO_REF, '-', LPAD(MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS DATA_INICIO,
    DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(ANO_REF, '-', LPAD(MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d') AS DATA_FIM
  FROM PARAMS
)
`;

const BASE_CTE = `
COORDENADOR_BASE AS (
  SELECT
    C.COD_SUPERVISOR,
    COALESCE(
      NULLIF(TRIM(F.NOME), ''),
      NULLIF(TRIM(U.NOME), ''),
      NULLIF(TRIM(C.NOME), ''),
      NULLIF(TRIM(U.DESCR), ''),
      CONCAT('Coordenador ', C.COD_SUPERVISOR)
    ) AS COORDENADOR
  FROM COORDENADORES C
  LEFT JOIN INT_USER U ON U.ID = C.USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = C.USER_ID
  WHERE COALESCE(C.ATIVO, TRUE) = TRUE
),
COORD_BU AS (
  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO, CB.COD_SUPERVISOR, COALESCE(CB_BASE.COORDENADOR, CONCAT('Coordenador ', CB.COD_SUPERVISOR)) AS COORDENADOR
  FROM COORDENADORES_BU CB
  JOIN COORDENADOR_BASE CB_BASE ON CB_BASE.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
VENDEDOR_BASE AS (
  SELECT
    VR.USER_ID AS VENDEDOR_ID,
    MIN(CAST(COALESCE(VR.COD_RCA, 0) AS UNSIGNED)) AS COD_RCA_VINCULADO,
    COALESCE(NULLIF(TRIM(MAX(F.NOME)), ''), NULLIF(TRIM(MAX(RT.RCA_NOME)), ''), CONCAT('Vendedor ', VR.USER_ID)) AS VENDEDOR
  FROM VENDEDOR_RCA VR
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  GROUP BY VR.USER_ID
),
ESCOPO_CARTEIRA AS (
  SELECT DISTINCT
    EC.ID_VENDEDOR AS VENDEDOR_ID,
    COALESCE(VB.COD_RCA_VINCULADO, 0) AS COD_RCA_VINCULADO,
    COALESCE(VB.VENDEDOR, CONCAT('Vendedor ', EC.ID_VENDEDOR)) AS VENDEDOR,
    COALESCE(CD.COD_SUPERVISOR, CB.COD_SUPERVISOR, 0) AS COD_SUPERVISOR,
    COALESCE(NULLIF(TRIM(UCD.NOME), ''), NULLIF(TRIM(UCD.DESCR), ''), NULLIF(TRIM(CD.NOME), ''), CB.COORDENADOR, 'Sem coordenador') AS COORDENADOR,
    CAST(COALESCE(CL.WINTHOR_CODCLI, CL.ID, EC.ID_CLIENTE) AS UNSIGNED) AS CODCLI
  FROM EQUIPE_CLIENTE EC
  JOIN CLIENTES CL ON CL.ID = EC.ID_CLIENTE
  LEFT JOIN VENDEDOR_BASE VB ON VB.VENDEDOR_ID = EC.ID_VENDEDOR
  LEFT JOIN COORDENADORES CD ON CD.USER_ID = EC.ID_VENDEDOR AND COALESCE(CD.ATIVO, TRUE) = TRUE
  LEFT JOIN INT_USER UCD ON UCD.ID = CD.USER_ID
  LEFT JOIN BU_VENDEDOR BV_ANY ON BV_ANY.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(BV_ANY.ATIVO, TRUE) = TRUE
  LEFT JOIN COORD_BU CB ON CB.CODFILIAL = CAST(TRIM(CAST(BV_ANY.CODFILIAL AS CHAR)) AS UNSIGNED)
   AND CB.CODEPTO = CAST(TRIM(CAST(BV_ANY.BU_CODIGO AS CHAR)) AS UNSIGNED)
  WHERE BV_ANY.VENDEDOR_ID IS NOT NULL
    AND COALESCE(CL.WINTHOR_CODCLI, CL.ID, EC.ID_CLIENTE) IS NOT NULL
),
BASE_VENDAS AS (
  SELECT
    EC.COD_SUPERVISOR,
    COALESCE(NULLIF(TRIM(EC.COORDENADOR), ''), NULLIF(TRIM(CAST(V.SUPERVISOR AS CHAR)), ''), 'Sem coordenador') AS COORDENADOR,
    CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    CONCAT('Filial ', CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED)) AS FILIAL,
    CAST(COALESCE(V.CODEPTO, 0) AS UNSIGNED) AS CODEPTO,
    CAST(COALESCE(V.CODSEC, 0) AS UNSIGNED) AS ID_SECAO,
    EC.VENDEDOR_ID AS COD_RCA,
    EC.VENDEDOR,
    CAST(COALESCE(V.CODCLI, 0) AS UNSIGNED) AS CODCLI,
    COALESCE(NULLIF(TRIM(CAST(V.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', V.CODCLI)) AS CLIENTE,
    CAST(COALESCE(V.CODPROD, 0) AS UNSIGNED) AS CODPROD,
    COALESCE(NULLIF(TRIM(CAST(V.DESCRICAO AS CHAR)), ''), CONCAT('Produto ', V.CODPROD)) AS PRODUTO,
    COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)) AS DEPARTAMENTO,
    COALESCE(NULLIF(TRIM(CAST(V.SECAO AS CHAR)), ''), 'Sem seção') AS SECAO,
    V.NUMPED,
    ROUND(COALESCE(V.QT, 0), 4) AS QT,
    ROUND(COALESCE(V.TOTAL, 0), 2) AS TOTAL
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PERMISSAO PX ON PX.PODE_ACESSAR = 1
  JOIN PERIODO P ON 1 = 1
  JOIN PARAMS F ON 1 = 1
  JOIN ESCOPO_CARTEIRA EC
    ON EC.CODCLI = CAST(COALESCE(V.CODCLI, 0) AS UNSIGNED)
  JOIN BU_VENDEDOR BV_SCOPE
    ON BV_SCOPE.VENDEDOR_ID = EC.VENDEDOR_ID
   AND COALESCE(BV_SCOPE.ATIVO, TRUE) = TRUE
   AND TRIM(CAST(BV_SCOPE.CODFILIAL AS CHAR)) = TRIM(CAST(V.CODFILIAL AS CHAR))
   AND TRIM(CAST(BV_SCOPE.BU_CODIGO AS CHAR)) = TRIM(CAST(V.CODEPTO AS CHAR))
   AND (
     BV_SCOPE.ID_SECAO IS NULL
     OR TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
     OR LPAD(TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
   )
  WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= P.DATA_INICIO
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < P.DATA_FIM
    AND (F.COD_SUPERVISOR_PARAM IS NULL OR EC.COD_SUPERVISOR = F.COD_SUPERVISOR_PARAM)
    AND (F.CODFILIAL_PARAM IS NULL OR CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) = F.CODFILIAL_PARAM)
    AND (F.COD_RCA_PARAM IS NULL OR EC.VENDEDOR_ID = F.COD_RCA_PARAM)
    AND (F.CODCLI_PARAM = '' OR FIND_IN_SET(CAST(CAST(COALESCE(V.CODCLI, 0) AS UNSIGNED) AS CHAR), F.CODCLI_PARAM) > 0)
    AND (F.CODPROD_PARAM IS NULL OR CAST(COALESCE(V.CODPROD, 0) AS UNSIGNED) = F.CODPROD_PARAM)
)
`;

function withBase(selectSql) {
  return `
    WITH
    ${PERMISSAO_CTE},
    ${PARAMS_CTE},
    ${BASE_CTE}
    ${selectSql}
  `;
}

const serverFunctions = [
  {
    name: 'faturamentoDiretoriaFiltros',
    description: 'Lista filtros de coordenadores, vendedores, clientes e produtos para a rota de faturamento.',
    code: withBase(`
      SELECT 'COORDENADOR' AS TIPO, CAST(COD_SUPERVISOR AS CHAR) AS VALUE, COORDENADOR AS LABEL, SUM(TOTAL) AS TOTAL
      FROM BASE_VENDAS
      GROUP BY COD_SUPERVISOR, COORDENADOR
      UNION ALL
      SELECT 'FILIAL' AS TIPO, CAST(CODFILIAL AS CHAR) AS VALUE, FILIAL AS LABEL, SUM(TOTAL) AS TOTAL
      FROM BASE_VENDAS
      GROUP BY CODFILIAL, FILIAL
      UNION ALL
      SELECT 'VENDEDOR' AS TIPO, CAST(COD_RCA AS CHAR) AS VALUE, VENDEDOR AS LABEL, SUM(TOTAL) AS TOTAL
      FROM BASE_VENDAS
      GROUP BY COD_RCA, VENDEDOR
      UNION ALL
      SELECT 'CLIENTE' AS TIPO, CAST(CODCLI AS CHAR) AS VALUE, CLIENTE AS LABEL, SUM(TOTAL) AS TOTAL
      FROM BASE_VENDAS
      GROUP BY CODCLI, CLIENTE
      UNION ALL
      SELECT 'PRODUTO' AS TIPO, CAST(CODPROD AS CHAR) AS VALUE, PRODUTO AS LABEL, SUM(TOTAL) AS TOTAL
      FROM BASE_VENDAS
      GROUP BY CODPROD, PRODUTO
      ORDER BY TIPO, TOTAL DESC, LABEL
      LIMIT 800
    `),
  },
  {
    name: 'faturamentoDiretoriaResumo',
    description: 'Resumo consolidado de faturamento para a rota de coordenadores, vendedores, produtos e clientes.',
    code: withBase(`
      SELECT
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
        COUNT(DISTINCT CODFILIAL) AS QTD_FILIAIS,
        COUNT(DISTINCT COD_SUPERVISOR) AS QTD_COORDENADORES,
        COUNT(DISTINCT COD_RCA) AS QTD_VENDEDORES,
        COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
        COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS,
        ROUND(SUM(QT), 2) AS QTD_ITENS,
        CASE WHEN COUNT(DISTINCT NUMPED) = 0 THEN 0 ELSE ROUND(SUM(TOTAL) / COUNT(DISTINCT NUMPED), 2) END AS TICKET_MEDIO
      FROM BASE_VENDAS
    `),
  },
  {
    name: 'faturamentoDiretoriaFiliais',
    description: 'Ranking de faturamento por filial respeitando escopo de vendedores e coordenadores.',
    code: withBase(`
      SELECT
        CODFILIAL,
        FILIAL,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        COUNT(DISTINCT COD_SUPERVISOR) AS QTD_COORDENADORES,
        COUNT(DISTINCT COD_RCA) AS QTD_VENDEDORES,
        COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
        COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
        ROUND(SUM(QT), 2) AS QTD_ITENS
      FROM BASE_VENDAS
      GROUP BY CODFILIAL, FILIAL
      ORDER BY FATURAMENTO DESC
      LIMIT 100
    `),
  },
  {
    name: 'faturamentoDiretoriaCoordenadores',
    description: 'Ranking de faturamento por coordenador.',
    code: withBase(`
      SELECT
        COD_SUPERVISOR,
        COORDENADOR,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        COUNT(DISTINCT COD_RCA) AS QTD_VENDEDORES,
        COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
        COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
        ROUND(SUM(QT), 2) AS QTD_ITENS
      FROM BASE_VENDAS
      GROUP BY COD_SUPERVISOR, COORDENADOR
      ORDER BY FATURAMENTO DESC
      LIMIT 100
    `),
  },
  {
    name: 'faturamentoDiretoriaVendedores',
    description: 'Ranking de faturamento por vendedor dentro do escopo filtrado.',
    code: withBase(`
      SELECT
        COD_SUPERVISOR,
        COORDENADOR,
        CODFILIAL,
        FILIAL,
        COD_RCA,
        VENDEDOR,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
        COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
        ROUND(SUM(QT), 2) AS QTD_ITENS
      FROM BASE_VENDAS
      GROUP BY COD_SUPERVISOR, COORDENADOR, CODFILIAL, FILIAL, COD_RCA, VENDEDOR
      ORDER BY FATURAMENTO DESC
      LIMIT 200
    `),
  },
  {
    name: 'faturamentoDiretoriaProdutos',
    description: 'Produtos vendidos no escopo de faturamento filtrado.',
    code: withBase(`
      SELECT
        CODPROD,
        PRODUTO,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        ROUND(SUM(QT), 2) AS QTD_ITENS,
        COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
        COUNT(DISTINCT COD_RCA) AS QTD_VENDEDORES,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
      FROM BASE_VENDAS
      GROUP BY CODPROD, PRODUTO
      ORDER BY FATURAMENTO DESC
      LIMIT 200
    `),
  },
  {
    name: 'faturamentoDiretoriaClientes',
    description: 'Clientes com compra no escopo de faturamento filtrado.',
    code: withBase(`
      SELECT
        CODCLI,
        CLIENTE,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
        COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS,
        COUNT(DISTINCT COD_RCA) AS QTD_VENDEDORES,
        ROUND(SUM(QT), 2) AS QTD_ITENS
      FROM BASE_VENDAS
      GROUP BY CODCLI, CLIENTE
      ORDER BY FATURAMENTO DESC
      LIMIT 200
    `),
  },
  {
    name: 'faturamentoDiretoriaDetalhe',
    description: 'Detalhe de faturamento por coordenador, vendedor, cliente e produto.',
    code: withBase(`
      SELECT
        COORDENADOR,
        VENDEDOR,
        CODFILIAL,
        FILIAL,
        CODCLI,
        CLIENTE,
        CODPROD,
        PRODUTO,
        DEPARTAMENTO,
        SECAO,
        ROUND(SUM(TOTAL), 2) AS FATURAMENTO,
        ROUND(SUM(QT), 2) AS QTD_ITENS,
        COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
      FROM BASE_VENDAS
      GROUP BY COORDENADOR, VENDEDOR, CODFILIAL, FILIAL, CODCLI, CLIENTE, CODPROD, PRODUTO, DEPARTAMENTO, SECAO
      ORDER BY FATURAMENTO DESC
      LIMIT 500
    `),
  },
];

async function upsertServerFunction(definition, existingByName) {
  const existing = existingByName.get(definition.name);
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
  return extractSfId(created);
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const functions = listed?.result || listed || [];
  const existingByName = new Map(functions.map((fn) => [fn.name, fn]));

  const ids = {};
  for (const definition of serverFunctions) {
    ids[definition.name] = await upsertServerFunction(definition, existingByName);
    console.log(`${definition.name}: ${ids[definition.name]}`);
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: ids.faturamentoDiretoriaResumo,
    input: { mes: String(new Date().getMonth() + 1), ano: String(new Date().getFullYear()), codSupervisor: '', codfilial: '', codRca: '', codCli: '', codProd: '' },
  });
  console.log('Smoke resumo:', extractRows(smoke)[0] || null);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
