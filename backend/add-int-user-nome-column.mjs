import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const SQL_DETALHAR_CONFIGURACOES_USUARIO = `
  SELECT
    U.ID,
    U.DESCR AS EMAIL,
    COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR) AS NOME_INTERNO,
    COALESCE(F.STATUS, 'ATIVO') AS STATUS_FUNCIONARIO,
    F.ID_SUBSTITUTO,
    COALESCE(P.MODO_AGENDA, 'SEMANA') AS MODO_AGENDA,
    COALESCE(P.EXIBICAO_TAREFAS, 'LISTA') AS EXIBICAO_TAREFAS,
    COALESCE(P.PAGINA_INICIAL, '/dashboard') AS PAGINA_INICIAL
  FROM INT_USER U
  LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
  LEFT JOIN USUARIO_PREFERENCIAS P ON P.USER_ID = U.ID
  WHERE U.ID = :VAR_USER
  LIMIT 1
`;

const SQL_DADOS_USUARIO_LOGADO = `
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

function errorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

async function runDdlSafe(sql, ignorePatterns = []) {
  try {
    await runDdlMitra({ projectId, sql });
  } catch (error) {
    const msg = errorText(error);
    const shouldIgnore = ignorePatterns.some((pattern) => msg.includes(pattern));
    if (!shouldIgnore) throw error;
  }
}

async function updateSfByName(allSfs, name, code, description) {
  const sf = allSfs.find((item) => item.name === name);
  if (!sf) {
    throw new Error(`Server Function nao encontrada: ${name}`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    code,
    description,
  });

  return sf.id;
}

async function main() {
  await runDdlSafe(
    'ALTER TABLE INT_USER ADD COLUMN NOME VARCHAR(200) NULL AFTER DESCR',
    ['duplicate column', 'already exists'],
  );

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE INT_USER U
      SET U.NOME = COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR)
      WHERE U.NOME IS NULL OR TRIM(U.NOME) = ''
    `,
  });

  const list = await listServerFunctionsMitra({ projectId });
  const allSfs = list?.result || [];

  const sfIds = {};
  sfIds.detalharConfiguracoesUsuario = await updateSfByName(
    allSfs,
    'detalharConfiguracoesUsuario',
    SQL_DETALHAR_CONFIGURACOES_USUARIO,
    'Retorna dados e preferencias do usuario autenticado para a tela de configuracoes.',
  );

  sfIds.dadosUsuarioLogado = await updateSfByName(
    allSfs,
    'dadosUsuarioLogado',
    SQL_DADOS_USUARIO_LOGADO,
    'Retorna dados basicos do usuario autenticado.',
  );

  sfIds.atualizarDadosUsuario = await updateSfByName(
    allSfs,
    'atualizarDadosUsuario',
    SQL_ATUALIZAR_DADOS_USUARIO,
    'Atualiza dados do usuario logado (nome interno, status e substituto).',
  );

  console.log('Coluna NOME adicionada em INT_USER e SFs de usuario atualizadas.');
  console.log(JSON.stringify(sfIds, null, 2));
}

main().catch((error) => {
  console.error('Falha ao aplicar coluna NOME em INT_USER:');
  console.error(error?.message || error);
  process.exit(1);
});
