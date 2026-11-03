import 'dotenv/config';
import {
  configureSdkMitra,
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

const sfDefinition = {
  name: 'temperaturaClientesCarteira',
  description: 'Calcula temperatura dos clientes da carteira do vendedor logado com score de recência, frequência, tendência e visitas.',
  code: `
    WITH CARTEIRA_LOGADA AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.ID_VENDEDOR,
        TRIM(COALESCE(EC.CODFILIAL, '')) AS CODFILIAL,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = :VAR_USER
         OR F.ID_SUBSTITUTO = :VAR_USER
    ),
    ESCOPO_EXPLICITO AS (
      SELECT DISTINCT
        CL.ID_CLIENTE,
        CL.CODFILIAL,
        TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
        CL.ID_SECAO
      FROM CARTEIRA_LOGADA CL
      JOIN BU_VENDEDOR BV
        ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
       AND TRIM(COALESCE(BV.CODFILIAL, '')) = CL.CODFILIAL
       AND BV.ID_SECAO = CL.ID_SECAO
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND CL.CODFILIAL <> ''
        AND CL.ID_SECAO IS NOT NULL
    ),
    ESCOPO_FALLBACK_BU AS (
      SELECT DISTINCT
        CL.ID_CLIENTE,
        NULL AS CODFILIAL,
        TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
        NULL AS ID_SECAO
      FROM CARTEIRA_LOGADA CL
      JOIN BU_VENDEDOR BV
        ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND (BV.CODFILIAL IS NULL OR TRIM(COALESCE(BV.CODFILIAL, '')) = '')
        AND BV.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV2
          WHERE BV2.VENDEDOR_ID = CL.ID_VENDEDOR
            AND COALESCE(BV2.ATIVO, TRUE) = TRUE
            AND BV2.CODFILIAL IS NOT NULL
            AND TRIM(COALESCE(BV2.CODFILIAL, '')) <> ''
            AND BV2.ID_SECAO IS NOT NULL
        )
    ),
    ESCOPO_VENDEDOR AS (
      SELECT * FROM ESCOPO_EXPLICITO
      UNION
      SELECT * FROM ESCOPO_FALLBACK_BU
    ),
    CURVA_MANUAL AS (
      SELECT
        CL.ID_CLIENTE,
        MAX(UPPER(TRIM(COALESCE(EC.CURVA_CLASSIFICACAO, '')))) AS CURVA_MANUAL
      FROM CARTEIRA_LOGADA CL
      JOIN EQUIPE_CLIENTE EC
        ON EC.ID_CLIENTE = CL.ID_CLIENTE
       AND EC.ID_VENDEDOR = CL.ID_VENDEDOR
      WHERE COALESCE(NULLIF(TRIM(EC.CURVA_CLASSIFICACAO), ''), '') <> ''
      GROUP BY CL.ID_CLIENTE
    ),
    BASE_VENDAS AS (
      SELECT
        R.CLIENTE_ID,
        STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') AS DATA_REF,
        COALESCE(R.TOTAL, 0) AS VALOR
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.CLIENTE_ID IS NOT NULL
        AND R.DATA_SAIDA IS NOT NULL
        AND R.DATA_SAIDA <> ''
        AND EXISTS (
          SELECT 1
          FROM ESCOPO_VENDEDOR E
          WHERE E.ID_CLIENTE = R.CLIENTE_ID
            AND (
              (
                E.CODFILIAL IS NOT NULL
                AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
                AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
                AND R.ID_SECAO = E.ID_SECAO
              )
              OR (
                E.CODFILIAL IS NULL
                AND E.ID_SECAO IS NULL
                AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
              )
            )
        )
    ),
    HISTORICO_DIAS AS (
      SELECT DISTINCT
        BV.CLIENTE_ID,
        BV.DATA_REF
      FROM BASE_VENDAS BV
      WHERE BV.DATA_REF IS NOT NULL
    ),
    ULTIMA_COMPRA AS (
      SELECT
        HD.CLIENTE_ID,
        MAX(HD.DATA_REF) AS ULTIMA_COMPRA,
        DATEDIFF(CURRENT_DATE, MAX(HD.DATA_REF)) AS DIAS_SEM_COMPRAR
      FROM HISTORICO_DIAS HD
      GROUP BY HD.CLIENTE_ID
    ),
    INTERVALOS AS (
      SELECT
        HD.CLIENTE_ID,
        DATEDIFF(
          HD.DATA_REF,
          LAG(HD.DATA_REF) OVER (PARTITION BY HD.CLIENTE_ID ORDER BY HD.DATA_REF)
        ) AS INTERVALO_DIAS
      FROM HISTORICO_DIAS HD
    ),
    CICLO_MEDIO AS (
      SELECT
        I.CLIENTE_ID,
        ROUND(AVG(I.INTERVALO_DIAS)) AS CICLO_MEDIO_DIAS
      FROM INTERVALOS I
      WHERE I.INTERVALO_DIAS IS NOT NULL
        AND I.INTERVALO_DIAS > 0
      GROUP BY I.CLIENTE_ID
    ),
    TENDENCIA_BASE AS (
      SELECT
        BV.CLIENTE_ID,
        ROUND(SUM(CASE
          WHEN BV.DATA_REF >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
            THEN BV.VALOR
          ELSE 0
        END), 2) AS VALOR_ULTIMOS_2_MESES,
        ROUND(SUM(CASE
          WHEN BV.DATA_REF >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 4 MONTH)
           AND BV.DATA_REF < DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
            THEN BV.VALOR
          ELSE 0
        END), 2) AS VALOR_2_MESES_ANTERIORES
      FROM BASE_VENDAS BV
      GROUP BY BV.CLIENTE_ID
    ),
    TENDENCIA AS (
      SELECT
        TB.CLIENTE_ID,
        TB.VALOR_ULTIMOS_2_MESES,
        TB.VALOR_2_MESES_ANTERIORES,
        CASE
          WHEN TB.VALOR_2_MESES_ANTERIORES > 0
            THEN ROUND(((TB.VALOR_ULTIMOS_2_MESES - TB.VALOR_2_MESES_ANTERIORES) / TB.VALOR_2_MESES_ANTERIORES) * 100, 2)
          WHEN TB.VALOR_ULTIMOS_2_MESES > 0 THEN 100
          ELSE 0
        END AS VARIACAO_PERCENTUAL
      FROM TENDENCIA_BASE TB
    ),
    ULTIMA_VISITA AS (
      SELECT
        V.CLIENTE_ID,
        MAX(STR_TO_DATE(V.DATA_AGENDADA, '%Y-%m-%d')) AS ULTIMA_VISITA
      FROM VISITAS V
      WHERE V.VENDEDOR_ID = :VAR_USER
        AND V.STATUS <> 'CANCELADA'
        AND V.DATA_AGENDADA IS NOT NULL
        AND V.DATA_AGENDADA <> ''
        AND STR_TO_DATE(V.DATA_AGENDADA, '%Y-%m-%d') <= CURRENT_DATE
      GROUP BY V.CLIENTE_ID
    ),
    BASE AS (
      SELECT
        CL.ID_CLIENTE,
        COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CONCAT('Cliente ', CL.ID_CLIENTE)) AS NOME_CLIENTE,
        COALESCE(
          CMAN.CURVA_MANUAL,
          CASE
            WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 15000 THEN 'A'
            WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 7000 THEN 'B'
            ELSE 'C'
          END
        ) AS CURVA,
        COALESCE(NULLIF(C.SEGMENTO, ''), 'Sem segmento') AS SEGMENTO,
        UC.ULTIMA_COMPRA,
        UV.ULTIMA_VISITA,
        COALESCE(UC.DIAS_SEM_COMPRAR, 9999) AS DIAS_SEM_COMPRAR,
        COALESCE(CM.CICLO_MEDIO_DIAS, 0) AS CICLO_MEDIO_DIAS,
        COALESCE(T.VARIACAO_PERCENTUAL, 0) AS VARIACAO_PERCENTUAL
      FROM CARTEIRA_LOGADA CL
      LEFT JOIN CLIENTES C ON C.ID = CL.ID_CLIENTE
      LEFT JOIN PERFIL_COMPRA_CLIENTE PC ON PC.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN CURVA_MANUAL CMAN ON CMAN.ID_CLIENTE = CL.ID_CLIENTE
      LEFT JOIN ULTIMA_COMPRA UC ON UC.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN CICLO_MEDIO CM ON CM.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN TENDENCIA T ON T.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN ULTIMA_VISITA UV ON UV.CLIENTE_ID = CL.ID_CLIENTE
    ),
    PONTOS AS (
      SELECT
        B.*,
        CASE
          WHEN B.DIAS_SEM_COMPRAR < 30 THEN 30
          WHEN B.DIAS_SEM_COMPRAR < 60 THEN 20
          WHEN B.DIAS_SEM_COMPRAR < 90 THEN 10
          ELSE 0
        END AS PONTOS_RECENCIA,
        CASE
          WHEN B.CICLO_MEDIO_DIAS <= 0 THEN 0
          WHEN B.DIAS_SEM_COMPRAR <= (B.CICLO_MEDIO_DIAS * 1.1) THEN 25
          WHEN B.DIAS_SEM_COMPRAR <= (B.CICLO_MEDIO_DIAS * 1.3) THEN 15
          WHEN B.DIAS_SEM_COMPRAR <= (B.CICLO_MEDIO_DIAS * 1.6) THEN 5
          ELSE 0
        END AS PONTOS_FREQUENCIA,
        CASE
          WHEN B.VARIACAO_PERCENTUAL > 10 THEN 25
          WHEN B.VARIACAO_PERCENTUAL >= -10 THEN 15
          WHEN B.VARIACAO_PERCENTUAL >= -30 THEN 5
          ELSE 0
        END AS PONTOS_TENDENCIA,
        CASE
          WHEN B.ULTIMA_VISITA IS NULL THEN 0
          WHEN DATEDIFF(CURRENT_DATE, B.ULTIMA_VISITA) < 30 THEN 20
          WHEN DATEDIFF(CURRENT_DATE, B.ULTIMA_VISITA) < 60 THEN 12
          WHEN DATEDIFF(CURRENT_DATE, B.ULTIMA_VISITA) < 90 THEN 5
          ELSE 0
        END AS PONTOS_VISITAS
      FROM BASE B
    )
    SELECT
      P.ID_CLIENTE,
      P.NOME_CLIENTE,
      P.CURVA,
      P.SEGMENTO,
      (P.PONTOS_RECENCIA + P.PONTOS_FREQUENCIA + P.PONTOS_TENDENCIA + P.PONTOS_VISITAS) AS SCORE_TOTAL,
      CASE
        WHEN (P.PONTOS_RECENCIA + P.PONTOS_FREQUENCIA + P.PONTOS_TENDENCIA + P.PONTOS_VISITAS) >= 70 THEN 'Quente'
        WHEN (P.PONTOS_RECENCIA + P.PONTOS_FREQUENCIA + P.PONTOS_TENDENCIA + P.PONTOS_VISITAS) >= 40 THEN 'Morno'
        ELSE 'Frio'
      END AS TEMPERATURA,
      CASE WHEN P.ULTIMA_COMPRA IS NULL THEN '' ELSE DATE_FORMAT(P.ULTIMA_COMPRA, '%Y-%m-%d') END AS ULTIMA_COMPRA,
      CASE WHEN P.ULTIMA_VISITA IS NULL THEN '' ELSE DATE_FORMAT(P.ULTIMA_VISITA, '%Y-%m-%d') END AS ULTIMA_VISITA,
      P.CICLO_MEDIO_DIAS,
      CASE WHEN P.DIAS_SEM_COMPRAR >= 9999 THEN 0 ELSE P.DIAS_SEM_COMPRAR END AS DIAS_SEM_COMPRAR
    FROM PONTOS P
    ORDER BY SCORE_TOTAL DESC, NOME_CLIENTE
  `,
};

async function upsertSf() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((item) => item.name === sfDefinition.name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: sfDefinition.code,
      description: sfDefinition.description,
    });
    console.log(JSON.stringify({ action: 'updated', name: sfDefinition.name, id: existing.id }, null, 2));
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: sfDefinition.name,
    type: 'SQL',
    code: sfDefinition.code,
    description: sfDefinition.description,
  });

  const sfId = created?.result?.serverFunctionId
    || created?.result?.id
    || created?.serverFunctionId
    || created?.id
    || null;

  console.log(JSON.stringify({ action: 'created', name: sfDefinition.name, id: sfId }, null, 2));
  return sfId;
}

async function main() {
  const sfId = await upsertSf();
  console.log('Temperatura de clientes configurada com sucesso.');
  console.log(JSON.stringify({ temperaturaClientesCarteira: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar temperatura de clientes:');
  console.error(error?.message || error);
  process.exit(1);
});
