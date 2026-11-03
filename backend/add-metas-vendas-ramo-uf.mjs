import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeDataLoaderMitra,
  executeServerFunctionMitra,
  listDataLoadersMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
  updateDataLoaderMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'CLIENTES_TOTVS';

const CLIENTES_TOTVS_QUERY = `
SELECT
  C.CODCLI,
  C.CLIENTE,
  A.RAMO,
  C.ESTENT AS UF,
  C.MUNICENT AS CIDADE
FROM PCCLIENT C
INNER JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
`;

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

function getDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
}

async function columnExists(tableName, columnName) {
  const res = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS TOTAL
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '${tableName}'
            AND COLUMN_NAME = '${columnName}'`,
  });
  const row = (res?.result?.rows || res?.rows || [])[0] || {};
  return Number(row.TOTAL || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await columnExists(tableName, columnName)) return;
  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${ddl}` });
}

async function upsertServerFunction(definition) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((fn) => fn.name === definition.name);
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
    type: definition.type || 'SQL',
    code: definition.code,
    description: definition.description,
  });
  return extractSfId(created);
}

async function getClientesTotvsDataLoaderId() {
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => (loader?.name || loader?.NAME || '') === DATA_LOADER_NAME);
  if (!existing) throw new Error(`Data Loader ${DATA_LOADER_NAME} nao encontrado.`);
  const dataLoaderId = Number(existing.id || existing.dataLoaderId || existing.ID || 0);
  if (!dataLoaderId) throw new Error(`ID do Data Loader ${DATA_LOADER_NAME} nao encontrado.`);

  await updateDataLoaderMitra({
    projectId,
    dataLoaderId,
    name: DATA_LOADER_NAME,
    jdbcId: WINTHOR_JDBC_ID,
    query: CLIENTES_TOTVS_QUERY,
  });
  return dataLoaderId;
}

const clienteUfSyncCode = `
const sdk = require('mitra-sdk');
const projectId = ${projectId};
const dataLoaderId = {{dataLoaderId}};

function rows(response) {
  return (response && response.result && response.result.rows) || response.rows || [];
}

await sdk.executeDataLoaderMitra({ projectId, dataLoaderId });

await sdk.runDmlMitra({ projectId, sql: \`
  UPDATE CLIENTES C
  JOIN IMP_CLIENTES_TOTVS ICT
    ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  SET C.UF = CASE WHEN TRIM(COALESCE(ICT.UF, '')) <> '' THEN TRIM(ICT.UF) ELSE C.UF END,
      C.CIDADE = CASE WHEN TRIM(COALESCE(ICT.CIDADE, '')) <> '' THEN TRIM(ICT.CIDADE) ELSE C.CIDADE END,
      C.SEGMENTO = CASE WHEN TRIM(COALESCE(ICT.RAMO, '')) <> '' THEN TRIM(ICT.RAMO) ELSE C.SEGMENTO END
\` });

const totals = await sdk.runQueryMitra({ projectId, sql: \`
  SELECT
    COUNT(*) AS CLIENTES_TOTAL,
    SUM(CASE WHEN TRIM(COALESCE(UF, '')) <> '' THEN 1 ELSE 0 END) AS CLIENTES_COM_UF
  FROM CLIENTES
\` });

return { success: true, dataLoaderId, stats: rows(totals)[0] || null };
`;

