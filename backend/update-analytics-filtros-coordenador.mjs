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
const ANALYTICS_IDS = [181, 182, 183, 184, 185, 186, 187, 188];

const FILIAIS_INPUT = `CASE
      WHEN '{{filiais}}' = '' OR LOCATE('{', '{{filiais}}') > 0 THEN NULL
      ELSE TRIM('{{filiais}}')
    END AS FILIAIS_PARAM,`;

const SECOES_INPUT = `CASE
      WHEN '{{secoes}}' = '' OR LOCATE('{', '{{secoes}}') > 0 THEN NULL
      ELSE TRIM('{{secoes}}')
    END AS SECOES_PARAM,`;

function addInputs(code) {
  if (code.includes('FILIAIS_PARAM') && code.includes('SECOES_PARAM')) return code;
  return code
    .replace(
      /END AS DATA_FIM,\n    CASE\n      WHEN '\{\{departamentos\}\}'/,
      `END AS DATA_FIM,
    ${FILIAIS_INPUT}
    CASE
      WHEN '{{departamentos}}'`,
    )
    .replace(
      /END AS DEPARTAMENTOS_PARAM,\n    CASE\n      WHEN '\{\{ramos\}\}'/,
      `END AS DEPARTAMENTOS_PARAM,
    ${SECOES_INPUT}
    CASE
      WHEN '{{ramos}}'`,
    );
}

function addFilialFilter(code, alias, dateColumn) {
  const dateLine = `AND ${alias}.${dateColumn} <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')`;
  const filter = `${dateLine}
    AND (
      P.FILIAIS_PARAM IS NULL
      OR INSTR(CONCAT('|', P.FILIAIS_PARAM, '|'), CONCAT('|', TRIM(CAST(${alias}.CODFILIAL AS CHAR)), '|')) > 0
    )`;
  return code.split(dateLine).join(filter);
}

function addSecaoFilter(code, alias) {
  const deptBlock = `AND (
      P.DEPARTAMENTOS_PARAM IS NULL
      OR INSTR(CONCAT('|', P.DEPARTAMENTOS_PARAM, '|'), CONCAT('|', TRIM(CAST(${alias}.CODEPTO AS CHAR)), '|')) > 0
    )`;
  const withSecao = `${deptBlock}
    AND (
      P.SECOES_PARAM IS NULL
      OR INSTR(CONCAT('|', P.SECOES_PARAM, '|'), CONCAT('|', TRIM(CAST(${alias}.CODSEC AS CHAR)), '|')) > 0
    )`;
  return code.split(deptBlock).join(withSecao);
}

function addRuntimeFilters(code) {
  if (code.includes('P.FILIAIS_PARAM') && code.includes('P.SECOES_PARAM')) return code;
  let next = addFilialFilter(code, 'V', 'DTSAIDA');
  next = addFilialFilter(next, 'D', 'DATA_DEVOLUCAO');
  next = addSecaoFilter(next, 'V');
  next = addSecaoFilter(next, 'D');
  return next;
}

const FILIAIS_CTE = `FILIAIS AS (
  SELECT
    TRIM(CAST(V.CODFILIAL AS CHAR)) AS VALUE,
    CONCAT('Filial ', TRIM(CAST(V.CODFILIAL AS CHAR))) AS LABEL
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  
    JOIN BU_SCOPE BS
      ON BS.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
     AND BS.ID_BU = TRIM(CAST(V.CODEPTO AS CHAR))
     AND (
       BS.ID_SECAO IS NULL
       OR TRIM(CAST(BS.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
       OR LPAD(TRIM(CAST(BS.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
     )
  
  
    JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID
  
  WHERE V.CODFILIAL IS NOT NULL
  GROUP BY TRIM(CAST(V.CODFILIAL AS CHAR))

  UNION

  SELECT
    B.CODFILIAL AS VALUE,
    CONCAT('Filial ', B.CODFILIAL) AS LABEL
  FROM BU_SCOPE B
),`;

const SECOES_CTE = `SECOES AS (
  SELECT
    TRIM(CAST(V.CODSEC AS CHAR)) AS VALUE,
    COALESCE(NULLIF(TRIM(CAST(MAX(V.SECAO) AS CHAR)), ''), CONCAT('Seção ', V.CODSEC)) AS LABEL
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  
    JOIN BU_SCOPE BS
      ON BS.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
     AND BS.ID_BU = TRIM(CAST(V.CODEPTO AS CHAR))
     AND (
       BS.ID_SECAO IS NULL
       OR TRIM(CAST(BS.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
       OR LPAD(TRIM(CAST(BS.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
     )
  
  
    JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID
  
  WHERE V.CODSEC IS NOT NULL
  GROUP BY TRIM(CAST(V.CODSEC AS CHAR)), V.CODSEC

  UNION

  SELECT
    CAST(B.ID_SECAO AS CHAR) AS VALUE,
    CONCAT('Seção ', B.ID_SECAO) AS LABEL
  FROM BU_SCOPE B
  WHERE B.ID_SECAO IS NOT NULL
),`;

function updateOptionsSql(code) {
  if (!code.includes("SELECT 'DEPARTAMENTO' AS TIPO")) return code;
  let next = code;
  if (!next.includes('FILIAIS AS (')) {
    next = next.replace('DEPARTAMENTOS AS (', `${FILIAIS_CTE}
DEPARTAMENTOS AS (`);
  }
  if (!next.includes('SECOES AS (')) {
    next = next.replace('RAMOS AS (', `${SECOES_CTE}
RAMOS AS (`);
  }
  if (!next.includes("SELECT 'FILIAL' AS TIPO")) {
    next = next.replace(
      "SELECT 'DEPARTAMENTO' AS TIPO, VALUE, LABEL\nFROM DEPARTAMENTOS",
      "SELECT 'FILIAL' AS TIPO, VALUE, LABEL\nFROM FILIAIS\nWHERE VALUE IS NOT NULL AND VALUE <> ''\nUNION ALL\nSELECT 'DEPARTAMENTO' AS TIPO, VALUE, LABEL\nFROM DEPARTAMENTOS",
    );
  }
  if (!next.includes("SELECT 'SECAO' AS TIPO")) {
    next = next.replace(
      "SELECT 'RAMO' AS TIPO, VALUE, LABEL\nFROM RAMOS",
      "SELECT 'SECAO' AS TIPO, VALUE, LABEL\nFROM SECOES\nWHERE VALUE IS NOT NULL AND VALUE <> ''\nUNION ALL\nSELECT 'RAMO' AS TIPO, VALUE, LABEL\nFROM RAMOS",
    );
  }
  return next;
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
      scopeMode: 'ME', scopeUserId: '', scopeCodRca: '',
      dataInicio: '2026-01-01', dataFim: '2026-01-31',
      filiais: '', departamentos: '', secoes: '', ramos: '',
      limit: '5', offset: '0', ANO: '2026', MES: '1',
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  const updated = [];
  for (const id of ANALYTICS_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const original = current?.result?.code || '';
    let next = addInputs(original);
    next = addRuntimeFilters(next);
    if (id === 181) next = updateOptionsSql(next);
    if (next !== original) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: id,
        code: next,
        description: current?.result?.description || `Analytics ${id} com filtros de coordenador`,
      });
      updated.push(id);
    }
  }

  for (const id of [181, 182, 184, 188]) {
    const rows = await smoke(id);
    console.log(`SF ${id}: filtros de coordenador OK (${rows} linha(s)).`);
  }
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar filtros de coordenador no Analytics:');
  console.error(error?.message || error);
  process.exit(1);
});
