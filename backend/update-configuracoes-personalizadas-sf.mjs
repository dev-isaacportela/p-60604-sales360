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
  LEFT JOIN (
    SELECT
      P1.USER_ID,
      P1.MODO_AGENDA,
      P1.EXIBICAO_TAREFAS,
      P1.PAGINA_INICIAL
    FROM USUARIO_PREFERENCIAS P1
    INNER JOIN (
      SELECT USER_ID, MAX(ID) AS MAX_ID
      FROM USUARIO_PREFERENCIAS
      GROUP BY USER_ID
    ) ULTIMA ON ULTIMA.USER_ID = P1.USER_ID AND ULTIMA.MAX_ID = P1.ID
  ) P ON P.USER_ID = U.ID
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

const SQL_ATUALIZAR_PREFERENCIAS_USUARIO = `
  UPDATE USUARIO_PREFERENCIAS
  SET
    MODO_AGENDA = '{{modoAgenda}}',
    EXIBICAO_TAREFAS = '{{exibicaoTarefas}}',
    PAGINA_INICIAL = '{{paginaInicial}}',
    ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE USER_ID = :VAR_USER;

  INSERT INTO USUARIO_PREFERENCIAS (
    USER_ID,
    MODO_AGENDA,
    EXIBICAO_TAREFAS,
    PAGINA_INICIAL,
    ATUALIZADO_EM
  )
  SELECT
    :VAR_USER,
    '{{modoAgenda}}',
    '{{exibicaoTarefas}}',
    '{{paginaInicial}}',
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM DUAL
  WHERE NOT EXISTS (
    SELECT 1 FROM USUARIO_PREFERENCIAS WHERE USER_ID = :VAR_USER
  );
`;

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

  sfIds.atualizarPreferenciasUsuario = await updateSfByName(
    allSfs,
    'atualizarPreferenciasUsuario',
    SQL_ATUALIZAR_PREFERENCIAS_USUARIO,
    'Atualiza preferencias do usuario logado (agenda, atividades e pagina inicial).',
  );

  console.log('SFs de configuracoes personalizadas atualizadas com sucesso.');
  console.log(JSON.stringify(sfIds, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar SFs de configuracoes personalizadas:');
  console.error(error?.message || error);
  process.exit(1);
});