const metasVendedorRamoUfCode = `
WITH
PARAMS AS (
  SELECT
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF,
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN CAST('{{vendedorId}}' AS UNSIGNED) ELSE :VAR_USER END AS VENDEDOR_ID,
    CASE WHEN '{{codfilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codfilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_PARAM,
    CASE WHEN '{{codepto}}' REGEXP '^[0-9]+$' THEN CAST('{{codepto}}' AS UNSIGNED) ELSE NULL END AS CODEPTO_PARAM
),
BU_SCOPE AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID,
    CAST(BV.CODFILIAL AS CHAR) AS CODFILIAL,
    BV.ID_SECAO,
    CASE
      WHEN CAST(BV.BU_CODIGO AS CHAR) = '1' THEN 'NUTRICAO'
      WHEN CAST(BV.BU_CODIGO AS CHAR) = '2' THEN 'ENFERMAGEM'
      WHEN CAST(BV.BU_CODIGO AS CHAR) = '8' THEN 'MEDICAMENTO'
      WHEN CAST(BV.BU_CODIGO AS CHAR) = '9' THEN 'ESTETICA_E_INJETAVEIS'
      ELSE NULL
    END AS BU_CODE
  FROM BU_VENDEDOR BV
  JOIN PARAMS P ON P.VENDEDOR_ID = BV.VENDEDOR_ID
  WHERE BV.ATIVO = TRUE
    AND (P.CODFILIAL_PARAM IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(P.CODFILIAL_PARAM AS CHAR))
    AND (P.CODEPTO_PARAM IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(P.CODEPTO_PARAM AS CHAR))
),
META_TOTAL AS (
  SELECT P.VENDEDOR_ID, COALESCE(MV.VALOR_META, 0) AS META_TOTAL
  FROM PARAMS P
  LEFT JOIN METAS_VENDEDOR MV
    ON MV.USER_ID = P.VENDEDOR_ID
   AND MV.ANO = P.ANO_REF
   AND MV.MES = P.MES_REF
),
TARGET_BASE AS (
  SELECT
    P.VENDEDOR_ID,
    BU.CODE AS BU_CODE,
    R.CODE AS UF,
    CASE
      WHEN S.CODE = 'ORGAO_PUBLICO' THEN 'ORGAO_PUBLICO'
      ELSE S.CODE
    END AS RAMO_CODE,
    CASE
      WHEN S.CODE = 'ORGAO_PUBLICO' THEN 'Órgão Público'
      ELSE S.NAME
    END AS RAMO_NOME,
    ROUND(SUM(COALESCE(T.TARGET_VALUE, 0)), 2) AS TARGET_VALUE
  FROM INTG_MONTHLY_BILLING_TARGET T
  JOIN INTG_BUSINESS_UNIT BU ON BU.SOURCE_BUSINESS_UNIT_ID = T.SOURCE_BUSINESS_UNIT_ID
  JOIN INTG_REGION R ON R.SOURCE_REGION_ID = T.SOURCE_REGION_ID
  JOIN INTG_ACTIVITY_SEGMENT S ON S.SOURCE_ACTIVITY_SEGMENT_ID = T.SOURCE_ACTIVITY_SEGMENT_ID
  JOIN PARAMS P ON P.ANO_REF = T.YEAR_REF AND P.MES_REF = T.MONTH_REF
  JOIN (SELECT DISTINCT VENDEDOR_ID, BU_CODE FROM BU_SCOPE WHERE BU_CODE IS NOT NULL) B
    ON B.VENDEDOR_ID = P.VENDEDOR_ID AND B.BU_CODE = BU.CODE
  WHERE T.ACTIVE = TRUE
    AND R.CODE <> 'NAO_INFORMADO'
  GROUP BY P.VENDEDOR_ID, BU.CODE, R.CODE, RAMO_CODE, RAMO_NOME
),
TARGET_TOTAL AS (
  SELECT VENDEDOR_ID, SUM(TARGET_VALUE) AS TARGET_TOTAL
  FROM TARGET_BASE
  GROUP BY VENDEDOR_ID
),
VENDAS_BASE AS (
  SELECT
    P.VENDEDOR_ID,
    BS.BU_CODE,
    CASE
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) IN ('ORGAO PUBLICO CENTRO OESTE', 'ORGAO PUBLICO SUDESTE', 'ORGAO PUBLICO NORTE', 'ORGAO PUBLICO NORDESTE', 'ORGAO PUBLICO SUL', 'ÓRGAO PUBLICO CENTRO OESTE', 'ÓRGAO PUBLICO SUDESTE', 'ÓRGAO PUBLICO NORTE', 'ÓRGAO PUBLICO NORDESTE', 'ÓRGAO PUBLICO SUL') THEN 'ORGAO_PUBLICO'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'CONCESSIONARIA' THEN 'CONCESSIONARIAS'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'CLINICA MEDICA' THEN 'CLINICA_MEDICA'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'DEMAIS CLIENTES' THEN 'DEMAIS_CLIENTES'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'HOME CARE' THEN 'HOME_CARE'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'HOSPITAL INTERIOR' THEN 'HOSPITAL_INTERIOR'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'HOSPITAL INTERIOR GO' THEN 'HOSPITAL_INTERIOR_GO'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'HOSPITAL PRIVADO' THEN 'HOSPITAL_PRIVADO'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'HOSPITAL PUBLICO' THEN 'HOSPITAL_PUBLICO'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'INSTITUTO DE LONGA PERMANENCIA' THEN 'LONGA_PERMANENCIA'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'MEDICAMENTO' THEN 'MEDICAMENTO'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'OPERADORA DE SAUDE' THEN 'OPERADORA_DE_SAUDE'
      WHEN UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, ''))) = 'PDV' THEN 'PDV'
      ELSE REPLACE(UPPER(TRIM(COALESCE(V.RAMO_CLIENTE, 'SEM_RAMO'))), ' ', '_')
    END AS RAMO_CODE,
    COALESCE(NULLIF(TRIM(C.UF), ''), 'NAO_INFORMADO') AS UF,
    ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO_BRUTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PARAMS P ON 1 = 1
  JOIN BU_SCOPE BS
    ON BS.VENDEDOR_ID = P.VENDEDOR_ID
   AND BS.CODFILIAL = CAST(V.CODFILIAL AS CHAR)
   AND (BS.ID_SECAO IS NULL OR BS.ID_SECAO = V.CODSEC)
  JOIN CLIENTES C
    ON CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) = CAST(V.CODCLI AS CHAR)
  JOIN EQUIPE_CLIENTE EC
    ON EC.ID_VENDEDOR = P.VENDEDOR_ID
   AND EC.ID_CLIENTE = C.ID
  WHERE SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 7) = CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'))
  GROUP BY P.VENDEDOR_ID, BS.BU_CODE, RAMO_CODE, UF
),
DEVOLUCOES_BASE AS (
  SELECT
    P.VENDEDOR_ID,
    BS.BU_CODE,
    CASE
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) IN ('ORGAO PUBLICO CENTRO OESTE', 'ORGAO PUBLICO SUDESTE', 'ORGAO PUBLICO NORTE', 'ORGAO PUBLICO NORDESTE', 'ORGAO PUBLICO SUL', 'ÓRGAO PUBLICO CENTRO OESTE', 'ÓRGAO PUBLICO SUDESTE', 'ÓRGAO PUBLICO NORTE', 'ÓRGAO PUBLICO NORDESTE', 'ÓRGAO PUBLICO SUL') THEN 'ORGAO_PUBLICO'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'CONCESSIONARIA' THEN 'CONCESSIONARIAS'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'CLINICA MEDICA' THEN 'CLINICA_MEDICA'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'DEMAIS CLIENTES' THEN 'DEMAIS_CLIENTES'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'HOME CARE' THEN 'HOME_CARE'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'HOSPITAL INTERIOR' THEN 'HOSPITAL_INTERIOR'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'HOSPITAL INTERIOR GO' THEN 'HOSPITAL_INTERIOR_GO'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'HOSPITAL PRIVADO' THEN 'HOSPITAL_PRIVADO'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'HOSPITAL PUBLICO' THEN 'HOSPITAL_PUBLICO'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'INSTITUTO DE LONGA PERMANENCIA' THEN 'LONGA_PERMANENCIA'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'MEDICAMENTO' THEN 'MEDICAMENTO'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'OPERADORA DE SAUDE' THEN 'OPERADORA_DE_SAUDE'
      WHEN UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, ''))) = 'PDV' THEN 'PDV'
      ELSE REPLACE(UPPER(TRIM(COALESCE(D.RAMO_CLIENTE, 'SEM_RAMO'))), ' ', '_')
    END AS RAMO_CODE,
    COALESCE(NULLIF(TRIM(C.UF), ''), 'NAO_INFORMADO') AS UF,
    ROUND(SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR_DEVOLVIDO
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN PARAMS P ON 1 = 1
  JOIN BU_SCOPE BS
    ON BS.VENDEDOR_ID = P.VENDEDOR_ID
   AND BS.CODFILIAL = CAST(D.CODFILIAL AS CHAR)
   AND (BS.ID_SECAO IS NULL OR BS.ID_SECAO = D.CODSEC)
  JOIN CLIENTES C
    ON CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) = CAST(D.CODCLI AS CHAR)
  JOIN EQUIPE_CLIENTE EC
    ON EC.ID_VENDEDOR = P.VENDEDOR_ID
   AND EC.ID_CLIENTE = C.ID
  WHERE SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 7) = CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'))
  GROUP BY P.VENDEDOR_ID, BS.BU_CODE, RAMO_CODE, UF
)
SELECT
  TB.VENDEDOR_ID,
  TB.BU_CODE,
  TB.UF,
  TB.RAMO_CODE,
  TB.RAMO_NOME,
  TB.TARGET_VALUE AS META_BASE_RITMO,
  MT.META_TOTAL AS META_VENDEDOR_TOTAL,
  CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
       ELSE ROUND((TB.TARGET_VALUE / TT.TARGET_TOTAL) * 100, 4)
  END AS PERCENTUAL_DISTRIBUICAO,
  CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
       ELSE ROUND(MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL), 2)
  END AS META_VENDEDOR_RAMO_UF,
  COALESCE(VB.FATURAMENTO_BRUTO, 0) AS FATURAMENTO_BRUTO,
  COALESCE(DB.VALOR_DEVOLVIDO, 0) AS DEVOLVIDO,
  ROUND(COALESCE(VB.FATURAMENTO_BRUTO, 0) - COALESCE(DB.VALOR_DEVOLVIDO, 0), 2) AS FATURAMENTO_LIQUIDO,
  CASE
    WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 OR MT.META_TOTAL = 0 THEN 0
    ELSE ROUND(((COALESCE(VB.FATURAMENTO_BRUTO, 0) - COALESCE(DB.VALOR_DEVOLVIDO, 0)) / (MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL))) * 100, 2)
  END AS PERCENTUAL_META
FROM TARGET_BASE TB
JOIN META_TOTAL MT ON MT.VENDEDOR_ID = TB.VENDEDOR_ID
JOIN TARGET_TOTAL TT ON TT.VENDEDOR_ID = TB.VENDEDOR_ID
LEFT JOIN VENDAS_BASE VB
  ON VB.VENDEDOR_ID = TB.VENDEDOR_ID
 AND VB.BU_CODE = TB.BU_CODE
 AND VB.RAMO_CODE = TB.RAMO_CODE
 AND VB.UF = TB.UF
LEFT JOIN DEVOLUCOES_BASE DB
  ON DB.VENDEDOR_ID = TB.VENDEDOR_ID
 AND DB.BU_CODE = TB.BU_CODE
 AND DB.RAMO_CODE = TB.RAMO_CODE
 AND DB.UF = TB.UF
WHERE ('{{ramoCode}}' = '' OR TB.RAMO_CODE = '{{ramoCode}}')
  AND ('{{uf}}' = '' OR TB.UF = '{{uf}}')
ORDER BY TB.BU_CODE, TB.RAMO_NOME, TB.UF
`;

