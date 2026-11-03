import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 104;

function rowsFromExecution(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return [];
    }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  return [];
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentCode = current?.result?.code || '';
  const before = `    SELECT :VAR_USER AS TARGET_USER_ID
    FROM PARAMS P
    WHERE P.SCOPE_MODE = 'ME'
       OR NOT EXISTS (SELECT 1 FROM COORD)`;
  const after = `    SELECT :VAR_USER AS TARGET_USER_ID
    FROM PARAMS P
    WHERE P.SCOPE_MODE = 'ME'`;

  if (!currentCode.includes(before)) {
    throw new Error('Trecho esperado da CTE TARGET não encontrado. Nenhuma alteração aplicada.');
  }

  const nextCode = currentCode.replace(before, after);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: current?.result?.description || 'Calcula B/W semanal por carteira e escopo de vendedor.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {
      vendedorId: '15',
      scopeMode: 'SELLER',
      scopeUserId: '15',
      scopeCodRca: '86',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      ramoCliente: '',
      mes: '5',
      ano: '2026',
      semanaNumero: '3',
    },
  });

  const rows = rowsFromExecution(smoke);
  const total = rows.reduce((sum, row) => sum + Number(row.FECHAMENTO_MES || 0), 0);
  console.log(JSON.stringify({ updated: true, smokeRows: rows.length, smokeTotal: total }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir escopo da SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
