import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  runDdlMitra,
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
  try {
    await runDdlMitra({
      projectId,
      sql: `ALTER TABLE TAREFAS ADD COLUMN CLIENTE_ID INT NULL`,
    });
    console.log('Coluna CLIENTE_ID adicionada em TAREFAS');
  } catch (error) {
    const message = String(error?.message || error || '');
    if (message.includes('Duplicate column name')) {
      console.log('Coluna CLIENTE_ID já existia em TAREFAS');
    } else {
      throw error;
    }
  }

  const serverFunctions = extractServerFunctions(await listServerFunctionsMitra({ projectId }));
  const criarTarefaFn = serverFunctions.find((fn) => fn.name === 'criarTarefa');
  const listarTarefasFn = serverFunctions.find((fn) => fn.name === 'listarTarefas');

  if (!criarTarefaFn) {
    throw new Error('SF criarTarefa não encontrada');
  }
  if (!listarTarefasFn) {
    throw new Error('SF listarTarefas não encontrada');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: criarTarefaFn.id,
    code: `
INSERT INTO TAREFAS (
  VENDEDOR_ID,
  CLIENTE_ID,
  TITULO,
  DESCRICAO,
  STATUS,
  PRIORIDADE,
  DATA_LIMITE,
  CRIADO_EM
)
VALUES (
  :VAR_USER,
  NULLIF('{{clienteId}}', ''),
  '{{titulo}}',
  NULLIF('{{descricao}}', ''),
  'PENDENTE',
  '{{prioridade}}',
  NULLIF('{{dataLimite}}', ''),
  '{{criadoEm}}'
)
    `,
    description: 'Cria atividade do vendedor logado, opcionalmente vinculada ao cliente da visita',
  });
  console.log(`SF criarTarefa atualizada (ID ${criarTarefaFn.id})`);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: listarTarefasFn.id,
    code: `
SELECT
  T.ID,
  T.TITULO,
  T.DESCRICAO,
  T.STATUS,
  T.PRIORIDADE,
  T.DATA_LIMITE,
  T.CRIADO_EM,
  T.CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE
FROM TAREFAS T
LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
WHERE T.VENDEDOR_ID = :VAR_USER
  AND ('{{status}}' = '' OR T.STATUS = '{{status}}')
  AND ('{{prioridade}}' = '' OR T.PRIORIDADE = '{{prioridade}}')
ORDER BY
  CASE T.STATUS WHEN 'PENDENTE' THEN 1 WHEN 'EM_ANDAMENTO' THEN 2 WHEN 'CONCLUIDA' THEN 3 END,
  CASE T.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'BAIXA' THEN 3 END,
  T.DATA_LIMITE
    `,
    description: 'Lista atividades do vendedor logado com vínculo opcional ao cliente',
  });
  console.log(`SF listarTarefas atualizada (ID ${listarTarefasFn.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
