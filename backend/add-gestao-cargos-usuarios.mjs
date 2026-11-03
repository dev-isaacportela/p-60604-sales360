import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

function isAlreadyExistsError(error) {
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists') || text.includes('duplicate') || text.includes('exists');
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: criado`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label}: ja existe`);
      return;
    }
    throw error;
  }
}

const PERMISSAO_CTE = `
PERMISSAO AS (
  SELECT
    CASE
      WHEN COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN') THEN 1
      WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
      ELSE 0
    END AS PODE_ACESSAR,
    COALESCE(UC.CARGO, 'NAO_DEFINIDO') AS CARGO_ATUAL,
    U.DESCR AS EMAIL
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  WHERE U.ID = :VAR_USER
)
`;

const serverFunctions = [
  {
    name: 'gestaoCargosUsuariosPermissao',
    description: 'Retorna se o usuario logado pode gerenciar cargos de usuarios.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT PODE_ACESSAR, CARGO_ATUAL, EMAIL
      FROM PERMISSAO
    `,
  },
  {
    name: 'gestaoCargosUsuariosResumo',
    description: 'Resumo de usuarios por cargo operacional: diretoria, coordenador e vendedor.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT
        SUM(CASE WHEN COALESCE(UC.CARGO, 'VENDEDOR') = 'DIRETORIA' THEN 1 ELSE 0 END) AS TOTAL_DIRETORIA,
        SUM(CASE WHEN COALESCE(UC.CARGO, 'VENDEDOR') = 'COORDENADOR' THEN 1 ELSE 0 END) AS TOTAL_COORDENADORES,
        SUM(CASE WHEN COALESCE(UC.CARGO, 'VENDEDOR') = 'VENDEDOR' THEN 1 ELSE 0 END) AS TOTAL_VENDEDORES,
        SUM(CASE WHEN COALESCE(UC.CARGO, 'VENDEDOR') NOT IN ('DIRETORIA', 'COORDENADOR', 'VENDEDOR') THEN 1 ELSE 0 END) AS TOTAL_OUTROS,
        COUNT(*) AS TOTAL_USUARIOS
      FROM INT_USER U
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
    `,
  },
  {
    name: 'gestaoCargosUsuariosListar',
    description: 'Lista usuarios com cargo atual, RCA e cadastro de coordenador para definicao de papeis.',
    code: `
      WITH
      ${PERMISSAO_CTE},
      FILTROS AS (
        SELECT
          UPPER('{{cargo}}') AS CARGO_PARAM,
          TRIM('{{busca}}') AS BUSCA_PARAM
      ),
      RCA_USUARIO AS (
        SELECT USER_ID, GROUP_CONCAT(COD_RCA ORDER BY COD_RCA SEPARATOR ', ') AS RCAS
        FROM VENDEDOR_RCA
        GROUP BY USER_ID
      ),
      COORD_USUARIO AS (
        SELECT USER_ID, MIN(COD_SUPERVISOR) AS COD_SUPERVISOR, MAX(NOME) AS NOME_COORDENADOR, MAX(ATIVO) AS COORDENADOR_ATIVO
        FROM COORDENADORES
        WHERE USER_ID IS NOT NULL
        GROUP BY USER_ID
      )
      SELECT
        U.ID AS USER_ID,
        COALESCE(NULLIF(U.NOME, ''), U.DESCR, CONCAT('Usuario ', U.ID)) AS NOME,
        U.DESCR AS EMAIL,
        COALESCE(UC.CARGO, 'VENDEDOR') AS CARGO,
        DATE_FORMAT(UC.ATUALIZADO_EM, '%Y-%m-%d %H:%i') AS ATUALIZADO_EM,
        COALESCE(RU.RCAS, '') AS RCAS,
        CU.COD_SUPERVISOR,
        COALESCE(CU.NOME_COORDENADOR, '') AS NOME_COORDENADOR,
        COALESCE(CU.COORDENADOR_ATIVO, 0) AS COORDENADOR_ATIVO
      FROM INT_USER U
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      JOIN FILTROS F ON 1 = 1
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      LEFT JOIN RCA_USUARIO RU ON RU.USER_ID = U.ID
      LEFT JOIN COORD_USUARIO CU ON CU.USER_ID = U.ID
      WHERE (F.CARGO_PARAM = '' OR COALESCE(UC.CARGO, 'VENDEDOR') = F.CARGO_PARAM)
        AND (
          F.BUSCA_PARAM = ''
          OR COALESCE(NULLIF(U.NOME, ''), U.DESCR, CONCAT('Usuario ', U.ID)) LIKE CONCAT('%', F.BUSCA_PARAM, '%')
          OR U.DESCR LIKE CONCAT('%', F.BUSCA_PARAM, '%')
          OR CAST(U.ID AS CHAR) LIKE CONCAT('%', F.BUSCA_PARAM, '%')
          OR COALESCE(RU.RCAS, '') LIKE CONCAT('%', F.BUSCA_PARAM, '%')
        )
      ORDER BY FIELD(COALESCE(UC.CARGO, 'VENDEDOR'), 'DIRETORIA', 'COORDENADOR', 'VENDEDOR'), NOME, EMAIL
      LIMIT 500
    `,
  },
  {
    name: 'gestaoCargosUsuariosSalvar',
    description: 'Define cargo operacional do usuario como DIRETORIA, COORDENADOR ou VENDEDOR.',
    code: `
      INSERT INTO USUARIO_CARGO (USER_ID, CARGO, ATUALIZADO_EM)
      SELECT
        {{userId}},
        CASE
          WHEN UPPER('{{cargo}}') IN ('DIRETORIA', 'COORDENADOR', 'VENDEDOR') THEN UPPER('{{cargo}}')
          ELSE 'VENDEDOR'
        END AS CARGO,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM INT_USER ADMIN_U
      LEFT JOIN USUARIO_CARGO ADMIN_CARGO ON ADMIN_CARGO.USER_ID = ADMIN_U.ID
      WHERE ADMIN_U.ID = :VAR_USER
        AND (
          COALESCE(ADMIN_CARGO.CARGO, '') IN ('DIRETORIA', 'ADMIN')
          OR LOWER(COALESCE(ADMIN_U.DESCR, '')) = 'ti@benenutri.com'
        )
        AND EXISTS (SELECT 1 FROM INT_USER TARGET_U WHERE TARGET_U.ID = {{userId}})
      ON DUPLICATE KEY UPDATE
        CARGO = VALUES(CARGO),
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  },
];

async function ensureTables() {
  await runDdlSafe(`CREATE TABLE USUARIO_CARGO (
    USER_ID INT NOT NULL PRIMARY KEY,
    CARGO VARCHAR(30) NOT NULL,
    ATUALIZADO_EM VARCHAR(19),
    UNIQUE KEY UX_USUARIO_CARGO_USER (USER_ID)
  );`, 'USUARIO_CARGO');
}

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};
  for (const definition of serverFunctions) {
    const found = existing.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: definition.code, description: definition.description });
      ids[definition.name] = found.id;
      continue;
    }
    const created = await createServerFunctionMitra({ projectId, name: definition.name, type: 'SQL', code: definition.code, description: definition.description });
    ids[definition.name] = extractSfId(created);
  }
  return ids;
}

async function smoke(ids) {
  const checks = [
    ['gestaoCargosUsuariosPermissao', {}],
    ['gestaoCargosUsuariosResumo', {}],
    ['gestaoCargosUsuariosListar', { busca: '', cargo: '' }],
  ];
  for (const [name, input] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  await ensureTables();
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Gestao de cargos de usuarios configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Gestao de Cargos de Usuarios:');
  console.error(error?.message || error);
  process.exit(1);
});
