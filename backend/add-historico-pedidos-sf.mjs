import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;

const LISTAR_PEDIDOS_NOME = 'historicoPedidosCliente';
const DETALHES_PEDIDO_NOME = 'detalhesPedidoCliente';
const RESUMO_PEDIDOS_NOME = 'historicoResumoPedidosCliente';

const LISTAR_PEDIDOS_SQL = `
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
        COUNT(I.NUMPED) AS TOTAL_ITENS
      FROM BENENUTRI.PCPEDC C
      LEFT JOIN BENENUTRI.PCPEDI I ON I.NUMPED = C.NUMPED
      WHERE C.CODCLI = {{clienteId}}
      GROUP BY C.NUMPED, C.DATA, C.DTCANCEL, C.POSICAO, C.VLTOTAL
    ) BASE
  )
  WHERE RN > {{offset}}
    AND RN <= ({{offset}} + {{limit}})
  ORDER BY RN
`;

const RESUMO_PEDIDOS_SQL = `
  SELECT
    COUNT(*) AS TOTAL_PEDIDOS,
    ROUND(AVG(NVL(C.VLTOTAL, 0)), 2) AS TICKET_MEDIO
  FROM BENENUTRI.PCPEDC C
  WHERE C.CODCLI = {{clienteId}}
    AND C.DTCANCEL IS NULL
    AND NVL(C.POSICAO, 'X') <> 'C'
`;

const DETALHES_PEDIDO_SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY I.CODPROD, I.ROWID) AS ITEM_ID,
    I.NUMPED AS PEDIDO_ID,
    TO_CHAR(I.CODPROD) AS PRODUTO_CODIGO,
    NVL(P.DESCRICAO, TO_CHAR(I.CODPROD)) AS PRODUTO_NOME,
    NVL(I.QT, 0) AS QUANTIDADE,
    NVL(I.PVENDA, 0) AS PRECO_UNITARIO,
    NVL(I.PERDESC, 0) AS DESCONTO_PERC,
    ROUND(NVL(I.QT, 0) * NVL(I.PVENDA, 0) * (1 - NVL(I.PERDESC, 0) / 100), 2) AS TOTAL_ITEM
  FROM BENENUTRI.PCPEDI I
  JOIN BENENUTRI.PCPEDC C ON C.NUMPED = I.NUMPED
  LEFT JOIN BENENUTRI.PCPRODUT P ON P.CODPROD = I.CODPROD
  WHERE I.NUMPED = {{pedidoId}}
    AND C.CODCLI = {{clienteId}}
  ORDER BY I.CODPROD
`;

function extractId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function upsertSf(name, code, description) {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code,
      description,
      jdbcId: WINTHOR_JDBC_ID,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name,
    type: 'SQL',
    code,
    description,
    jdbcId: WINTHOR_JDBC_ID,
  });

  const id = extractId(created);
  if (!id) {
    throw new Error(`Não foi possível identificar ID da SF ${name}.`);
  }

  return id;
}

async function main() {
  const pedidosId = await upsertSf(
    LISTAR_PEDIDOS_NOME,
    LISTAR_PEDIDOS_SQL,
    'Lista pedidos/simulações de um cliente para histórico com total e quantidade de itens',
  );

  const detalhesId = await upsertSf(
    DETALHES_PEDIDO_NOME,
    DETALHES_PEDIDO_SQL,
    'Detalha produtos, preços, desconto e total dos itens de um pedido do cliente',
  );

  const resumoId = await upsertSf(
    RESUMO_PEDIDOS_NOME,
    RESUMO_PEDIDOS_SQL,
    'Retorna total de pedidos válidos e ticket médio por cliente',
  );

  console.log('SFs de histórico de pedidos configuradas com sucesso.');
  console.log(JSON.stringify({
    historicoPedidosCliente: pedidosId,
    detalhesPedidoCliente: detalhesId,
    historicoResumoPedidosCliente: resumoId,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar SFs de histórico de pedidos:');
  console.error(error?.message || error);
  process.exit(1);
});
