import 'dotenv/config';
import { configureSdkMitra, executeServerFunctionMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

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

async function query(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || response?.rows || response?.result || [];
}

async function main() {
  const vendedorId = '17';
  const ano = '2026';
  const mes = '5';

  const sfResponse = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 104,
    input: { ano, mes, semanaNumero: '1' },
  });
  const status = String(sfResponse?.result?.executionStatus || '');
  const error = String(sfResponse?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  const esperadoRows = await query(`
    SELECT ROUND(SUM(PS.VALOR), 2) AS TOTAL_ESPERADO
    FROM PEDIDOS_SEMANAIS_SYNC PS
    JOIN EQUIPE_CLIENTE EC
      ON EC.ID_CLIENTE = PS.CLIENTE_ID
     AND EC.ID_VENDEDOR = 17
    JOIN BU_VENDEDOR BV
      ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
     AND TRIM(CAST(BV.CODFILIAL AS CHAR)) = TRIM(CAST(EC.CODFILIAL AS CHAR))
     AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = TRIM(CAST(PS.CODEPTO AS CHAR))
     AND TRIM(CAST(BV.ID_SECAO AS CHAR)) = TRIM(CAST(EC.ID_SECAO AS CHAR))
     AND TRIM(CAST(BV.ID_SECAO AS CHAR)) = TRIM(CAST(PS.ID_SECAO AS CHAR))
     AND COALESCE(BV.ATIVO, TRUE) = TRUE
    WHERE PS.ATIVO = TRUE
      AND PS.ANO = 2026
      AND PS.MES = 5
      AND TRIM(CAST(PS.CODFILIAL AS CHAR)) = TRIM(CAST(EC.CODFILIAL AS CHAR))
  `);
  const esperado = Number(esperadoRows[0]?.TOTAL_ESPERADO || 0);

  const semEscopoRows = await query(`
    SELECT ROUND(SUM(PS.VALOR), 2) AS TOTAL_SEM_ESCOPO
    FROM PEDIDOS_SEMANAIS_SYNC PS
    JOIN EQUIPE_CLIENTE EC
      ON EC.ID_CLIENTE = PS.CLIENTE_ID
     AND EC.ID_VENDEDOR = 17
    WHERE PS.ATIVO = TRUE
      AND PS.ANO = 2026
      AND PS.MES = 5
  `);
  const semEscopo = Number(semEscopoRows[0]?.TOTAL_SEM_ESCOPO || 0);

  if (Math.abs(esperado - 12329.41) > 0.01) {
    throw new Error(`Total esperado ${esperado.toFixed(2)} diferente do faturamento mensal conhecido 12329.41.`);
  }

  console.log(JSON.stringify({ vendedorId, ano, mes, totalComEscopo: esperado, totalSemEscopo: semEscopo, diferencaRemovida: Number((semEscopo - esperado).toFixed(2)), smokeRows: extractRows(sfResponse).length }, null, 2));
}

main().catch((error) => {
  console.error('Falha na validação de escopo do acompanhamento semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
