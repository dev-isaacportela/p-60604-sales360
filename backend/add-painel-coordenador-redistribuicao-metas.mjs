import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
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

function isAlreadyExistsError(error) {
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists') || text.includes('duplicate') || text.includes('exists');
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: criado`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label}: ja existe`);
      return;
    }
    throw error;
  }
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

const PERIODO_COORD_CTE = `
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
    CB.CODEPTO,
    CASE
      WHEN CAST(CB.CODEPTO AS CHAR) = '1' THEN 'NUTRICAO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '2' THEN 'ENFERMAGEM'
      WHEN CAST(CB.CODEPTO AS CHAR) = '8' THEN 'MEDICAMENTO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '9' THEN 'ESTETICA_E_INJETAVEIS'
      ELSE CAST(CB.CODEPTO AS CHAR)
    END AS BU_CODE
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
BU_DESC AS (
  SELECT
    CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    V.CODEPTO,
    MAX(COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO))) AS DEPARTAMENTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND V.CODEPTO IS NOT NULL
  GROUP BY CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED), V.CODEPTO
)
`;

const serverFunctions = [
  {
    name: 'painelCoordenadorMetasBuRecebidas',
    description: 'Lista metas recebidas da diretoria por BU do coordenador com total ja redistribuido e saldo.',
    code: `
      WITH
       ${PERIODO_COORD_CTE},
      METAS_INTEGRADAS AS (
        SELECT
          E.BU_CODE,
          ROUND(SUM(COALESCE(T.TARGET_VALUE, 0)), 2) AS META_INTEGRADA
        FROM (SELECT DISTINCT BU_CODE FROM ESCOPO_BU) E
        JOIN PERIODO P ON 1 = 1
        JOIN INTG_BUSINESS_UNIT BU ON BU.CODE = E.BU_CODE
        JOIN INTG_MONTHLY_BILLING_TARGET T
          ON T.SOURCE_BUSINESS_UNIT_ID = BU.SOURCE_BUSINESS_UNIT_ID
          AND T.YEAR_REF = P.ANO_REF
          AND T.MONTH_REF = P.MES_REF
          AND T.ACTIVE = TRUE
        GROUP BY E.BU_CODE
      ),
      ESCOPO_BU_COUNT AS (
        SELECT
          E.BU_CODE,
          COUNT(*) AS TOTAL_ESCOPOS_BU
        FROM ESCOPO_BU E
        GROUP BY E.BU_CODE
      ),
      METAS_RECEBIDAS AS (
        SELECT
          E.CODFILIAL,
          E.CODEPTO,
          COALESCE(BD.DEPARTAMENTO, CONCAT('Departamento ', E.CODEPTO)) AS DEPARTAMENTO,
          P.MES_REF AS MES,
          P.ANO_REF AS ANO,
          COALESCE(NULLIF(M.META_VALOR, 0), ROUND(MI.META_INTEGRADA / NULLIF(EBC.TOTAL_ESCOPOS_BU, 0), 2), 0) AS META_DIRETORIA
        FROM ESCOPO_BU E
        JOIN PERIODO P ON 1 = 1
        LEFT JOIN BU_DESC BD ON BD.CODFILIAL = E.CODFILIAL AND BD.CODEPTO = E.CODEPTO
        LEFT JOIN METAS_BU M ON M.CODFILIAL = E.CODFILIAL AND M.CODEPTO = E.CODEPTO AND M.MES = P.MES_REF AND M.ANO = P.ANO_REF
        LEFT JOIN METAS_INTEGRADAS MI ON MI.BU_CODE = E.BU_CODE
        LEFT JOIN ESCOPO_BU_COUNT EBC ON EBC.BU_CODE = E.BU_CODE
      ),
      DISTRIBUIDO AS (
        SELECT
          MBV.CODFILIAL,
          MBV.CODEPTO,
          ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS META_DISTRIBUIDA,
          COUNT(DISTINCT MBV.VENDEDOR_ID) AS VENDEDORES_COM_META
        FROM METAS_BU_VENDEDOR MBV
        JOIN PERIODO P ON P.MES_REF = MBV.MES AND P.ANO_REF = MBV.ANO
        GROUP BY MBV.CODFILIAL, MBV.CODEPTO
      ),
      VENDEDORES_BU AS (
        SELECT
          E.CODFILIAL,
          E.CODEPTO,
          COUNT(DISTINCT BV.VENDEDOR_ID) AS TOTAL_VENDEDORES
        FROM ESCOPO_BU E
        LEFT JOIN BU_VENDEDOR BV
          ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
         AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
         AND COALESCE(BV.ATIVO, TRUE) = TRUE
        GROUP BY E.CODFILIAL, E.CODEPTO
      )
      SELECT
        MR.CODFILIAL,
        MR.CODEPTO,
        MR.DEPARTAMENTO,
        MR.MES,
        MR.ANO,
        MR.META_DIRETORIA,
        COALESCE(D.META_DISTRIBUIDA, 0) AS META_DISTRIBUIDA,
        ROUND(MR.META_DIRETORIA - COALESCE(D.META_DISTRIBUIDA, 0), 2) AS SALDO_DISTRIBUIR,
        CASE WHEN MR.META_DIRETORIA <= 0 THEN 0 ELSE ROUND((COALESCE(D.META_DISTRIBUIDA, 0) / MR.META_DIRETORIA) * 100, 2) END AS PERCENTUAL_DISTRIBUIDO,
        COALESCE(VB.TOTAL_VENDEDORES, 0) AS TOTAL_VENDEDORES,
        COALESCE(D.VENDEDORES_COM_META, 0) AS VENDEDORES_COM_META
      FROM METAS_RECEBIDAS MR
      LEFT JOIN DISTRIBUIDO D ON D.CODFILIAL = MR.CODFILIAL AND D.CODEPTO = MR.CODEPTO
      LEFT JOIN VENDEDORES_BU VB ON VB.CODFILIAL = MR.CODFILIAL AND VB.CODEPTO = MR.CODEPTO
      ORDER BY MR.CODFILIAL, MR.CODEPTO
    `,
  },
  {
    name: 'painelCoordenadorMetasVendedoresBu',
    description: 'Lista vendedores da BU selecionada com meta redistribuida pelo coordenador e realizado liquido no periodo.',
    code: `
      WITH
      ${PERIODO_COORD_CTE},
      FILTRO_BU AS (
        SELECT
          CASE WHEN '{{codfilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codfilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_PARAM,
          CASE WHEN '{{codepto}}' REGEXP '^[0-9]+$' THEN CAST('{{codepto}}' AS UNSIGNED) ELSE NULL END AS CODEPTO_PARAM
      ),
      BU_SELECIONADA AS (
        SELECT E.CODFILIAL, E.CODEPTO
        FROM ESCOPO_BU E
        JOIN FILTRO_BU F ON F.CODFILIAL_PARAM = E.CODFILIAL AND F.CODEPTO_PARAM = E.CODEPTO
      ),
      VENDEDORES_BU AS (
        SELECT DISTINCT
          BV.VENDEDOR_ID,
          VR.COD_RCA,
          COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.DESCR), ''), RT.RCA_NOME, CONCAT('RCA ', COALESCE(VR.COD_RCA, BV.VENDEDOR_ID))) AS RCA
        FROM BU_SELECIONADA B
        JOIN BU_VENDEDOR BV
          ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(B.CODFILIAL AS CHAR)
         AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(B.CODEPTO AS CHAR)
         AND COALESCE(BV.ATIVO, TRUE) = TRUE
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
        LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
      ),
      CLIENTE_MAP AS (
        SELECT
          MIN(C.ID) AS ID,
          TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
        FROM CLIENTES C
        WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
        GROUP BY TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR))
      ),
      CLIENTES_CARTEIRA AS (
        SELECT DISTINCT EC.ID_CLIENTE, EC.ID_VENDEDOR
        FROM EQUIPE_CLIENTE EC
        JOIN VENDEDORES_BU VB ON VB.VENDEDOR_ID = EC.ID_VENDEDOR
      ),
      VENDAS_PERIODO AS (
        SELECT
          V.AUTO_ID,
          V.NUMPED,
          SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) AS DATA_VENDA,
          TRIM(CAST(V.CODFILIAL AS CHAR)) AS CODFILIAL,
          V.CODEPTO,
          V.CODSEC,
          V.CODCLI,
          COALESCE(V.TOTAL, 0) AS TOTAL,
          CM.ID AS ID_CLIENTE_INTERNO
        FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
        JOIN PERIODO P ON 1 = 1
        JOIN BU_SELECIONADA B
          ON TRIM(CAST(V.CODFILIAL AS CHAR)) = CAST(B.CODFILIAL AS CHAR)
         AND V.CODEPTO = B.CODEPTO
        LEFT JOIN CLIENTE_MAP CM ON CM.CODCLI = TRIM(CAST(V.CODCLI AS CHAR))
        WHERE SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= P.DATA_INICIO
          AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < P.DATA_FIM
      ),
      VENDAS_ATRIBUIDAS AS (
        SELECT V.*, CC.ID_VENDEDOR AS VENDEDOR_ID
        FROM VENDAS_PERIODO V
        JOIN CLIENTES_CARTEIRA CC ON CC.ID_CLIENTE = V.ID_CLIENTE_INTERNO
        WHERE EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV
          JOIN BU_SELECIONADA B
            ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(B.CODFILIAL AS CHAR)
           AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(B.CODEPTO AS CHAR)
          WHERE BV.VENDEDOR_ID = CC.ID_VENDEDOR
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
            AND ${territorioVendedorMatch('V', 'BV')}
        )
      ),
      DEVOLUCOES_PERIODO AS (
        SELECT
          D.AUTO_ID,
          D.NOTA_DEVOLUCAO,
          SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) AS DATA_DEVOLUCAO,
          TRIM(CAST(D.CODFILIAL AS CHAR)) AS CODFILIAL,
          D.CODEPTO,
          D.CODSEC,
          D.CODCLI,
          COALESCE(D.VALOR_DEVOLVIDO, 0) AS VALOR_DEVOLVIDO,
          CM.ID AS ID_CLIENTE_INTERNO
        FROM IMP_DEVOLUCOES_TOTVS D
        JOIN PERIODO P ON 1 = 1
        JOIN BU_SELECIONADA B
          ON TRIM(CAST(D.CODFILIAL AS CHAR)) = CAST(B.CODFILIAL AS CHAR)
         AND D.CODEPTO = B.CODEPTO
        LEFT JOIN CLIENTE_MAP CM ON CM.CODCLI = TRIM(CAST(D.CODCLI AS CHAR))
        WHERE SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) >= P.DATA_INICIO
          AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) < P.DATA_FIM
      ),
      DEVOLUCOES_ATRIBUIDAS AS (
        SELECT D.*, CC.ID_VENDEDOR AS VENDEDOR_ID
        FROM DEVOLUCOES_PERIODO D
        JOIN CLIENTES_CARTEIRA CC ON CC.ID_CLIENTE = D.ID_CLIENTE_INTERNO
        WHERE EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV
          JOIN BU_SELECIONADA B
            ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(B.CODFILIAL AS CHAR)
           AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(B.CODEPTO AS CHAR)
          WHERE BV.VENDEDOR_ID = CC.ID_VENDEDOR
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
            AND ${territorioVendedorMatch('D', 'BV')}
        )
      ),
      VENDAS_AGG AS (
        SELECT VENDEDOR_ID, ROUND(SUM(TOTAL), 2) AS FATURAMENTO_BRUTO, COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
        FROM VENDAS_ATRIBUIDAS
        GROUP BY VENDEDOR_ID
      ),
      DEV_AGG AS (
        SELECT VENDEDOR_ID, ROUND(SUM(VALOR_DEVOLVIDO), 2) AS TOTAL_DEVOLVIDO
        FROM DEVOLUCOES_ATRIBUIDAS
        GROUP BY VENDEDOR_ID
      )
      SELECT
        B.CODFILIAL,
        B.CODEPTO,
        VB.VENDEDOR_ID,
        COALESCE(VB.COD_RCA, VB.VENDEDOR_ID) AS COD_RCA,
        VB.RCA,
        COALESCE(MBV.META_VALOR, 0) AS META_VALOR,
        COALESCE(VA.FATURAMENTO_BRUTO, 0) AS FATURAMENTO_BRUTO,
        COALESCE(DA.TOTAL_DEVOLVIDO, 0) AS TOTAL_DEVOLVIDO,
        ROUND(COALESCE(VA.FATURAMENTO_BRUTO, 0) - COALESCE(DA.TOTAL_DEVOLVIDO, 0), 2) AS REALIZADO_LIQUIDO,
        CASE WHEN COALESCE(MBV.META_VALOR, 0) <= 0 THEN 0 ELSE ROUND(((COALESCE(VA.FATURAMENTO_BRUTO, 0) - COALESCE(DA.TOTAL_DEVOLVIDO, 0)) / MBV.META_VALOR) * 100, 2) END AS PERCENTUAL_META,
        COALESCE(VA.QTD_PEDIDOS, 0) AS QTD_PEDIDOS
      FROM BU_SELECIONADA B
      JOIN VENDEDORES_BU VB ON 1 = 1
      JOIN PERIODO P ON 1 = 1
      LEFT JOIN METAS_BU_VENDEDOR MBV
        ON MBV.CODFILIAL = B.CODFILIAL
       AND MBV.CODEPTO = B.CODEPTO
       AND MBV.VENDEDOR_ID = VB.VENDEDOR_ID
       AND MBV.MES = P.MES_REF
       AND MBV.ANO = P.ANO_REF
      LEFT JOIN VENDAS_AGG VA ON VA.VENDEDOR_ID = VB.VENDEDOR_ID
      LEFT JOIN DEV_AGG DA ON DA.VENDEDOR_ID = VB.VENDEDOR_ID
      ORDER BY VB.RCA
    `,
  },
  {
    name: 'painelCoordenadorSalvarMetaVendedorBu',
    description: 'Cria ou atualiza a meta redistribuida pelo coordenador para um vendedor dentro de uma BU e periodo.',
    code: `
      INSERT INTO METAS_BU_VENDEDOR (CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, META_VALOR, CRIADO_POR, CREATED_AT, UPDATED_AT)
      SELECT
        CAST('{{codfilial}}' AS UNSIGNED),
        CAST('{{codepto}}' AS UNSIGNED),
        CAST('{{vendedorId}}' AS UNSIGNED),
        CAST('{{mes}}' AS UNSIGNED),
        CAST('{{ano}}' AS UNSIGNED),
        CAST('{{metaValor}}' AS DECIMAL(15,2)),
        COALESCE(U.DESCR, CONCAT('USER ', U.ID)),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM INT_USER U
      JOIN COORDENADORES C ON C.USER_ID = U.ID AND COALESCE(C.ATIVO, TRUE) = TRUE
      JOIN COORDENADORES_BU CB
        ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
       AND CB.CODFILIAL = CAST('{{codfilial}}' AS UNSIGNED)
       AND CB.CODEPTO = CAST('{{codepto}}' AS UNSIGNED)
      WHERE U.ID = :VAR_USER
        AND EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV
          WHERE BV.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED)
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
            AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
            AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
        )
      ON DUPLICATE KEY UPDATE
        META_VALOR = VALUES(META_VALOR),
        CRIADO_POR = VALUES(CRIADO_POR),
        UPDATED_AT = CURRENT_TIMESTAMP
    `,
  },
];

