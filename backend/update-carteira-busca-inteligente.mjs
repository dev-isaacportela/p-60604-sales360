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

const EXTRA_SEARCH_SQL = `${MARKER}
      OR REPLACE(REPLACE(REPLACE(C.CNPJ, '.', ''), '/', ''), '-', '') LIKE CONCAT('%', REPLACE(REPLACE(REPLACE('{{busca}}', '.', ''), '/', ''), '-', ''), '%')
      OR REPLACE(REPLACE(REPLACE(CAST(C.WINTHOR_CODCLI AS CHAR), '.', ''), '/', ''), '-', '') LIKE CONCAT('%', REPLACE(REPLACE(REPLACE('{{busca}}', '.', ''), '/', ''), '-', ''), '%')
      OR SOUNDEX(C.NOME_FANTASIA) = SOUNDEX('{{busca}}')
      OR SOUNDEX(C.RAZAO_SOCIAL) = SOUNDEX('{{busca}}')`;

function patchSql(code, name) {
  if (code.includes(MARKER)) return code;

  const anchors = [
    "OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'",
    "OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'",
    "OR C.CNPJ LIKE '%{{busca}}%'",
  ];

  for (const anchor of anchors) {
    if (code.includes(anchor)) {
      return code.replace(anchor, `${anchor}\n      ${EXTRA_SEARCH_SQL}`);
    }
  }

  throw new Error(`Não foi possível localizar bloco de busca em ${name}.`);
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];

  for (const name of TARGETS) {
    const match = serverFunctions.find((item) => item.name === name);
    if (!match?.id) {
      console.log(`SF ${name} não encontrada; pulando.`);
      continue;
    }

    const detail = await readServerFunctionMitra({ projectId, serverFunctionId: match.id });
    const currentCode = detail?.result?.code || '';
    const updatedCode = patchSql(currentCode, name);

    if (updatedCode === currentCode) {
      console.log(`SF ${name} já estava com busca inteligente.`);
      continue;
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: match.id,
      code: updatedCode,
      description: detail?.result?.description || match.description || '',
    });
    console.log(`SF ${name} atualizada com busca inteligente.`);
  }
}

main().catch((error) => {
  console.error('Erro ao atualizar busca inteligente de clientes:', error);
  process.exit(1);
});
