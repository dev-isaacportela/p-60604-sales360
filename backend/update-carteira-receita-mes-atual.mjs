import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_NAME = 'minhaCarteiraClientesRanking';

const MONTHLY_SUM_SQL = `ROUND(
          SUM(
            CASE
              WHEN SUBSTRING(VT.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)
                THEN COALESCE(VT.TOTAL, 0)
              ELSE 0
            END
          ),
          2
        ) AS COMPRAS_MES_ATUAL,`;

function patchRankingSql(code) {
  let updated = code;

  if (!updated.includes('B.COMPRAS_MES_ATUAL,')) {
    if (!updated.includes('B.COMPRAS_90D,')) {
      throw new Error('Não foi possível localizar B.COMPRAS_90D na SF alvo.');
    }
    updated = updated.replace('B.COMPRAS_90D,', 'B.COMPRAS_90D,\n    B.COMPRAS_MES_ATUAL,');
  }

  if (!updated.includes('COALESCE(IA.COMPRAS_MES_ATUAL, 0) AS COMPRAS_MES_ATUAL,')) {
    if (!updated.includes('COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,')) {
      throw new Error('Não foi possível localizar COALESCE(IA.COMPRAS_90D, 0) na SF alvo.');
    }
    updated = updated.replace(
      'COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,',
      'COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,\n      COALESCE(IA.COMPRAS_MES_ATUAL, 0) AS COMPRAS_MES_ATUAL,',
    );
  }

  const hasMonthlyCalcInIa = updated.includes('WHEN SUBSTRING(VT.DTSAIDA, 1, 7) = SUBSTRING(CURRENT_DATE, 1, 7)');
  if (!hasMonthlyCalcInIa) {
    if (!updated.includes(') AS COMPRAS_90D,\n        DATEDIFF(')) {
      throw new Error('Não foi possível localizar bloco COMPRAS_90D -> DATEDIFF na subquery IA.');
    }
    updated = updated.replace(
      ') AS COMPRAS_90D,\n        DATEDIFF(',
      `) AS COMPRAS_90D,\n        ${MONTHLY_SUM_SQL}\n        DATEDIFF(`,
    );
  }

  const hasMonthlyInGroupBy = updated.includes('IA.COMPRAS_90D,\n      IA.COMPRAS_MES_ATUAL,\n      IA.DIAS_ULTIMA_COMPRA,');
  if (!hasMonthlyInGroupBy) {
    if (!updated.includes('IA.COMPRAS_90D,\n      IA.DIAS_ULTIMA_COMPRA,')) {
      throw new Error('Não foi possível localizar trecho de GROUP BY de IA.COMPRAS_90D.');
    }
    updated = updated.replace(
      'IA.COMPRAS_90D,\n      IA.DIAS_ULTIMA_COMPRA,',
      'IA.COMPRAS_90D,\n      IA.COMPRAS_MES_ATUAL,\n      IA.DIAS_ULTIMA_COMPRA,',
    );
  }

  return updated;
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];
  const match = serverFunctions.find((item) => item.name === TARGET_NAME);

  if (!match?.id) {
    throw new Error(`SF não encontrada: ${TARGET_NAME}`);
  }

  const detail = await readServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
  });

  const currentCode = detail?.result?.code || '';
  if (!currentCode.trim()) {
    throw new Error(`A SF ${TARGET_NAME} está sem código.`);
  }

  const updatedCode = patchRankingSql(currentCode);
  if (updatedCode === currentCode) {
    console.log(`SF ${TARGET_NAME} já estava com COMPRAS_MES_ATUAL.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
    code: updatedCode,
    description: detail?.result?.description || match.description || '',
  });

  console.log(`SF ${TARGET_NAME} atualizada com COMPRAS_MES_ATUAL.`);
}

main().catch((error) => {
  console.error('Erro ao atualizar receita do mês atual na carteira:', error);
  process.exit(1);
});
