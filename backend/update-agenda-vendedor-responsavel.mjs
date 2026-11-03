import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const TARGET_VENDEDOR_SQL = `CASE
    WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' AND CAST('{{vendedorId}}' AS UNSIGNED) > 0 THEN CAST('{{vendedorId}}' AS UNSIGNED)
    ELSE :VAR_USER
  END`;

const AGENDA_VERIFICAR_CONFLITO_SQL = `
SELECT
  COUNT(*) AS TOTAL,
  MIN(V.HORA_INICIO) AS HORARIO_CONFLITO
FROM VISITAS V
WHERE V.VENDEDOR_ID = ${TARGET_VENDEDOR_SQL}
  AND V.DATA_AGENDADA = '{{dataAgendada}}'
  AND V.HORA_INICIO = '{{horaInicio}}'
  AND COALESCE(V.STATUS, '') <> 'CANCELADA'
  AND ('{{visitaId}}' = '' OR CAST(V.ID AS CHAR) <> '{{visitaId}}')
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
  PLANEJAMENTO,
  CRIADO_EM
)
SELECT
  C.ID,
  ${TARGET_VENDEDOR_SQL},
  '{{dataAgendada}}',
  '{{horaInicio}}',
  '{{horaFim}}',
  '{{tipo}}',
  'AGENDADA',
  NULL,
  NULLIF('{{planejamento}}', ''),
  SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
FROM CLIENTES C
WHERE C.ID = {{clienteId}}
  AND EXISTS (
    SELECT 1
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    WHERE EC.ID_CLIENTE = C.ID
      AND (
        EC.ID_VENDEDOR = ${TARGET_VENDEDOR_SQL}
        OR F.ID_SUBSTITUTO = ${TARGET_VENDEDOR_SQL}
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM VISITAS V
    WHERE V.VENDEDOR_ID = ${TARGET_VENDEDOR_SQL}
      AND V.DATA_AGENDADA = '{{dataAgendada}}'
      AND V.HORA_INICIO = '{{horaInicio}}'
      AND COALESCE(V.STATUS, '') <> 'CANCELADA'
  )
LIMIT 1
`;

const PROSPECT_TARGET_SQL = `CASE
    WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' AND CAST('{{vendedorId}}' AS UNSIGNED) > 0 THEN CAST('{{vendedorId}}' AS UNSIGNED)
    WHEN '{{userId}}' REGEXP '^[0-9]+$' AND CAST('{{userId}}' AS UNSIGNED) > 0 THEN CAST('{{userId}}' AS UNSIGNED)
    ELSE :VAR_USER
  END`;

const PROSPECTS_AGENDAR_VISITA_SQL = `
INSERT INTO PROSPECT_VISITAS (
  PROSPECT_ID,
  EXECUTIVO_ID,
  DATA_VISITA,
  HORA_INICIO,
  HORA_FIM,
  OBJETIVO,
  STATUS,
  CRIADO_EM,
  ATUALIZADO_EM
) VALUES (
  {{prospectId}},
  ${PROSPECT_TARGET_SQL},
  '{{dataVisita}}',
  '{{horaInicio}}',
  '{{horaFim}}',
  '{{objetivo}}',
  'AGENDADA',
  '{{criadoEm}}',
  '{{criadoEm}}'
);

UPDATE PROSPECTS
SET STATUS_PIPELINE = 'VISITA_AGENDADA',
    ATUALIZADO_EM = '{{criadoEm}}'
WHERE ID = {{prospectId}}
LIMIT 1;

SELECT 'AGENDADA' AS STATUS;
`;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

async function updateByName(name, code, description) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const found = listed.find((item) => item.name === name);
  if (!found) {
    console.log(`SF ${name} não encontrada; ignorando.`);
    return null;
  }

  const details = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    code,
    description: description || details?.result?.description || found.description,
  });
  console.log(`SF ${name} atualizada (${found.id}).`);
  return found.id;
}

async function main() {
  await updateByName('agendaVerificarConflitoVisita', AGENDA_VERIFICAR_CONFLITO_SQL, 'Verifica conflito de agenda por vendedor responsavel selecionado.');
  await updateByName('agendaCriarVisita', AGENDA_CRIAR_VISITA_SQL, 'Cria visita para cliente com vendedor responsavel opcional.');
  await updateByName('prospectsAgendarVisita', PROSPECTS_AGENDAR_VISITA_SQL, 'Agenda visita para prospect com vendedor responsavel opcional.');
  await updateByName('prospectsAgendarVisitaSql', PROSPECTS_AGENDAR_VISITA_SQL, 'Agenda visita para prospect com vendedor responsavel opcional.');
}

main().catch((error) => {
  console.error('Erro ao atualizar vendedor responsavel da agenda:');
  console.error(error?.message || error);
  process.exit(1);
});
