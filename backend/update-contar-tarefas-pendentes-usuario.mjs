import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractServerFunctions(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function main() {
  const serverFunctions = extractServerFunctions(await listServerFunctionsMitra({ projectId }));
  const contarTarefasPendentesFn = serverFunctions.find((fn) => fn.name === 'contarTarefasPendentes');

  if (!contarTarefasPendentesFn) {
    throw new Error('SF contarTarefasPendentes não encontrada');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: contarTarefasPendentesFn.id,
    code: `
SELECT COUNT(*) AS TOTAL
FROM TAREFAS
WHERE VENDEDOR_ID = :VAR_USER
  AND STATUS IN ('PENDENTE','EM_ANDAMENTO')
    `,
    description: 'Conta tarefas pendentes e em andamento do vendedor logado para badge no menu',
  });

  console.log(`SF contarTarefasPendentes atualizada (ID ${contarTarefasPendentesFn.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