async function ensureSchema() {
  await runDdlSafe(`CREATE TABLE METAS_BU_VENDEDOR (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    CODFILIAL INT NOT NULL,
    CODEPTO INT NOT NULL,
    VENDEDOR_ID INT NOT NULL,
    MES INT NOT NULL,
    ANO INT NOT NULL,
    META_VALOR DECIMAL(15,2) NOT NULL DEFAULT 0,
    CRIADO_POR VARCHAR(150),
    CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UX_METAS_BU_VENDEDOR_PERIODO (CODFILIAL, CODEPTO, VENDEDOR_ID, ANO, MES),
    KEY IX_METAS_BU_VENDEDOR_BU (CODFILIAL, CODEPTO, ANO, MES),
    KEY IX_METAS_BU_VENDEDOR_VENDEDOR (VENDEDOR_ID, ANO, MES)
  )`, 'Tabela METAS_BU_VENDEDOR');
}

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
      console.log(`${definition.name}: atualizado (${found.id})`);
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
    console.log(`${definition.name}: criado (${ids[definition.name]})`);
  }

  return ids;
}

async function smoke(ids) {
  const now = new Date();
  const input = { mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) };
  const metas = await executeServerFunctionMitra({ projectId, serverFunctionId: ids.painelCoordenadorMetasBuRecebidas, input });
  const status = String(metas?.result?.executionStatus || '');
  const error = String(metas?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`painelCoordenadorMetasBuRecebidas falhou: ${error || status}`);
  const rows = extractRows(metas);
  console.log(`painelCoordenadorMetasBuRecebidas: smoke OK (${rows.length} linha(s))`);

  const first = rows[0];
  if (first) {
    const vendedores = await executeServerFunctionMitra({
      projectId,
      serverFunctionId: ids.painelCoordenadorMetasVendedoresBu,
      input: { ...input, codfilial: String(first.CODFILIAL), codepto: String(first.CODEPTO) },
    });
    const vendedoresStatus = String(vendedores?.result?.executionStatus || '');
    const vendedoresError = String(vendedores?.result?.error || '').trim();
    if ((vendedoresStatus && vendedoresStatus !== 'COMPLETED') || vendedoresError) throw new Error(`painelCoordenadorMetasVendedoresBu falhou: ${vendedoresError || vendedoresStatus}`);
    console.log(`painelCoordenadorMetasVendedoresBu: smoke OK (${extractRows(vendedores).length} linha(s))`);
  }
}

async function main() {
  await ensureSchema();
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Redistribuicao de metas do Painel Coordenador configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar redistribuicao de metas do Painel Coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
