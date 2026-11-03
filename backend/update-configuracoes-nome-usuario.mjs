import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const SQL_ATUALIZAR_DADOS_USUARIO = `
  INSERT INTO FUNCIONARIOS (ID, NOME, STATUS, ID_SUBSTITUTO, ATUALIZADO_EM)
  SELECT
    U.ID,
    CASE
      WHEN TRIM('{{nomeInterno}}') = '' THEN COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR)
      ELSE '{{nomeInterno}}'
    END,
    '{{statusFuncionario}}',
    CASE WHEN '{{idSubstituto}}' = '' THEN NULL ELSE CAST('{{idSubstituto}}' AS SIGNED) END,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM INT_USER U
  LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
  WHERE U.ID = :VAR_USER
  ON DUPLICATE KEY UPDATE
    NOME = VALUES(NOME),
    STATUS = VALUES(STATUS),
    ID_SUBSTITUTO = VALUES(ID_SUBSTITUTO),
    ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
`;

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === 'atualizarDadosUsuario');

  if (!existing) {
    throw new Error('SF atualizarDadosUsuario não encontrada no projeto.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: existing.id,
    code: SQL_ATUALIZAR_DADOS_USUARIO,
    description: 'Atualiza dados do usuário logado (nome interno, status e substituto).',
  });

  console.log('SF atualizarDadosUsuario atualizada com suporte a nome interno.');
  console.log(JSON.stringify({ atualizarDadosUsuario: existing.id }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar SF de configurações com nome de usuário:');
  console.error(error?.message || error);
  process.exit(1);
});
