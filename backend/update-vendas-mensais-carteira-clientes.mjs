import 'dotenv/config';
import { configureSdkMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 2;

const code = `
SELECT
  SUBSTRING(V.DTSAIDA, 1, 4) AS ANO,
  SUBSTRING(V.DTSAIDA, 6, 2) AS MES,
  SUBSTRING(V.DTSAIDA, 1, 7) AS PERIODO,
  0 AS META,
  ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS REALIZADO
FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
JOIN (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
   WHERE EC.ID_VENDEDOR = :VAR_USER
      OR F.ID_SUBSTITUTO = :VAR_USER
) CARTEIRA_LOGADA ON CARTEIRA_LOGADA.ID_CLIENTE = V.CODCLI
JOIN VENDEDOR_RCA VR ON VR.USER_ID = CARTEIRA_LOGADA.ID_VENDEDOR AND VR.COD_RCA = V.COD_RCA
WHERE V.CODCLI IS NOT NULL
  AND V.COD_RCA IS NOT NULL
  AND V.DTSAIDA IS NOT NULL
GROUP BY SUBSTRING(V.DTSAIDA, 1, 7), SUBSTRING(V.DTSAIDA, 1, 4), SUBSTRING(V.DTSAIDA, 6, 2)
ORDER BY PERIODO
`;

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code,
    description: 'Vendas mensais por carteira com RCA vinculado ao vendedor titular.',
  });

  console.log('SF 2 (vendasMensais) atualizada para filtrar somente clientes da carteira.');
}

main().catch((error) => {
  console.error('Falha ao atualizar SF vendasMensais:');
  console.error(error?.message || error);
  process.exit(1);
});
