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

const mixEnviadoExists = `
    EXISTS (
      SELECT 1
      FROM TAREFAS T
      WHERE T.CLIENTE_ID = M.ID_CLIENTE
        AND T.STATUS = 'CONCLUIDA'
        AND T.TITULO = CONCAT('Mix enviado: ', COALESCE(NULLIF(M.NOME, ''), CONCAT('Mix #', M.ID)))
        AND T.DESCRICAO LIKE '%Mix enviado diretamente pelo Mix Builder.%'
    )`;

const historicoPedidosCliente = `
WITH PEDIDOS_BASE AS (
  SELECT
    CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
    MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
    'FATURADO' AS STATUS_PEDIDO,
    ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
    0 AS MARGEM_MEDIA,
    COUNT(*) AS TOTAL_ITENS
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
  WHERE VT.CODCLI = {{clienteId}}
    AND VT.COD_RCA IN (
      SELECT DISTINCT VR.COD_RCA
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN VENDEDOR_RCA VR ON VR.USER_ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )
  GROUP BY VT.NUMPED
),
MIX_BASE AS (
  SELECT
    -M.ID AS PEDIDO_ID,
    SUBSTRING(M.DT_CRIACAO, 1, 10) AS DATA_PEDIDO,
    'MIX' AS STATUS_PEDIDO,
    ROUND(COALESCE(M.TOTAL_VENDA, 0), 2) AS VALOR_TOTAL,
    ROUND(COALESCE(M.MARGEM_MEDIA, 0), 2) AS MARGEM_MEDIA,
    COUNT(MI.ID) AS TOTAL_ITENS
  FROM PRODUCT_MIX M
  LEFT JOIN PRODUCT_MIX_ITEMS MI ON MI.ID_MIX = M.ID
  WHERE M.ID_CLIENTE = {{clienteId}}
    AND ${mixEnviadoExists}
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
  GROUP BY M.ID, M.DT_CRIACAO, M.TOTAL_VENDA, M.MARGEM_MEDIA
),
UNIFICADO AS (
  SELECT * FROM PEDIDOS_BASE
  UNION ALL
  SELECT * FROM MIX_BASE
),
PAGINADO AS (
  SELECT U.*, ROW_NUMBER() OVER (ORDER BY U.DATA_PEDIDO DESC, ABS(U.PEDIDO_ID) DESC) AS RN
  FROM UNIFICADO U
)
SELECT PEDIDO_ID, DATA_PEDIDO, STATUS_PEDIDO, VALOR_TOTAL, MARGEM_MEDIA, TOTAL_ITENS
FROM PAGINADO
WHERE RN > {{offset}}
  AND RN <= ({{offset}} + {{limit}})
ORDER BY RN
`;

const detalhesPedidoCliente = `
SELECT *
FROM (
  SELECT
    ROW_NUMBER() OVER (ORDER BY VT.AUTO_ID) AS ITEM_ID,
    CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
    CAST(VT.CODPROD AS CHAR) AS PRODUTO_CODIGO,
    COALESCE(VT.DESCRICAO, CONCAT('Produto ', CAST(VT.CODPROD AS CHAR))) AS PRODUTO_NOME,
    1 AS QUANTIDADE,
    ROUND(COALESCE(VT.TOTAL, 0), 2) AS PRECO_UNITARIO,
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
    COALESCE(CAST(P.CODPROD AS CHAR), CAST(MI.ID_PRODUTO AS CHAR)) AS PRODUTO_CODIGO,
    COALESCE(P.NOME, P.DESCRICAO, CONCAT('Produto ', CAST(MI.ID_PRODUTO AS CHAR))) AS PRODUTO_NOME,
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
    AND ${mixEnviadoExists}
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

async function update(id, code, description) {
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, code, description });
}

async function smoke(id, input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou no smoke: ${error || status}`);
}

async function main() {
  await update(25, historicoPedidosCliente, 'Histórico paginado de pedidos e mixes enviados do cliente dentro da carteira.');
  await update(26, detalhesPedidoCliente, 'Detalhes de pedido TOTVS ou itens de mix enviado.');

  await smoke(25, { clienteId: '1', limit: '5', offset: '0' });

  console.log('Histórico ajustado para listar apenas mixes enviados.');
}

main().catch((error) => {
  console.error('Falha ao ajustar histórico de mix:');
  console.error(error?.message || error);
  process.exit(1);
});
