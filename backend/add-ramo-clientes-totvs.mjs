import 'dotenv/config';
import {
  configureSdkMitra,
  createDataLoaderMitra,
  executeDataLoaderMitra,
  listDataLoadersMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  runDdlMitra,
  runDmlMitra,
  updateDataLoaderMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE || 'https://agent.mitralab.io';
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'CLIENTES_TOTVS';
const STAGING_TABLE = 'IMP_CLIENTES_TOTVS';

const CLIENTES_TOTVS_QUERY = `
SELECT C.CODCLI, C.CLIENTE, A.RAMO
FROM PCCLIENT C
INNER JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
`;

const IMPACTED_SF_IDS = [
  1, 2, 6, 7, 16, 17, 18, 19, 22, 25, 26, 27, 31, 38, 39, 40, 84, 85,
  104, 105, 109, 110, 111, 123, 124, 128, 130, 131, 134, 135, 138,
];

function getDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
}

function isAlreadyExistsError(error) {
  const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return message.includes('already exists')
    || message.includes('duplicate column')
    || message.includes('duplicate key name');
}

function ramoExpr(sourceAlias = 'ICT') {
  return `CASE
    WHEN ${sourceAlias}.RAMO IS NULL OR TRIM(CAST(${sourceAlias}.RAMO AS CHAR)) = '' THEN 'Sem ramo'
    ELSE TRIM(CAST(${sourceAlias}.RAMO AS CHAR))
  END`;
}

function normalizeExistingRamoCase(sql) {
  return String(sql || '').replace(
    /CASE\s+WHEN\s+(ICT(?:_RAMO)?)\.RAMO\s+IS\s+NULL[\s\S]*?END\s+AS\s+RAMO_CLIENTE/gi,
    (_match, alias) => `${ramoExpr(alias)} AS RAMO_CLIENTE`,
  );
}

function ramoFilter(column = 'RAMO_CLIENTE') {
  return `('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${column} = '{{ramoCliente}}')`;
}

function repairSegmentoCondition(sql) {
  return String(sql || '').replace(
    /C\.SEGMENTO\s*,\s*CASE[\s\S]*?END\s+AS\s+RAMO_CLIENTE\s*=\s*'\{\{segmento\}\}'/gi,
    "C.SEGMENTO = '{{segmento}}'",
  );
}

function addRamoFilterCondition(sql) {
  if (/ramoCliente/i.test(sql)) return sql;
  const condition = `\n  AND ${ramoFilter(ramoExpr('ICT_RAMO'))}`;
  if (/\n\s*ORDER\s+BY\b/i.test(sql)) {
    return sql.replace(/(\n\s*ORDER\s+BY\b)/i, `${condition}$1`);
  }
  if (/\n\s*GROUP\s+BY\b/i.test(sql)) {
    return sql.replace(/(\n\s*GROUP\s+BY\b)/i, `${condition}$1`);
  }
  if (/\n\s*LIMIT\b/i.test(sql)) {
    return sql.replace(/(\n\s*LIMIT\b)/i, `${condition}$1`);
  }
  return `${sql}${condition}`;
}

function detectClientesAlias(sql) {
  const match = sql.match(/\b(?:FROM|JOIN)\s+CLIENTES\s+([A-Za-z][A-Za-z0-9_]*)\b/i);
  return match?.[1] || null;
}

function addJoinAfterClientes(sql, alias) {
  if (/\bIMP_CLIENTES_TOTVS\b/i.test(sql)) return sql;
  const join = `  LEFT JOIN ${STAGING_TABLE} ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(${alias}.WINTHOR_CODCLI, ${alias}.ID) AS CHAR)\n`;
  const pattern = new RegExp(`((?:FROM|JOIN)\\s+CLIENTES\\s+${alias}\\b[^\\n]*\\n)`, 'i');
  return sql.replace(pattern, `$1${join}`);
}

