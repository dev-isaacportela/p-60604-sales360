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
const DETALHE_GRAFICO_ID = 135;

const code = `
  WITH MESES AS (
    SELECT 12 AS N UNION ALL SELECT 11 UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8
    UNION ALL SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4
    UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
  ),
  PARAMS AS (
    SELECT
      CASE WHEN '{{idAlerta}}' REGEXP '^[0-9]+$' THEN CAST('{{idAlerta}}' AS UNSIGNED) ELSE 0 END AS ID_ALERTA_REF,
      CASE WHEN '{{idCliente}}' REGEXP '^[0-9]+$' THEN CAST('{{idCliente}}' AS UNSIGNED) ELSE 0 END AS ID_CLIENTE_REF,
      CASE WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED) ELSE :VAR_USER END AS ID_VENDEDOR_REF,
      CASE WHEN '{{codFilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codFilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_REF,
      CASE WHEN TRIM('{{idSecao}}') <> '' AND LOCATE('{', '{{idSecao}}') = 0 THEN LEFT(TRIM('{{idSecao}}'), 20) ELSE '' END AS ID_SECAO_REF,
      TRIM('{{codigoProduto}}') AS PRODUTO_REF
  ),
  ALERTA_REF AS (
    SELECT
      AI.ID,
      AI.ID_VENDEDOR,
      AI.ID_CLIENTE,
      AI.CODFILIAL,
      AI.ID_SECAO,
      AI.CODEPTO,
      AI.PRODUTO_REFERENCIA
    FROM ALERTAS_INTELIGENTES AI
    JOIN PARAMS P ON AI.ID = P.ID_ALERTA_REF
    LIMIT 1
  ),
  PRODUTO_ALVO AS (
    SELECT
      COALESCE(NULLIF(P.PRODUTO_REF, ''), AR.PRODUTO_REFERENCIA, '') AS PRODUTO_REF,
      UPPER(TRIM(COALESCE(NULLIF(P.PRODUTO_REF, ''), AR.PRODUTO_REFERENCIA, ''))) AS PRODUTO_TXT,
      TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(P.PRODUTO_REF, ''), AR.PRODUTO_REFERENCIA, ''), '|', 1)) AS ANTES_PIPE,
      TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(P.PRODUTO_REF, ''), AR.PRODUTO_REFERENCIA, ''), ' - ', 1)) AS ANTES_HIFEN
    FROM PARAMS P
    LEFT JOIN ALERTA_REF AR ON 1 = 1
  ),
  CALENDARIO AS (
    SELECT
      DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL M.N MONTH), '%Y-%m') AS MES_ANO,
      DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL M.N MONTH) AS DATA_MES
    FROM MESES M
  ),
  ESCOPO_ALERTA AS (
    SELECT
      P.ID_CLIENTE_REF,
      P.ID_VENDEDOR_REF,
      COALESCE(AR.CODFILIAL, P.CODFILIAL_REF) AS CODFILIAL_REF,
      COALESCE(NULLIF(AR.ID_SECAO, ''), NULLIF(P.ID_SECAO_REF, '')) AS ID_SECAO_REF,
      AR.CODEPTO AS CODEPTO_REF
    FROM PARAMS P
    LEFT JOIN ALERTA_REF AR ON 1 = 1
  ),
  VENDAS AS (
    SELECT
      DATE_FORMAT(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d'), '%Y-%m') AS MES_ANO,
      ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VOLUME,
      COUNT(DISTINCT COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), NULLIF(CAST(R.NUMTRANSVENDA AS CHAR), ''), NULLIF(CAST(R.NUMNOTA AS CHAR), ''), CONCAT('AUTO-', R.ID))) AS QTD_PEDIDOS
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO_ALERTA E ON CAST(R.CLIENTE_ID AS CHAR) = CAST(E.ID_CLIENTE_REF AS CHAR)
    JOIN PRODUTO_ALVO PA ON 1 = 1
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.DATA_SAIDA IS NOT NULL
      AND R.DATA_SAIDA <> ''
      AND LENGTH(R.DATA_SAIDA) >= 10
      AND STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 12 MONTH)
      AND STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
      AND (E.CODEPTO_REF IS NULL OR TRIM(CAST(R.CODEPTO AS CHAR)) = TRIM(CAST(E.CODEPTO_REF AS CHAR)))
      AND (E.CODFILIAL_REF IS NULL OR CAST(TRIM(CAST(R.CODFILIAL AS CHAR)) AS UNSIGNED) = E.CODFILIAL_REF)
      AND (
        E.ID_SECAO_REF IS NULL
        OR E.ID_SECAO_REF = ''
        OR LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20) = LEFT(TRIM(CAST(E.ID_SECAO_REF AS CHAR)), 20)
        OR LPAD(LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(E.ID_SECAO_REF AS CHAR)), 20)
      )
      AND (
        (PA.PRODUTO_REF REGEXP '^[0-9]+$' AND CAST(R.CODPROD AS CHAR) = PA.PRODUTO_REF)
        OR (PA.ANTES_PIPE REGEXP '^[0-9]+$' AND CAST(R.CODPROD AS CHAR) = PA.ANTES_PIPE)
        OR (PA.ANTES_HIFEN REGEXP '^[0-9]+$' AND CAST(R.CODPROD AS CHAR) = PA.ANTES_HIFEN)
        OR UPPER(TRIM(CAST(R.DESCRICAO AS CHAR))) = PA.PRODUTO_TXT
        OR UPPER(CONCAT(CAST(R.CODPROD AS CHAR), ' - ', TRIM(CAST(R.DESCRICAO AS CHAR)))) = PA.PRODUTO_TXT
        OR (LENGTH(PA.PRODUTO_TXT) >= 5 AND UPPER(TRIM(CAST(R.DESCRICAO AS CHAR))) LIKE CONCAT('%', PA.PRODUTO_TXT, '%'))
        OR (LENGTH(TRIM(CAST(R.DESCRICAO AS CHAR))) >= 5 AND PA.PRODUTO_TXT LIKE CONCAT('%', UPPER(TRIM(CAST(R.DESCRICAO AS CHAR))), '%'))
      )
      AND EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV
          ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
         AND COALESCE(BV.ATIVO, TRUE) = TRUE
         AND TRIM(CAST(R.CODEPTO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
         AND CAST(TRIM(CAST(R.CODFILIAL AS CHAR)) AS UNSIGNED) = CAST(TRIM(CAST(BV.CODFILIAL AS CHAR)) AS UNSIGNED)
         AND (
           BV.ID_SECAO IS NULL
           OR LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20) = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
           OR LPAD(LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
         )
        WHERE EC.ID_CLIENTE = E.ID_CLIENTE_REF
          AND EC.ID_VENDEDOR = E.ID_VENDEDOR_REF
      )
    GROUP BY DATE_FORMAT(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d'), '%Y-%m')
  )
  SELECT
    C.MES_ANO AS mesAno,
    COALESCE(V.VOLUME, 0) AS \`volumeR$\`,
    COALESCE(V.QTD_PEDIDOS, 0) AS qtdPedidos
  FROM CALENDARIO C
  LEFT JOIN VENDAS V ON V.MES_ANO = C.MES_ANO
  ORDER BY C.DATA_MES
`;

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: DETALHE_GRAFICO_ID,
    code,
    description: 'Retorna o ciclo anual de compras do cliente para um produto usando o mesmo escopo completo do alerta.',
  });
  console.log('SF de detalhe do gráfico atualizada.');

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: DETALHE_GRAFICO_ID,
    input: {
      idAlerta: '4236',
      idCliente: '39',
      codigoProduto: 'BIATAIN SILICONE 17,5X17,5 CUR ESPUM STD',
      idVendedor: '11',
      codFilial: '1',
      idSecao: '203',
    },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou com status ${status}`);

  const rows = extractRows(smoke);
  const total = rows.reduce((sum, row) => sum + Number(row['volumeR$'] || row.VOLUME_RS || row.VOLUME || 0), 0);
  if (total <= 0) throw new Error('Smoke retornou gráfico sem volume.');
  console.log(JSON.stringify({ rows: rows.slice(0, 13), total }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
