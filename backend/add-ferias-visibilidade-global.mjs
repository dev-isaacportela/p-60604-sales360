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

const ALCADA_SQL = `
  EXISTS (
    SELECT 1
    FROM USUARIO_CARGO UC
    WHERE UC.USER_ID = :VAR_USER
      AND UC.CARGO IN ('GESTOR', 'ADMIN', 'DIRETORIA')
  )
`;

const CLIENTE_VISIVEL_SQL = `
  EXISTS (
    SELECT 1
    FROM EQUIPE_CLIENTE EC
    WHERE EC.ID_CLIENTE = C.ID
      AND ${visibleOwnerPredicate('EC.ID_VENDEDOR')}
  )
`;

const LISTAR_VISITAS_PERIODO_SQL = `
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
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.ENDERECO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
`;

const VISITAS_DO_DIA_SQL = `
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
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.ENDERECO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA = '{{data}}'
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  ORDER BY V.HORA_INICIO
`;

const AGENDA_LISTAR_SQL = `
  SELECT
    V.ID,
    V.CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.UF,
    V.VENDEDOR_ID,
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
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
    )
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const AGENDA_CONTAR_SQL = `
  SELECT COUNT(*) AS TOTAL
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
    )
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
`;

const AGENDA_CRIAR_VISITA_SQL = `
  INSERT INTO VISITAS (
    CLIENTE_ID,
    VENDEDOR_ID,
    DATA_AGENDADA,
    HORA_INICIO,
    HORA_FIM,
    TIPO,
    STATUS,
    RELATO,
    CRIADO_EM
  )
  SELECT
    C.ID,
    :VAR_USER,
    '{{dataAgendada}}',
    '{{horaInicio}}',
    '{{horaFim}}',
    '{{tipo}}',
    'AGENDADA',
    NULLIF('{{relato}}', ''),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM CLIENTES C
  WHERE C.ID = {{clienteId}}
    AND ${CLIENTE_VISIVEL_SQL}
  LIMIT 1
`;

const CHECKIN_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.STATUS = 'EM_ANDAMENTO',
    V.CHECKIN_HORA = '{{checkinHora}}'
  WHERE V.ID = {{visitaId}}
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
    AND V.STATUS = 'AGENDADA'
  LIMIT 1
`;

const CHECKOUT_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.STATUS = 'CONCLUIDA',
    V.CHECKOUT_HORA = '{{checkoutHora}}',
    V.RELATO = '{{relato}}'
  WHERE V.ID = {{visitaId}}
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
    AND NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
    AND V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
  LIMIT 1
`;

const AGENDA_ATUALIZAR_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.CLIENTE_ID = {{clienteId}},
    V.DATA_AGENDADA = '{{dataAgendada}}',
    V.HORA_INICIO = '{{horaInicio}}',
    V.HORA_FIM = '{{horaFim}}',
    V.TIPO = '{{tipo}}',
    V.RELATO = NULLIF('{{relato}}', '')
  WHERE V.ID = {{visitaId}}
    AND (
      ${ALCADA_SQL}
      OR ${visibleOwnerPredicate('V.VENDEDOR_ID')}
    )
    AND (
      ${ALCADA_SQL}
      OR EXISTS (
        SELECT 1
        FROM CLIENTES C
        WHERE C.ID = {{clienteId}}
          AND ${CLIENTE_VISIVEL_SQL}
      )
    )
    AND (
      (
        V.DATA_AGENDADA = '{{dataAgendada}}'
        AND V.HORA_INICIO = '{{horaInicio}}'
        AND V.HORA_FIM = '{{horaFim}}'
      )
      OR NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
    )
  LIMIT 1
`;

const AGENDA_CANCELAR_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.STATUS = 'CANCELADA',
    V.RELATO = '{{relato}}'
  WHERE V.ID = {{visitaId}}
    AND (
      ${ALCADA_SQL}
      OR ${visibleOwnerPredicate('V.VENDEDOR_ID')}
    )
    AND NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
  LIMIT 1
`;

const CANCELAR_VISITA_SQL = `
  UPDATE VISITAS V
  SET V.STATUS = 'CANCELADA'
  WHERE V.ID = {{visitaId}}
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  LIMIT 1
`;

const DEFINITIONS = [
  ['listarVisitasPeriodo', LISTAR_VISITAS_PERIODO_SQL, 'Lista visitas do periodo incluindo cobertura ativa por ferias.'],
  ['visitasDoDia', VISITAS_DO_DIA_SQL, 'Lista visitas do dia incluindo cobertura ativa por ferias.'],
  ['agendaListarVisitasPaginado', AGENDA_LISTAR_SQL, 'Lista visitas paginadas incluindo cobertura ativa por ferias.'],
  ['agendaContarVisitasPaginado', AGENDA_CONTAR_SQL, 'Conta visitas paginadas incluindo cobertura ativa por ferias.'],
  ['agendaCriarVisita', AGENDA_CRIAR_VISITA_SQL, 'Cria visita para cliente visivel na carteira propria ou por ferias ativas.'],
  ['checkinVisita', CHECKIN_VISITA_SQL, 'Registra check-in para visita propria ou coberta por ferias ativas.'],
  ['checkoutVisita', CHECKOUT_VISITA_SQL, 'Finaliza visita propria ou coberta por ferias ativas com relato obrigatorio.'],
  ['agendaAtualizarVisita', AGENDA_ATUALIZAR_VISITA_SQL, 'Atualiza visita respeitando alcada, carteira e cobertura por ferias ativas.'],
  ['agendaCancelarVisitaSeguro', AGENDA_CANCELAR_VISITA_SQL, 'Cancela visita respeitando alcada e cobertura por ferias ativas.'],
  ['cancelarVisita', CANCELAR_VISITA_SQL, 'Cancela visita propria ou coberta por ferias ativas.'],
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
  console.log('Visibilidade global de ferias aplicada nas SFs de agenda.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao aplicar visibilidade global de ferias:');
  console.error(error?.message || error);
  process.exit(1);
});
