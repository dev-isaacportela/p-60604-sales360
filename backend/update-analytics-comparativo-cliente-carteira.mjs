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

function addClienteInput(code) {
  const start = code.indexOf('INPUTS AS (');
  const end = code.lastIndexOf('PERIODO_BASE AS (');
  if (start === -1 || end === -1 || end <= start) return code;

  const inputs = `INPUTS AS (
  SELECT
    CASE
      WHEN '{{dataInicio}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN '{{dataInicio}}'
      ELSE DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
    END AS DATA_INICIO,
    CASE
      WHEN '{{dataFim}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN '{{dataFim}}'
      ELSE DATE_FORMAT(LAST_DAY(CURRENT_DATE), '%Y-%m-%d')
    END AS DATA_FIM,
    CASE
      WHEN '{{filiais}}' = '' OR LOCATE('{', '{{filiais}}') > 0 THEN NULL
      ELSE TRIM('{{filiais}}')
    END AS FILIAIS_PARAM,
    CASE
      WHEN '{{departamentos}}' = '' OR LOCATE('{', '{{departamentos}}') > 0 THEN NULL
      ELSE TRIM('{{departamentos}}')
    END AS DEPARTAMENTOS_PARAM,
    CASE
      WHEN '{{secoes}}' = '' OR LOCATE('{', '{{secoes}}') > 0 THEN NULL
      ELSE TRIM('{{secoes}}')
    END AS SECOES_PARAM,
    CASE
      WHEN '{{ramos}}' = '' OR LOCATE('{', '{{ramos}}') > 0 THEN NULL
      ELSE TRIM('{{ramos}}')
    END AS RAMOS_PARAM,
    CASE
      WHEN '{{cliente}}' = '' OR LOCATE('{', '{{cliente}}') > 0 THEN NULL
      ELSE TRIM('{{cliente}}')
    END AS CLIENTE_PARAM,
    CASE WHEN '{{limit}}' REGEXP '^[0-9]+$' THEN CAST('{{limit}}' AS UNSIGNED) ELSE 100 END AS LIMIT_PARAM,
    CASE WHEN '{{offset}}' REGEXP '^[0-9]+$' THEN CAST('{{offset}}' AS UNSIGNED) ELSE 0 END AS OFFSET_PARAM
),
`;

  return `${code.slice(0, start)}${inputs}${code.slice(end)}`;
}

function addClienteFilterForAlias(code, alias) {
  if (code.includes(`TRIM(CAST(${alias}.CODCLI AS CHAR)) = P.CLIENTE_PARAM`)) return code;
  const marker = `AND (
      P.RAMOS_PARAM IS NULL
      OR INSTR(
        CONCAT('|', P.RAMOS_PARAM, '|'),
        CONCAT('|', REPLACE(COALESCE(NULLIF(TRIM(CAST(${alias}.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo'), '''', ''), '|')
      ) > 0
    )`;
  const filter = `${marker}
    AND (
      P.CLIENTE_PARAM IS NULL
      OR TRIM(CAST(${alias}.CODCLI AS CHAR)) = P.CLIENTE_PARAM
    )`;
  return code.split(marker).join(filter);
}

function addClienteOptions(code) {
  if (code.includes("SELECT 'CLIENTE' AS TIPO")) return code;
  const clienteCte = `CLIENTES_CARTEIRA AS (
  SELECT
    TRIM(CAST(CS.CODCLI AS CHAR)) AS VALUE,
    CONCAT(COALESCE(NULLIF(TRIM(CAST(MAX(C.NOME_FANTASIA) AS CHAR)), ''), NULLIF(TRIM(CAST(MAX(C.RAZAO_SOCIAL) AS CHAR)), ''), CONCAT('Cliente ', CS.CODCLI)), ' · Cód. ', TRIM(CAST(CS.CODCLI AS CHAR))) AS LABEL
  FROM CARTEIRA_SCOPE CS
  LEFT JOIN CLIENTES C ON C.ID = CS.CLIENTE_ID
  WHERE CS.CODCLI IS NOT NULL
  GROUP BY TRIM(CAST(CS.CODCLI AS CHAR)), CS.CODCLI
),`;
  let next = code.replace('RAMOS AS (', `${clienteCte}
RAMOS AS (`);
  next = next.replace(
    `SELECT 'RAMO' AS TIPO, VALUE, LABEL
FROM RAMOS`,
    `SELECT 'CLIENTE' AS TIPO, VALUE, LABEL
FROM CLIENTES_CARTEIRA
WHERE VALUE IS NOT NULL AND VALUE <> ''
UNION ALL
SELECT 'RAMO' AS TIPO, VALUE, LABEL
FROM RAMOS`,
  );
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

async function updateSf(id, transform, descriptionSuffix) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
  const original = current?.result?.code || '';
  const next = transform(addClienteInput(original));
  if (next === original) return false;
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    code: next,
    description: current?.result?.description || descriptionSuffix,
  });
  return true;
}

async function smoke(id, input = {}) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '',
      dataInicio: '2026-01-01', dataFim: '2026-01-31',
      filiais: '', departamentos: '', secoes: '', ramos: '', cliente: '',
      limit: '5', offset: '0',
      ...input,
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
  return extractRows(response);
}

async function main() {
  const updated = [];
  if (await updateSf(181, addClienteOptions, 'Filtros do Analytics com clientes da carteira.')) updated.push(181);
  if (await updateSf(184, (code) => addClienteFilterForAlias(addClienteFilterForAlias(code, 'V'), 'D'), 'Mix de produtos do Analytics com filtro opcional por cliente da carteira.')) updated.push(184);
  if (await updateSf(186, (code) => addClienteFilterForAlias(addClienteFilterForAlias(code, 'V'), 'D'), 'Top clientes do Analytics com filtro opcional por cliente da carteira.')) updated.push(186);

  const optionsRows = await smoke(181);
  const cliente = optionsRows.find((row) => row.TIPO === 'CLIENTE' && row.VALUE)?.VALUE || '';
  const mixRows = await smoke(184, { cliente });
  const topRows = await smoke(186, { cliente });

  console.log(JSON.stringify({ updated, clienteSmoke: cliente || null, mixRows: mixRows.length, topRows: topRows.length }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao adicionar filtro de cliente no comparativo do Analytics:');
  console.error(error?.message || error);
  process.exit(1);
});
