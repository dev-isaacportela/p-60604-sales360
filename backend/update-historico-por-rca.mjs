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
const TENANT_JDBC_ID = 1;

const RCA_SCOPE_SQL = `
  SELECT DISTINCT VR.COD_RCA
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = EC.ID_VENDEDOR
  WHERE EC.ID_CLIENTE = {{clienteId}}
    AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
`;

const VENDEDOR_SCOPE_SQL = `
  SELECT DISTINCT EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE EC.ID_CLIENTE = {{clienteId}}
    AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
`;

const HISTORICO_VISITAS_SQL = `
  SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.TIPO, V.STATUS, V.RELATO
  FROM VISITAS V
  WHERE V.CLIENTE_ID = {{clienteId}}
    AND V.VENDEDOR_ID IN (${VENDEDOR_SCOPE_SQL})
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{periodoDias}}' = 'ALL'
      OR SUBSTRING(V.DATA_AGENDADA, 1, 10) >= DATE_FORMAT(
        DATE_SUB(CURRENT_DATE, INTERVAL CAST('{{periodoDias}}' AS UNSIGNED) DAY),
        '%Y-%m-%d'
      )
    )
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const HISTORICO_PEDIDOS_SQL = `
  SELECT
    BASE.PEDIDO_ID,
    BASE.DATA_PEDIDO,
    'FATURADO' AS STATUS_PEDIDO,
    BASE.VALOR_TOTAL,
    0 AS MARGEM_MEDIA,
    BASE.TOTAL_ITENS
  FROM (
    SELECT
      VT.NUMPED AS PEDIDO_ID,
      MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
      ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
      COUNT(*) AS TOTAL_ITENS,
      ROW_NUMBER() OVER (ORDER BY MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) DESC, VT.NUMPED DESC) AS RN
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = {{clienteId}}
      AND VT.COD_RCA IN (${RCA_SCOPE_SQL})
    GROUP BY VT.NUMPED
  ) BASE
  WHERE BASE.RN > {{offset}}
    AND BASE.RN <= ({{offset}} + {{limit}})
  ORDER BY BASE.RN
`;

const RESUMO_PEDIDOS_SQL = `
  SELECT
    COUNT(*) AS TOTAL_PEDIDOS,
    ROUND(AVG(PED.VALOR_TOTAL), 2) AS TICKET_MEDIO
  FROM (
    SELECT
      VT.NUMPED,
      ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = {{clienteId}}
      AND VT.COD_RCA IN (${RCA_SCOPE_SQL})
    GROUP BY VT.NUMPED
  ) PED
`;

const DETALHES_PEDIDO_SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY VT.AUTO_ID) AS ITEM_ID,
    VT.NUMPED AS PEDIDO_ID,
    CAST(VT.CODPROD AS CHAR) AS PRODUTO_CODIGO,
    COALESCE(VT.DESCRICAO, CONCAT('Produto ', CAST(VT.CODPROD AS CHAR))) AS PRODUTO_NOME,
    1 AS QUANTIDADE,
    ROUND(COALESCE(VT.TOTAL, 0), 2) AS PRECO_UNITARIO,
    0 AS DESCONTO_PERC,
    ROUND(COALESCE(VT.TOTAL, 0), 2) AS TOTAL_ITEM
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
  WHERE VT.CODCLI = {{clienteId}}
    AND VT.NUMPED = {{pedidoId}}
    AND VT.COD_RCA IN (${RCA_SCOPE_SQL})
  ORDER BY VT.AUTO_ID
`;

async function updateByName(name, payload) {
  const list = await listServerFunctionsMitra({ projectId });
  const sf = (list?.result || []).find((item) => item.name === name);

  if (!sf) {
    throw new Error(`SF não encontrada: ${name}`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    ...payload,
    jdbcId: TENANT_JDBC_ID,
  });

  return sf.id;
}

async function main() {
  const historicoVisitasId = await updateByName('historicoVisitasCliente', {
    code: HISTORICO_VISITAS_SQL,
    description: 'Histórico de visitas do cliente filtrado por vendedor/RCA da carteira do usuário.',
  });

  const historicoPedidosId = await updateByName('historicoPedidosCliente', {
    code: HISTORICO_PEDIDOS_SQL,
    description: 'Histórico de pedidos do cliente filtrado por RCA da carteira do usuário.',
  });

  const historicoResumoId = await updateByName('historicoResumoPedidosCliente', {
    code: RESUMO_PEDIDOS_SQL,
    description: 'Resumo de pedidos do cliente filtrado por RCA da carteira do usuário.',
  });

  const detalhesPedidoId = await updateByName('detalhesPedidoCliente', {
    code: DETALHES_PEDIDO_SQL,
    description: 'Itens do pedido do cliente filtrados por RCA da carteira do usuário.',
  });

  console.log('SFs de histórico ajustadas para escopo de RCA com sucesso.');
  console.log(
    JSON.stringify(
      {
        historicoVisitasCliente: historicoVisitasId,
        historicoPedidosCliente: historicoPedidosId,
        historicoResumoPedidosCliente: historicoResumoId,
        detalhesPedidoCliente: detalhesPedidoId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha ao ajustar histórico por RCA:');
  console.error(error?.message || error);
  process.exit(1);
});
