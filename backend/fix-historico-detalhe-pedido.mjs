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

const detalhesPedidoCliente = `
SELECT *
FROM (
  SELECT
    ROW_NUMBER() OVER (ORDER BY VT.AUTO_ID) AS ITEM_ID,
    CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
    CAST(VT.CODPROD AS CHAR) AS PRODUTO_CODIGO,
    COALESCE(VT.DESCRICAO, CONCAT('Produto ', CAST(VT.CODPROD AS CHAR))) AS PRODUTO_NOME,
    COALESCE(VT.QT, 0) AS QUANTIDADE,
    ROUND(COALESCE(VT.VLUNIT, CASE WHEN COALESCE(VT.QT, 0) = 0 THEN VT.TOTAL ELSE VT.TOTAL / VT.QT END, 0), 2) AS PRECO_UNITARIO,
    0 AS DESCONTO_PERC,
    ROUND(COALESCE(VT.TOTAL, 0), 2) AS TOTAL_ITEM
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
  WHERE {{pedidoId}} > 0
    AND VT.CODCLI = {{clienteId}}
    AND VT.NUMPED = {{pedidoId}}
    AND VT.COD_RCA IN (
      SELECT DISTINCT VR.COD_RCA
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN VENDEDOR_RCA VR ON VR.USER_ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )

  UNION ALL

  SELECT
    ROW_NUMBER() OVER (ORDER BY MI.ID) AS ITEM_ID,
    -M.ID AS PEDIDO_ID,
    COALESCE(CAST(P.CODIGO AS CHAR), CAST(MI.ID_PRODUTO AS CHAR)) AS PRODUTO_CODIGO,
    COALESCE(P.NOME, CONCAT('Produto ', CAST(MI.ID_PRODUTO AS CHAR))) AS PRODUTO_NOME,
    MI.QUANTIDADE,
    ROUND(COALESCE(MI.PRECO_VENDA, 0), 2) AS PRECO_UNITARIO,
    0 AS DESCONTO_PERC,
    ROUND(COALESCE(MI.PRECO_VENDA, 0) * COALESCE(MI.QUANTIDADE, 0), 2) AS TOTAL_ITEM
  FROM PRODUCT_MIX M
  JOIN PRODUCT_MIX_ITEMS MI ON MI.ID_MIX = M.ID
  LEFT JOIN PRODUTOS P ON P.ID = MI.ID_PRODUTO
  WHERE {{pedidoId}} < 0
    AND M.ID = ABS({{pedidoId}})
    AND M.ID_CLIENTE = {{clienteId}}
    AND (
      M.ID_USUARIO_CRIACAO = :VAR_USER
      OR EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
        WHERE EC.ID_CLIENTE = M.ID_CLIENTE
          AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
      )
    )
) ITENS
ORDER BY ITEM_ID
`;

function getRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    output = JSON.parse(output);
  }
  return output?.rows || [];
}

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 26,
    code: detalhesPedidoCliente,
    description: 'Detalhes de pedido TOTVS ou itens de mix salvo.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 26,
    input: { clienteId: '167', pedidoId: '242014646' },
  });

  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(error || `Smoke test retornou status ${status}`);
  }

  const rows = getRows(smoke);
  if (rows.length === 0) {
    throw new Error('Smoke test não retornou itens para o pedido 242014646.');
  }

  console.log(JSON.stringify({ updated: 26, smokeRows: rows.length, firstItem: rows[0] }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir detalhe do pedido:');
  console.error(error?.message || error);
  process.exit(1);
});
