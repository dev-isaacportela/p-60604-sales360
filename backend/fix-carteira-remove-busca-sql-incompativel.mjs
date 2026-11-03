import 'dotenv/config';
import {
  configureSdkMitra,
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
const TARGETS = [
  'minhaCarteiraClientes',
  'contarMinhaCarteiraClientes',
  'minhaCarteiraClientesRanking',
  'listarClientesDisponiveisMinhaBu',
  'contarClientesDisponiveisMinhaBu',
];

const MARKER = '/* busca_inteligente_clientes */';

function removeIncompatibleSearchBlock(code) {
  if (!code.includes(MARKER)) return code;

  const lines = code.split('\n');
  const nextLines = [];
  let skipping = false;

  for (const line of lines) {
    if (line.includes(MARKER)) {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (line.includes('OR SOUNDEX(C.RAZAO_SOCIAL)')) {
        skipping = false;
      }
      continue;
    }

    nextLines.push(line);
  }

  return nextLines.join('\n');
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];

  for (const name of TARGETS) {
    const match = serverFunctions.find((item) => item.name === name);
    if (!match?.id) continue;

    const detail = await readServerFunctionMitra({ projectId, serverFunctionId: match.id });
    const currentCode = detail?.result?.code || '';
    const updatedCode = removeIncompatibleSearchBlock(currentCode);

    if (updatedCode === currentCode) {
      console.log(`SF ${name} sem bloco incompatível.`);
      continue;
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: match.id,
      code: updatedCode,
      description: detail?.result?.description || match.description || '',
    });
    console.log(`SF ${name} corrigida.`);
  }
}

main().catch((error) => {
  console.error('Erro ao remover busca SQL incompatível:', error);
  process.exit(1);
});
