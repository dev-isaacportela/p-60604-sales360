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

const MIX_ITENS_PRODUTOS_CUSTOS_SQL = `
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
  CAST(COALESCE(PC.CODPROD, P.ID, I.ID_PRODUTO) AS CHAR) AS CODIGO,
  COALESCE(PC.NOME, P.NOME, CONCAT('Produto ', CAST(I.ID_PRODUTO AS CHAR))) AS NOME,
  CASE
    WHEN PC.CODPROD IS NOT NULL THEN CONCAT('Depto ', PC.DEPARTAMENTO_ID, ' / Seção ', PC.SECAO_ID)
    ELSE COALESCE(P.CATEGORIA, '')
  END AS CATEGORIA
FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
LEFT JOIN PRODUTOS_CUSTOS PC ON PC.CODPROD = I.ID_PRODUTO
LEFT JOIN PRODUTOS P ON P.ID = I.ID_PRODUTO
WHERE I.ID_MIX = {{mixId}}
  AND M.ID_USUARIO_CRIACAO = :VAR_USER
ORDER BY I.ID
`;

async function smokeMixItens() {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 93,
    input: { mixId: '1' },
  });

  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || status);
  }
}

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 93,
    code: MIX_ITENS_PRODUTOS_CUSTOS_SQL,
    description: 'Lista itens do mix usando PRODUTOS_CUSTOS como fonte principal por CODPROD.',
  });

  await smokeMixItens();
  console.log('mixItens atualizado para usar PRODUTOS_CUSTOS por CODPROD.');
}

main().catch((error) => {
  console.error('Falha ao atualizar mixItens:');
  console.error(error?.message || error);
  process.exit(1);
});
