import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function getBaseUrlFromEnv() {
  if (process.env.MITRA_BASE_URL) return process.env.MITRA_BASE_URL;
  const token = String(process.env.MITRA_TOKEN || '').replace(/^Bearer\s+/i, '');
  const payload = token.split('.')[1];
  if (!payload) return '';
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).backURL || '';
  } catch {
    return '';
  }
}

configureSdkMitra({
  baseURL: getBaseUrlFromEnv(),
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const DASHBOARD_VISITAS_SEMANA_SQL = `
WITH INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER', 'GLOBAL') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO
),
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT F.ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  LEFT JOIN COORDENADORES_BU CB
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (I.SCOPE_COD_SUPERVISOR IS NULL OR CB.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN COORDENADORES_BU CB
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'SELLER'
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C
        JOIN COORDENADORES_BU CB_SCOPE ON CB_SCOPE.COD_SUPERVISOR = C.COD_SUPERVISOR
        WHERE C.USER_ID = :VAR_USER
          AND COALESCE(C.ATIVO, TRUE) = TRUE
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_SCOPE.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_SCOPE.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_COD_SUPERVISOR IS NULL OR CB.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
)
SELECT
  V.ID,
  V.DATA_AGENDADA AS DATA_VISITA,
  CASE
    WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NULL THEN ''
    ELSE CASE
      WHEN COALESCE(V.CHECKOUT_HORA, '') REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN SUBSTRING(V.CHECKOUT_HORA, 1, 10)
      ELSE V.DATA_AGENDADA
    END
  END AS DATA_RELATO,
  COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CONCAT('Cliente ', V.CLIENTE_ID)) AS CLIENTE,
  V.STATUS AS STATUS_VISITA,
  CASE
    WHEN COALESCE(V.STATUS, '') = 'CANCELADA' THEN 'CANCELADA'
    WHEN COALESCE(V.STATUS, '') = 'CONCLUIDA' THEN 'CONCLUIDA'
    WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NOT NULL THEN 'REAGENDADA'
    ELSE V.STATUS
  END AS SITUACAO_VISITA,
  COALESCE(NULLIF(F.NOME, ''), NULLIF(U.DESCR, ''), CONCAT('Responsável ', V.VENDEDOR_ID)) AS RESPONSAVEL_VISITA,
  V.RELATO,
  CASE
    WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NULL THEN 'RELATO_PENDENTE'
    ELSE 'OK'
  END AS STATUS_RELATO
FROM VISITAS V
JOIN TARGET_USERS TU ON TU.USER_ID = V.VENDEDOR_ID
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = V.VENDEDOR_ID
LEFT JOIN INT_USER U ON U.ID = V.VENDEDOR_ID
WHERE V.DATA_AGENDADA >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), '%Y-%m-%d')
  AND V.DATA_AGENDADA <= DATE_FORMAT(DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), INTERVAL 6 DAY), '%Y-%m-%d')
ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
LIMIT 12
`;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  return [];
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

async function main() {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const sf = listed.find((item) => item.name === 'dashboardVisitasSemanaResumo');
  if (!sf) throw new Error('SF nao encontrada: dashboardVisitasSemanaResumo');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    code: DASHBOARD_VISITAS_SEMANA_SQL,
    description: 'Lista visitas da semana respeitando o escopo de vendedor, time e filtros do coordenador.',
  });

  const baseInput = {
    scopeMode: 'ME',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodSupervisor: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };
  const smokeInputs = [
    baseInput,
    { ...baseInput, scopeMode: 'GLOBAL' },
    { ...baseInput, scopeMode: 'SELLER', scopeUserId: '0', scopeCodRca: '0' },
  ];
  const smokeRows = [];
  for (const input of smokeInputs) {
    const response = await executeServerFunctionMitra({ projectId, serverFunctionId: sf.id, input });
    const status = String(response?.result?.executionStatus || '');
    const error = String(response?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) {
      throw new Error(error || `Smoke ${input.scopeMode} finalizado com status ${status}`);
    }
    smokeRows.push({ scopeMode: input.scopeMode, rows: extractRows(response).length });
  }

  console.log(JSON.stringify({ dashboardVisitasSemanaResumo: sf.id, smokeRows }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar visitas da semana por escopo:');
  console.error(error?.message || error);
  process.exit(1);
});
