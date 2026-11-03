import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 39;

async function main() {
  const detail = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentCode = detail?.result?.code || '';

  const selectBlock = currentCode.split('FROM (')[0] || currentCode;
  if (selectBlock.includes('C.WINTHOR_CODCLI,')) {
    console.log('listarClientesDisponiveisMinhaBu já retorna WINTHOR_CODCLI.');
    return;
  }

  const updatedCode = currentCode.replace(
    '    C.SEGMENTO,\n',
    '    C.SEGMENTO,\n    C.WINTHOR_CODCLI,\n',
  );

  if (updatedCode === currentCode) {
    throw new Error('Não foi possível localizar o ponto de inserção de WINTHOR_CODCLI.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: updatedCode,
    description: detail?.result?.description || 'Lista clientes disponíveis para carteira.',
  });

  console.log('listarClientesDisponiveisMinhaBu atualizada para retornar WINTHOR_CODCLI.');
}

main().catch((error) => {
  console.error('Erro ao corrigir busca de clientes disponíveis:', error);
  process.exit(1);
});
