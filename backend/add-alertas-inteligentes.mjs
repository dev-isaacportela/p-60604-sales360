import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ALERTAS_INTELIGENTES (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_VENDEDOR INT NOT NULL,
  CODFILIAL INT NOT NULL,
  ID_SECAO VARCHAR(20),
  ID_CLIENTE INT NOT NULL,
  NOME_CLIENTE VARCHAR(200),
  TIPO_ALERTA VARCHAR(50) NOT NULL,
  TITULO VARCHAR(200) NOT NULL,
  DESCRICAO TEXT,
  VALOR_REFERENCIA DECIMAL(15,2),
  PRIORIDADE ENUM('ALTA','MEDIA','BAIXA') DEFAULT 'MEDIA',
  LIDO TINYINT(1) DEFAULT 0,
  DATA_GERACAO DATETIME DEFAULT CURRENT_TIMESTAMP,
  DATA_LEITURA DATETIME NULL,
  MES_REFERENCIA VARCHAR(7),
  PRODUTO_REFERENCIA VARCHAR(200),
  INDEX idx_vendedor (ID_VENDEDOR, CODFILIAL),
  INDEX idx_cliente (ID_CLIENTE),
  INDEX idx_lido (LIDO),
  INDEX idx_tipo (TIPO_ALERTA)
)`;

const CLEANUP_SQL = `DELETE FROM ALERTAS_INTELIGENTES
WHERE DATA_GERACAO < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)`;

const POPULATE_SQL = `INSERT INTO ALERTAS_INTELIGENTES (
  ID_VENDEDOR,
  CODFILIAL,
  ID_SECAO,
  ID_CLIENTE,
  NOME_CLIENTE,
  TIPO_ALERTA,
  TITULO,
  DESCRICAO,
  VALOR_REFERENCIA,
  PRIORIDADE,
  LIDO,
  DATA_GERACAO,
  MES_REFERENCIA,
  PRODUTO_REFERENCIA
)
WITH CARTEIRA AS (
  SELECT DISTINCT
    EC.ID_VENDEDOR,
    CASE
      WHEN EC.CODFILIAL IS NOT NULL AND TRIM(CAST(EC.CODFILIAL AS CHAR)) REGEXP '^[0-9]+$'
        THEN CAST(TRIM(CAST(EC.CODFILIAL AS CHAR)) AS UNSIGNED)
      WHEN BV.CODFILIAL IS NOT NULL AND TRIM(CAST(BV.CODFILIAL AS CHAR)) REGEXP '^[0-9]+$'
        THEN CAST(TRIM(CAST(BV.CODFILIAL AS CHAR)) AS UNSIGNED)
      ELSE NULL
    END AS CODFILIAL,
    CASE
      WHEN EC.ID_SECAO IS NOT NULL AND TRIM(CAST(EC.ID_SECAO AS CHAR)) <> ''
        THEN LEFT(TRIM(CAST(EC.ID_SECAO AS CHAR)), 20)
      WHEN BV.ID_SECAO IS NOT NULL AND TRIM(CAST(BV.ID_SECAO AS CHAR)) <> ''
        THEN LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
      ELSE NULL
    END AS ID_SECAO,
    EC.ID_CLIENTE,
    LEFT(COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), NULLIF(TRIM(C.RAZAO_SOCIAL), ''), CONCAT('Cliente ', EC.ID_CLIENTE)), 200) AS NOME_CLIENTE,
    COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'Sem segmento') AS SEGMENTO,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM EQUIPE_CLIENTE EC
  JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
  JOIN BU_VENDEDOR BV
    ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
   AND COALESCE(BV.ATIVO, TRUE) = TRUE
   AND (
     (
       EC.CODFILIAL IS NOT NULL
       AND TRIM(CAST(EC.CODFILIAL AS CHAR)) <> ''
       AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = TRIM(CAST(EC.CODFILIAL AS CHAR))
       AND (
         (EC.ID_SECAO IS NULL AND BV.ID_SECAO IS NULL)
         OR LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20) = LEFT(TRIM(CAST(EC.ID_SECAO AS CHAR)), 20)
         OR LPAD(LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(EC.ID_SECAO AS CHAR)), 20)
       )
     )
     OR (
       (EC.CODFILIAL IS NULL OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = '')
       AND BV.CODFILIAL IS NOT NULL
       AND TRIM(CAST(BV.CODFILIAL AS CHAR)) <> ''
     )
     OR (
       (BV.CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = '')
       AND BV.ID_SECAO IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM BU_VENDEDOR BV2
         WHERE BV2.VENDEDOR_ID = EC.ID_VENDEDOR
           AND COALESCE(BV2.ATIVO, TRUE) = TRUE
           AND BV2.CODFILIAL IS NOT NULL
           AND TRIM(CAST(BV2.CODFILIAL AS CHAR)) <> ''
       )
     )
   )
  WHERE EC.ID_VENDEDOR IS NOT NULL
    AND __VENDEDOR_FILTER__
    AND EC.ID_CLIENTE IS NOT NULL
),
BASE_VENDAS AS (
  SELECT
    C.ID_VENDEDOR,
    COALESCE(C.CODFILIAL, CAST(TRIM(CAST(R.CODFILIAL AS CHAR)) AS UNSIGNED)) AS CODFILIAL,
    COALESCE(C.ID_SECAO, LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20)) AS ID_SECAO,
    C.ID_CLIENTE,
    C.NOME_CLIENTE,
    C.SEGMENTO,
    C.CODEPTO,
    R.CODPROD,
    LEFT(COALESCE(NULLIF(TRIM(R.DESCRICAO), ''), CONCAT('Produto ', R.CODPROD)), 200) AS PRODUTO,
    COALESCE(R.TOTAL, 0) AS VALOR,
    COALESCE(R.QT, 0) AS QT,
    STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') AS DATA_REF,
    COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), NULLIF(CAST(R.NUMTRANSVENDA AS CHAR), ''), NULLIF(CAST(R.NUMNOTA AS CHAR), ''), CONCAT('AUTO-', R.ID)) AS PEDIDO_CHAVE
  FROM CARTEIRA C
  JOIN PEDIDOS_SEMANAIS_SYNC_RAW R
    ON R.CLIENTE_ID = C.ID_CLIENTE
   AND TRIM(CAST(R.CODEPTO AS CHAR)) = C.CODEPTO
   AND (C.CODFILIAL IS NULL OR CAST(TRIM(CAST(R.CODFILIAL AS CHAR)) AS UNSIGNED) = C.CODFILIAL)
   AND (
     C.ID_SECAO IS NULL
     OR LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20) = C.ID_SECAO
     OR LPAD(LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20), 2, '0') = C.ID_SECAO
   )
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.CODPROD IS NOT NULL
    AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND R.DATA_SAIDA IS NOT NULL
    AND R.DATA_SAIDA <> ''
    AND R.DATA_SAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
),
PRODUTO_PERDIDO_BASE AS (
  SELECT
    BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.CODPROD, BV.PRODUTO,
    MAX(BV.DATA_REF) AS ULTIMA_COMPRA,
    ROUND(SUM(BV.VALOR) / GREATEST(COUNT(DISTINCT DATE_FORMAT(BV.DATA_REF, '%Y-%m')), 1), 2) AS MEDIA_MENSAL,
    ROW_NUMBER() OVER (PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE ORDER BY SUM(BV.VALOR) DESC) AS RN
  FROM BASE_VENDAS BV
  WHERE BV.DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
    AND BV.DATA_REF < DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH)
    AND NOT EXISTS (
      SELECT 1 FROM BASE_VENDAS REC
      WHERE REC.ID_VENDEDOR = BV.ID_VENDEDOR
        AND REC.CODFILIAL = BV.CODFILIAL
        AND ((REC.ID_SECAO IS NULL AND BV.ID_SECAO IS NULL) OR REC.ID_SECAO = BV.ID_SECAO)
        AND REC.ID_CLIENTE = BV.ID_CLIENTE
        AND REC.CODPROD = BV.CODPROD
        AND REC.DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH)
    )
  GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.CODPROD, BV.PRODUTO
),
SAZONALIDADE_BASE AS (
  SELECT
    BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.CODPROD, BV.PRODUTO,
    ROUND(SUM(BV.VALOR) / GREATEST(COUNT(DISTINCT YEAR(BV.DATA_REF)), 1), 2) AS MEDIA_MES,
    ROW_NUMBER() OVER (PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE ORDER BY SUM(BV.VALOR) DESC) AS RN
  FROM BASE_VENDAS BV
  WHERE MONTH(BV.DATA_REF) = MONTH(CURRENT_DATE)
    AND YEAR(BV.DATA_REF) = YEAR(CURRENT_DATE) - 1
    AND NOT EXISTS (
      SELECT 1 FROM BASE_VENDAS ATUAL
      WHERE ATUAL.ID_VENDEDOR = BV.ID_VENDEDOR
        AND ATUAL.CODFILIAL = BV.CODFILIAL
        AND ((ATUAL.ID_SECAO IS NULL AND BV.ID_SECAO IS NULL) OR ATUAL.ID_SECAO = BV.ID_SECAO)
        AND ATUAL.ID_CLIENTE = BV.ID_CLIENTE
        AND ATUAL.CODPROD = BV.CODPROD
        AND YEAR(ATUAL.DATA_REF) = YEAR(CURRENT_DATE)
        AND MONTH(ATUAL.DATA_REF) = MONTH(CURRENT_DATE)
    )
  GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.CODPROD, BV.PRODUTO
),
DATAS_PRODUTO AS (
  SELECT DISTINCT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE, CODPROD, PRODUTO, DATA_REF
  FROM BASE_VENDAS
  WHERE DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
),
INTERVALOS_PRODUTO AS (
  SELECT
    DP.*,
    DATEDIFF(DP.DATA_REF, LAG(DP.DATA_REF) OVER (PARTITION BY DP.ID_VENDEDOR, DP.CODFILIAL, DP.ID_SECAO, DP.ID_CLIENTE, DP.CODPROD ORDER BY DP.DATA_REF)) AS INTERVALO_DIAS
  FROM DATAS_PRODUTO DP
),
REPOSICAO_BASE AS (
  SELECT
    IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE, IP.NOME_CLIENTE, IP.CODPROD, IP.PRODUTO,
    MAX(IP.DATA_REF) AS ULTIMA_COMPRA,
    ROUND(AVG(IP.INTERVALO_DIAS)) AS CICLO_MEDIO_DIAS,
    DATE_ADD(MAX(IP.DATA_REF), INTERVAL ROUND(AVG(IP.INTERVALO_DIAS)) DAY) AS DATA_PREVISTA,
    ROW_NUMBER() OVER (PARTITION BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE ORDER BY DATE_ADD(MAX(IP.DATA_REF), INTERVAL ROUND(AVG(IP.INTERVALO_DIAS)) DAY)) AS RN
  FROM INTERVALOS_PRODUTO IP
  WHERE IP.INTERVALO_DIAS IS NOT NULL
    AND IP.INTERVALO_DIAS > 0
  GROUP BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE, IP.NOME_CLIENTE, IP.CODPROD, IP.PRODUTO
  HAVING DATA_PREVISTA BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
),
VOLUME_CLIENTE AS (
  SELECT
    BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE,
    ROUND(SUM(CASE WHEN BV.DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH) THEN BV.VALOR ELSE 0 END), 2) AS VALOR_ATUAL,
    ROUND(SUM(CASE WHEN BV.DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH) AND BV.DATA_REF < DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH) THEN BV.VALOR ELSE 0 END), 2) AS VALOR_ANTERIOR
  FROM BASE_VENDAS BV
  GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE
),
SEGMENTO_TOTAL AS (
  SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, SEGMENTO, COUNT(DISTINCT ID_CLIENTE) AS TOTAL_CLIENTES
  FROM CARTEIRA
  GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, SEGMENTO
),
SEGMENTO_PRODUTO AS (
  SELECT
    BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.SEGMENTO, BV.CODPROD, BV.PRODUTO,
    COUNT(DISTINCT BV.ID_CLIENTE) AS CLIENTES_COMPRARAM,
    ROUND(SUM(BV.VALOR), 2) AS VALOR_TOTAL,
    ROUND(SUM(BV.VALOR) / 12, 2) AS POTENCIAL_MENSAL
  FROM BASE_VENDAS BV
  WHERE BV.DATA_REF >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
  GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.SEGMENTO, BV.CODPROD, BV.PRODUTO
),
NAO_EXPLORADO_BASE AS (
  SELECT
    C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE, C.NOME_CLIENTE, SP.CODPROD, SP.PRODUTO,
    ROUND((SP.CLIENTES_COMPRARAM / GREATEST(ST.TOTAL_CLIENTES, 1)) * 100, 1) AS PERCENTUAL_CLIENTES,
    SP.POTENCIAL_MENSAL,
    ROW_NUMBER() OVER (PARTITION BY C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE ORDER BY SP.CLIENTES_COMPRARAM DESC, SP.POTENCIAL_MENSAL DESC) AS RN
  FROM CARTEIRA C
  JOIN SEGMENTO_PRODUTO SP
    ON SP.ID_VENDEDOR = C.ID_VENDEDOR
   AND SP.CODFILIAL = C.CODFILIAL
   AND ((SP.ID_SECAO IS NULL AND C.ID_SECAO IS NULL) OR SP.ID_SECAO = C.ID_SECAO)
   AND SP.CODEPTO = C.CODEPTO
   AND SP.SEGMENTO = C.SEGMENTO
  JOIN SEGMENTO_TOTAL ST
    ON ST.ID_VENDEDOR = C.ID_VENDEDOR
   AND ST.CODFILIAL = C.CODFILIAL
   AND ((ST.ID_SECAO IS NULL AND C.ID_SECAO IS NULL) OR ST.ID_SECAO = C.ID_SECAO)
   AND ST.CODEPTO = C.CODEPTO
   AND ST.SEGMENTO = C.SEGMENTO
  WHERE SP.CLIENTES_COMPRARAM >= 2
    AND NOT EXISTS (
      SELECT 1 FROM BASE_VENDAS OWN
      WHERE OWN.ID_VENDEDOR = C.ID_VENDEDOR
        AND OWN.CODFILIAL = C.CODFILIAL
        AND ((OWN.ID_SECAO IS NULL AND C.ID_SECAO IS NULL) OR OWN.ID_SECAO = C.ID_SECAO)
        AND OWN.ID_CLIENTE = C.ID_CLIENTE
        AND OWN.CODPROD = SP.CODPROD
    )
),
PEDIDOS AS (
  SELECT
    BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE,
    MAX(BV.DATA_REF) AS DATA_PEDIDO,
    ROUND(SUM(BV.VALOR), 2) AS VALOR_PEDIDO
  FROM BASE_VENDAS BV
  GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE
),
MEDIA_PEDIDO AS (
  SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, ROUND(AVG(VALOR_PEDIDO), 2) AS MEDIA_HISTORICA
  FROM PEDIDOS
  WHERE DATA_PEDIDO < DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
  GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE
),
PEDIDO_INCOMPLETO_BASE AS (
  SELECT
    P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE, P.NOME_CLIENTE,
    P.DATA_PEDIDO, P.VALOR_PEDIDO, MP.MEDIA_HISTORICA,
    ROW_NUMBER() OVER (PARTITION BY P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE ORDER BY P.DATA_PEDIDO DESC, P.VALOR_PEDIDO ASC) AS RN
  FROM PEDIDOS P
  JOIN MEDIA_PEDIDO MP
    ON MP.ID_VENDEDOR = P.ID_VENDEDOR
   AND MP.CODFILIAL = P.CODFILIAL
   AND ((MP.ID_SECAO IS NULL AND P.ID_SECAO IS NULL) OR MP.ID_SECAO = P.ID_SECAO)
   AND MP.ID_CLIENTE = P.ID_CLIENTE
  WHERE P.DATA_PEDIDO >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
    AND MP.MEDIA_HISTORICA > 0
    AND P.VALOR_PEDIDO < (MP.MEDIA_HISTORICA * 0.5)
),
GERADOS AS (
  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'PRODUTO_PERDIDO' AS TIPO_ALERTA,
    LEFT(CONCAT('Cliente parou de comprar ', PRODUTO), 200) AS TITULO,
    CONCAT('Última compra há ', TIMESTAMPDIFF(MONTH, ULTIMA_COMPRA, CURRENT_DATE), ' meses. Volume histórico: R$ ', FORMAT(MEDIA_MENSAL, 2), '/mês.') AS DESCRICAO,
    MEDIA_MENSAL AS VALOR_REFERENCIA,
    'ALTA' AS PRIORIDADE,
    DATE_FORMAT(CURRENT_DATE, '%Y-%m') AS MES_REFERENCIA,
    PRODUTO AS PRODUTO_REFERENCIA
  FROM PRODUTO_PERDIDO_BASE
  WHERE RN <= 3

  UNION ALL

  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'SAZONALIDADE_NAO_REPETIDA',
    LEFT(CONCAT('Oportunidade sazonal: ', PRODUTO), 200),
    CONCAT('No último ano, cliente costuma comprar ', PRODUTO, ' em ',
      CASE MONTH(CURRENT_DATE)
        WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março' WHEN 4 THEN 'Abril'
        WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho' WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto'
        WHEN 9 THEN 'Setembro' WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' ELSE 'Dezembro'
      END,
      ' — média R$ ', FORMAT(MEDIA_MES, 2), '.'),
    MEDIA_MES,
    'ALTA',
    DATE_FORMAT(CURRENT_DATE, '%Y-%m'),
    PRODUTO
  FROM SAZONALIDADE_BASE
  WHERE RN <= 3

  UNION ALL

  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'REPOSICAO_PREVISTA',
    LEFT(CONCAT('Reposição esperada: ', PRODUTO), 200),
    CONCAT('Ciclo médio: ', CICLO_MEDIO_DIAS, ' dias. Última compra: ', DATE_FORMAT(ULTIMA_COMPRA, '%d/%m/%Y'), '. Previsão: ', DATE_FORMAT(DATA_PREVISTA, '%d/%m/%Y'), '.'),
    NULL,
    'MEDIA',
    DATE_FORMAT(CURRENT_DATE, '%Y-%m'),
    PRODUTO
  FROM REPOSICAO_BASE
  WHERE RN <= 3

  UNION ALL

  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'VOLUME_CRESCENTE',
    'Cliente em crescimento',
    CONCAT('Volume +', ROUND(((VALOR_ATUAL - VALOR_ANTERIOR) / VALOR_ANTERIOR) * 100, 1), '% nos últimos 3 meses. Ótimo momento para ampliar mix.'),
    VALOR_ATUAL,
    'MEDIA',
    DATE_FORMAT(CURRENT_DATE, '%Y-%m'),
    NULL
  FROM VOLUME_CLIENTE
  WHERE VALOR_ANTERIOR > 0
    AND VALOR_ATUAL > (VALOR_ANTERIOR * 1.2)

  UNION ALL

  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'PRODUTO_NAO_EXPLORADO',
    LEFT(CONCAT('Produto não explorado: ', PRODUTO), 200),
    CONCAT(PERCENTUAL_CLIENTES, '% dos clientes do segmento compram este produto. Potencial estimado: R$ ', FORMAT(POTENCIAL_MENSAL, 2), '/mês.'),
    POTENCIAL_MENSAL,
    'BAIXA',
    DATE_FORMAT(CURRENT_DATE, '%Y-%m'),
    PRODUTO
  FROM NAO_EXPLORADO_BASE
  WHERE RN <= 3

  UNION ALL

  SELECT
    ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE,
    'PEDIDO_INCOMPLETO',
    'Pedido abaixo do padrão',
    CONCAT('Pedido de R$ ', FORMAT(VALOR_PEDIDO, 2), ' vs. média de R$ ', FORMAT(MEDIA_HISTORICA, 2), '. Oportunidade de complementar.'),
    VALOR_PEDIDO,
    'MEDIA',
    DATE_FORMAT(CURRENT_DATE, '%Y-%m'),
    NULL
  FROM PEDIDO_INCOMPLETO_BASE
  WHERE RN = 1
)
SELECT
  G.ID_VENDEDOR,
  G.CODFILIAL,
  G.ID_SECAO,
  G.ID_CLIENTE,
  G.NOME_CLIENTE,
  G.TIPO_ALERTA,
  G.TITULO,
  G.DESCRICAO,
  G.VALOR_REFERENCIA,
  G.PRIORIDADE,
  0 AS LIDO,
  CURRENT_TIMESTAMP AS DATA_GERACAO,
  G.MES_REFERENCIA,
  G.PRODUTO_REFERENCIA