function addRamoToSelect(sql, alias) {
  if (/\bRAMO_CLIENTE\b/i.test(sql)) return sql;
  const expression = ramoExpr('ICT_RAMO');
  const segmentoPattern = new RegExp(`(${alias}\\.SEGMENTO(?:\\s+AS\\s+SEGMENTO)?)`, 'i');
  if (segmentoPattern.test(sql)) {
    return sql.replace(segmentoPattern, `$1,\n        ${expression} AS RAMO_CLIENTE`);
  }

  const nomePattern = new RegExp(`(${alias}\\.(?:NOME_FANTASIA|RAZAO_SOCIAL)(?:\\s+AS\\s+[A-Za-z_][A-Za-z0-9_]*)?)`, 'i');
  if (nomePattern.test(sql)) {
    return sql.replace(nomePattern, `$1,\n        ${expression} AS RAMO_CLIENTE`);
  }

  return sql;
}

function addAlertasRamoList(sql) {
  let next = sql;
  if (!/\bRAMO_CLIENTE\b/i.test(next)) {
    next = next.replace(/(\bNOME_CLIENTE\s*,)/i, `$1\n        RAMO_CLIENTE,`);
  }
  if (!/ramoCliente/i.test(next)) {
    next = next.replace(/\bWHERE\b/i, `WHERE ${ramoFilter('COALESCE(AI.RAMO_CLIENTE, \'Sem ramo\')')}\n          AND`);
  }
  return next;
}

function addAlertasRamoCount(sql) {
  let next = sql;
  if (!/ramoCliente/i.test(next)) {
    next = next.replace(/\bWHERE\b/i, `WHERE ${ramoFilter('COALESCE(RAMO_CLIENTE, \'Sem ramo\')')}\n        AND`);
  }
  return next;
}

function addRamoToPopulateAlertas(sql) {
  if (!/INSERT\s+INTO\s+ALERTAS_INTELIGENTES/i.test(sql)) return sql;
  if (/RAMO_CLIENTE/i.test(sql)) return sql;

  let next = sql.replace(/(NOME_CLIENTE,\s*\n)/i, `$1  RAMO_CLIENTE,\n`);
  next = next.replace(/(C\.NOME_CLIENTE,\s*\n)/i, `$1  C.RAMO_CLIENTE,\n`);
  next = addJoinAfterClientes(next, 'C');
  next = addRamoToSelect(next, 'C');
  return next;
}

function addRamoBackfillToAlertasPopularJs(code) {
  if (/\bIMP_CLIENTES_TOTVS\b/i.test(code)) return code;

  const backfillSql = `UPDATE ALERTAS_INTELIGENTES A
    JOIN CLIENTES C ON C.ID = A.ID_CLIENTE
    LEFT JOIN ${STAGING_TABLE} ICT ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
    SET A.RAMO_CLIENTE = ${ramoExpr('ICT')}
    WHERE A.ID_CLIENTE IS NOT NULL
      AND (A.RAMO_CLIENTE IS NULL OR A.RAMO_CLIENTE = '')`;

  const snippet = `\n\n  await runDmlMitra({ projectId, sql: ${JSON.stringify(backfillSql)} });\n`;
  return code.replace(/\n\s*const total = await runQueryMitra\(\{/i, `${snippet}\n  const total = await runQueryMitra({`);
}

function transformSql(sql, sfName) {
  let next = repairSegmentoCondition(normalizeExistingRamoCase(sql));

  if (sfName === 'alertasInteligentesListar') {
    return addAlertasRamoList(next);
  }

  if (sfName === 'alertasInteligentesContarNaoLidos') {
    return addAlertasRamoCount(next);
  }

  if (sfName === 'alertasInteligentesPopular') {
    return addRamoBackfillToAlertasPopularJs(next);
  }

  const alias = detectClientesAlias(next);
  if (!alias) return next;

  next = addJoinAfterClientes(next, alias);
  if (!/^contar/i.test(sfName) && !/^\s*SELECT\s+COUNT\s*\(/i.test(next)) {
    next = addRamoToSelect(next, alias);
  }
  if (['buscarClientes', 'contarClientes', 'minhaCarteiraClientes', 'contarMinhaCarteiraClientes', 'minhaCarteiraClientesRanking', 'listarClientesDisponiveisMinhaBu', 'contarClientesDisponiveisMinhaBu'].includes(sfName)) {
    next = addRamoFilterCondition(next);
  }
  return next;
}

async function upsertDataLoader() {
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => (loader?.name || loader?.NAME || '') === DATA_LOADER_NAME);
  let dataLoaderId = existing ? Number(existing.id || existing.dataLoaderId || existing.ID || 0) : null;

  if (dataLoaderId) {
    await updateDataLoaderMitra({
      projectId,
      dataLoaderId,
      name: DATA_LOADER_NAME,
      jdbcId: WINTHOR_JDBC_ID,
      query: CLIENTES_TOTVS_QUERY,
    });
    console.log(`Data Loader ${DATA_LOADER_NAME} atualizado (ID ${dataLoaderId}).`);
  } else {
    const created = await createDataLoaderMitra({
      projectId,
      jdbcId: WINTHOR_JDBC_ID,
      name: DATA_LOADER_NAME,
      query: CLIENTES_TOTVS_QUERY,
      runWhenCreate: false,
    });
    dataLoaderId = Number(getDataLoaderId(created));
    if (!dataLoaderId) throw new Error(`Não foi possível obter o ID do Data Loader ${DATA_LOADER_NAME}.`);
    console.log(`Data Loader ${DATA_LOADER_NAME} criado (ID ${dataLoaderId}).`);
  }

  await executeDataLoaderMitra({ projectId, dataLoaderId });
  console.log(`Data Loader ${DATA_LOADER_NAME} executado. Tabela ${STAGING_TABLE} atualizada.`);
  return dataLoaderId;
}

async function ensureAlertasColumn() {
  try {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE ALERTAS_INTELIGENTES ADD COLUMN RAMO_CLIENTE VARCHAR(100)',
    });
    console.log('Coluna ALERTAS_INTELIGENTES.RAMO_CLIENTE adicionada.');
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log('Coluna ALERTAS_INTELIGENTES.RAMO_CLIENTE já existe.');
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE INDEX IDX_ALERTAS_RAMO_CLIENTE ON ALERTAS_INTELIGENTES(RAMO_CLIENTE)',
    });
    console.log('Índice IDX_ALERTAS_RAMO_CLIENTE criado.');
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log('Índice IDX_ALERTAS_RAMO_CLIENTE já existe.');
  }
}

