import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_IDS = [5, 11, 12, 20, 42, 43, 104, 123, 124, 131, 134, 181, 182, 183, 184, 185, 186, 187, 188, 215];

const scopeOptionsSql = `
WITH
PERMISSAO AS (
  SELECT
    CASE
      WHEN UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA') THEN 1
      WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
      ELSE 0
    END AS PODE_DIRETORIA,
    C.COD_SUPERVISOR
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  LEFT JOIN COORDENADORES C ON C.USER_ID = U.ID AND COALESCE(C.ATIVO, TRUE) = TRUE
  WHERE U.ID = :VAR_USER
),
ESCOPO_BU AS (
  SELECT DISTINCT BV.CODFILIAL, BV.BU_CODIGO AS CODEPTO
  FROM BU_VENDEDOR BV
  JOIN PERMISSAO P ON P.PODE_DIRETORIA = 1
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE

  UNION

  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN PERMISSAO P ON P.COD_SUPERVISOR = CB.COD_SUPERVISOR

  UNION

  SELECT DISTINCT BV.CODFILIAL, BV.BU_CODIGO AS CODEPTO
  FROM BU_VENDEDOR BV
  WHERE BV.VENDEDOR_ID = :VAR_USER
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
),
VENDEDORES_SCOPE_RAW AS (
  SELECT DISTINCT
    VR.USER_ID,
    VR.COD_RCA,
    COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(B.NOME), ''), CONCAT('Departamento ', BV.BU_CODIGO)) AS DEPARTAMENTO,
    CB.COD_SUPERVISOR,
    COALESCE(NULLIF(TRIM(CU.NOME), ''), NULLIF(TRIM(CU.DESCR), ''), CONCAT('Coordenador ', CB.COD_SUPERVISOR)) AS COORDENADOR,
    BV.ID_SECAO,
    COALESCE(NULLIF(TRIM(S.NOME_SECAO), ''), CONCAT('Seção ', BV.ID_SECAO)) AS SECAO,
    CASE WHEN BV.VENDEDOR_ID = :VAR_USER THEN 1 ELSE 0 END AS IS_OWN_SCOPE,
    CASE WHEN C2.AUTO_ID IS NULL THEN 0 ELSE 1 END AS IS_COORDENADOR
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN COORDENADORES_BU CB
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN COORDENADORES C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR AND COALESCE(C.ATIVO, TRUE) = TRUE
  LEFT JOIN INT_USER CU ON CU.ID = C.USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN BU B ON TRIM(CAST(B.CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  LEFT JOIN COORDENADORES C2 ON C2.USER_ID = BV.VENDEDOR_ID AND COALESCE(C2.ATIVO, TRUE) = TRUE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (
      EXISTS (SELECT 1 FROM PERMISSAO P_DIR WHERE P_DIR.PODE_DIRETORIA = 1)
      OR C2.AUTO_ID IS NULL
      OR BV.VENDEDOR_ID = :VAR_USER
    )
)
SELECT
  USER_ID,
  COD_RCA,
  RCA,
  CODFILIAL,
  CODEPTO,
  DEPARTAMENTO,
  COD_SUPERVISOR,
  COORDENADOR,
  ID_SECAO,
  SECAO,
  IS_OWN_SCOPE,
  IS_COORDENADOR
FROM VENDEDORES_SCOPE_RAW
ORDER BY COORDENADOR, RCA, CODFILIAL, CODEPTO, ID_SECAO
`;

