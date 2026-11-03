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
const jdbcId = 1;

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

const RAMO_EXPR = `COALESCE(NULLIF(TRIM(ICT.RAMO), ''), NULLIF(TRIM(C.SEGMENTO), ''), 'Sem ramo')`;

const TARGET_SCOPE_CTES = `
INPUTS AS (
  SELECT
    CASE WHEN '{{codRca}}' REGEXP '^[0-9]+$' THEN CAST('{{codRca}}' AS UNSIGNED) ELSE NULL END AS COD_RCA_PARAM,
    CASE WHEN '{{ramo}}' = '' OR LOCATE('{', '{{ramo}}') > 0 THEN NULL ELSE UPPER(TRIM('{{ramo}}')) END AS RAMO_PARAM,
    CASE WHEN '{{busca}}' = '' OR LOCATE('{', '{{busca}}') > 0 THEN NULL ELSE UPPER(TRIM('{{busca}}')) END AS BUSCA_PARAM
),
COORD AS (
  SELECT C.COD_SUPERVISOR
  FROM COORDENADORES C
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
  LIMIT 1
),
ESCOPO_BU AS (
  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
TARGET_SCOPE AS (
  SELECT
    MIN(VR.USER_ID) AS USER_ID,
    VR.COD_RCA,
    BV.CODFILIAL,
    BV.ID_SECAO,
    BV.BU_CODIGO
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  JOIN INPUTS I ON I.COD_RCA_PARAM = VR.COD_RCA
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND I.COD_RCA_PARAM IS NOT NULL
  GROUP BY VR.COD_RCA, BV.CODFILIAL, BV.ID_SECAO, BV.BU_CODIGO
  ORDER BY BV.CODFILIAL, BV.ID_SECAO
  LIMIT 1
)
`;

const SQL_LISTAR_DISPONIVEIS = `
  WITH
  ${TARGET_SCOPE_CTES}
  SELECT
    C.ID,
    COALESCE(C.WINTHOR_CODCLI, C.ID) AS CODCLI,
    C.WINTHOR_CODCLI,
    C.RAZAO_SOCIAL,
    C.NOME_FANTASIA,
    COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), NULLIF(TRIM(C.RAZAO_SOCIAL), ''), ICT.CLIENTE, CONCAT('Cliente ', C.ID)) AS CLIENTE,
    C.CNPJ,
    C.CIDADE,
    C.UF,
    C.SEGMENTO,
    ${RAMO_EXPR} AS RAMO_ATIVIDADE,
    C.STATUS,
    TS.CODFILIAL,
    TS.ID_SECAO,
    TS.BU_CODIGO
  FROM TARGET_SCOPE TS
  JOIN CLIENTES C ON 1 = 1
  LEFT JOIN IMP_CLIENTES_TOTVS ICT ON ICT.CODCLI = COALESCE(C.WINTHOR_CODCLI, C.ID)
  JOIN INPUTS I ON 1 = 1
  WHERE (I.RAMO_PARAM IS NULL OR UPPER(${RAMO_EXPR}) = I.RAMO_PARAM)
    AND ${RAMO_EXPR} <> 'PESSOA FISICA'
    AND (
      I.BUSCA_PARAM IS NULL
      OR UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(ICT.CLIENTE, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(C.ID AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(C.CNPJ, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = C.ID
        AND EC.CODFILIAL = TS.CODFILIAL
        AND EC.ID_SECAO = TS.ID_SECAO
        AND BV.BU_CODIGO = TS.BU_CODIGO
    )
  ORDER BY CLIENTE
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_DISPONIVEIS = `
  WITH
  ${TARGET_SCOPE_CTES}
  SELECT COUNT(*) AS TOTAL
  FROM TARGET_SCOPE TS
  JOIN CLIENTES C ON 1 = 1
  LEFT JOIN IMP_CLIENTES_TOTVS ICT ON ICT.CODCLI = COALESCE(C.WINTHOR_CODCLI, C.ID)
  JOIN INPUTS I ON 1 = 1
  WHERE (I.RAMO_PARAM IS NULL OR UPPER(${RAMO_EXPR}) = I.RAMO_PARAM)
    AND ${RAMO_EXPR} <> 'PESSOA FISICA'
    AND (
      I.BUSCA_PARAM IS NULL
      OR UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(ICT.CLIENTE, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(C.ID AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(C.CNPJ, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = C.ID
        AND EC.CODFILIAL = TS.CODFILIAL
        AND EC.ID_SECAO = TS.ID_SECAO
        AND BV.BU_CODIGO = TS.BU_CODIGO
    )
`;

const SQL_ADICIONAR_CLIENTE = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CRIADO_EM)
  WITH
  ${TARGET_SCOPE_CTES}
  SELECT
    {{clienteId}},
    TS.USER_ID,
    TS.CODFILIAL,
    TS.ID_SECAO,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM TARGET_SCOPE TS
  WHERE EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}})
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR = TS.USER_ID
        AND EC.CODFILIAL = TS.CODFILIAL
        AND EC.ID_SECAO = TS.ID_SECAO
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.CODFILIAL = TS.CODFILIAL
        AND EC.ID_SECAO = TS.ID_SECAO
        AND BV.BU_CODIGO = TS.BU_CODIGO
    )
`;

const definitions = [
  {
    name: 'gestaoCarteiraCoordenadorClientesDisponiveis',
    description: 'Lista clientes disponíveis para adicionar à carteira de um vendedor no escopo do coordenador.',
    code: SQL_LISTAR_DISPONIVEIS,
  },
  {
    name: 'gestaoCarteiraCoordenadorContarClientesDisponiveis',
    description: 'Conta clientes disponíveis para adicionar à carteira de um vendedor no escopo do coordenador.',
    code: SQL_CONTAR_DISPONIVEIS,
  },
  {
    name: 'gestaoCarteiraCoordenadorAdicionarCliente',
    description: 'Adiciona um cliente disponível à carteira de um vendedor no escopo do coordenador.',
    code: SQL_ADICIONAR_CLIENTE,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const definition of definitions) {
    const found = existing.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: definition.code, description: definition.description, jdbcId });
      ids[definition.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({ projectId, name: definition.name, type: 'SQL', code: definition.code, description: definition.description, jdbcId });
    ids[definition.name] = extractSfId(created);
  }

  return ids;
}

async function smoke(ids) {
  const input = { codRca: '', ramo: '', busca: '', limit: '1', offset: '0' };
  const checks = [
    ['gestaoCarteiraCoordenadorClientesDisponiveis', input],
    ['gestaoCarteiraCoordenadorContarClientesDisponiveis', input],
    ['gestaoCarteiraCoordenadorAdicionarCliente', { ...input, clienteId: '0' }],
  ];

  for (const [name, params] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input: params });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Funções para adicionar cliente na Gestão de Carteira configuradas.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar adição de cliente na Gestão de Carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
