import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

const AGENDA_ATUALIZAR_INTERNA_SQL = `
UPDATE AGENDA_INTERNA
SET
  TITULO = '{{titulo}}',
  DESCRICAO = NULLIF('{{descricao}}', ''),
  DATA_AGENDADA = '{{dataAgendada}}',
  HORA_INICIO = '{{horaInicio}}',
  HORA_FIM = '{{horaFim}}',
  TIPO = NULLIF('{{tipo}}', ''),
  ORIGEM_DESLOCAMENTO = NULLIF('{{origemDeslocamento}}', ''),
  DESTINO_DESLOCAMENTO = NULLIF('{{destinoDeslocamento}}', ''),
  ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID = {{agendaId}}
  AND CRIADOR_ID = :VAR_USER
  AND STATUS = 'AGENDADA'`;

async function upsertFunction(name, type, code, description) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const existing = listed.find((sf) => sf.name === name);

  if (existing) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code, description });
    console.log(`SF ${name} atualizada (${existing.id}).`);
    return existing.id;
  }

  const created = await createServerFunctionMitra({ projectId, name, type, code, description });
  const id = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
  console.log(`SF ${name} criada (${id}).`);
  return id;
}

async function smoke(serverFunctionId) {
  const result = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {
      agendaId: '0',
      titulo: 'Smoke agenda interna',
      descricao: '',
      dataAgendada: '2099-01-01',
      horaInicio: '08:00',
      horaFim: '09:00',
      tipo: 'Reunião interna',
      origemDeslocamento: '',
      destinoDeslocamento: '',
      atualizadoEm: '2099-01-01T08:00:00',
    },
  });
  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou: ${status}`);
  console.log('Smoke de atualização de agenda interna OK.');
}

async function main() {
  const id = await upsertFunction(
    'agendaAtualizarCompromissoInterno',
    'SQL',
    AGENDA_ATUALIZAR_INTERNA_SQL,
    'Atualiza compromisso interno agendado pelo usuario logado.',
  );
  await smoke(id);
  console.log(JSON.stringify({ agendaAtualizarCompromissoInterno: id }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar edição de agenda interna:');
  console.error(error?.message || error);
  process.exit(1);
});