FROM GERADOS G
WHERE NOT EXISTS (
  SELECT 1
  FROM ALERTAS_INTELIGENTES AI
  WHERE AI.ID_VENDEDOR = G.ID_VENDEDOR
    AND AI.CODFILIAL = G.CODFILIAL
    AND ((AI.ID_SECAO IS NULL AND G.ID_SECAO IS NULL) OR AI.ID_SECAO = G.ID_SECAO)
    AND AI.ID_CLIENTE = G.ID_CLIENTE
    AND AI.TIPO_ALERTA = G.TIPO_ALERTA
    AND COALESCE(AI.MES_REFERENCIA, '') = COALESCE(G.MES_REFERENCIA, '')
    AND COALESCE(AI.PRODUTO_REFERENCIA, '') = COALESCE(G.PRODUTO_REFERENCIA, '')
    AND COALESCE(AI.LIDO, 0) = 0
    AND AI.DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)
)`;

function buildPopularCode() {
  return `
const { runDmlMitra, runQueryMitra } = require('mitra-sdk');

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};
  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || ${projectId});
  if (!projectId) {
    return { rows: [{ STATUS: 'FAILED', MENSAGEM: 'projectId nao identificado.' }] };
  }

  await runDmlMitra({ projectId, sql: ${JSON.stringify(CLEANUP_SQL)} });

  const vendedoresRes = await runQueryMitra({
    projectId,
    sql: "SELECT DISTINCT VENDEDOR_ID FROM BU_VENDEDOR WHERE VENDEDOR_ID IS NOT NULL AND COALESCE(ATIVO, TRUE) = TRUE ORDER BY VENDEDOR_ID",
  });
  const vendedores = (vendedoresRes?.result?.rows || [])
    .map((row) => Number(row.VENDEDOR_ID || row.vendedor_id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);

  const existentesRes = await runQueryMitra({
    projectId,
    sql: "SELECT ID_VENDEDOR, COUNT(*) AS TOTAL FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY) GROUP BY ID_VENDEDOR",
  });
  const existentes = new Map((existentesRes?.result?.rows || []).map((row) => [Number(row.ID_VENDEDOR || 0), Number(row.TOTAL || 0)]));
  const force = ['true', '1', 'sim', 's'].includes(String(evt.force || '').toLowerCase());
  const refresh = ['true', '1', 'sim', 's'].includes(String(evt.refresh || evt.atualizar || '').toLowerCase());

  let avisosArquivados = 0;
  if (refresh) {
    const archiveRes = await runDmlMitra({
      projectId,
      sql: "UPDATE ALERTAS_INTELIGENTES SET LIDO = 1, DATA_LEITURA = CURRENT_TIMESTAMP WHERE COALESCE(LIDO, 0) = 0 AND DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)",
    });
    avisosArquivados = Number(archiveRes?.result?.rowCount || archiveRes?.result?.affectedRows || archiveRes?.rowCount || 0);
  }

  const vendedoresParaProcessar = refresh || force ? vendedores : vendedores.filter((id) => !existentes.has(id));

  const populateBase = ${JSON.stringify(POPULATE_SQL)};
  const processados = [];
  for (const vendedorId of vendedoresParaProcessar) {
    const sql = populateBase.replace('__VENDEDOR_FILTER__', 'EC.ID_VENDEDOR = ' + vendedorId);
    await runDmlMitra({ projectId, sql });
    processados.push(vendedorId);
  }

  const total = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)",
  });
  const porVendedor = await runQueryMitra({
    projectId,
    sql: "SELECT ID_VENDEDOR, COUNT(*) AS TOTAL FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY) GROUP BY ID_VENDEDOR ORDER BY TOTAL DESC, ID_VENDEDOR",
  });
  const row = total?.result?.rows?.[0] || {};
  return {
    rows: [
      {
        STATUS: 'OK',
        MODO: refresh ? 'REFRESH' : (force ? 'FORCE' : 'INCREMENTAL'),
        AVISOS_ARQUIVADOS: avisosArquivados,
        VENDEDORES_PROCESSADOS: processados.join(','),
        VENDEDORES_ATIVOS: vendedores.join(','),
        TOTAL_ALERTAS_ATIVOS: Number(row.TOTAL || 0),
      },
      ...(porVendedor?.result?.rows || []).map((item) => ({
        STATUS: 'COUNT_POR_VENDEDOR',
        ID_VENDEDOR: Number(item.ID_VENDEDOR || 0),
        TOTAL: Number(item.TOTAL || 0),
      })),
    ],
  };
}

