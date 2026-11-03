import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 104;

const oldBaseAtual = `BASE_ATUAL AS (
  SELECT
    E.TARGET_USER_ID AS VENDEDOR_ID,
    PS.CLIENTE_ID,
    PS.SEGMENTO,
    PS.SEMANA_NUMERO,
    PS.VALOR,
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo') AS RAMO_CLIENTE_FILTRADO
  FROM PEDIDOS_SEMANAIS_SYNC PS
  JOIN PARAMS P ON 1 = 1
  JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
    AND TRIM(CAST(E.CODFILIAL AS CHAR)) = TRIM(CAST(PS.CODFILIAL AS CHAR))
    AND TRIM(CAST(E.CODEPTO AS CHAR)) = TRIM(CAST(PS.CODEPTO AS CHAR))
    AND (
      TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(PS.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(PS.ID_SECAO AS CHAR))
    )
  LEFT JOIN CLIENTES C_FILTRO ON C_FILTRO.ID = PS.CLIENTE_ID
  LEFT JOIN CLIENTES_RAMO CR ON CR.CODCLI = CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID, PS.CLIENTE_ID) AS CHAR)
  WHERE PS.ATIVO = TRUE
    AND PS.ANO = P.ANO_REF
    AND PS.MES = P.MES_REF
    AND ('{{ramoCliente}}' = '' OR FIND_IN_SET(UPPER(COALESCE(CR.RAMO_CLIENTE, 'Sem ramo')), UPPER(REPLACE('{{ramoCliente}}', '|', ','))) > 0)
),`;

const newBaseAtual = `BASE_ATUAL AS (
  SELECT
    E.TARGET_USER_ID AS VENDEDOR_ID,
    E.ID_CLIENTE AS CLIENTE_ID,
    MAX(COALESCE(NULLIF(TRIM(CAST(V.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo')) AS SEGMENTO,
    CEIL(DAY(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d')) / 7) AS SEMANA_NUMERO,
    ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VALOR,
    COALESCE(MAX(NULLIF(TRIM(CAST(V.RAMO_CLIENTE AS CHAR)), '')), 'Sem ramo') AS RAMO_CLIENTE_FILTRADO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PARAMS P ON 1 = 1
  JOIN CLIENTES C_FILTRO
    ON TRIM(CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID) AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
  JOIN ESCOPO E ON E.ID_CLIENTE = C_FILTRO.ID
    AND TRIM(CAST(E.CODFILIAL AS CHAR)) = TRIM(CAST(V.CODFILIAL AS CHAR))
    AND TRIM(CAST(E.CODEPTO AS CHAR)) = TRIM(CAST(V.CODEPTO AS CHAR))
    AND (
      TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
    )
  WHERE V.DTSAIDA >= DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d')
    AND V.DTSAIDA <= DATE_FORMAT(LAST_DAY(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d')), '%Y-%m-%d')
    AND ('{{ramoCliente}}' = '' OR FIND_IN_SET(UPPER(COALESCE(NULLIF(TRIM(CAST(V.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo')), UPPER(REPLACE('{{ramoCliente}}', '|', ','))) > 0)
  GROUP BY E.TARGET_USER_ID, E.ID_CLIENTE, CEIL(DAY(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d')) / 7)
),`;

const oldBaseAnterior = `BASE_ANTERIOR AS (
  SELECT
    E.TARGET_USER_ID AS VENDEDOR_ID,
    PS.CLIENTE_ID,
    PS.SEMANA_NUMERO,
    PS.VALOR
  FROM PEDIDOS_SEMANAIS_SYNC PS
  JOIN PARAMS P ON 1 = 1
  JOIN PERIODO_ANTERIOR PA ON 1 = 1
  JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
    AND TRIM(CAST(E.CODFILIAL AS CHAR)) = TRIM(CAST(PS.CODFILIAL AS CHAR))
    AND TRIM(CAST(E.CODEPTO AS CHAR)) = TRIM(CAST(PS.CODEPTO AS CHAR))
    AND (
      TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(PS.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(PS.ID_SECAO AS CHAR))
    )
  LEFT JOIN CLIENTES C_FILTRO ON C_FILTRO.ID = PS.CLIENTE_ID
  LEFT JOIN CLIENTES_RAMO CR ON CR.CODCLI = CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID, PS.CLIENTE_ID) AS CHAR)
  WHERE PS.ATIVO = TRUE
    AND PS.MES = PA.MES_ANT
    AND PS.ANO = PA.ANO_ANT
    AND ('{{ramoCliente}}' = '' OR FIND_IN_SET(UPPER(COALESCE(CR.RAMO_CLIENTE, 'Sem ramo')), UPPER(REPLACE('{{ramoCliente}}', '|', ','))) > 0)
),`;

const newBaseAnterior = `BASE_ANTERIOR AS (
  SELECT
    E.TARGET_USER_ID AS VENDEDOR_ID,
    E.ID_CLIENTE AS CLIENTE_ID,
    CEIL(DAY(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d')) / 7) AS SEMANA_NUMERO,
    ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VALOR
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PARAMS P ON 1 = 1
  JOIN PERIODO_ANTERIOR PA ON 1 = 1
  JOIN CLIENTES C_FILTRO
    ON TRIM(CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID) AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
  JOIN ESCOPO E ON E.ID_CLIENTE = C_FILTRO.ID
    AND TRIM(CAST(E.CODFILIAL AS CHAR)) = TRIM(CAST(V.CODFILIAL AS CHAR))
    AND TRIM(CAST(E.CODEPTO AS CHAR)) = TRIM(CAST(V.CODEPTO AS CHAR))
    AND (
      TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
    )
  WHERE V.DTSAIDA >= DATE_FORMAT(STR_TO_DATE(CONCAT(PA.ANO_ANT, '-', LPAD(PA.MES_ANT, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d')
    AND V.DTSAIDA <= DATE_FORMAT(LAST_DAY(STR_TO_DATE(CONCAT(PA.ANO_ANT, '-', LPAD(PA.MES_ANT, 2, '0'), '-01'), '%Y-%m-%d')), '%Y-%m-%d')
    AND ('{{ramoCliente}}' = '' OR FIND_IN_SET(UPPER(COALESCE(NULLIF(TRIM(CAST(V.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo')), UPPER(REPLACE('{{ramoCliente}}', '|', ','))) > 0)
  GROUP BY E.TARGET_USER_ID, E.ID_CLIENTE, CEIL(DAY(STR_TO_DATE(V.DTSAIDA, '%Y-%m-%d')) / 7)
),`;

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentCode = current?.result?.code || '';

  if (!currentCode.includes(oldBaseAtual) || !currentCode.includes(oldBaseAnterior)) {
    throw new Error('Trechos esperados da SF 104 não encontrados. Nenhuma alteração aplicada.');
  }

  const nextCode = currentCode
    .replace(oldBaseAtual, newBaseAtual)
    .replace(oldBaseAnterior, newBaseAnterior);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: 'Calcula B/W semanal por carteira usando a mesma fonte de vendas do Analytics.',
  });

  console.log('SF 104 atualizada para usar IMP_VENDAS_DASHBOARD_TOTVS_RCA.');
}

main().catch((error) => {
  console.error('Falha ao atualizar SF 104:');
  console.error(error?.message || error);
  process.exit(1);
});
