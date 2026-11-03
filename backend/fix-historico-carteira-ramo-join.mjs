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
const target = { id: 27, name: 'minhaCarteiraClientes' };

function ensureRamoJoin(code) {
  if (!/\bICT_RAMO\b/i.test(code)) return code;
  if (/\bJOIN\s+IMP_CLIENTES_TOTVS\s+ICT_RAMO\b/i.test(code)) return code;

  const join = `LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO
  ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
`;

  if (/FROM CLIENTES C\n/i.test(code)) {
    return code.replace(/FROM CLIENTES C\n/i, `FROM CLIENTES C\n${join}`);
  }

  throw new Error('Nao foi possivel encontrar FROM CLIENTES C para inserir join de ramo.');
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

async function smoke(input) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    input,
  });

  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Execucao finalizada com status ${status}`);
  }

  return extractRows(response).length;
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  const currentCode = String(current?.result?.code || '');
  const nextCode = ensureRamoJoin(currentCode);

  if (nextCode !== currentCode) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: target.id,
      code: nextCode,
      description: current?.result?.description || 'Lista clientes da carteira.',
    });
    console.log(`${target.name}: join de ramo adicionado.`);
  } else {
    console.log(`${target.name}: join de ramo ja estava correto.`);
  }

  const baseInput = {
    busca: '',
    idBu: '',
    limit: '1',
    offset: '0',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };

  const meRows = await smoke({ ...baseInput, scopeMode: 'ME' });
  const teamRows = await smoke({ ...baseInput, scopeMode: 'TEAM' });
  console.log(JSON.stringify({ [target.name]: target.id, meRows, teamRows }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir carteira do historico:');
  console.error(error?.message || error);
  process.exit(1);
});
