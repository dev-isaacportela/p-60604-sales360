import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const MIX_LISTAR_SQL = `
SELECT
  M.ID,
  M.NOME,
  M.DESCRICAO,
  M.ID_CLIENTE,
  M.ID_USUARIO_CRIACAO,
  M.TOTAL_CUSTO,
  M.TOTAL_VENDA,
  M.MARGEM_MEDIA,
  M.DT_CRIACAO,
  C.NOME_FANTASIA AS CLIENTE
FROM PRODUCT_MIX M
JOIN CLIENTES C ON C.ID = M.ID_CLIENTE
WHERE M.ID_USUARIO_CRIACAO = :VAR_USER
  AND ('{{clienteId}}' = '' OR M.ID_CLIENTE = CAST('{{clienteId}}' AS UNSIGNED))
ORDER BY M.DT_CRIACAO DESC, M.ID DESC
LIMIT {{limit}} OFFSET {{offset}}
`;

const MIX_ITENS_SQL = `
SELECT
  I.ID,
  I.ID_MIX,
  I.ID_PRODUTO,
  I.QUANTIDADE,
  I.TIPO_CUSTO,
  I.CUSTO_UNITARIO,
  I.MARGEM_PERCENT,
  I.PRECO_VENDA,
  I.PRECO_CONCORRENTE,
  I.CMV_PERCENT,
  P.CODIGO,
  P.NOME,
  P.CATEGORIA
FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
JOIN PRODUTOS P ON P.ID = I.ID_PRODUTO
WHERE I.ID_MIX = {{mixId}}
  AND M.ID_USUARIO_CRIACAO = :VAR_USER
ORDER BY I.ID
`;

async function update(serverFunctionId, code, description) {
  await updateServerFunctionMitra({ projectId, serverFunctionId, code, description });
}

async function smoke(serverFunctionId, input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou no smoke: ${error || status}`);
  }
}

async function main() {
  await update(92, MIX_LISTAR_SQL, 'Lista mixes salvos apenas do vendedor logado.');
  await update(93, MIX_ITENS_SQL, 'Lista itens apenas de mixes do vendedor logado.');

  await smoke(92, { clienteId: '', usuarioId: '', limit: '5', offset: '0' });
  await smoke(93, { mixId: '1' });

  console.log('Mix Builder ajustado para o vendedor logado.');
}

main().catch((error) => {
  console.error('Falha ao ajustar Mix Builder para vendedor logado:');
  console.error(error?.message || error);
  process.exit(1);
});
