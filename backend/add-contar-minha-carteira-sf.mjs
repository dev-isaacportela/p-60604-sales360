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
const SF_NAME = 'contarMinhaCarteiraClientes';

const SF_SQL = `
  SELECT COUNT(*) AS TOTAL
  FROM CLIENTES C
  WHERE EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = C.ID
        AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
        AND (
          '{{idBu}}' = ''
          OR COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = '{{idBu}}'
        )
    )
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
    )
    AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
    AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
    AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
    AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
`;

function getSfId(payload) {
  return payload?.result?.serverFunctionId || payload?.serverFunctionId || payload?.result?.id || payload?.id || null;
}

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === SF_NAME);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: SF_SQL,
      description: 'Conta os clientes da carteira do vendedor logado',
    });
    console.log(JSON.stringify({ [SF_NAME]: existing.id }, null, 2));
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SF_NAME,
    type: 'SQL',
    code: SF_SQL,
    description: 'Conta os clientes da carteira do vendedor logado',
  });

  console.log(JSON.stringify({ [SF_NAME]: getSfId(created) }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar SF contarMinhaCarteiraClientes:');
  console.error(error?.message || error);
  process.exit(1);
});
