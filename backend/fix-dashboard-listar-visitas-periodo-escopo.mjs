import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 5;

const LISTAR_VISITAS_PERIODO_SQL = `
WITH INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
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
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
),
VENDEDOR_INFO AS (
  SELECT
    VR.USER_ID,
    MIN(VR.COD_RCA) AS COD_RCA,
    MAX(COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA))) AS VENDEDOR_NOME
  FROM VENDEDOR_RCA VR
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  GROUP BY VR.USER_ID
)
SELECT
  V.ID,
  V.DATA_AGENDADA,
  V.HORA_INICIO,
  V.HORA_FIM,
  V.TIPO,
  V.STATUS,
  V.CHECKIN_HORA,
  V.CHECKOUT_HORA,
  V.RELATO,
  V.PLANEJAMENTO,
  V.VENDEDOR_ID,
  VI.COD_RCA,
  COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', V.VENDEDOR_ID)) AS VENDEDOR_NOME,
  CASE WHEN (
    V.VENDEDOR_ID = :VAR_USER
    OR EXISTS (
      SELECT 1
      FROM FUNCIONARIOS FS
      WHERE FS.ID = V.VENDEDOR_ID
        AND FS.ID_SUBSTITUTO = :VAR_USER
    )
    OR EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_DONO
      JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
      JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
      WHERE VR_DONO.USER_ID = V.VENDEDOR_ID
        AND VR_SUB.USER_ID = :VAR_USER
        AND COALESCE(FV.ATIVO, TRUE) = TRUE
        AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
    )
  ) THEN 1 ELSE 0 END AS PODE_OPERAR,
  C.ID AS CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE,
  C.CIDADE,
  C.ENDERECO
FROM VISITAS V
JOIN TARGET_USERS TU ON TU.USER_ID = V.VENDEDOR_ID
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
`;

function rowsFromExecution(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return [];
    }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function smoke(input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  return rowsFromExecution(response).length;
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: LISTAR_VISITAS_PERIODO_SQL,
    description: current?.result?.description || 'Lista visitas do periodo respeitando escopo selecionado.',
  });

  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const toIso = (date) => date.toISOString().slice(0, 10);

  const smokeRows = await smoke({
    dataInicio: toIso(monday),
    dataFim: toIso(friday),
    scopeMode: 'ME',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  });

  console.log(JSON.stringify({ updated: true, serverFunctionId, smokeRows }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir escopo de listarVisitasPeriodo:');
  console.error(error?.message || error);
  process.exit(1);
});
