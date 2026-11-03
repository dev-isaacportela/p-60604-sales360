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
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const HISTORICO_VISITAS_CLIENTE_ID = 22;

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

async function smoke(input) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: HISTORICO_VISITAS_CLIENTE_ID,
    input,
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Execucao finalizada com status ${status}`);
  }

  const rows = extractRows(response);
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.TIPO_REGISTRO || 'REGISTRO'}:${row.ID}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const duplicates = Array.from(counts.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    throw new Error(`Historico ainda retornou registros duplicados: ${JSON.stringify(duplicates)}`);
  }

  return rows.length;
}

async function main() {
  const current = await readServerFunctionMitra({
    projectId,
    serverFunctionId: HISTORICO_VISITAS_CLIENTE_ID,
  });
  const currentCode = String(current?.result?.code || '');
  if (!currentCode) throw new Error('Codigo atual da funcao historicoVisitasCliente nao encontrado.');

  const fixedCode = currentCode
    .replace(
      `FROM VISITAS V
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = V.CLIENTE_ID AND CS.VENDEDOR_DONO_CLIENTE = V.VENDEDOR_ID
  JOIN BU_SCOPE BS ON BS.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE
  WHERE V.CLIENTE_ID = {{clienteId}}`,
      `FROM VISITAS V
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = V.CLIENTE_ID AND CS.VENDEDOR_DONO_CLIENTE = V.VENDEDOR_ID
  WHERE V.CLIENTE_ID = {{clienteId}}
    AND EXISTS (
      SELECT 1
      FROM BU_SCOPE BS
      WHERE BS.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE
    )`,
    )
    .replace(
      `FROM TAREFAS T
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = T.CLIENTE_ID AND CS.VENDEDOR_DONO_CLIENTE = T.VENDEDOR_ID
  JOIN BU_SCOPE BS ON BS.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE
  WHERE T.CLIENTE_ID = {{clienteId}}`,
      `FROM TAREFAS T
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = T.CLIENTE_ID AND CS.VENDEDOR_DONO_CLIENTE = T.VENDEDOR_ID
  WHERE T.CLIENTE_ID = {{clienteId}}
    AND T.STATUS = 'CONCLUIDA'
    AND EXISTS (
      SELECT 1
      FROM BU_SCOPE BS
      WHERE BS.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE
    )`,
    );

  const alreadyFixed = currentCode.includes('AND T.STATUS = \'CONCLUIDA\'')
    && currentCode.includes('WHERE BS.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE');

  if (fixedCode !== currentCode) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: HISTORICO_VISITAS_CLIENTE_ID,
      code: fixedCode,
      description: 'Historico de visitas e tarefas concluidas do cliente sem duplicar por escopo de BU.',
    });
  } else if (!alreadyFixed) {
    throw new Error('Nenhuma alteracao aplicada: padrao esperado nao encontrado no SQL atual.');
  }

  const checkedRows = await smoke({
    clienteId: '1',
    status: '',
    dataInicio: '',
    dataFim: '',
    limit: '100',
    offset: '0',
    scopeMode: 'ME',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  });

  console.log(JSON.stringify({ historicoVisitasCliente: HISTORICO_VISITAS_CLIENTE_ID, checkedRows, alreadyFixed: fixedCode === currentCode }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir historico de tarefas duplicadas:');
  console.error(error?.message || error);
  process.exit(1);
});
