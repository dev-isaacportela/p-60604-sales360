import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  listTablesMitra,
  readServerFunctionMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const CONFLITO_VISITA_SQL = `
SELECT
  COUNT(*) AS TOTAL,
  MIN(V.HORA_INICIO) AS HORARIO_CONFLITO
FROM VISITAS V
WHERE V.VENDEDOR_ID = :VAR_USER
  AND V.DATA_AGENDADA = '{{dataAgendada}}'
  AND V.HORA_INICIO = '{{horaInicio}}'
  AND COALESCE(V.STATUS, '') <> 'CANCELADA'
  AND ('{{visitaId}}' = '' OR CAST(V.ID AS CHAR) <> '{{visitaId}}')
`;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function ensurePlanejamentoColumn() {
  const tables = normalizeArray(await listTablesMitra({ projectId }));
  const visitas = tables.find((table) => table.name === 'VISITAS');
  const exists = visitas?.columns?.some((column) => column.name === 'PLANEJAMENTO');
  if (exists) {
    console.log('Coluna VISITAS.PLANEJAMENTO já existe.');
    return;
  }

  await runDdlMitra({ projectId, sql: 'ALTER TABLE VISITAS ADD COLUMN PLANEJAMENTO TEXT' });
  console.log('Coluna VISITAS.PLANEJAMENTO criada.');
}

async function getFunctionByName(name) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const found = listed.find((sf) => sf.name === name);
  if (!found) throw new Error(`Server Function nao encontrada: ${name}`);
  const details = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  return { id: found.id, code: details?.result?.code || found.code || '', description: details?.result?.description || found.description || '' };
}

async function updateByName(name, code, description) {
  const fn = await getFunctionByName(name);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: fn.id,
    code,
    description: description || fn.description,
  });
  console.log(`SF ${name} atualizada (${fn.id}).`);
  return fn.id;
}

function addPlanejamentoToSelect(code) {
  if (code.includes('V.PLANEJAMENTO')) return code;
  return code.replace('V.RELATO,', 'V.RELATO,\n    V.PLANEJAMENTO,');
}

function updateCreateVisitSql(code) {
  if (code.includes('PLANEJAMENTO')) return code;
  return code
    .replace('RELATO,\n    CRIADO_EM', 'RELATO,\n    PLANEJAMENTO,\n    CRIADO_EM')
    .replace("NULLIF('{{relato}}', ''),\n    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)", "NULL,\n    NULLIF('{{planejamento}}', ''),\n    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)");
}

function updateEditVisitSql(code) {
  return code.replace(
    /AND \(\s*\(\s*V\.DATA_AGENDADA = '\{\{dataAgendada\}\}'\s*AND V\.HORA_INICIO = '\{\{horaInicio\}\}'\s*AND V\.HORA_FIM = '\{\{horaFim\}\}'\s*\)\s*OR NULLIF\(TRIM\('\{\{relato\}\}'\), ''\) IS NOT NULL\s*\)/g,
    "AND (\n      V.DATA_AGENDADA = '{{dataAgendada}}'\n      OR NULLIF(TRIM('{{relato}}'), '') IS NOT NULL\n    )",
  );
}

async function smoke(conflitoId) {
  const result = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: conflitoId,
    input: { dataAgendada: new Date().toISOString().slice(0, 10), horaInicio: '08:00', visitaId: '' },
  });
  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke conflito falhou: ${status}`);
  console.log('Smoke de conflito OK.');
}

async function main() {
  await ensurePlanejamentoColumn();

  for (const name of ['listarVisitasPeriodo', 'visitasDoDia', 'agendaListarVisitasPaginado']) {
    const fn = await getFunctionByName(name);
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: fn.id,
      code: addPlanejamentoToSelect(fn.code),
      description: fn.description,
    });
    console.log(`SF ${name} inclui PLANEJAMENTO (${fn.id}).`);
  }

  const createFn = await getFunctionByName('agendaCriarVisita');
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: createFn.id,
    code: updateCreateVisitSql(createFn.code),
    description: 'Cria visita com planejamento separado do relato final.',
  });
  console.log(`SF agendaCriarVisita atualizada (${createFn.id}).`);

  const editFn = await getFunctionByName('agendaAtualizarVisita');
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: editFn.id,
    code: updateEditVisitSql(editFn.code),
    description: 'Atualiza visita e exige relato apenas quando a data for modificada.',
  });
  console.log(`SF agendaAtualizarVisita atualizada (${editFn.id}).`);

  const conflitoId = await updateByName(
    'agendaVerificarConflitoVisita',
    CONFLITO_VISITA_SQL,
    'Verifica conflito de agenda ignorando a propria visita em reagendamentos.',
  );
  await smoke(conflitoId);
}

main().catch((error) => {
  console.error('Erro ao atualizar agenda com planejamento e reagendamento:');
  console.error(error?.message || error);
  process.exit(1);
});
