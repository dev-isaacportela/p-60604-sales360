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

function patchSql(code) {
  return code
    .replace(
      "OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'\n        AND ('",
      "OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'\n    )\n    AND ('",
    )
    .replace(
      "OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'\n        AND ({{limit}}",
      "OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'\n    )\n    AND ({{limit}}",
    );
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];

  for (const name of TARGETS) {
    const match = serverFunctions.find((item) => item.name === name);
    if (!match?.id) continue;

    const detail = await readServerFunctionMitra({ projectId, serverFunctionId: match.id });
    const currentCode = detail?.result?.code || '';
    const updatedCode = patchSql(currentCode);

    if (updatedCode === currentCode) {
      console.log(`SF ${name} sem ajuste pendente.`);
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
  console.error('Erro ao corrigir fechamento da busca:', error);
  process.exit(1);
});