async function backfillAlertasRamo() {
  await runDmlMitra({
    projectId,
    sql: `UPDATE ALERTAS_INTELIGENTES A
      JOIN CLIENTES C ON C.ID = A.ID_CLIENTE
      LEFT JOIN ${STAGING_TABLE} ICT ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
      SET A.RAMO_CLIENTE = ${ramoExpr('ICT')}
      WHERE A.ID_CLIENTE IS NOT NULL`,
  });
  console.log('ALERTAS_INTELIGENTES.RAMO_CLIENTE populado a partir do TOTVS.');
}

async function republishServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const byId = new Map((listed?.result || []).map((item) => [Number(item.id), item]));
  const updated = [];
  const unchanged = [];
  const skipped = [];

  for (const sfId of IMPACTED_SF_IDS) {
    const sf = byId.get(sfId);
    if (!sf) {
      skipped.push({ id: sfId, reason: 'não encontrada' });
      continue;
    }

    const sfType = String(sf.type || '').toUpperCase();
    if (sfType !== 'SQL' && sf.name !== 'alertasInteligentesPopular') {
      skipped.push({ id: sfId, name: sf.name, reason: `tipo ${sf.type || 'desconhecido'}` });
      continue;
    }

    const full = await readServerFunctionMitra({ projectId, serverFunctionId: sfId });
    const currentCode = full?.result?.code || sf.code || '';
    const nextCode = transformSql(currentCode, sf.name);

    if (nextCode === currentCode) {
      unchanged.push({ id: sfId, name: sf.name });
      continue;
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: sfId,
      code: nextCode,
      description: full?.result?.description || sf.description || `SF ${sf.name} atualizada com ramo do cliente TOTVS`,
      jdbcId: full?.result?.jdbcId || sf.jdbcId || undefined,
    });
    updated.push({ id: sfId, name: sf.name });
  }

  console.log('Republicação de SFs concluída.');
  console.log(JSON.stringify({ updated, unchanged, skipped }, null, 2));
  return { updated, unchanged, skipped };
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');
  await upsertDataLoader();
  await ensureAlertasColumn();
  await backfillAlertasRamo();
  await republishServerFunctions();
}

main().catch((error) => {
  console.error('Falha ao integrar ramo de atividade TOTVS:');
  console.error(error?.message || error);
  process.exit(1);
});
