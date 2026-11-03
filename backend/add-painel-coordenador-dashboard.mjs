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

function territorioVendedorMatch(saleAlias = 'V', buAlias = 'BV') {
  return `
    TRIM(COALESCE(CAST(${buAlias}.CODFILIAL AS CHAR), '')) = ${saleAlias}.CODFILIAL
    AND TRIM(CAST(${buAlias}.BU_CODIGO AS CHAR)) = TRIM(CAST(${saleAlias}.CODEPTO AS CHAR))
    AND (
      (
        ${buAlias}.ID_SECAO IS NOT NULL
        AND (
          TRIM(CAST(${buAlias}.ID_SECAO AS CHAR)) = TRIM(CAST(${saleAlias}.CODSEC AS CHAR))
          OR LPAD(TRIM(CAST(${buAlias}.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(${saleAlias}.CODSEC AS CHAR))
        )
      )
      OR (
        ${buAlias}.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV2
          WHERE BV2.VENDEDOR_ID = ${buAlias}.VENDEDOR_ID
            AND TRIM(COALESCE(CAST(BV2.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(${buAlias}.CODFILIAL AS CHAR), ''))
            AND TRIM(CAST(BV2.BU_CODIGO AS CHAR)) = TRIM(CAST(${buAlias}.BU_CODIGO AS CHAR))
            AND BV2.ID_SECAO IS NOT NULL
            AND (
              TRIM(CAST(BV2.ID_SECAO AS CHAR)) = TRIM(CAST(${saleAlias}.CODSEC AS CHAR))
              OR LPAD(TRIM(CAST(BV2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(${saleAlias}.CODSEC AS CHAR))
            )
        )
      )
    )
  `;
}

