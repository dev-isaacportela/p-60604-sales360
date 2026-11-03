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
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
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
  name: 'prospeccaoSemanalCarteira',
  description: 'Lista clientes da carteira do vendedor logado por tendencia de recompra semanal.',
  type: 'SQL',
  code: `
    WITH CARTEIRA_LOGADA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = :VAR_USER
         OR F.ID_SUBSTITUTO = :VAR_USER
    ),
    HISTORICO_BASE AS (
      SELECT
        R.CLIENTE_ID,
        STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') AS DATA_COMPRA,
        COALESCE(
          NULLIF(CAST(R.NUMPED AS CHAR), ''),
          NULLIF(CAST(R.NUMTRANSVENDA AS CHAR), ''),
          NULLIF(CAST(R.NUMNOTA AS CHAR), ''),
          CONCAT('AUTO-', CAST(R.ID AS CHAR))
        ) AS PEDIDO_CHAVE
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = R.CLIENTE_ID
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.CLIENTE_ID IS NOT NULL
        AND R.DATA_SAIDA IS NOT NULL
        AND R.DATA_SAIDA <> ''
    ),
    HISTORICO_DIAS AS (
      SELECT DISTINCT
        HB.CLIENTE_ID,
        HB.DATA_COMPRA
      FROM HISTORICO_BASE HB
      WHERE HB.DATA_COMPRA IS NOT NULL
    ),
    HISTORICO_ORDENS AS (
      SELECT DISTINCT
        HB.CLIENTE_ID,
        HB.PEDIDO_CHAVE
      FROM HISTORICO_BASE HB
      WHERE HB.DATA_COMPRA IS NOT NULL
        AND HB.PEDIDO_CHAVE IS NOT NULL
        AND HB.PEDIDO_CHAVE <> ''
    ),
    INTERVALOS AS (
      SELECT
        HD.CLIENTE_ID,
        DATEDIFF(
          HD.DATA_COMPRA,
          LAG(HD.DATA_COMPRA) OVER (PARTITION BY HD.CLIENTE_ID ORDER BY HD.DATA_COMPRA)
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
    ULTIMA_COMPRA AS (
      SELECT
        HD.CLIENTE_ID,
        MAX(HD.DATA_COMPRA) AS ULTIMA_COMPRA,
        DATEDIFF(CURRENT_DATE, MAX(HD.DATA_COMPRA)) AS DIAS_SEM_COMPRAR
      FROM HISTORICO_DIAS HD
      GROUP BY HD.CLIENTE_ID
    ),
    TOTAL_PEDIDOS AS (
      SELECT
        HO.CLIENTE_ID,
        COUNT(*) AS TOTAL_PEDIDOS_HISTORICO
      FROM HISTORICO_ORDENS HO
      GROUP BY HO.CLIENTE_ID
    ),
    SEMANA_ATUAL AS (
      SELECT LEAST(5, GREATEST(1, CEIL(DAY(CURRENT_DATE) / 7))) AS SEMANA_MES_ATUAL
    ),
    PADRAO_SEMANAL AS (
      SELECT
        HD.CLIENTE_ID,
        SUM(
          CASE
            WHEN LEAST(5, GREATEST(1, CEIL(DAY(HD.DATA_COMPRA) / 7))) = SA.SEMANA_MES_ATUAL THEN 1
            ELSE 0
          END
        ) AS COMPROU_NESSA_SEMANA_HISTORICO
      FROM HISTORICO_DIAS HD
      CROSS JOIN SEMANA_ATUAL SA
      WHERE HD.DATA_COMPRA >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
      GROUP BY HD.CLIENTE_ID
    ),
    BASE AS (
      SELECT
        CL.ID_CLIENTE,
        COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CONCAT('Cliente ', CL.ID_CLIENTE)) AS NOME_CLIENTE,
        CASE
          WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 15000 THEN 'A'
          WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 7000 THEN 'B'
          ELSE 'C'
        END AS CURVA,
        COALESCE(NULLIF(C.SEGMENTO, ''), 'Sem segmento') AS SEGMENTO,
        UC.ULTIMA_COMPRA,
        UC.DIAS_SEM_COMPRAR,
        COALESCE(CM.CICLO_MEDIO_DIAS, 0) AS CICLO_MEDIO_DIAS,
        COALESCE(PS.COMPROU_NESSA_SEMANA_HISTORICO, 0) AS COMPROU_NESSA_SEMANA_HISTORICO,
        COALESCE(TP.TOTAL_PEDIDOS_HISTORICO, 0) AS TOTAL_PEDIDOS_HISTORICO,
        CASE
          WHEN COALESCE(CM.CICLO_MEDIO_DIAS, 0) > 0
           AND UC.DIAS_SEM_COMPRAR >= (CM.CICLO_MEDIO_DIAS * 0.8)
            THEN 1
          ELSE 0
        END AS EM_JANELA_RECOMPRA,
        CASE
          WHEN COALESCE(PS.COMPROU_NESSA_SEMANA_HISTORICO, 0) >= 2 THEN 1
          ELSE 0
        END AS TEM_PADRAO_SEMANAL
      FROM CARTEIRA_LOGADA CL
      LEFT JOIN ULTIMA_COMPRA UC ON UC.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN CLIENTES C ON C.ID = CL.ID_CLIENTE
      LEFT JOIN PERFIL_COMPRA_CLIENTE PC ON PC.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN CICLO_MEDIO CM ON CM.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN PADRAO_SEMANAL PS ON PS.CLIENTE_ID = CL.ID_CLIENTE
      LEFT JOIN TOTAL_PEDIDOS TP ON TP.CLIENTE_ID = CL.ID_CLIENTE
    )
    SELECT
      B.ID_CLIENTE,
      B.NOME_CLIENTE,
      B.CURVA,
      B.SEGMENTO,
      CASE WHEN B.ULTIMA_COMPRA IS NULL THEN '' ELSE DATE_FORMAT(B.ULTIMA_COMPRA, '%Y-%m-%d') END AS ULTIMA_COMPRA,
      COALESCE(B.DIAS_SEM_COMPRAR, 0) AS DIAS_SEM_COMPRAR,
      B.CICLO_MEDIO_DIAS,
      CASE
        WHEN B.EM_JANELA_RECOMPRA = 1 AND B.TEM_PADRAO_SEMANAL = 1 THEN 'Alta'
        WHEN B.EM_JANELA_RECOMPRA = 1 OR B.TEM_PADRAO_SEMANAL = 1 THEN 'Media'
        ELSE 'Baixa'
      END AS TENDENCIA,
      B.TOTAL_PEDIDOS_HISTORICO
    FROM BASE B
    ORDER BY
      CASE
        WHEN B.EM_JANELA_RECOMPRA = 1 AND B.TEM_PADRAO_SEMANAL = 1 THEN 1
        WHEN B.EM_JANELA_RECOMPRA = 1 OR B.TEM_PADRAO_SEMANAL = 1 THEN 2
        ELSE 3
      END,
      COALESCE(B.DIAS_SEM_COMPRAR, 0) DESC,
      B.NOME_CLIENTE
  `,
};

async function main() {
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
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: sfDefinition.name,
    type: sfDefinition.type,
    code: sfDefinition.code,
    description: sfDefinition.description,
  });

  const sfId = created?.result?.serverFunctionId
    || created?.result?.id
    || created?.serverFunctionId
    || created?.id
    || null;

  console.log(JSON.stringify({ action: 'created', name: sfDefinition.name, id: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao criar/atualizar SF de prospeccao semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
