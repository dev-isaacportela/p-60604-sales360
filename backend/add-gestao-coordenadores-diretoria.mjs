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

const BU_BASE_CTE = `
BU_BASE AS (
  SELECT DISTINCT
    CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    V.CODEPTO,
    COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)) AS DEPARTAMENTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND V.CODEPTO IS NOT NULL

  UNION

  SELECT DISTINCT
    M.CODFILIAL,
    M.CODEPTO,
    CONCAT('Departamento ', M.CODEPTO) AS DEPARTAMENTO
  FROM METAS_BU M

  UNION

  SELECT DISTINCT
    CB.CODFILIAL,
    CB.CODEPTO,
    CONCAT('Departamento ', CB.CODEPTO) AS DEPARTAMENTO
  FROM COORDENADORES_BU CB
)
`;

const serverFunctions = [
  {
    name: 'gestaoCoordenadoresPermissao',
    description: 'Retorna se o usuario pode acessar a gestao de coordenadores.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT PODE_ACESSAR, CARGO_ATUAL, EMAIL
      FROM PERMISSAO
    `,
  },
  {
    name: 'gestaoCoordenadoresUsuarios',
    description: 'Lista usuarios elegiveis para vinculo como coordenador.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT
        U.ID AS USER_ID,
        COALESCE(NULLIF(U.NOME, ''), U.DESCR, CONCAT('Usuario ', U.ID)) AS NOME,
        U.DESCR AS EMAIL,
        COALESCE(UC.CARGO, 'VENDEDOR') AS CARGO
      FROM INT_USER U
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      ORDER BY NOME, EMAIL
    `,
  },
  {
    name: 'gestaoCoordenadoresBus',
    description: 'Lista BUs disponiveis para vinculo a coordenadores.',
    code: `
      WITH
      ${PERMISSAO_CTE},
      ${BU_BASE_CTE}
      SELECT B.CODFILIAL, B.CODEPTO, MAX(B.DEPARTAMENTO) AS DEPARTAMENTO
      FROM BU_BASE B
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      GROUP BY B.CODFILIAL, B.CODEPTO
      ORDER BY B.CODFILIAL, B.CODEPTO
    `,
  },
  {
    name: 'gestaoCoordenadoresListar',
    description: 'Lista coordenadores cadastrados com total de BUs vinculadas.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT
        C.AUTO_ID,
        C.COD_SUPERVISOR,
        C.NOME,
        C.EMAIL,
        C.USER_ID,
        COALESCE(U.DESCR, C.EMAIL, '') AS EMAIL_USUARIO,
        C.ATIVO,
        COUNT(CB.AUTO_ID) AS TOTAL_BUS,
        DATE_FORMAT(C.CREATED_AT, '%Y-%m-%d') AS CREATED_AT
      FROM COORDENADORES C
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      LEFT JOIN INT_USER U ON U.ID = C.USER_ID
      LEFT JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
      WHERE ('{{busca}}' = '' OR C.NOME LIKE '%{{busca}}%' OR C.EMAIL LIKE '%{{busca}}%' OR CAST(C.COD_SUPERVISOR AS CHAR) LIKE '%{{busca}}%')
      GROUP BY C.AUTO_ID, C.COD_SUPERVISOR, C.NOME, C.EMAIL, C.USER_ID, U.DESCR, C.ATIVO, C.CREATED_AT
      ORDER BY C.ATIVO DESC, C.NOME
    `,
  },
  {
    name: 'gestaoCoordenadoresSalvar',
    description: 'Cria ou atualiza cadastro de coordenador por codigo supervisor.',
    code: `
      INSERT INTO COORDENADORES (COD_SUPERVISOR, NOME, EMAIL, USER_ID, ATIVO, CREATED_AT)
      SELECT
        {{codSupervisor}},
        '{{nome}}',
        NULLIF('{{email}}', ''),
        CASE WHEN '{{userId}}' REGEXP '^[0-9]+$' THEN CAST('{{userId}}' AS UNSIGNED) ELSE NULL END,
        CASE WHEN '{{ativo}}' IN ('0', 'false', 'FALSE') THEN FALSE ELSE TRUE END,
        CURRENT_TIMESTAMP
      FROM INT_USER U
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
        AND (
          COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN')
          OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
        )
      ON DUPLICATE KEY UPDATE
        NOME = VALUES(NOME),
        EMAIL = VALUES(EMAIL),
        USER_ID = VALUES(USER_ID),
        ATIVO = VALUES(ATIVO)
    `,
  },
  {
    name: 'gestaoCoordenadoresDefinirStatus',
    description: 'Ativa ou inativa um coordenador existente.',
    code: `
      UPDATE COORDENADORES C
      SET C.ATIVO = CASE WHEN '{{ativo}}' IN ('0', 'false', 'FALSE') THEN FALSE ELSE TRUE END
      WHERE C.COD_SUPERVISOR = {{codSupervisor}}
        AND EXISTS (
          SELECT 1
          FROM INT_USER U
          LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
          WHERE U.ID = :VAR_USER
            AND (
              COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN')
              OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
            )
        )
    `,
  },
  {
    name: 'gestaoCoordenadoresBuListar',
    description: 'Lista BUs vinculadas a um coordenador.',
    code: `
      WITH
      ${PERMISSAO_CTE},
      ${BU_BASE_CTE}
      SELECT
        CB.AUTO_ID,
        CB.COD_SUPERVISOR,
        CB.CODFILIAL,
        CB.CODEPTO,
        COALESCE(B.DEPARTAMENTO, CONCAT('Departamento ', CB.CODEPTO)) AS DEPARTAMENTO
      FROM COORDENADORES_BU CB
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      LEFT JOIN BU_BASE B ON B.CODFILIAL = CB.CODFILIAL AND B.CODEPTO = CB.CODEPTO
      WHERE CB.COD_SUPERVISOR = {{codSupervisor}}
      ORDER BY CB.CODFILIAL, CB.CODEPTO
    `,
  },
  {
    name: 'gestaoCoordenadoresBuVincular',
    description: 'Vincula uma BU a um coordenador.',
    code: `
      INSERT INTO COORDENADORES_BU (COD_SUPERVISOR, CODFILIAL, CODEPTO)
      SELECT {{codSupervisor}}, {{codfilial}}, {{codepto}}
      FROM INT_USER U
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
        AND (
          COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN')
          OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
        )
        AND EXISTS (SELECT 1 FROM COORDENADORES C WHERE C.COD_SUPERVISOR = {{codSupervisor}})
      ON DUPLICATE KEY UPDATE CODFILIAL = VALUES(CODFILIAL)
    `,
  },
  {
    name: 'gestaoCoordenadoresBuDesvincular',
    description: 'Remove vinculo de BU de um coordenador.',
    code: `
      DELETE CB
      FROM COORDENADORES_BU CB
      WHERE CB.AUTO_ID = {{vinculoId}}
        AND EXISTS (
          SELECT 1
          FROM INT_USER U
          LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
          WHERE U.ID = :VAR_USER
            AND (
              COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN')
              OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
            )
        )
    `,
  },
];

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
    ['gestaoCoordenadoresPermissao', {}],
    ['gestaoCoordenadoresUsuarios', {}],
    ['gestaoCoordenadoresBus', {}],
    ['gestaoCoordenadoresListar', { busca: '' }],
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
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Gestao de coordenadores configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Gestao de Coordenadores:');
  console.error(error?.message || error);
  process.exit(1);
});
