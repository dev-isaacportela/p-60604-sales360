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

const sfDefinitions = [
  {
    name: 'clienteDetalheVendasSemanais',
    description: 'Retorna resumo semanal de compras por cliente com total de pedidos e valor total.',
    code: `
      WITH PARAMS AS (
        SELECT
          CASE
            WHEN '{{ANO}}' = '' THEN YEAR(CURRENT_DATE)
            ELSE CAST('{{ANO}}' AS UNSIGNED)
          END AS ANO_REF,
          CASE
            WHEN '{{MES}}' = '' THEN NULL
            ELSE CAST('{{MES}}' AS UNSIGNED)
          END AS MES_REF
      )
      SELECT
        R.ANO,
        R.MES,
        R.SEMANA_NUMERO,
        DATE_FORMAT(MIN(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_INICIO_SEMANA,
        DATE_FORMAT(MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_FIM_SEMANA,
        COUNT(DISTINCT COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))) AS TOTAL_PEDIDOS,
        ROUND(SUM(R.VALOR), 2) AS VALOR_TOTAL_SEMANA
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R
      JOIN PARAMS P ON 1 = 1
      WHERE R.ATIVO = TRUE
        AND R.STATUS_INGESTAO = 'ATIVO'
        AND R.CLIENTE_ID = {{ID_CLIENTE}}
        AND R.ANO = P.ANO_REF
        AND (P.MES_REF IS NULL OR R.MES = P.MES_REF)
      GROUP BY R.ANO, R.MES, R.SEMANA_NUMERO
      ORDER BY R.ANO DESC, R.MES DESC, R.SEMANA_NUMERO DESC
    `,
  },
  {
    name: 'clienteDetalheItensSemana',
    description: 'Retorna produtos agregados da semana por cliente com quantidade total e valor total por produto.',
    code: `
      SELECT
        I.CODPROD,
        I.DESCRICAO AS DESCRICAO_PRODUTO,
        ROUND(SUM(COALESCE(I.QT, 0)), 6) AS QT_TOTAL_SEMANA,
        ROUND(
          CASE
            WHEN SUM(COALESCE(I.QT, 0)) = 0 THEN 0
            ELSE SUM(COALESCE(I.TOTAL, 0)) / SUM(COALESCE(I.QT, 0))
          END,
          6
        ) AS VALOR_UNITARIO,
        ROUND(SUM(COALESCE(I.TOTAL, 0)), 2) AS VALOR_TOTAL_PRODUTO_SEMANA
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA I
      JOIN CLIENTES C ON C.WINTHOR_CODCLI = I.CODCLI
      WHERE C.ID = {{ID_CLIENTE}}
        AND SUBSTRING(I.DTSAIDA, 1, 4) = CAST('{{ANO}}' AS CHAR)
        AND LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(I.DTSAIDA, 9, 2) AS UNSIGNED) / 7))) = {{SEMANA_NUMERO}}
        AND ('{{MES}}' = '' OR CAST(SUBSTRING(I.DTSAIDA, 6, 2) AS UNSIGNED) = CAST('{{MES}}' AS UNSIGNED))
        AND EXISTS (
          SELECT 1
          FROM RCA_DEPARTAMENTO RD
          WHERE RD.ATIVO = TRUE
            AND RD.COD_RCA = I.COD_RCA
            AND RD.COD_DEPARTAMENTO = CAST(I.CODEPTO AS CHAR)
        )
      GROUP BY
        I.CODPROD,
        I.DESCRICAO
      ORDER BY
        I.CODPROD
    `,
  },
  {
    name: 'clienteDetalheResumoPedidosSemana',
    description: 'Retorna resumo de pedidos da semana por cliente com valor total por pedido e data.',
    code: `
      SELECT
        CAST(I.NUMPED AS CHAR) AS NUMPEDIDO,
        ROUND(SUM(COALESCE(I.TOTAL, 0)), 2) AS VALOR_TOTAL_PEDIDO,
        DATE_FORMAT(MAX(STR_TO_DATE(I.DTSAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_PEDIDO
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA I
      JOIN CLIENTES C ON C.WINTHOR_CODCLI = I.CODCLI
      WHERE C.ID = {{ID_CLIENTE}}
        AND SUBSTRING(I.DTSAIDA, 1, 4) = CAST('{{ANO}}' AS CHAR)
        AND LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(I.DTSAIDA, 9, 2) AS UNSIGNED) / 7))) = {{SEMANA_NUMERO}}
        AND ('{{MES}}' = '' OR CAST(SUBSTRING(I.DTSAIDA, 6, 2) AS UNSIGNED) = CAST('{{MES}}' AS UNSIGNED))
        AND EXISTS (
          SELECT 1
          FROM RCA_DEPARTAMENTO RD
          WHERE RD.ATIVO = TRUE
            AND RD.COD_RCA = I.COD_RCA
            AND RD.COD_DEPARTAMENTO = CAST(I.CODEPTO AS CHAR)
        )
      GROUP BY CAST(I.NUMPED AS CHAR)
      ORDER BY MAX(STR_TO_DATE(I.DTSAIDA, '%Y-%m-%d')) ASC, CAST(I.NUMPED AS UNSIGNED)
    `,
  },
];

async function upsertSfs() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const definition of sfDefinitions) {
    const found = existing.find((item) => item.name === definition.name);

    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: definition.code,
        description: definition.description,
      });
      ids[definition.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: definition.name,
      type: 'SQL',
      code: definition.code,
      description: definition.description,
    });

    ids[definition.name] = created?.result?.serverFunctionId
      || created?.result?.id
      || created?.serverFunctionId
      || created?.id
      || null;
  }

  return ids;
}

async function main() {
  const sfIds = await upsertSfs();
  console.log(JSON.stringify({ sfIds }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao criar/atualizar SFs de detalhamento semanal por cliente:');
  console.error(error?.message || error);
  process.exit(1);
});
