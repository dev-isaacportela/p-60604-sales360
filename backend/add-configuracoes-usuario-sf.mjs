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
const SF_NAME = 'dadosUsuarioLogado';

const SF_SQL = `
  SELECT
    U.ID,
    U.DESCR AS EMAIL,
    COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR) AS NOME_INTERNO,
    COALESCE(F.STATUS, 'ATIVO') AS STATUS_FUNCIONARIO,
    F.ID_SUBSTITUTO
  FROM INT_USER U
  LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
  WHERE U.ID = :VAR_USER
  LIMIT 1
`;

function getSfId(payload) {
  return (
    payload?.result?.serverFunctionId
    || payload?.serverFunctionId
    || payload?.result?.id
    || payload?.id
    || null
  );
}

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === SF_NAME);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: SF_SQL,
      description: 'Retorna dados do usuário autenticado para aba de configurações',
    });

    console.log('SF atualizada com sucesso.');
    console.log(JSON.stringify({ dadosUsuarioLogado: existing.id }, null, 2));
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SF_NAME,
    type: 'SQL',
    code: SF_SQL,
    description: 'Retorna dados do usuário autenticado para aba de configurações',
  });

  const sfId = getSfId(created);
  if (!sfId) {
    throw new Error('Não foi possível obter o ID da SF dadosUsuarioLogado.');
  }

  console.log('SF criada com sucesso.');
  console.log(JSON.stringify({ dadosUsuarioLogado: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar SF de usuário:');
  console.error(error?.message || error);
  process.exit(1);
});