const globalTargetUsersUnion = `

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (
      I.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES_BU CB_GLOBAL
        WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

const cleanScopeCte = `INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER', 'GLOBAL') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR
),
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT F.ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_COORD_ALVO
      WHERE C_COORD_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_COORD_ALVO.ATIVO, TRUE) = TRUE
        AND C_COORD_ALVO.USER_ID <> :VAR_USER
    )
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_COORD_ALVO
      WHERE C_COORD_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_COORD_ALVO.ATIVO, TRUE) = TRUE
        AND C_COORD_ALVO.USER_ID <> :VAR_USER
    )
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
${globalTargetUsersUnion}
)`;

function patchScopeMode(code) {
  return code;
}

function patchInputScope(code) {
  return code;
}

function findCteEnd(code, cteName) {
  const start = code.indexOf(`${cteName} AS (`);
  if (start === -1) return -1;
  const open = code.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function patchTargetUsers(code) {
  if (!code.includes('TARGET_USERS AS')) return code;
  const inputStart = code.indexOf('INPUT_SCOPE AS (');
  const targetStart = code.indexOf('TARGET_USERS AS (');
  const end = findCteEnd(code, 'TARGET_USERS');
  if (targetStart === -1 || end === -1) return code;
  if (inputStart !== -1 && inputStart < targetStart) {
    return `${code.slice(0, inputStart)}${cleanScopeCte}${code.slice(end + 1)}`;
  }
  return `${code.slice(0, targetStart)}${cleanScopeCte}${code.slice(end + 1)}`;
}

function patchWeeklyCode(code) {
  let next = code
    .replaceAll("'ME', 'TEAM', 'SELLER'", "'ME', 'TEAM', 'SELLER', 'GLOBAL'")
    .replaceAll("CASE WHEN P.SCOPE_MODE = 'TEAM' THEN 0 ELSE", "CASE WHEN P.SCOPE_MODE IN ('TEAM','GLOBAL') THEN 0 ELSE");
  if (!next.includes('SCOPE_COD_SUPERVISOR')) {
    next = next.replace(
      `NULLIF('{{scopeIdSecao}}', '') AS SECAO_PARAM,`,
      () => `NULLIF('{{scopeIdSecao}}', '') AS SECAO_PARAM,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR,`,
    );
  }
  if (!next.includes('GLOBAL_SCOPE_USERS AS')) {
    next = next.replace(
      `COORD_SCOPE_USERS AS (`,
      () => `GLOBAL_SCOPE_USERS AS (
  SELECT DISTINCT BV.VENDEDOR_ID AS TARGET_USER_ID
  FROM PARAMS P
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  WHERE P.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
    AND (
      P.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES_BU CB_GLOBAL
        WHERE CB_GLOBAL.COD_SUPERVISOR = P.SCOPE_COD_SUPERVISOR
          AND TRIM(CAST(BV.CODFILIAL AS CHAR)) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
      )
    )
),
COORD_SCOPE_USERS AS (`,
    );
    next = next.replace(
      `SELECT CSU.TARGET_USER_ID
    FROM COORD_SCOPE_USERS CSU
    JOIN PARAMS P ON P.SCOPE_MODE = 'TEAM'`,
      `SELECT CSU.TARGET_USER_ID
    FROM COORD_SCOPE_USERS CSU
    JOIN PARAMS P ON P.SCOPE_MODE = 'TEAM'
    UNION ALL
    SELECT GSU.TARGET_USER_ID
    FROM GLOBAL_SCOPE_USERS GSU`,
    );
  }
  return next;
}

function patchCode(id, code) {
  if (id === 104) return patchWeeklyCode(code);
  const scoped = patchTargetUsers(code);
  if (scoped !== code) return scoped;
  return patchInputScope(patchScopeMode(code));
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

async function smoke(id) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      scopeMode: 'GLOBAL',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodSupervisor: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      dataInicio: '2026-01-01',
      dataFim: '2026-01-31',
      mes: '1',
      ano: '2026',
      semanaNumero: '1',
      status: '',
      prioridade: '',
      limite: '5',
      limit: '5',
      offset: '0',
      departamentos: '',
      filiais: '',
      secoes: '',
      ramos: '',
      cliente: '',
      vendedorId: '',
      ramoCliente: '',
      idCliente: '',
      idAlerta: '',
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 158,
    code: scopeOptionsSql,
    description: 'Lista vendedores/RCA, coordenadores e dimensões para escopo de vendedor, coordenador e diretoria.',
  });

  const updated = [];
  const skipped = [];
  for (const id of TARGET_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const original = current?.result?.code || '';
    const next = patchCode(id, original);
    if (!next || next === original) {
      skipped.push(id);
      continue;
    }
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      code: next,
      description: current?.result?.description || `SF ${id} com escopo global da diretoria`,
    });
    updated.push(id);
  }

  for (const id of [5, 11, 20, 104, 123, 131, 134, 181, 182, 215]) {
    const rows = await smoke(id);
    console.log(`SF ${id}: GLOBAL OK (${rows} linha(s)).`);
  }
  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ativar filtros de diretoria por coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
