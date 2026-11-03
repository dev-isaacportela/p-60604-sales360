import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const FUNCTION_NAME = 'solicitacoesComprasClientesGeral';

const code = `
SELECT
  C.ID,
  C.ID AS CODCLI,
  C.RAZAO_SOCIAL,
  C.NOME_FANTASIA,
  C.CNPJ,
  C.CIDADE,
  C.UF,
  C.SEGMENTO,
  C.STATUS
FROM CLIENTES C
WHERE ('{{busca}}' = ''
  OR CAST(C.ID AS CHAR) LIKE CONCAT('%', '{{busca}}', '%')
  OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
  OR COALESCE(C.CNPJ, '') LIKE CONCAT('%', '{{busca}}', '%'))
  AND COALESCE(C.STATUS, 'ATIVO') = 'ATIVO'
ORDER BY COALESCE(NULLIF(C.NOME_FANTASIA, ''), C.RAZAO_SOCIAL, CAST(C.ID AS CHAR))
LIMIT {{limit}} OFFSET {{offset}}
`;

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') output = JSON.parse(output);
  return output?.rows || output?.result || [];
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((item) => item.name === FUNCTION_NAME);

  let serverFunctionId;
  if (existing) {
    serverFunctionId = Number(existing.id);
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId,
      code,
      description: 'Busca clientes ativos para solicitações de compras usando a base geral de clientes.',
    });
  } else {
    const created = await createServerFunctionMitra({
      projectId,
      name: FUNCTION_NAME,
      type: 'SQL',
      code,
      description: 'Busca clientes ativos para solicitações de compras usando a base geral de clientes.',
    });
    serverFunctionId = Number(created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id);
  }

  const sample = extractRows(await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: { busca: '', limit: '5', offset: '0' },
  }));

  if (sample.length === 0) throw new Error('A busca geral de clientes não retornou registros.');
  console.log(JSON.stringify({ serverFunctionId, sample: sample.slice(0, 2) }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