async function main() {
  await addColumnIfMissing('IMP_CLIENTES_TOTVS', 'UF', 'UF VARCHAR(2)');
  await addColumnIfMissing('IMP_CLIENTES_TOTVS', 'CIDADE', 'CIDADE VARCHAR(120)');

  const dataLoaderId = await getClientesTotvsDataLoaderId();
  await executeDataLoaderMitra({ projectId, dataLoaderId });
  await runDmlMitra({
    projectId,
    sql: `UPDATE CLIENTES C
          JOIN IMP_CLIENTES_TOTVS ICT
            ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
          SET C.UF = CASE WHEN TRIM(COALESCE(ICT.UF, '')) <> '' THEN TRIM(ICT.UF) ELSE C.UF END,
              C.CIDADE = CASE WHEN TRIM(COALESCE(ICT.CIDADE, '')) <> '' THEN TRIM(ICT.CIDADE) ELSE C.CIDADE END,
              C.SEGMENTO = CASE WHEN TRIM(COALESCE(ICT.RAMO, '')) <> '' THEN TRIM(ICT.RAMO) ELSE C.SEGMENTO END`,
  });

  const syncSfId = await upsertServerFunction({
    name: 'sincronizarClientesUfRamoTotvs',
    type: 'JAVASCRIPT',
    code: clienteUfSyncCode.replace('{{dataLoaderId}}', String(dataLoaderId)),
    description: 'Atualiza ramos, UF e cidade dos clientes a partir da fonte Winthor para metas por ramo/UF.',
  });

  const metasSfId = await upsertServerFunction({
    name: 'metasVendedorRamoUfAplicadas',
    type: 'SQL',
    code: metasVendedorRamoUfCode,
    description: 'Aplica metas de vendas por vendedor, ramo consolidado e UF, usando UF de localizacao do cliente para Orgao Publico.',
  });

  const stats = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS CLIENTES_TOTAL,
                 SUM(CASE WHEN TRIM(COALESCE(UF, '')) <> '' THEN 1 ELSE 0 END) AS CLIENTES_COM_UF
          FROM CLIENTES`,
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: metasSfId,
    input: { ano: '2026', mes: '4', vendedorId: '5', ramoCode: '', uf: '' },
  });

  console.log(JSON.stringify({
    dataLoaderId,
    syncSfId,
    metasSfId,
    stats: (stats?.result?.rows || stats?.rows || [])[0] || null,
    smokeStatus: smoke?.result?.executionStatus,
    smokeError: smoke?.result?.error || null,
    smokeRows: smoke?.result?.output?.rows?.slice?.(0, 3) || [],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
