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

const updates = [
  {
    name: 'dadosUsuarioLogado',
    code: SQL_DADOS_USUARIO_LOGADO,
    description: 'Retorna dados basicos do usuario autenticado usando nome da conta logada.',
  },
  {
    name: 'detalharConfiguracoesUsuario',
    code: SQL_DETALHAR_CONFIGURACOES_USUARIO,
    description: 'Retorna dados e preferencias do usuario autenticado usando nome da conta logada.',
  },
  {
    name: 'atualizarDadosUsuario',
    code: SQL_ATUALIZAR_DADOS_USUARIO,
    description: 'Atualiza dados do usuario logado sem usar nome de funcionario como fallback.',
  },
];

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const allSfs = list?.result || [];
  const updated = {};

  for (const item of updates) {
    const sf = allSfs.find((candidate) => candidate.name === item.name);
    if (!sf) throw new Error(`Server Function nao encontrada: ${item.name}`);
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: sf.id,
      code: item.code,
      description: item.description,
    });
    updated[item.name] = sf.id;
  }

  console.log('Funcoes de usuario atualizadas com fonte exclusiva em INT_USER para nome.');
  console.log(JSON.stringify(updated, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar funcoes de usuario:');
  console.error(error?.message || error);
  process.exit(1);
});
