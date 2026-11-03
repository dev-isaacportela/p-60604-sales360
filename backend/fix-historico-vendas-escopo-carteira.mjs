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

const CARTEIRA_VENDAS_SCOPE_SQL = `
WITH
CARTEIRA_LOGADA_RAW AS (
  SELECT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE (
    EC.ID_VENDEDOR = :VAR_USER
    OR EXISTS (
      SELECT 1
      FROM FUNCIONARIOS FS
      WHERE FS.ID = EC.ID_VENDEDOR
        AND FS.ID_SUBSTITUTO = :VAR_USER
    )
    OR EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_DONO
      JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
      JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
      WHERE VR_DONO.USER_ID = EC.ID_VENDEDOR
        AND VR_SUB.USER_ID = :VAR_USER
        AND COALESCE(FV.ATIVO, TRUE) = TRUE
        AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
    )
  )
),
CARTEIRA_LOGADA AS (
  SELECT
    BASE.ID_CLIENTE,
    BASE.ID_VENDEDOR AS VENDEDOR_DONO_CLIENTE
  FROM (
    SELECT
      CLR.ID_CLIENTE,
      CLR.ID_VENDEDOR,
      ROW_NUMBER() OVER (
        PARTITION BY CLR.ID_CLIENTE
        ORDER BY
          CASE WHEN CLR.ID_VENDEDOR = :VAR_USER THEN 0 ELSE 1 END,
          CLR.ID_VENDEDOR
      ) AS RN
    FROM CARTEIRA_LOGADA_RAW CLR
  ) BASE
  WHERE BASE.RN = 1
),
BU_SCOPE AS (
  SELECT DISTINCT
    CL.VENDEDOR_DONO_CLIENTE AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM CARTEIRA_LOGADA CL
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = CL.VENDEDOR_DONO_CLIENTE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
BASE_VENDAS AS (
  SELECT
    V.*,
    CL.ID_CLIENTE AS CLIENTE_ID_INTERNO,
    CL.VENDEDOR_DONO_CLIENTE
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN CLIENTES CCLI
    ON (
      CAST(CCLI.ID AS CHAR) = CAST(V.CODCLI AS CHAR)
      OR CAST(CCLI.WINTHOR_CODCLI AS CHAR) = CAST(V.CODCLI AS CHAR)
    )
  JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = CCLI.ID
  JOIN BU_SCOPE B
    ON B.TARGET_USER_ID = CL.VENDEDOR_DONO_CLIENTE
    AND B.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
    AND B.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
    AND (
      (
        B.ID_SECAO IS NOT NULL
        AND (
          TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
          OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
        )
      )
      OR (
        B.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_SCOPE B2
          WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
            AND B2.CODFILIAL = B.CODFILIAL
            AND B2.CODEPTO = B.CODEPTO
            AND B2.ID_SECAO IS NOT NULL
            AND (
              TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
              OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
            )
        )
      )
    )
)
`;

const HISTORICO_PEDIDOS_SQL = `
${CARTEIRA_VENDAS_SCOPE_SQL},
PEDIDOS_BASE AS (
  SELECT
    CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
    MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
    'FATURADO' AS STATUS_PEDIDO,
    ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
    0 AS MARGEM_MEDIA,
    COUNT(*) AS TOTAL_ITENS
  FROM BASE_VENDAS VT
  WHERE VT.CLIENTE_ID_INTERNO = {{clienteId}}
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
    AND (
      M.ID_USUARIO_CRIACAO = :VAR_USER
      OR EXISTS (
        SELECT 1
        FROM CARTEIRA_LOGADA CL
        WHERE CL.ID_CLIENTE = M.ID_CLIENTE
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

const DETALHES_PEDIDO_SQL = `
${CARTEIRA_VENDAS_SCOPE_SQL}
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
  FROM BASE_VENDAS VT
  WHERE {{pedidoId}} > 0
    AND VT.CLIENTE_ID_INTERNO = {{clienteId}}
    AND VT.NUMPED = {{pedidoId}}

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
        FROM CARTEIRA_LOGADA CL
        WHERE CL.ID_CLIENTE = M.ID_CLIENTE
      )
    )
) ITENS
ORDER BY ITEM_ID
`;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function updateByName(name, payload) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const sf = listed.find((item) => item.name === name);
  if (!sf) throw new Error(`SF nao encontrada: ${name}`);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    ...payload,
  });

  console.log(`SF atualizada: ${name} (${sf.id})`);
  return sf.id;
}

async function main() {
  const ids = {};
  ids.historicoPedidosCliente = await updateByName('historicoPedidosCliente', {
    code: HISTORICO_PEDIDOS_SQL,
    description: 'Historico de pedidos do cliente usando o mesmo escopo de carteira, codigo externo e BU.',
  });
  ids.detalhesPedidoCliente = await updateByName('detalhesPedidoCliente', {
    code: DETALHES_PEDIDO_SQL,
    description: 'Itens do pedido do cliente usando o mesmo escopo de carteira, codigo externo e BU.',
  });

  console.log('Historico de vendas ajustado para escopo da carteira.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar historico de vendas:');
  console.error(error?.message || error);
  process.exit(1);
});
