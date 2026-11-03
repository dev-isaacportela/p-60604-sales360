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
const WINTHOR_JDBC_ID = 2;

const HISTORICO_VISITAS_SQL = `
  SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.TIPO, V.STATUS, V.RELATO
  FROM VISITAS V
  WHERE V.CLIENTE_ID = {{clienteId}}
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{periodoDias}}' = 'ALL'
      OR V.DATA_AGENDADA >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL {{periodoDias}} DAY), '%Y-%m-%d')
    )
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const HISTORICO_PEDIDOS_SQL = `
  SELECT
    PEDIDO_ID,
    DATA_PEDIDO,
    STATUS_PEDIDO,
    VALOR_TOTAL,
    MARGEM_MEDIA,
    TOTAL_ITENS
  FROM (
    SELECT
      BASE.PEDIDO_ID,
      BASE.DATA_PEDIDO,
      BASE.STATUS_PEDIDO,
      BASE.VALOR_TOTAL,
      BASE.MARGEM_MEDIA,
      BASE.TOTAL_ITENS,
      ROW_NUMBER() OVER (ORDER BY BASE.DATA_PEDIDO_RAW DESC, BASE.PEDIDO_ID DESC) AS RN
    FROM (
      SELECT
        C.NUMPED AS PEDIDO_ID,
        C.DATA AS DATA_PEDIDO_RAW,
        TO_CHAR(C.DATA, 'YYYY-MM-DD') AS DATA_PEDIDO,
        CASE
          WHEN C.DTCANCEL IS NOT NULL OR C.POSICAO = 'C' THEN 'CANCELADO'
          WHEN C.POSICAO = 'F' THEN 'FATURADO'
          WHEN C.POSICAO = 'B' THEN 'BLOQUEADO'
          WHEN C.POSICAO = 'L' THEN 'LIBERADO'
          WHEN C.POSICAO = 'P' THEN 'PENDENTE'
          ELSE NVL(C.POSICAO, 'DESCONHECIDO')
        END AS STATUS_PEDIDO,
        NVL(C.VLTOTAL, 0) AS VALOR_TOTAL,
        0 AS MARGEM_MEDIA,
        (
          SELECT COUNT(*)
          FROM BENENUTRI.PCPEDI I
          WHERE I.NUMPED = C.NUMPED
        ) AS TOTAL_ITENS
      FROM BENENUTRI.PCPEDC C
      WHERE C.CODCLI = {{clienteId}}
    ) BASE
  )
  WHERE RN > {{offset}}
    AND RN <= ({{offset}} + {{limit}})
  ORDER BY RN
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
  });

  return sf.id;
}

async function main() {
  const historicoVisitasId = await updateByName('historicoVisitasCliente', {
    code: HISTORICO_VISITAS_SQL,
    description: 'Historico de visitas de um cliente com filtros e paginacao',
  });

  const historicoPedidosId = await updateByName('historicoPedidosCliente', {
    code: HISTORICO_PEDIDOS_SQL,
    description: 'Lista pedidos de um cliente com paginacao',
    jdbcId: WINTHOR_JDBC_ID,
  });

  console.log('SFs de histórico atualizadas para paginação com sucesso.');
  console.log(JSON.stringify({ historicoVisitasCliente: historicoVisitasId, historicoPedidosCliente: historicoPedidosId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar SFs de histórico:');
  console.error(error?.message || error);
  process.exit(1);
});
