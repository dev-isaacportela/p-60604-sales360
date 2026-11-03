import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 27;

function ramoExpression() {
  return `COALESCE(
    NULLIF(TRIM(CAST(ICT_RAMO.RAMO AS CHAR)), ''),
    NULLIF(NULLIF(TRIM(CAST(C.SEGMENTO AS CHAR)), ''), 'WINTHOR'),
    'Sem ramo'
  )`;
}

function addRamoToCarteiraSql(code) {
  let next = code;

  if (!/\bRAMO_CLIENTE\b/i.test(next)) {
    next = next.replace(
      /(\n\s*C\.SEGMENTO,\n)/,
      `$1  MAX(${ramoExpression()}) AS RAMO_CLIENTE,\n`,
    );
  }

  if (!/\bJOIN\s+IMP_CLIENTES_TOTVS\s+ICT_RAMO\b/i.test(next)) {
    next = next.replace(
      /(FROM CLIENTES C\n)/,
      `$1LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO\n  ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)\n`,
    );
  }

  if (!/\bRAMO_CLIENTE\b/i.test(next) || !/\bICT_RAMO\b/i.test(next)) {
    throw new Error('Nao foi possivel inserir RAMO_CLIENTE na SQL da carteira.');
  }

  return next;
}

const current = await readServerFunctionMitra({ projectId, serverFunctionId });
const currentCode = String(current?.result?.code || '');
const nextCode = addRamoToCarteiraSql(currentCode);

if (nextCode === currentCode) {
  console.log('minhaCarteiraClientes ja retorna RAMO_CLIENTE.');
} else {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: current?.result?.description || 'Lista clientes da carteira com ramo do cliente.',
  });
  console.log('minhaCarteiraClientes atualizada com RAMO_CLIENTE.');
}
