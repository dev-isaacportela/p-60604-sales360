import 'dotenv/config';
import {
  configureSdkMitra,
  createDataLoaderMitra,
  createServerFunctionMitra,
  deleteServerFunctionMitra,
  executeDataLoaderMitra,
  executeServerFunctionMitra,
  listDataLoadersMitra,
  readServerFunctionMitra,
  updateDataLoaderMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'FORNECEDORES_TOTVS';
const FORNECEDORES_QUERY = `
SELECT
  CODFORNEC,
  FORNECEDOR
FROM PCFORNEC
WHERE CODFORNEC IS NOT NULL
`;
const analyticsRcaMixProdutosId = 184;

function getDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
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

async function testPcfornecQuery() {
  const created = await createServerFunctionMitra({
    projectId,
    name: `tmpValidarPcfornec${Date.now()}`,
    type: 'SQL',
    jdbcId: WINTHOR_JDBC_ID,
    code: `${FORNECEDORES_QUERY}\nAND ROWNUM <= 10`,
    description: 'Validação temporária da consulta PCFORNEC.',
  });
  const serverFunctionId = created?.result?.serverFunctionId || created?.result?.id || created?.id;

  try {
    const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input: {} });
    const status = String(response?.result?.executionStatus || '');
    const error = String(response?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
    const rows = extractRows(response);
    if (rows.length === 0) throw new Error('PCFORNEC não retornou registros na amostra.');
    return rows;
  } finally {
    if (serverFunctionId) {
      try { await deleteServerFunctionMitra({ projectId, serverFunctionId }); } catch { /* temporária; não bloquear */ }
    }
  }
}

async function upsertDataLoader() {
  const listed = await listDataLoadersMitra({ projectId });
  const loaders = listed?.result || listed?.data || [];
  const existing = loaders.find((item) => item.name === DATA_LOADER_NAME);

  if (existing?.id) {
    await updateDataLoaderMitra({
      projectId,
      dataLoaderId: existing.id,
      name: DATA_LOADER_NAME,
      jdbcId: WINTHOR_JDBC_ID,
      query: FORNECEDORES_QUERY,
      runWhenCreate: false,
    });
    return existing.id;
  }

  const created = await createDataLoaderMitra({
    projectId,
    jdbcId: WINTHOR_JDBC_ID,
    name: DATA_LOADER_NAME,
    query: FORNECEDORES_QUERY,
    runWhenCreate: false,
  });
  const id = getDataLoaderId(created);
  if (!id) throw new Error('Data Loader de fornecedores criado sem ID retornado.');
  return id;
}

function updateMixCode(code) {
  let next = String(code || '');

  const fornecedorBlockHasJoin = /VENDAS_FORNECEDOR AS \([\s\S]*?IMP_FORNECEDORES_TOTVS\s+IFT[\s\S]*?GROUP BY COALESCE\(V\.CODFORNEC, 0\)/i.test(next);

  if (!/IMP_FORNECEDORES_TOTVS\s+IFT/i.test(next)) {
    next = next.replace(
      /JOIN PERIODO P ON 1 = 1\n  WHERE V\.CODPROD IS NOT NULL/,
      `JOIN PERIODO P ON 1 = 1
  LEFT JOIN IMP_FORNECEDORES_TOTVS IFT ON IFT.CODFORNEC = V.CODFORNEC
  WHERE V.CODPROD IS NOT NULL`,
    );
  }

  if (!fornecedorBlockHasJoin) {
    next = next.replace(
      /(VENDAS_FORNECEDOR AS \([\s\S]*?JOIN PERIODO P ON 1 = 1\n)  WHERE V\.CODPROD IS NOT NULL/,
      `$1  LEFT JOIN IMP_FORNECEDORES_TOTVS IFT ON IFT.CODFORNEC = V.CODFORNEC
  WHERE V.CODPROD IS NOT NULL`,
    );
  }

  next = next.replace(
    /CONCAT\('Fornecedor ', COALESCE\(CAST\(V\.CODFORNEC AS CHAR\), 'não informado'\)\) AS FORNECEDOR,/,
    `COALESCE(NULLIF(TRIM(CAST(MAX(IFT.FORNECEDOR) AS CHAR)), ''), CONCAT('Fornecedor ', COALESCE(CAST(V.CODFORNEC AS CHAR), 'não informado'))) AS FORNECEDOR,`,
  );

  next = next.replace(
    /GROUP BY COALESCE\(V\.CODFORNEC, 0\)/,
    'GROUP BY COALESCE(V.CODFORNEC, 0)',
  );

  if (!/VENDAS_FORNECEDOR AS \([\s\S]*?IMP_FORNECEDORES_TOTVS\s+IFT[\s\S]*?GROUP BY COALESCE\(V\.CODFORNEC, 0\)/i.test(next)) {
    throw new Error('Não foi possível inserir join com IMP_FORNECEDORES_TOTVS no bloco de fornecedores.');
  }
  return next;
}

async function updateAnalyticsJoin() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: analyticsRcaMixProdutosId });
  const code = current?.result?.code || '';
  const nextCode = updateMixCode(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: analyticsRcaMixProdutosId,
      code: nextCode,
      description: current?.result?.description || 'Mix de produtos com distribuição por fornecedor.',
    });
  }
}

async function smokeAnalytics() {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: analyticsRcaMixProdutosId,
    input: { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', dataInicio: '2026-01-01', dataFim: '2026-01-31', departamentos: '', ramos: '', limit: '5', offset: '0' },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);
  return extractRows(response).filter((row) => row.TIPO === 'FORNECEDOR');
}

async function main() {
  const sample = await testPcfornecQuery();
  console.log(`PCFORNEC: amostra OK (${sample.length} registro(s)).`);

  const dataLoaderId = await upsertDataLoader();
  await executeDataLoaderMitra({ projectId, dataLoaderId });
  console.log(`Data Loader ${dataLoaderId}: FORNECEDORES_TOTVS executado.`);

  await updateAnalyticsJoin();
  const fornecedores = await smokeAnalytics();
  console.log(`SF ${analyticsRcaMixProdutosId}: join com fornecedores OK (${fornecedores.length} fornecedor(es)).`);
}

main().catch((error) => {
  console.error('Falha ao importar PCFORNEC e ajustar join de fornecedores:');
  console.error(error?.message || error);
  process.exit(1);
});
