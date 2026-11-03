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
const TARGETS = [
  { id: 27, name: 'minhaCarteiraClientes' },
  { id: 84, name: 'minhaCarteiraClientesRanking' },
];

function ramoExpr(alias = 'ICT_RAMO') {
  return `CASE
    WHEN ${alias}.RAMO IS NULL OR TRIM(CAST(${alias}.RAMO AS CHAR)) = '' THEN 'Sem ramo'
    ELSE TRIM(CAST(${alias}.RAMO AS CHAR))
  END`;
}

function addRamoJoin(code) {
  if (/\bIMP_CLIENTES_TOTVS\b/i.test(code)) return code;
  return code.replace(
    /(JOIN CLIENTES C ON C\.ID = CL\.ID_CLIENTE\n)/,
    `$1      LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)\n`,
  );
}

function addRamoSelect(code) {
  if (/\bRAMO_CLIENTE\b/i.test(code)) return code;
  return code.replace(
    /(\n\s*C\.SEGMENTO,\n)/,
    `$1        MAX(${ramoExpr('ICT_RAMO')}) AS RAMO_CLIENTE,\n`,
  );
}

function addRamoFilter(code) {
  if (/ramoCliente/i.test(code)) return code;
  return code.replace(
    /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\))/,
    `$1\n        AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${ramoExpr('ICT_RAMO')} = '{{ramoCliente}}')`,
  );
}

function transform(code, id) {
  let next = addRamoJoin(code);
  next = addRamoSelect(next);
  if (id === 84) next = addRamoFilter(next);
  return next;
}

async function updateTarget(target) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  const code = String(current?.result?.code || '');
  const next = transform(code, target.id);

  if (next === code) {
    console.log(`${target.name}: sem alterações necessárias.`);
    return;
  }

  if (!/\bRAMO_CLIENTE\b/i.test(next) || !/\bIMP_CLIENTES_TOTVS\b/i.test(next)) {
    throw new Error(`Falha ao aplicar RAMO_CLIENTE em ${target.name}.`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    code: next,
    description: current?.result?.description || `Atualiza ${target.name}`,
  });

  console.log(`${target.name}: atualizado com RAMO_CLIENTE.`);
}

async function smokeTest(target) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    input: {
      busca: '',
      idBu: '',
      segmento: '',
      ramoCliente: '',
      status: '',
      cidade: '',
      uf: '',
      limit: '5',
      offset: '0',
    },
  });

  const output = response?.result?.output;
  const rows = Array.isArray(output?.rows) ? output.rows : [];
  const ramoKeys = rows.map((row) => String(row.RAMO_CLIENTE || ''));
  console.log(`${target.name}: teste retornou ${rows.length} linha(s), ramos=${JSON.stringify(ramoKeys)}`);
}

for (const target of TARGETS) {
  await updateTarget(target);
}

for (const target of TARGETS) {
  await smokeTest(target);
}
