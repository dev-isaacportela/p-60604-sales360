import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const analyticsVendedorCarteiraSql = `
  WITH CARTEIRA_UNICA AS (
    SELECT
      EC.ID_CLIENTE,
      MIN(EC.ID_VENDEDOR) AS VENDEDOR_ID
    FROM EQUIPE_CLIENTE EC
    GROUP BY EC.ID_CLIENTE
  ),
  VENDAS_CARTEIRA AS (
    SELECT
      CU.VENDEDOR_ID,
      COALESCE(SUM(COALESCE(VT.TOTAL, 0)), 0) AS TOTAL_VENDAS
    FROM CARTEIRA_UNICA CU
    LEFT JOIN IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
      ON VT.CODCLI = CU.CLIENTE_ID
    GROUP BY CU.VENDEDOR_ID
  )
  SELECT
    COALESCE(F.NOME, U.DESCR, CONCAT('Usuario ', VC.VENDEDOR_ID)) AS name,
    ROUND(VC.TOTAL_VENDAS, 2) AS value
  FROM VENDAS_CARTEIRA VC
  LEFT JOIN INT_USER U ON U.ID = VC.VENDEDOR_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VC.VENDEDOR_ID
  ORDER BY value DESC
`;

function extractSfId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === 'analyticsVendasVendedor');

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: analyticsVendedorCarteiraSql,
      description: 'Vendas por vendedor considerando apenas clientes na carteira.',
    });

    console.log('SF analyticsVendasVendedor atualizada com sucesso.');
    console.log(JSON.stringify({ serverFunctionId: existing.id }, null, 2));
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: 'analyticsVendasVendedor',
    type: 'SQL',
    code: analyticsVendedorCarteiraSql,
    description: 'Vendas por vendedor considerando apenas clientes na carteira.',
  });

  console.log('SF analyticsVendasVendedor criada com sucesso.');
  console.log(JSON.stringify({ serverFunctionId: extractSfId(created) }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao ajustar analytics de vendedor por carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
