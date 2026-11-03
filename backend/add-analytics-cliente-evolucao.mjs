import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
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
const SOURCE_ID = 183;
const TARGET_NAME = 'analyticsRcaEvolucaoCliente';

function addClienteInput(code) {
  if (code.includes('CLIENTE_PARAM')) return code;
  return code.replace(
    `END AS RAMOS_PARAM,`,
    `END AS RAMOS_PARAM,
    CASE
      WHEN '{{cliente}}' = '' OR LOCATE('{', '{{cliente}}') > 0 THEN NULL
      ELSE REPLACE(TRIM('{{cliente}}'), '|', ',')
    END AS CLIENTE_PARAM,`,
  );
}

function addClienteFilterForAlias(code, alias) {
  if (code.includes(`FIND_IN_SET(TRIM(CAST(${alias}.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0`)) return code;
  const marker = `AND (
      P.RAMOS_PARAM IS NULL
      OR INSTR(
        CONCAT('|', P.RAMOS_PARAM, '|'),
        CONCAT('|', REPLACE(COALESCE(NULLIF(TRIM(CAST(${alias}.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo'), '''', ''), '|')
      ) > 0
    )`;
  const filter = `${marker}
    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(${alias}.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )`;
  return code.split(marker).join(filter);
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

async function smoke(serverFunctionId) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {
      scopeMode: 'ME',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      filiais: '',
      departamentos: '',
      secoes: '',
      ramos: '',
      cliente: '',
      limit: '50',
      offset: '0',
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status || 'Falha ao validar evolucao por cliente.');
  return extractRows(response).length;
}

async function main() {
  const source = await readServerFunctionMitra({ projectId, serverFunctionId: SOURCE_ID });
  const sourceCode = source?.result?.code || '';
  if (!sourceCode) throw new Error('Consulta base de evolucao nao encontrada.');

  const code = addClienteFilterForAlias(addClienteFilterForAlias(addClienteInput(sourceCode), 'V'), 'D');
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === TARGET_NAME);

  let serverFunctionId = existing?.id;
  if (serverFunctionId) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId,
      code,
      description: 'Evolucao de faturamento liquido filtrada por cliente na tela Analytics.',
    });
  } else {
    const created = await createServerFunctionMitra({
      projectId,
      name: TARGET_NAME,
      type: 'SQL',
      code,
      description: 'Evolucao de faturamento liquido filtrada por cliente na tela Analytics.',
    });
    serverFunctionId = created?.result?.serverFunctionId || created?.result?.id;
  }

  const rows = await smoke(serverFunctionId);
  console.log(JSON.stringify({ serverFunctionId, rows }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar evolucao por cliente no Analytics:');
  console.error(error?.message || error);
  process.exit(1);
});