const PERIODO_CTE = `
PARAMS AS (
  SELECT
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF
),
PERIODO AS (
  SELECT
    P.MES_REF,
    P.ANO_REF,
    DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS DATA_INICIO,
    DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d') AS DATA_FIM
  FROM PARAMS P
),
COORD AS (
  SELECT
    C.COD_SUPERVISOR,
    C.NOME,
    C.EMAIL,
    C.USER_ID
  FROM COORDENADORES C
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
  LIMIT 1
),
ESCOPO_BU AS (
  SELECT DISTINCT
    CB.COD_SUPERVISOR,
    CB.CODFILIAL,
    CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
VENDEDORES_COORDENADOR AS (
  SELECT DISTINCT BV.VENDEDOR_ID
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
),
CLIENTE_MAP AS (
  SELECT
    MIN(C.ID) AS ID,
    TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
  FROM CLIENTES C
  WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
  GROUP BY TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR))
),
CLIENTES_CARTEIRA_COORDENADOR AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  JOIN VENDEDORES_COORDENADOR VC ON VC.VENDEDOR_ID = EC.ID_VENDEDOR
),
CLIENTES_COM_CARTEIRA AS (
  SELECT DISTINCT EC.ID_CLIENTE
  FROM EQUIPE_CLIENTE EC
),
VENDAS_PERIODO AS (
  SELECT
    V.AUTO_ID,
    V.NUMPED,
    SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) AS DATA_VENDA,
    TRIM(CAST(V.CODFILIAL AS CHAR)) AS CODFILIAL,
    V.CODEPTO,
    V.CODSEC,
    V.COD_RCA,
    COALESCE(NULLIF(TRIM(CAST(V.RCA AS CHAR)), ''), CONCAT('RCA ', V.COD_RCA)) AS RCA,
    V.CODCLI,
    COALESCE(NULLIF(TRIM(CAST(V.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', V.CODCLI)) AS CLIENTE,
    COALESCE(V.TOTAL, 0) AS TOTAL,
    CCLI.ID AS ID_CLIENTE_INTERNO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PERIODO P ON 1 = 1
  LEFT JOIN CLIENTE_MAP CCLI ON CCLI.CODCLI = TRIM(CAST(V.CODCLI AS CHAR))
  WHERE SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= P.DATA_INICIO
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < P.DATA_FIM
),
VENDAS_ATRIBUIDAS AS (
  SELECT
    V.*,
    CCC.ID_VENDEDOR AS VENDEDOR_ATRIBUIDO
  FROM VENDAS_PERIODO V
  JOIN CLIENTES_CARTEIRA_COORDENADOR CCC ON CCC.ID_CLIENTE = V.ID_CLIENTE_INTERNO
  WHERE EXISTS (
    SELECT 1
    FROM BU_VENDEDOR BV
    JOIN ESCOPO_BU E
      ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
     AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
    WHERE BV.VENDEDOR_ID = CCC.ID_VENDEDOR
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND ${territorioVendedorMatch('V', 'BV')}
  )
),
VENDAS_SEM_CARTEIRA AS (
  SELECT
    V.*,
    NULL AS VENDEDOR_ATRIBUIDO
  FROM VENDAS_PERIODO V
  JOIN ESCOPO_BU E
    ON V.CODFILIAL = CAST(E.CODFILIAL AS CHAR)
   AND V.CODEPTO = E.CODEPTO
  LEFT JOIN CLIENTES_COM_CARTEIRA CCG ON CCG.ID_CLIENTE = V.ID_CLIENTE_INTERNO
  WHERE CCG.ID_CLIENTE IS NULL
),
VENDAS_BASE AS (
  SELECT * FROM VENDAS_ATRIBUIDAS
  UNION ALL
  SELECT * FROM VENDAS_SEM_CARTEIRA
),
DEVOLUCOES_PERIODO AS (
  SELECT
    D.AUTO_ID,
    D.NOTA_DEVOLUCAO,
    D.NOTA_VENDA_ORIGINAL,
    D.NUMPED,
    SUBSTRING(CAST(D.DATA_VENDA AS CHAR), 1, 10) AS DATA_VENDA,
    SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) AS DATA_DEVOLUCAO,
    TRIM(CAST(D.CODFILIAL AS CHAR)) AS CODFILIAL,
    D.CODEPTO,
    D.CODSEC,
    D.COD_RCA,
    COALESCE(NULLIF(TRIM(CAST(D.RCA AS CHAR)), ''), CONCAT('RCA ', D.COD_RCA)) AS RCA,
    D.CODCLI,
    COALESCE(NULLIF(TRIM(CAST(D.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', D.CODCLI)) AS CLIENTE,
    COALESCE(D.VALOR_DEVOLVIDO, 0) AS VALOR_DEVOLVIDO,
    COALESCE(D.QT_DEVOLVIDA, 0) AS QT_DEVOLVIDA,
    D.TIPODESCARGA,
    CCLI.ID AS ID_CLIENTE_INTERNO
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN PERIODO P ON 1 = 1
  LEFT JOIN CLIENTE_MAP CCLI ON CCLI.CODCLI = TRIM(CAST(D.CODCLI AS CHAR))
  WHERE SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) >= P.DATA_INICIO
    AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) < P.DATA_FIM
),
DEVOLUCOES_ATRIBUIDAS AS (
  SELECT
    D.*,
    CCC.ID_VENDEDOR AS VENDEDOR_ATRIBUIDO
  FROM DEVOLUCOES_PERIODO D
  JOIN CLIENTES_CARTEIRA_COORDENADOR CCC ON CCC.ID_CLIENTE = D.ID_CLIENTE_INTERNO
  WHERE EXISTS (
    SELECT 1
    FROM BU_VENDEDOR BV
    JOIN ESCOPO_BU E
      ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
     AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
    WHERE BV.VENDEDOR_ID = CCC.ID_VENDEDOR
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND ${territorioVendedorMatch('D', 'BV')}
  )
),
DEVOLUCOES_SEM_CARTEIRA AS (
  SELECT
    D.*,
    NULL AS VENDEDOR_ATRIBUIDO
  FROM DEVOLUCOES_PERIODO D
  JOIN ESCOPO_BU E
    ON D.CODFILIAL = CAST(E.CODFILIAL AS CHAR)
   AND D.CODEPTO = E.CODEPTO
  LEFT JOIN CLIENTES_COM_CARTEIRA CCG ON CCG.ID_CLIENTE = D.ID_CLIENTE_INTERNO
  WHERE CCG.ID_CLIENTE IS NULL
),
DEVOLUCOES_BASE AS (
  SELECT * FROM DEVOLUCOES_ATRIBUIDAS
  UNION ALL
  SELECT * FROM DEVOLUCOES_SEM_CARTEIRA
)
`;

