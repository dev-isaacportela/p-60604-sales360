import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const sfUpdates = {
  mixListar: {
    description: 'Lista cabeçalhos de mix salvos (PRODUCT_MIX).',
    code: `
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
      WHERE ('{{clienteId}}' = '' OR M.ID_CLIENTE = CAST('{{clienteId}}' AS UNSIGNED))
        AND ('{{usuarioId}}' = '' OR M.ID_USUARIO_CRIACAO = CAST('{{usuarioId}}' AS UNSIGNED))
      ORDER BY M.DT_CRIACAO DESC, M.ID DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  historicoPedidosCliente: {
    description: 'Histórico paginado de pedidos TOTVS do cliente dentro da carteira.',
    code: `
      SELECT
        BASE.PEDIDO_ID,
        BASE.DATA_PEDIDO,
        BASE.STATUS_PEDIDO,
        BASE.VALOR_TOTAL,
        BASE.MARGEM_MEDIA,
        BASE.TOTAL_ITENS
      FROM (
        SELECT
          CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
          MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
          'FATURADO' AS STATUS_PEDIDO,
          ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
          0 AS MARGEM_MEDIA,
          COUNT(*) AS TOTAL_ITENS,
          ROW_NUMBER() OVER (ORDER BY MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) DESC, CAST(VT.NUMPED AS SIGNED) DESC) AS RN
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
      ) BASE
      WHERE BASE.RN > {{offset}}
        AND BASE.RN <= ({{offset}} + {{limit}})
      ORDER BY BASE.RN
    `,
  },
  historicoResumoPedidosCliente: {
    description: 'Resumo de ticket médio considerando apenas pedidos TOTVS do cliente.',
    code: `
      SELECT
        COUNT(*) AS TOTAL_PEDIDOS,
        ROUND(AVG(PED.VALOR_TOTAL), 2) AS TICKET_MEDIO
      FROM (
        SELECT
          ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL
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
      ) PED
    `,
  },
  detalhesPedidoCliente: {
    description: 'Detalhes de pedido TOTVS.',
    code: `
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
      WHERE VT.CODCLI = {{clienteId}}
        AND VT.NUMPED = {{pedidoId}}
        AND VT.COD_RCA IN (
          SELECT DISTINCT VR.COD_RCA
          FROM EQUIPE_CLIENTE EC
          LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
          JOIN VENDEDOR_RCA VR ON VR.USER_ID = EC.ID_VENDEDOR
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
        )
      ORDER BY ITEM_ID
    `,
  },
};

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];

  const updatedIds = {};

  for (const [name, payload] of Object.entries(sfUpdates)) {
    const found = existing.find((item) => item.name === name);
    if (!found) {
      throw new Error(`SF '${name}' não encontrada no projeto.`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: found.id,
      code: payload.code,
      description: payload.description,
    });

    updatedIds[name] = found.id;
  }

  console.log('SFs de mix/histórico atualizadas com sucesso.');
  console.log(JSON.stringify(updatedIds, null, 2));
}

main().catch((error) => {
  console.error('Erro ao atualizar SFs de mix/histórico:');
  console.error(error?.message || error);
  process.exit(1);
});