return run();
`;
}

const serverFunctions = [
  {
    name: 'alertasInteligentesPopular',
    type: 'JAVASCRIPT',
    description: 'Limpa alertas antigos e gera alertas inteligentes da carteira comercial.',
    code: buildPopularCode(),
  },
  {
    name: 'alertasInteligentesListar',
    type: 'SQL',
    description: 'Lista alertas inteligentes com filtros por vendedor, escopo, tipo, prioridade, cliente e lido.',
    code: `
      WITH FILTRADO AS (
        SELECT
          AI.*,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE AI.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
              AI.DATA_GERACAO DESC,
              AI.ID DESC
          ) AS RN
        FROM ALERTAS_INTELIGENTES AI
        WHERE AI.ID_VENDEDOR = CASE
            WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED)
            ELSE :VAR_USER
          END
          AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR AI.CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
          AND (
            '{{idSecao}}' = ''
            OR LOCATE('{', '{{idSecao}}') > 0
            OR ('{{idSecao}}' = 'NULL' AND AI.ID_SECAO IS NULL)
            OR AI.ID_SECAO = '{{idSecao}}'
          )
          AND ('{{tipoAlerta}}' = '' OR LOCATE('{', '{{tipoAlerta}}') > 0 OR AI.TIPO_ALERTA = '{{tipoAlerta}}')
          AND ('{{prioridade}}' = '' OR LOCATE('{', '{{prioridade}}') > 0 OR AI.PRIORIDADE = '{{prioridade}}')
          AND ('{{idCliente}}' = '' OR LOCATE('{', '{{idCliente}}') > 0 OR AI.ID_CLIENTE = CAST('{{idCliente}}' AS UNSIGNED))
          AND (
            LOWER('{{somenteNaoLidos}}') NOT IN ('true', '1', 'sim', 's')
            OR AI.LIDO = 0
          )
      )
      SELECT
        ID,
        ID_VENDEDOR,
        CODFILIAL,
        ID_SECAO,
        ID_CLIENTE,
        NOME_CLIENTE,
        TIPO_ALERTA,
        TITULO,
        DESCRICAO,
        VALOR_REFERENCIA,
        PRIORIDADE,
        LIDO,
        DATE_FORMAT(DATA_GERACAO, '%Y-%m-%d %H:%i:%s') AS DATA_GERACAO,
        DATE_FORMAT(DATA_LEITURA, '%Y-%m-%d %H:%i:%s') AS DATA_LEITURA,
        MES_REFERENCIA,
        PRODUTO_REFERENCIA
      FROM FILTRADO
      WHERE RN <= CASE WHEN '{{limite}}' REGEXP '^[0-9]+$' THEN CAST('{{limite}}' AS UNSIGNED) ELSE 50 END
      ORDER BY RN
    `,
  },
  {
    name: 'alertasInteligentesMarcarLido',
    type: 'SQL',
    description: 'Marca um alerta inteligente como lido para o vendedor logado.',
    code: `
      UPDATE ALERTAS_INTELIGENTES
      SET LIDO = 1,
          DATA_LEITURA = CURRENT_TIMESTAMP
      WHERE ID = CAST('{{idAlerta}}' AS UNSIGNED)
        AND ID_VENDEDOR = :VAR_USER
    `,
  },
  {
    name: 'alertasInteligentesMarcarTodosLidos',
    type: 'SQL',
    description: 'Marca todos os alertas inteligentes não lidos do vendedor/escopo como lidos.',
    code: `
      UPDATE ALERTAS_INTELIGENTES
      SET LIDO = 1,
          DATA_LEITURA = CURRENT_TIMESTAMP
      WHERE ID_VENDEDOR = CASE
          WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED)
          ELSE :VAR_USER
        END
        AND LIDO = 0
        AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
        AND (
          '{{idSecao}}' = ''
          OR LOCATE('{', '{{idSecao}}') > 0
          OR ('{{idSecao}}' = 'NULL' AND ID_SECAO IS NULL)
          OR ID_SECAO = '{{idSecao}}'
        )
    `,
  },
  {
    name: 'alertasInteligentesContarNaoLidos',
    type: 'SQL',
    description: 'Conta alertas inteligentes não lidos do vendedor/escopo.',
    code: `
      SELECT COUNT(*) AS TOTAL
      FROM ALERTAS_INTELIGENTES
      WHERE ID_VENDEDOR = CASE
          WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED)
          ELSE :VAR_USER
        END
        AND LIDO = 0
        AND ('{{codFilial}}' = '' OR LOCATE('{', '{{codFilial}}') > 0 OR CODFILIAL = CAST('{{codFilial}}' AS UNSIGNED))
        AND (
          '{{idSecao}}' = ''
          OR LOCATE('{', '{{idSecao}}') > 0
          OR ('{{idSecao}}' = 'NULL' AND ID_SECAO IS NULL)
          OR ID_SECAO = '{{idSecao}}'
        )
    `,
  },
  {
    name: 'alertasInteligentesDetalheGrafico',
    type: 'SQL',
    description: 'Retorna o ciclo anual de compras do cliente para um produto, iniciando no mesmo mes do ano anterior.',
    code: `
      WITH MESES AS (
        SELECT 12 AS N UNION ALL SELECT 11 UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8
        UNION ALL SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4
        UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
      ),
      PARAMS AS (
        SELECT
          CASE WHEN '{{idCliente}}' REGEXP '^[0-9]+$' THEN CAST('{{idCliente}}' AS UNSIGNED) ELSE 0 END AS ID_CLIENTE_REF,
          CASE WHEN '{{idVendedor}}' REGEXP '^[0-9]+$' THEN CAST('{{idVendedor}}' AS UNSIGNED) ELSE :VAR_USER END AS ID_VENDEDOR_REF,
          CASE WHEN '{{codFilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codFilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_REF,
          CASE WHEN TRIM('{{idSecao}}') <> '' AND LOCATE('{', '{{idSecao}}') = 0 THEN LEFT(TRIM('{{idSecao}}'), 20) ELSE '' END AS ID_SECAO_REF,
          TRIM('{{codigoProduto}}') AS PRODUTO_REF
      ),
      PRODUTO_ALVO AS (
        SELECT
          PRODUTO_REF,
          UPPER(TRIM(PRODUTO_REF)) AS PRODUTO_TXT,
          TRIM(SUBSTRING_INDEX(PRODUTO_REF, '|', 1)) AS ANTES_PIPE,
          TRIM(SUBSTRING_INDEX(PRODUTO_REF, '|', -1)) AS DEPOIS_PIPE,
          TRIM(SUBSTRING_INDEX(PRODUTO_REF, ' - ', 1)) AS ANTES_HIFEN,
          TRIM(SUBSTRING_INDEX(PRODUTO_REF, ' - ', -1)) AS DEPOIS_HIFEN
        FROM PARAMS
      ),
      CALENDARIO AS (
        SELECT
          DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL M.N MONTH), '%Y-%m') AS MES_ANO,
          DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL M.N MONTH) AS DATA_MES
        FROM MESES M
      ),
      VENDAS AS (
        SELECT
          DATE_FORMAT(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d'), '%Y-%m') AS MES_ANO,
          ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VOLUME,
          COUNT(DISTINCT COALESCE(NULLIF(CAST(V.NUMPED AS CHAR), ''), NULLIF(CAST(V.NUMTRANSVENDA AS CHAR), ''), NULLIF(CAST(V.NUMNOTA AS CHAR), ''), CONCAT('AUTO-', CAST(V.CODPROD AS CHAR), '-', CAST(V.DTSAIDA AS CHAR)))) AS QTD_PEDIDOS
        FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
        JOIN CLIENTES C ON C.WINTHOR_CODCLI = V.CODCLI
        JOIN PARAMS P ON P.ID_CLIENTE_REF = C.ID
        JOIN PRODUTO_ALVO PA ON 1 = 1
        WHERE V.DTSAIDA IS NOT NULL
          AND V.DTSAIDA <> ''
          AND V.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 12 MONTH)
          AND STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d') < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
          AND TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
          AND (P.CODFILIAL_REF IS NULL OR CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) = P.CODFILIAL_REF)
          AND (
            P.ID_SECAO_REF = ''
            OR LEFT(TRIM(COALESCE(CAST(V.CODSEC AS CHAR), '')), 20) = P.ID_SECAO_REF
            OR LPAD(LEFT(TRIM(COALESCE(CAST(V.CODSEC AS CHAR), '')), 20), 2, '0') = P.ID_SECAO_REF
          )
          AND (
            PA.PRODUTO_REF = ''
            OR (PA.PRODUTO_REF REGEXP '^[0-9]+$' AND CAST(V.CODPROD AS CHAR) = PA.PRODUTO_REF)
            OR (PA.ANTES_PIPE REGEXP '^[0-9]+$' AND CAST(V.CODPROD AS CHAR) = PA.ANTES_PIPE)
            OR (PA.ANTES_HIFEN REGEXP '^[0-9]+$' AND CAST(V.CODPROD AS CHAR) = PA.ANTES_HIFEN)
            OR UPPER(TRIM(CAST(V.DESCRICAO AS CHAR))) = PA.PRODUTO_TXT
            OR UPPER(TRIM(CAST(V.DESCRICAO AS CHAR))) = UPPER(PA.DEPOIS_PIPE)
            OR UPPER(TRIM(CAST(V.DESCRICAO AS CHAR))) = UPPER(PA.DEPOIS_HIFEN)
            OR UPPER(CONCAT(CAST(V.CODPROD AS CHAR), ' - ', TRIM(CAST(V.DESCRICAO AS CHAR)))) = PA.PRODUTO_TXT
            OR (LENGTH(PA.PRODUTO_TXT) >= 5 AND UPPER(TRIM(CAST(V.DESCRICAO AS CHAR))) LIKE CONCAT('%', PA.PRODUTO_TXT, '%'))
            OR (LENGTH(TRIM(CAST(V.DESCRICAO AS CHAR))) >= 5 AND PA.PRODUTO_TXT LIKE CONCAT('%', UPPER(TRIM(CAST(V.DESCRICAO AS CHAR))), '%'))
          )
          AND EXISTS (
            SELECT 1
            FROM EQUIPE_CLIENTE EC
            JOIN BU_VENDEDOR BV
              ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
             AND COALESCE(BV.ATIVO, TRUE) = TRUE
             AND TRIM(CAST(V.CODEPTO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
            WHERE EC.ID_CLIENTE = C.ID
              AND EC.ID_VENDEDOR = P.ID_VENDEDOR_REF
              AND (
                (
                  EC.CODFILIAL IS NOT NULL
                  AND TRIM(CAST(EC.CODFILIAL AS CHAR)) <> ''
                  AND CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) = CAST(TRIM(CAST(EC.CODFILIAL AS CHAR)) AS UNSIGNED)
                  AND (
                    EC.ID_SECAO IS NULL
                    OR LEFT(TRIM(CAST(V.CODSEC AS CHAR)), 20) = LEFT(TRIM(CAST(EC.ID_SECAO AS CHAR)), 20)
                    OR LPAD(LEFT(TRIM(CAST(V.CODSEC AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(EC.ID_SECAO AS CHAR)), 20)
                  )
                )
                OR EC.CODFILIAL IS NULL
                OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = ''
              )
              AND (
                (
                  BV.CODFILIAL IS NOT NULL
                  AND TRIM(CAST(BV.CODFILIAL AS CHAR)) <> ''
                  AND CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) = CAST(TRIM(CAST(BV.CODFILIAL AS CHAR)) AS UNSIGNED)
                  AND (
                    BV.ID_SECAO IS NULL
                    OR LEFT(TRIM(CAST(V.CODSEC AS CHAR)), 20) = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
                    OR LPAD(LEFT(TRIM(CAST(V.CODSEC AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
                  )
                )
                OR (
                  (BV.CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = '')
                  AND BV.ID_SECAO IS NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM BU_VENDEDOR BV2
                    WHERE BV2.VENDEDOR_ID = EC.ID_VENDEDOR
                      AND COALESCE(BV2.ATIVO, TRUE) = TRUE
                      AND BV2.CODFILIAL IS NOT NULL
                      AND TRIM(CAST(BV2.CODFILIAL AS CHAR)) <> ''
                  )
                )
              )
          )
        GROUP BY DATE_FORMAT(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d'), '%Y-%m')
      )
      SELECT
        C.MES_ANO AS mesAno,
        COALESCE(V.VOLUME, 0) AS \`volumeR$\`,
        COALESCE(V.QTD_PEDIDOS, 0) AS qtdPedidos
      FROM CALENDARIO C
      LEFT JOIN VENDAS V ON V.MES_ANO = C.MES_ANO
      ORDER BY C.DATA_MES
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);
    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: sf.code,
        description: sf.description,
      });
      ids[sf.name] = found.id;
      console.log(`SF ${sf.name}: atualizada (ID ${found.id})`);
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: sf.type,
      code: sf.code,
      description: sf.description,
    });

    const sfId = created?.result?.serverFunctionId
      || created?.result?.id
      || created?.serverFunctionId
      || created?.id
      || null;
    ids[sf.name] = sfId;
    console.log(`SF ${sf.name}: criada (ID ${sfId})`);
  }

  return ids;
}

async function main() {
  await runDdlMitra({ projectId, sql: CREATE_TABLE_SQL });
  console.log('Tabela ALERTAS_INTELIGENTES garantida.');
  const ids = await upsertServerFunctions();
  console.log('Alertas inteligentes configurados com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar alertas inteligentes:');
  console.error(error?.message || error);
  process.exit(1);
});
