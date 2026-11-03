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

function addPlanejamentoUpdate(code) {
  if (code.includes('V.PLANEJAMENTO =')) return code;
  return code.replace(
    "V.RELATO = NULLIF('{{relato}}', '')",
    "V.RELATO = NULLIF('{{relato}}', ''),\n    V.PLANEJAMENTO = NULLIF('{{planejamento}}', '')",
  );
}

async function main() {
  const fn = await getFunctionByName('agendaAtualizarVisita');
  const code = addPlanejamentoUpdate(fn.code);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: fn.id,
    code,
    description: 'Atualiza visita existente, incluindo planejamento, e exige relato quando houver reagendamento.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: fn.id,
    input: {
      visitaId: 0,
      clienteId: 0,
      dataAgendada: '2099-01-01',
      horaInicio: '08:00',
      horaFim: '09:00',
      tipo: 'Smoke',
      relato: 'Smoke sem efeito',
      planejamento: 'Smoke sem efeito',
    },
  });

  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou: ${status}`);

  console.log(`SF agendaAtualizarVisita atualizada com planejamento (${fn.id}).`);
}

main().catch((error) => {
  console.error('Erro ao atualizar edicao de planejamento da agenda:');
  console.error(error?.message || error);
  process.exit(1);
});
