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
  { id: 27, name: 'minhaCarteiraClientes', supportsRamoFilter: false },
  { id: 84, name: 'minhaCarteiraClientesRanking', supportsRamoFilter: true },
];

const ramoExpression = `CASE
          WHEN ICT_RAMO.RAMO IS NULL OR TRIM(CAST(ICT_RAMO.RAMO AS CHAR)) = '' THEN 'Sem ramo'
          ELSE TRIM(CAST(ICT_RAMO.RAMO AS CHAR))
        END`;

function addRamoJoin(code) {
  if (/\bIMP_CLIENTES_TOTVS\s+ICT_RAMO\b/i.test(code)) return code;

  const replacements = [
    {
      from: 'JOIN CLIENTES C ON C.ID = CL.ID_CLIENTE\n',
      to: `JOIN CLIENTES C ON C.ID = CL.ID_CLIENTE
      LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
`,
    },
    {
      from: 'FROM CLIENTES C\nJOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = C.ID\n',
      to: `FROM CLIENTES C
LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = C.ID
`,
    },
  ];

  for (const replacement of replacements) {
    if (code.includes(replacement.from)) {
      return code.replace(replacement.from, replacement.to);
    }
  }

  throw new Error('Não encontrei o ponto seguro para inserir o join de ramo.');
}

function addRamoSelect(code) {
  if (/\bRAMO_CLIENTE\b/i.test(code)) return code;

  const replacements = [
    {
      from: '        C.SEGMENTO,\n        C.STATUS,\n',
      to: `        C.SEGMENTO,
        MAX(${ramoExpression}) AS RAMO_CLIENTE,
        C.STATUS,
`,
    },
    {
      from: '  C.SEGMENTO,\n  C.STATUS,\n',
      to: `  C.SEGMENTO,
  MAX(${ramoExpression}) AS RAMO_CLIENTE,
  C.STATUS,
`,
    },
  ];

  for (const replacement of replacements) {
    if (code.includes(replacement.from)) {
      return code.replace(replacement.from, replacement.to);
    }
  }

  throw new Error('Não encontrei o ponto seguro para inserir RAMO_CLIENTE no SELECT.');
}

function addRamoFilter(code) {
  if (/\{\{ramoCliente\}\}/i.test(code)) return code;

  const marker = "        AND ('{{status}}' = '' OR C.STATUS = '{{status}}')\n";
  if (!code.includes(marker)) return code;

  return code.replace(
    marker,
    `${marker}        AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${ramoExpression} = '{{ramoCliente}}')
`,
  );
}

function transform(code, target) {
  let next = addRamoJoin(code);
  next = addRamoSelect(next);
  if (target.supportsRamoFilter) next = addRamoFilter(next);
  return next;
}

async function updateTarget(target) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  const code = String(current?.result?.code || '');
  const next = transform(code, target);

  if (next === code) {
    console.log(`${target.name}: sem alterações necessárias.`);
    return;
  }

  if (!/\bIMP_CLIENTES_TOTVS\s+ICT_RAMO\b/i.test(next) || !/\bRAMO_CLIENTE\b/i.test(next)) {
    throw new Error(`Correção incompleta em ${target.name}.`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    code: next,
    description: current?.result?.description || `Atualiza ${target.name}`,
  });

  console.log(`${target.name}: RAMO_CLIENTE restaurado.`);
}

async function smokeRamos() {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 142,
    input: {},
  });
  const rows = response?.result?.output?.rows || [];
  console.log(`Fonte de ramos: ${rows.length} ramo(s) encontrado(s).`);
}

for (const target of TARGETS) {
  await updateTarget(target);
}

await smokeRamos();
