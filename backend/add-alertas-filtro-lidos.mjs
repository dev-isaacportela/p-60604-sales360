// Adiciona o parametro opcional {{somenteLidos}} na SF alertasInteligentesListar,
// permitindo separar alertas pendentes (padrao), lidos e todos na tela de Alertas.
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

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SF_NAME = 'alertasInteligentesListar';

const NAO_LIDOS_BLOCK = `AND (
      LOWER('{{somenteNaoLidos}}') NOT IN ('true', '1', 'sim', 's')
      OR AI.LIDO = 0
    )`;

const LIDOS_BLOCK = `AND (
      LOWER('{{somenteLidos}}') NOT IN ('true', '1', 'sim', 's')
      OR AI.LIDO = 1
    )`;

async function run() {
  const listed = await listServerFunctionsMitra({ projectId });
  const rows = listed?.result || listed || [];
  const found = (Array.isArray(rows) ? rows : []).find((item) => (item?.name || item?.NAME) === SF_NAME);
  if (!found) throw new Error(`Server Function ${SF_NAME} nao encontrada.`);

  const serverFunctionId = Number(found.id ?? found.ID ?? found.serverFunctionId);
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current?.result?.code || '';

  if (/somenteLidos/.test(code)) {
    console.log(`SF ${SF_NAME} (ID ${serverFunctionId}) ja possui o filtro somenteLidos. Nada a fazer.`);
    return;
  }

  if (!code.includes(NAO_LIDOS_BLOCK)) {
    throw new Error('Nao foi possivel localizar o bloco de filtro somenteNaoLidos no SQL atual da SF.');
  }

  const nextCode = code.replace(NAO_LIDOS_BLOCK, `${NAO_LIDOS_BLOCK}\n    ${LIDOS_BLOCK}`);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: 'Lista alertas inteligentes com filtros por vendedor, escopo, tipo, prioridade, cliente, ramo e situacao de leitura (somenteNaoLidos / somenteLidos).',
  });

  console.log(`SF ${SF_NAME} (ID ${serverFunctionId}) atualizada com o filtro somenteLidos.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
