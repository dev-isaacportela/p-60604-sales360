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
];

const SEARCH_NEEDLE = "OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'";
const SEARCH_REPLACEMENT = `${SEARCH_NEEDLE}\n      OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'`;

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];

  for (const name of TARGETS) {
    const match = serverFunctions.find((item) => item.name === name);
    if (!match?.id) {
      throw new Error(`SF não encontrada: ${name}`);
    }

    const detail = await readServerFunctionMitra({
      projectId,
      serverFunctionId: match.id,
    });

    const currentCode = detail?.result?.code || '';
    if (!currentCode.includes(SEARCH_NEEDLE)) {
      throw new Error(`Trecho de busca não encontrado na SF ${name}.`);
    }

    if (currentCode.includes('WINTHOR_CODCLI')) {
      console.log(`SF ${name} já busca por WINTHOR_CODCLI.`);
      continue;
    }

    const updatedCode = currentCode.replace(SEARCH_NEEDLE, SEARCH_REPLACEMENT);

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: match.id,
      code: updatedCode,
      description: detail?.result?.description || match.description || '',
    });

    console.log(`SF ${name} atualizada com busca por código.`);
  }
}

main().catch((error) => {
  console.error('Erro ao atualizar busca por código da carteira:', error);
  process.exit(1);
});
