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

const PERIODO_CTE = `
PARAMS AS (
  SELECT
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF
),
PERIODO AS (
  SELECT
    P.MES_REF,
    P.ANO_REF,
    DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS DATA_INICIO,
    DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d') AS DATA_FIM
  FROM PARAMS P
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
    name: 'gestaoMetasDiretoriaPermissao',
    description: 'Retorna se o usuario logado pode acessar a Gestao de Metas da Diretoria.',
    code: `
      WITH ${PERMISSAO_CTE}
      SELECT PODE_ACESSAR, CARGO_ATUAL, EMAIL
      FROM PERMISSAO
    `,
  },
  {
    name: 'gestaoMetasDiretoriaBus',
    description: 'Lista BUs disponiveis para cadastro de metas (filial + departamento).',
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
    name: 'gestaoMetasDiretoriaListar',
    description: 'Lista metas por BU com comparativo meta vs realizado no periodo.',
    code: `
      WITH
      ${PERMISSAO_CTE},
      ${PERIODO_CTE},
      ${BU_BASE_CTE},
      VENDAS AS (
        SELECT
          CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
          V.CODEPTO,
          ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO_BRUTO
        FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
        JOIN PERIODO P ON 1 = 1
        WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
          AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= P.DATA_INICIO
          AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < P.DATA_FIM
        GROUP BY CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED), V.CODEPTO
      ),
      DEVOLUCOES AS (
        SELECT
          CAST(TRIM(CAST(D.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
          D.CODEPTO,
          ROUND(SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS DEVOLVIDO
        FROM IMP_DEVOLUCOES_TOTVS D
        JOIN PERIODO P ON 1 = 1
        WHERE TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
          AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) >= P.DATA_INICIO
          AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) < P.DATA_FIM
        GROUP BY CAST(TRIM(CAST(D.CODFILIAL AS CHAR)) AS UNSIGNED), D.CODEPTO
      )
      SELECT
        B.CODFILIAL,
        B.CODEPTO,
        B.DEPARTAMENTO,
        P.MES_REF AS MES,
        P.ANO_REF AS ANO,
        COALESCE(M.META_VALOR, 0) AS META_VALOR,
        COALESCE(V.FATURAMENTO_BRUTO, 0) AS FATURAMENTO_BRUTO,
        COALESCE(D.DEVOLVIDO, 0) AS DEVOLVIDO,
        ROUND(COALESCE(V.FATURAMENTO_BRUTO, 0) - COALESCE(D.DEVOLVIDO, 0), 2) AS REALIZADO_LIQUIDO,
        CASE
          WHEN COALESCE(M.META_VALOR, 0) <= 0 THEN 0
          ELSE ROUND(((COALESCE(V.FATURAMENTO_BRUTO, 0) - COALESCE(D.DEVOLVIDO, 0)) / M.META_VALOR) * 100, 2)
        END AS PERCENTUAL_META
      FROM BU_BASE B
      JOIN PERMISSAO PX ON PX.PODE_ACESSAR = 1
      JOIN PERIODO P ON 1 = 1
      LEFT JOIN METAS_BU M ON M.CODFILIAL = B.CODFILIAL AND M.CODEPTO = B.CODEPTO AND M.MES = P.MES_REF AND M.ANO = P.ANO_REF
      LEFT JOIN VENDAS V ON V.CODFILIAL = B.CODFILIAL AND V.CODEPTO = B.CODEPTO
      LEFT JOIN DEVOLUCOES D ON D.CODFILIAL = B.CODFILIAL AND D.CODEPTO = B.CODEPTO
      ORDER BY B.CODFILIAL, B.CODEPTO
    `,
  },
  {
    name: 'gestaoMetasDiretoriaHistorico',
    description: 'Lista historico de metas cadastradas por periodo e BU.',
    code: `
      WITH
      ${PERMISSAO_CTE},
      FILTROS AS (
        SELECT
          CASE WHEN '{{codfilial}}' REGEXP '^[0-9]+$' THEN CAST('{{codfilial}}' AS UNSIGNED) ELSE NULL END AS CODFILIAL_PARAM,
          CASE WHEN '{{codepto}}' REGEXP '^[0-9]+$' THEN CAST('{{codepto}}' AS UNSIGNED) ELSE NULL END AS CODEPTO_PARAM,
          CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE NULL END AS ANO_PARAM
      )
      SELECT
        M.AUTO_ID,
        M.CODFILIAL,
        M.CODEPTO,
        M.MES,
        M.ANO,
        M.META_VALOR,
        M.CRIADO_POR,
        DATE_FORMAT(M.CREATED_AT, '%Y-%m-%d') AS CREATED_AT,
        DATE_FORMAT(M.UPDATED_AT, '%Y-%m-%d') AS UPDATED_AT
      FROM METAS_BU M
      JOIN PERMISSAO P ON P.PODE_ACESSAR = 1
      JOIN FILTROS F ON 1 = 1
      WHERE (F.CODFILIAL_PARAM IS NULL OR M.CODFILIAL = F.CODFILIAL_PARAM)
        AND (F.CODEPTO_PARAM IS NULL OR M.CODEPTO = F.CODEPTO_PARAM)
        AND (F.ANO_PARAM IS NULL OR M.ANO = F.ANO_PARAM)
      ORDER BY M.ANO DESC, M.MES DESC, M.CODFILIAL, M.CODEPTO
      LIMIT 300
    `,
  },
  {
    name: 'gestaoMetasDiretoriaSalvar',
    description: 'Cria ou atualiza meta mensal por BU para usuarios com perfil Diretoria/Admin.',
    code: `
      INSERT INTO METAS_BU (CODFILIAL, CODEPTO, MES, ANO, META_VALOR, CRIADO_POR, CREATED_AT, UPDATED_AT)
      SELECT
        {{codfilial}},
        {{codepto}},
        {{mes}},
        {{ano}},
        CAST('{{metaValor}}' AS DECIMAL(15,2)),
        COALESCE(U.DESCR, CONCAT('USER ', U.ID)),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM INT_USER U
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
        AND (
          COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN')
          OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
        )
      ON DUPLICATE KEY UPDATE
        META_VALOR = VALUES(META_VALOR),
        CRIADO_POR = VALUES(CRIADO_POR),
        UPDATED_AT = CURRENT_TIMESTAMP
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
  const now = new Date();
  const input = { mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) };
  const checks = [
    ['gestaoMetasDiretoriaPermissao', {}],
    ['gestaoMetasDiretoriaBus', {}],
    ['gestaoMetasDiretoriaListar', input],
    ['gestaoMetasDiretoriaHistorico', { codfilial: '', codepto: '', ano: String(now.getFullYear()) }],
  ];
  for (const [name, sfInput] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input: sfInput });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Gestao de Metas da Diretoria configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Gestao de Metas da Diretoria:');
  console.error(error?.message || error);
  process.exit(1);
});
