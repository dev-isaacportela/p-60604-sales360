import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
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

async function getFunctionByName(name) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const found = listed.find((sf) => sf.name === name);
  if (!found) throw new Error(`Server Function nao encontrada: ${name}`);
  const details = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  return {
    id: found.id,
    code: details?.result?.code || found.code || '',
    description: details?.result?.description || found.description || '',
  };
}

function buildPeriodoSqlFromPaginado(code) {
  const marker = 'SELECT *\nFROM EVENTOS';
  const markerIndex = code.indexOf(marker);
  if (markerIndex === -1) throw new Error('SQL paginada nao contem SELECT * FROM EVENTOS.');

  const cte = code.slice(0, markerIndex);
  return `${cte}SELECT *
FROM EVENTOS
ORDER BY DATA_AGENDADA, HORA_INICIO`;
}

async function smoke(functionId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: functionId,
    input: { dataInicio: today, dataFim: today },
  });
  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou: ${status}`);
  console.log(`listarVisitasPeriodo smoke OK (${extractRows(result).length} linha(s)).`);
}

async function main() {
  const paginado = await getFunctionByName('agendaListarVisitasPaginado');
  const periodo = await getFunctionByName('listarVisitasPeriodo');
  const code = buildPeriodoSqlFromPaginado(paginado.code);

  if (!code.includes('AGENDA_INTERNA')) {
    throw new Error('SQL gerada nao inclui AGENDA_INTERNA.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: periodo.id,
    code,
    description: 'Lista visitas e agendas internas do periodo respeitando o escopo atual.',
  });

  await smoke(periodo.id);
  console.log(JSON.stringify({ listarVisitasPeriodo: periodo.id }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao corrigir listarVisitasPeriodo para agendas internas:');
  console.error(error?.message || error);
  process.exit(1);
});
