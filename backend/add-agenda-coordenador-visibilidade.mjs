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

function visibleOwnerPredicate(ownerUserExpr, viewerUserExpr = ':VAR_USER') {
  return `(
    ${ownerUserExpr} = ${viewerUserExpr}
    OR EXISTS (
      SELECT 1
      FROM FUNCIONARIOS FS
      WHERE FS.ID = ${ownerUserExpr}
        AND FS.ID_SUBSTITUTO = ${viewerUserExpr}
    )
    OR EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_DONO
      JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
      JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
      WHERE VR_DONO.USER_ID = ${ownerUserExpr}
        AND VR_SUB.USER_ID = ${viewerUserExpr}
        AND COALESCE(FV.ATIVO, TRUE) = TRUE
        AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
    )
  )`;
}

function coordinatorPredicate(ownerUserExpr) {
  return `EXISTS (
    SELECT 1
    FROM COORDENADORES C
    JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
    JOIN BU_VENDEDOR BV
      ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
     AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
    WHERE C.USER_ID = :VAR_USER
      AND COALESCE(C.ATIVO, TRUE) = TRUE
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND BV.VENDEDOR_ID = ${ownerUserExpr}
  )`;
}

const VENDEDOR_INFO_CTE = `
VENDEDOR_INFO AS (
  SELECT
    VR.USER_ID,
    MIN(VR.COD_RCA) AS COD_RCA,
    MAX(COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA))) AS VENDEDOR_NOME
  FROM VENDEDOR_RCA VR
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN INT_USER U ON U.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  GROUP BY VR.USER_ID
)
`;

const OPERACAO_PERMITIDA = visibleOwnerPredicate('V.VENDEDOR_ID');
const VISIBILIDADE_PERMITIDA = `(${OPERACAO_PERMITIDA} OR ${coordinatorPredicate('V.VENDEDOR_ID')})`;

const LISTAR_VISITAS_PERIODO_SQL = `
  WITH ${VENDEDOR_INFO_CTE}
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
    V.VENDEDOR_ID,
    VI.COD_RCA,
    COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', V.VENDEDOR_ID)) AS VENDEDOR_NOME,
    CASE WHEN ${OPERACAO_PERMITIDA} THEN 1 ELSE 0 END AS PODE_OPERAR,
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.ENDERECO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ${VISIBILIDADE_PERMITIDA}
  ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
`;

const VISITAS_DO_DIA_SQL = `
  WITH ${VENDEDOR_INFO_CTE}
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
    V.VENDEDOR_ID,
    VI.COD_RCA,
    COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', V.VENDEDOR_ID)) AS VENDEDOR_NOME,
    CASE WHEN ${OPERACAO_PERMITIDA} THEN 1 ELSE 0 END AS PODE_OPERAR,
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.ENDERECO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
  WHERE V.DATA_AGENDADA = '{{data}}'
    AND ${VISIBILIDADE_PERMITIDA}
  ORDER BY V.HORA_INICIO
`;

const AGENDA_LISTAR_SQL = `
  WITH ${VENDEDOR_INFO_CTE}
  SELECT
    V.ID,
    V.CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.UF,
    V.VENDEDOR_ID,
    VI.COD_RCA,
    COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', V.VENDEDOR_ID)) AS VENDEDOR_NOME,
    CASE WHEN ${OPERACAO_PERMITIDA} THEN 1 ELSE 0 END AS PODE_OPERAR,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    V.HORA_FIM,
    V.TIPO,
    V.STATUS,
    V.CHECKIN_HORA,
    V.CHECKOUT_HORA,
    V.RELATO,
    V.CRIADO_EM
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR COALESCE(VI.VENDEDOR_NOME, '') LIKE '%{{busca}}%'
      OR CAST(COALESCE(VI.COD_RCA, '') AS CHAR) LIKE '%{{busca}}%'
    )
    AND ${VISIBILIDADE_PERMITIDA}
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const AGENDA_CONTAR_SQL = `
  WITH ${VENDEDOR_INFO_CTE}
  SELECT COUNT(*) AS TOTAL
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR COALESCE(VI.VENDEDOR_NOME, '') LIKE '%{{busca}}%'
      OR CAST(COALESCE(VI.COD_RCA, '') AS CHAR) LIKE '%{{busca}}%'
    )
    AND ${VISIBILIDADE_PERMITIDA}
`;

const DEFINITIONS = [
  ['listarVisitasPeriodo', LISTAR_VISITAS_PERIODO_SQL, 'Lista visitas do periodo para o vendedor/substituto ou coordenador no escopo, incluindo relatos.'],
  ['visitasDoDia', VISITAS_DO_DIA_SQL, 'Lista visitas do dia para o vendedor/substituto ou coordenador no escopo, incluindo relatos.'],
  ['agendaListarVisitasPaginado', AGENDA_LISTAR_SQL, 'Lista visitas paginadas para vendedor/substituto ou coordenador no escopo, incluindo relatos.'],
  ['agendaContarVisitasPaginado', AGENDA_CONTAR_SQL, 'Conta visitas paginadas para vendedor/substituto ou coordenador no escopo.'],
];

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

async function updateByName(sfMap, name, code, description) {
  const existing = sfMap.get(name);
  if (!existing) throw new Error(`Server Function nao encontrada: ${name}`);
  await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code, description });
  return existing.id;
}

async function smoke(ids) {
  const today = new Date().toISOString().slice(0, 10);
  const checks = [
    ['listarVisitasPeriodo', { dataInicio: today, dataFim: today }],
    ['visitasDoDia', { data: today }],
    ['agendaContarVisitasPaginado', { dataInicio: today, dataFim: today, status: '', busca: '', limit: 1, offset: 0 }],
  ];

  for (const [name, input] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const sfMap = new Map((listed?.result || []).map((sf) => [sf.name, sf]));
  const ids = {};

  for (const [name, code, description] of DEFINITIONS) {
    ids[name] = await updateByName(sfMap, name, code, description);
    console.log(`SF ${ids[name]} ${name}: atualizada`);
  }

  await smoke(ids);
  console.log('Agenda liberada para coordenadores no escopo dos vendedores.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao liberar agenda para coordenadores:');
  console.error(error?.message || error);
  process.exit(1);
});
