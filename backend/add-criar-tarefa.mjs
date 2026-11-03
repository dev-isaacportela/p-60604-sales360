import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
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
  const existing = extractServerFunctions(await listServerFunctionsMitra({ projectId }));
  const found = existing.find((fn) => fn.name === 'criarTarefa');

  if (found) {
    console.log(`SF criada anteriormente: criarTarefa (ID ${found.id})`);
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: 'criarTarefa',
    type: 'SQL',
    code: `
INSERT INTO TAREFAS (
  VENDEDOR_ID,
  TITULO,
  DESCRICAO,
  STATUS,
  PRIORIDADE,
  DATA_LIMITE,
  CRIADO_EM
)
VALUES (
  :VAR_USER,
  '{{titulo}}',
  NULLIF('{{descricao}}', ''),
  'PENDENTE',
  '{{prioridade}}',
  NULLIF('{{dataLimite}}', ''),
  '{{criadoEm}}'
);
    `,
    description: 'Cria uma tarefa vinculada ao usuário logado',
  });

  const serverFunctionId = created?.result?.serverFunctionId ?? created?.result?.id ?? created?.serverFunctionId ?? created?.id;
  console.log(`SF criada: criarTarefa (ID ${serverFunctionId ?? 'desconhecido'})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
