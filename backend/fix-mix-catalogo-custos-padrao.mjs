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

const MIX_CATALOGO_PRODUTOS_CUSTOS_SQL = `
SELECT
  P.CODPROD AS PRODUCT_ID,
  P.CODPROD,
  P.FORNECEDOR_ID AS CODFORNEC,
  CAST(P.CODPROD AS CHAR) AS CODIGO,
  P.CODAUXILIAR,
  P.NOME,
  CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) AS CATEGORIA,
  COALESCE(CP.CUSTO, 0) AS CUSTO_STD,
  NULL AS POLICY_ID,
  NULL AS CUSTO_POLICY,
  COALESCE(CP.CUSTO, 0) AS CUSTO_APLICADO,
  CASE WHEN CP.CUSTO IS NOT NULL THEN 'PADRAO' ELSE 'SEM_CUSTO' END AS TIPO_CUSTO,
  0 AS PRECO_TABELA,
  CP.DATA_REF AS DATA_CUSTO_STD
FROM PRODUTOS_CUSTOS P
LEFT JOIN CUSTO_PADRAO_PRODUTO CP ON CP.CODPROD = P.CODPROD
WHERE (
  '{{busca}}' = ''
  OR UPPER(P.NOME) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR CAST(P.CODPROD AS CHAR) LIKE CONCAT('%', '{{busca}}', '%')
  OR UPPER(P.CODFAB) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR UPPER(COALESCE(P.CODAUXILIAR, '')) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
)
AND COALESCE(P.ATIVO, TRUE) = TRUE
ORDER BY P.CODPROD
LIMIT {{limit}} OFFSET {{offset}}
`;

function extractRows(response) {
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  return output?.rows || output?.result || [];
}

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    code: MIX_CATALOGO_PRODUTOS_CUSTOS_SQL,
    description: 'Catálogo local do Mix Builder usando produto espelhado e custo padrão sincronizado.',
  });

  const rows = extractRows(await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 91,
    input: { busca: '1', clienteId: '', filialId: '', limit: '5', offset: '0' },
  }));

  if (!rows.some((row) => Number(row.CUSTO_STD || 0) > 0)) {
    throw new Error('Smoke test não retornou custo padrão positivo no catálogo.');
  }

  console.log(JSON.stringify({ updated: true, sample: rows }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir catálogo de custos do mix:');
  console.error(error?.message || error);
  process.exit(1);
});