const serverFunctions = [
  {
    name: 'painelCoordenadorPermissao',
    description: 'Retorna se o usuario logado pode acessar as telas de Coordenador, incluindo coordenadores, diretoria e admin.',
    code: `
      SELECT
        CASE
          WHEN C.AUTO_ID IS NOT NULL THEN 1
          WHEN UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA') THEN 1
          WHEN UPPER(COALESCE(UC.CARGO, '')) LIKE '%COORDENADOR%' THEN 1
          WHEN UPPER(COALESCE(UC.CARGO, '')) LIKE '%CORDENADOR%' THEN 1
          WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
          ELSE 0
        END AS PODE_ACESSAR,
        C.COD_SUPERVISOR,
        COALESCE(C.NOME, U.DESCR) AS NOME,
        COALESCE(C.EMAIL, U.DESCR) AS EMAIL,
        COALESCE(UC.CARGO, CASE WHEN C.AUTO_ID IS NULL THEN 'NAO_DEFINIDO' ELSE 'COORDENADOR' END) AS CARGO_ATUAL
      FROM INT_USER U
      LEFT JOIN COORDENADORES C
        ON C.USER_ID = U.ID
       AND COALESCE(C.ATIVO, TRUE) = TRUE
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
      LIMIT 1
    `,
  },
  {
    name: 'painelCoordenadorKpis',
    description: 'KPIs mensais do Painel Coordenador por carteira dos vendedores do coordenador e clientes sem carteira.',
    code: `
      WITH
      ${PERIODO_CTE},
      METAS AS (
        SELECT ROUND(COALESCE(SUM(M.META_VALOR), 0), 2) AS META_BU
        FROM METAS_BU M
        JOIN PERIODO P ON P.MES_REF = M.MES AND P.ANO_REF = M.ANO
        JOIN ESCOPO_BU E ON E.CODFILIAL = M.CODFILIAL AND E.CODEPTO = M.CODEPTO
      ),
      FAT AS (
        SELECT
          ROUND(COALESCE(SUM(TOTAL), 0), 2) AS FATURAMENTO_BRUTO,
          COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
          COUNT(DISTINCT CODCLI) AS QTD_CLIENTES_COM_COMPRA
        FROM VENDAS_BASE
      ),
      DEV AS (
        SELECT ROUND(COALESCE(SUM(VALOR_DEVOLVIDO), 0), 2) AS TOTAL_DEVOLVIDO
        FROM DEVOLUCOES_BASE
      )
      SELECT
        P.MES_REF AS MES,
        P.ANO_REF AS ANO,
        COALESCE(M.META_BU, 0) AS META_BU,
        COALESCE(F.FATURAMENTO_BRUTO, 0) AS FATURAMENTO_BRUTO,
        COALESCE(D.TOTAL_DEVOLVIDO, 0) AS TOTAL_DEVOLVIDO,
        ROUND(COALESCE(F.FATURAMENTO_BRUTO, 0) - COALESCE(D.TOTAL_DEVOLVIDO, 0), 2) AS FATURAMENTO_LIQUIDO,
        CASE
          WHEN COALESCE(M.META_BU, 0) <= 0 THEN 0
          ELSE ROUND(((COALESCE(F.FATURAMENTO_BRUTO, 0) - COALESCE(D.TOTAL_DEVOLVIDO, 0)) / M.META_BU) * 100, 2)
        END AS PERCENTUAL_META,
        COALESCE(F.QTD_PEDIDOS, 0) AS QTD_PEDIDOS,
        COALESCE(F.QTD_CLIENTES_COM_COMPRA, 0) AS QTD_CLIENTES_COM_COMPRA
      FROM PERIODO P
      JOIN METAS M ON 1 = 1
      JOIN FAT F ON 1 = 1
      JOIN DEV D ON 1 = 1
    `,
  },
  {
    name: 'painelCoordenadorPerformanceVendedores',
    description: 'Performance por RCA considerando carteira dos vendedores do coordenador e clientes sem carteira.',
    code: `
      WITH
      ${PERIODO_CTE},
      VENDEDORES_SCOPE_RAW AS (
        SELECT DISTINCT
          VR.COD_RCA,
          VR.USER_ID,
          COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA
        FROM BU_VENDEDOR BV
        JOIN ESCOPO_BU E
          ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
         AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
        JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
        WHERE COALESCE(BV.ATIVO, TRUE) = TRUE

        UNION

        SELECT DISTINCT
          COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO, 0) AS COD_RCA,
          V.VENDEDOR_ATRIBUIDO AS USER_ID,
          CASE
            WHEN V.VENDEDOR_ATRIBUIDO IS NULL THEN 'SEM CARTEIRA'
            ELSE COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO)))
          END AS RCA
        FROM VENDAS_BASE V
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = V.VENDEDOR_ATRIBUIDO
        LEFT JOIN FUNCIONARIOS F ON F.ID = V.VENDEDOR_ATRIBUIDO
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA

        UNION

        SELECT DISTINCT
          COALESCE(VR.COD_RCA, D.VENDEDOR_ATRIBUIDO, 0) AS COD_RCA,
          D.VENDEDOR_ATRIBUIDO AS USER_ID,
          CASE
            WHEN D.VENDEDOR_ATRIBUIDO IS NULL THEN 'SEM CARTEIRA'
            ELSE COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', COALESCE(VR.COD_RCA, D.VENDEDOR_ATRIBUIDO)))
          END AS RCA
        FROM DEVOLUCOES_BASE D
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = D.VENDEDOR_ATRIBUIDO
        LEFT JOIN FUNCIONARIOS F ON F.ID = D.VENDEDOR_ATRIBUIDO
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
      ),
      VENDEDORES_SCOPE AS (
        SELECT
          COD_RCA,
          MIN(USER_ID) AS USER_ID,
          MAX(RCA) AS RCA
        FROM VENDEDORES_SCOPE_RAW
        WHERE COD_RCA IS NOT NULL
        GROUP BY COD_RCA
      ),
      VENDAS_AGG AS (
        SELECT
          COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO, 0) AS COD_RCA,
          ROUND(SUM(TOTAL), 2) AS FATURAMENTO_BRUTO,
          COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
        FROM VENDAS_BASE V
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = V.VENDEDOR_ATRIBUIDO
        GROUP BY COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO, 0)
      ),
      DEV_AGG AS (
        SELECT
          COALESCE(VR.COD_RCA, D.VENDEDOR_ATRIBUIDO, 0) AS COD_RCA,
          ROUND(SUM(VALOR_DEVOLVIDO), 2) AS DEVOLVIDO
        FROM DEVOLUCOES_BASE D
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = D.VENDEDOR_ATRIBUIDO
        GROUP BY COALESCE(VR.COD_RCA, D.VENDEDOR_ATRIBUIDO, 0)
      ),
      METAS_INDIVIDUAIS AS (
        SELECT
          VR.COD_RCA,
          ROUND(SUM(COALESCE(MV.VALOR_META, 0)), 2) AS META_INDIVIDUAL
        FROM VENDEDOR_RCA VR
        JOIN METAS_VENDEDOR MV ON MV.USER_ID = VR.USER_ID
        JOIN PERIODO P ON P.MES_REF = MV.MES AND P.ANO_REF = MV.ANO
        GROUP BY VR.COD_RCA
      ),
      CLIENTES_AGG AS (
        SELECT
          VR.COD_RCA,
          COUNT(DISTINCT EC.ID_CLIENTE) AS QTD_CLIENTES_ATIVOS
        FROM VENDEDOR_RCA VR
        JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = VR.USER_ID
        LEFT JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
        JOIN VENDEDORES_SCOPE VS ON VS.COD_RCA = VR.COD_RCA
        WHERE COALESCE(C.STATUS, 'ATIVO') = 'ATIVO'
        GROUP BY VR.COD_RCA
      )
      SELECT
        VS.COD_RCA,
        VS.RCA,
        COALESCE(VA.FATURAMENTO_BRUTO, 0) AS FATURAMENTO_BRUTO,
        COALESCE(DA.DEVOLVIDO, 0) AS DEVOLVIDO,
        ROUND(COALESCE(VA.FATURAMENTO_BRUTO, 0) - COALESCE(DA.DEVOLVIDO, 0), 2) AS LIQUIDO,
        COALESCE(MI.META_INDIVIDUAL, 0) AS META_INDIVIDUAL,
        CASE
          WHEN COALESCE(MI.META_INDIVIDUAL, 0) <= 0 THEN 0
          ELSE ROUND(((COALESCE(VA.FATURAMENTO_BRUTO, 0) - COALESCE(DA.DEVOLVIDO, 0)) / MI.META_INDIVIDUAL) * 100, 2)
        END AS PERCENTUAL_META_INDIVIDUAL,
        COALESCE(CA.QTD_CLIENTES_ATIVOS, 0) AS QTD_CLIENTES_ATIVOS,
        COALESCE(VA.QTD_PEDIDOS, 0) AS QTD_PEDIDOS
      FROM VENDEDORES_SCOPE VS
      LEFT JOIN VENDAS_AGG VA ON VA.COD_RCA = VS.COD_RCA
      LEFT JOIN DEV_AGG DA ON DA.COD_RCA = VS.COD_RCA
      LEFT JOIN METAS_INDIVIDUAIS MI ON MI.COD_RCA = VS.COD_RCA
      LEFT JOIN CLIENTES_AGG CA ON CA.COD_RCA = VS.COD_RCA
      ORDER BY LIQUIDO DESC, VS.RCA
      LIMIT 200
    `,
  },
  {
    name: 'painelCoordenadorAnomaliasTerritorio',
    description: 'Lista vendas de clientes em carteira que ocorreram fora do território BU_VENDEDOR do vendedor dono da carteira.',
    code: `
      WITH
      ${PERIODO_CTE},
      ANOMALIAS AS (
        SELECT
          V.AUTO_ID,
          V.NUMPED,
          V.DATA_VENDA,
          V.CODFILIAL,
          V.CODEPTO,
          V.CODSEC,
          V.CODCLI,
          V.CLIENTE,
          V.TOTAL,
          CCC.ID_VENDEDOR AS VENDEDOR_ID,
          COALESCE(VR.COD_RCA, CCC.ID_VENDEDOR) AS COD_RCA_CARTEIRA,
          COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('Vendedor ', CCC.ID_VENDEDOR)) AS VENDEDOR_CARTEIRA,
          COALESCE(
            NULLIF(
              GROUP_CONCAT(
                DISTINCT CONCAT(
                  'Filial ', TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')),
                  ' / Depto ', TRIM(CAST(BV.BU_CODIGO AS CHAR)),
                  ' / Secao ', COALESCE(CAST(BV.ID_SECAO AS CHAR), 'Todas')
                )
                ORDER BY TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')), TRIM(CAST(BV.BU_CODIGO AS CHAR)), BV.ID_SECAO
                SEPARATOR ' | '
              ),
              ''
            ),
            'Sem BU ativa'
          ) AS TERRITORIOS_CARTEIRA,
          COUNT(*) OVER() AS TOTAL_REGISTROS
        FROM VENDAS_PERIODO V
        JOIN CLIENTES_CARTEIRA_COORDENADOR CCC ON CCC.ID_CLIENTE = V.ID_CLIENTE_INTERNO
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = CCC.ID_VENDEDOR
        LEFT JOIN FUNCIONARIOS F ON F.ID = CCC.ID_VENDEDOR
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
        LEFT JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = CCC.ID_VENDEDOR AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BVC
          WHERE BVC.VENDEDOR_ID = CCC.ID_VENDEDOR
            AND COALESCE(BVC.ATIVO, TRUE) = TRUE
            AND ${territorioVendedorMatch('V', 'BVC')}
        )
        GROUP BY
          V.AUTO_ID,
          V.NUMPED,
          V.DATA_VENDA,
          V.CODFILIAL,
          V.CODEPTO,
          V.CODSEC,
          V.CODCLI,
          V.CLIENTE,
          V.TOTAL,
          CCC.ID_VENDEDOR,
          COALESCE(VR.COD_RCA, CCC.ID_VENDEDOR),
          COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('Vendedor ', CCC.ID_VENDEDOR))
      )
      SELECT
        NUMPED,
        DATA_VENDA,
        CODFILIAL,
        CODEPTO,
        CODSEC,
        CODCLI,
        CLIENTE,
        TOTAL,
        VENDEDOR_ID,
        COD_RCA_CARTEIRA,
        VENDEDOR_CARTEIRA,
        TERRITORIOS_CARTEIRA,
        'Venda fora do território com cliente em carteira' AS ALERTA,
        TOTAL_REGISTROS
      FROM ANOMALIAS
      ORDER BY DATA_VENDA DESC, NUMPED DESC
      LIMIT 100
    `,
  },
  {
    name: 'painelCoordenadorDevolucoesRecentes',
    description: 'Lista as ultimas 20 devolucoes do periodo para o coordenador, por carteira dos vendedores e clientes sem carteira.',
    code: `
      WITH
      ${PERIODO_CTE}
      SELECT
        NOTA_DEVOLUCAO,
        NOTA_VENDA_ORIGINAL,
        NUMPED,
        DATA_VENDA,
        DATA_DEVOLUCAO,
        CASE
          WHEN DATA_VENDA IS NULL OR DATA_DEVOLUCAO IS NULL THEN 0
          ELSE DATEDIFF(STR_TO_DATE(DATA_DEVOLUCAO, '%Y-%m-%d'), STR_TO_DATE(DATA_VENDA, '%Y-%m-%d'))
        END AS DIAS_ATE_DEVOLUCAO,
        CODFILIAL,
        CODEPTO,
        COD_RCA,
        RCA,
        CODCLI,
        CLIENTE,
        VALOR_DEVOLVIDO,
        QT_DEVOLVIDA,
        TIPODESCARGA
      FROM DEVOLUCOES_BASE
      ORDER BY DATA_DEVOLUCAO DESC, AUTO_ID DESC
      LIMIT 20
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const definition of serverFunctions) {
    const found = existing.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: definition.code,
        description: definition.description,
      });
      ids[definition.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: definition.name,
      type: 'SQL',
      code: definition.code,
      description: definition.description,
    });
    ids[definition.name] = extractSfId(created);
  }

  return ids;
}

async function smoke(ids) {
  const now = new Date();
  const input = { mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) };
  const checks = [
    ['painelCoordenadorPermissao', {}],
    ['painelCoordenadorKpis', input],
    ['painelCoordenadorPerformanceVendedores', input],
    ['painelCoordenadorAnomaliasTerritorio', input],
    ['painelCoordenadorDevolucoesRecentes', input],
  ];

  for (const [name, sfInput] of checks) {
    const id = ids[name];
    if (!id) throw new Error(`ID nao encontrado para ${name}`);
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input: sfInput });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) {
      throw new Error(`${name} falhou: ${error || status}`);
    }
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Painel Coordenador configurado.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Painel Coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
