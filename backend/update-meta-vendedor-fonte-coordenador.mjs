import 'dotenv/config';
import {
  configureSdkMitra,
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

const SQL_ESCOPO_CTE = `
WITH TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
),
CARTEIRA_SCOPE_RAW AS (
  SELECT
    TU.USER_ID AS TARGET_USER_ID,
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM TARGET_USERS TU
  JOIN EQUIPE_CLIENTE EC ON 1 = 1
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE EC.ID_VENDEDOR = TU.USER_ID
     OR F.ID_SUBSTITUTO = TU.USER_ID
),
CARTEIRA_SCOPE AS (
  SELECT
    BASE.TARGET_USER_ID,
    BASE.ID_CLIENTE,
    BASE.ID_VENDEDOR AS VENDEDOR_DONO_CLIENTE
  FROM (
    SELECT
      CSR.TARGET_USER_ID,
      CSR.ID_CLIENTE,
      CSR.ID_VENDEDOR,
      ROW_NUMBER() OVER (
        PARTITION BY CSR.TARGET_USER_ID, CSR.ID_CLIENTE
        ORDER BY
          CASE WHEN CSR.ID_VENDEDOR = CSR.TARGET_USER_ID THEN 0 ELSE 1 END,
          CSR.ID_VENDEDOR
      ) AS RN
    FROM CARTEIRA_SCOPE_RAW CSR
  ) BASE
  WHERE BASE.RN = 1
),
RCA_SCOPE AS (
  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    VR.COD_RCA
  FROM TARGET_USERS TU
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = TU.USER_ID

  UNION

  SELECT DISTINCT
    TU.USER_ID AS TARGET_USER_ID,
    VR.COD_RCA
  FROM TARGET_USERS TU
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = TU.USER_ID
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = F.ID
),
ESCOPO_RCA_DEPTO AS (
  SELECT DISTINCT
    RS.TARGET_USER_ID,
    RD.COD_RCA,
    TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) AS CODEPTO
  FROM RCA_SCOPE RS
  JOIN RCA_DEPARTAMENTO RD ON RD.COD_RCA = RS.COD_RCA
  WHERE COALESCE(RD.ATIVO, TRUE) = TRUE
)
`;

const serverFunctions = [
  {
    name: 'metaDefinir',
    description: 'Bloqueia definicao de meta pelo vendedor; metas agora sao redistribuidas pelo coordenador por BU.',
    code: `
      SELECT
        0 AS PODE_ALTERAR,
        'A meta e definida pelo coordenador na redistribuicao da BU.' AS MENSAGEM
    `,
  },
  {
    name: 'metaRealizadoProjecao',
    description: 'Retorna meta distribuida pelo coordenador, realizado, projecao e status do mes/ano do vendedor logado.',
    code: `
      ${SQL_ESCOPO_CTE},
      PARAMS AS (
        SELECT
          CASE WHEN '{{ANO}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ANO}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF,
          CASE WHEN '{{MES}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{MES}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF
      ),
      PERIODO AS (
        SELECT
          P.ANO_REF,
          P.MES_REF,
          DAY(LAST_DAY(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'))) AS TOTAL_DIAS_MES,
          CASE
            WHEN P.ANO_REF = YEAR(CURRENT_DATE) AND P.MES_REF = MONTH(CURRENT_DATE)
              THEN GREATEST(DAY(CURRENT_DATE), 1)
            ELSE DAY(LAST_DAY(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d')))
          END AS DIA_ATUAL
        FROM PARAMS P
      ),
      META_COORDENADOR AS (
        SELECT ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS VALOR_META
        FROM METAS_BU_VENDEDOR MBV
        JOIN PARAMS P ON P.ANO_REF = MBV.ANO AND P.MES_REF = MBV.MES
        WHERE MBV.VENDEDOR_ID = :VAR_USER
      ),
      REALIZADO AS (
        SELECT
          ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_REALIZADO
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        JOIN PARAMS P ON 1 = 1
        JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
        JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID
          AND E.COD_RCA = R.COD_RCA
          AND E.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
        WHERE R.ATIVO = TRUE
          AND R.STATUS_INGESTAO = 'ATIVO'
          AND R.ANO = P.ANO_REF
          AND R.MES = P.MES_REF
      )
      SELECT
        P.ANO_REF AS ANO,
        P.MES_REF AS MES,
        COALESCE(M.VALOR_META, 0) AS VALOR_META,
        COALESCE(R.VALOR_REALIZADO, 0) AS VALOR_REALIZADO,
        CASE
          WHEN COALESCE(M.VALOR_META, 0) <= 0 THEN 0
          ELSE ROUND((COALESCE(R.VALOR_REALIZADO, 0) / M.VALOR_META) * 100, 2)
        END AS PERCENTUAL_ATINGIDO,
        P.DIA_ATUAL,
        P.TOTAL_DIAS_MES,
        GREATEST(P.TOTAL_DIAS_MES - P.DIA_ATUAL, 0) AS DIAS_RESTANTES,
        ROUND(
          CASE
            WHEN P.DIA_ATUAL <= 0 THEN 0
            ELSE (COALESCE(R.VALOR_REALIZADO, 0) / P.DIA_ATUAL) * P.TOTAL_DIAS_MES
          END,
          2
        ) AS PROJECAO_FECHAMENTO,
        CASE
          WHEN COALESCE(M.VALOR_META, 0) <= 0 THEN 'abaixo'
          WHEN (
            CASE
              WHEN P.DIA_ATUAL <= 0 THEN 0
              ELSE (COALESCE(R.VALOR_REALIZADO, 0) / P.DIA_ATUAL) * P.TOTAL_DIAS_MES
            END
          ) > M.VALOR_META THEN 'acima'
          WHEN (
            CASE
              WHEN P.DIA_ATUAL <= 0 THEN 0
              ELSE (COALESCE(R.VALOR_REALIZADO, 0) / P.DIA_ATUAL) * P.TOTAL_DIAS_MES
            END
          ) >= (M.VALOR_META * 0.9) THEN 'no_ritmo'
          ELSE 'abaixo'
        END AS STATUS,
        'COORDENADOR' AS ORIGEM_META
      FROM PERIODO P
      LEFT JOIN META_COORDENADOR M ON 1 = 1
      LEFT JOIN REALIZADO R ON 1 = 1
    `,
  },
  {
    name: 'metaListarHistorico',
    description: 'Retorna ultimos 12 meses de meta redistribuida pelo coordenador vs realizado do vendedor logado.',
    code: `
      ${SQL_ESCOPO_CTE},
      MESES AS (
        SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
        UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
      ),
      PERIODOS AS (
        SELECT
          YEAR(DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL N MONTH)) AS ANO_REF,
          MONTH(DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL N MONTH)) AS MES_REF,
          DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL N MONTH) AS DT_REF
        FROM MESES
      ),
      METAS_POR_PERIODO AS (
        SELECT
          MBV.ANO,
          MBV.MES,
          ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS VALOR_META
        FROM METAS_BU_VENDEDOR MBV
        WHERE MBV.VENDEDOR_ID = :VAR_USER
        GROUP BY MBV.ANO, MBV.MES
      ),
      REALIZADO_POR_PERIODO AS (
        SELECT
          R.ANO,
          R.MES,
          ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_REALIZADO
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
        JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID
          AND E.COD_RCA = R.COD_RCA
          AND E.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
        WHERE R.ATIVO = TRUE
          AND R.STATUS_INGESTAO = 'ATIVO'
        GROUP BY R.ANO, R.MES
      )
      SELECT
        P.ANO_REF AS ANO,
        P.MES_REF AS MES,
        CONCAT(
          CASE P.MES_REF
            WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
            WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
            WHEN 9 THEN 'Set' WHEN 10 THEN 'Out' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dez'
          END,
          '/',
          RIGHT(CAST(P.ANO_REF AS CHAR), 2)
        ) AS MES_LABEL,
        COALESCE(M.VALOR_META, 0) AS VALOR_META,
        COALESCE(RP.VALOR_REALIZADO, 0) AS VALOR_REALIZADO,
        CASE
          WHEN COALESCE(M.VALOR_META, 0) <= 0 THEN 0
          ELSE ROUND((COALESCE(RP.VALOR_REALIZADO, 0) / M.VALOR_META) * 100, 2)
        END AS PERCENTUAL_ATINGIDO,
        CASE
          WHEN COALESCE(M.VALOR_META, 0) <= 0 THEN 'abaixo'
          WHEN COALESCE(RP.VALOR_REALIZADO, 0) > M.VALOR_META THEN 'acima'
          WHEN COALESCE(RP.VALOR_REALIZADO, 0) >= (M.VALOR_META * 0.9) THEN 'no_ritmo'
          ELSE 'abaixo'
        END AS STATUS,
        'COORDENADOR' AS ORIGEM_META
      FROM PERIODOS P
      LEFT JOIN METAS_POR_PERIODO M
        ON M.ANO = P.ANO_REF
       AND M.MES = P.MES_REF
      LEFT JOIN REALIZADO_POR_PERIODO RP
        ON RP.ANO = P.ANO_REF
       AND RP.MES = P.MES_REF
      ORDER BY P.DT_REF DESC
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);
    if (!found) throw new Error(`SF existente nao encontrada: ${sf.name}`);
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: found.id,
      code: sf.code,
      description: sf.description,
    });
    ids[sf.name] = found.id;
    console.log(`SF ${sf.name}: atualizada (ID ${found.id})`);
  }

  return ids;
}

async function smoke(ids) {
  const now = new Date();
  const input = { ANO: String(now.getFullYear()), MES: String(now.getMonth() + 1) };
  const checks = [
    ['metaRealizadoProjecao', input],
    ['metaListarHistorico', {}],
    ['metaDefinir', { ...input, VALOR_META: '1' }],
  ];

  for (const [name, sfInput] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input: sfInput });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Metas do vendedor agora usam redistribuicao do coordenador.');
}

main().catch((error) => {
  console.error('Erro ao atualizar fonte da meta do vendedor:');
  console.error(error?.message || error);
  process.exit(1);
});
