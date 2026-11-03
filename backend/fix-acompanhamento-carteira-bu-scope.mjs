import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
  executeServerFunctionMitra,
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
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const CALCULAR_BW_ID = 104;

function patchWeeklyScope(code) {
  let next = String(code || '');

  if (!next.includes('BASE_ATUAL_RAW') || !next.includes('JOIN BU_SCOPE B ON')) {
    throw new Error('A SF semanal não está no formato RAW esperado para o patch de carteira + BU.');
  }

  if (!next.includes('CARTEIRA_SCOPE AS (')) {
    next = next.replace(
      /(BU_SCOPE AS \([\s\S]*?\n\s*\),)\n\s*CLIENTES_RAMO AS \(/,
      `$1
    CARTEIRA_SCOPE AS (
      SELECT DISTINCT
        TU.USER_ID AS TARGET_USER_ID,
        C.ID AS CLIENTE_ID,
        TRIM(CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)) AS CODCLI
      FROM TARGET_USERS TU
      JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = TU.USER_ID
      JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
      WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL
    ),
    CLIENTES_RAMO AS (`,
    );
  }

  const carteiraJoin = `JOIN CARTEIRA_SCOPE CS ON CS.TARGET_USER_ID = B.TARGET_USER_ID
        AND (
          (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
          OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
        )`;

  next = next.replace(
    /JOIN BU_SCOPE B ON ([\s\S]*?)\n\s*LEFT JOIN CLIENTES C_RM ON C_RM\.ID = R\.CLIENTE_ID/g,
    (match) => (match.includes('JOIN CARTEIRA_SCOPE CS') ? match : match.replace(/\n\s*LEFT JOIN CLIENTES C_RM/, `\n      ${carteiraJoin}\n      LEFT JOIN CLIENTES C_RM`)),
  );

  next = next.replace(
    /'Escopo semanal alinhado ao Dashboard: RAW \+ CODFILIAL \+ CODEPTO \+ CODSEC via BU_VENDEDOR'/g,
    "'Escopo semanal alinhado: cliente na carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR'",
  );

  next = next.replace(
    /'Exibindo apenas clientes da carteira do vendedor selecionado'/g,
    "'Escopo semanal alinhado: cliente na carteira + filial + departamento + secao'",
  );

  if (!next.includes('JOIN CARTEIRA_SCOPE CS')) {
    throw new Error('Patch não conseguiu inserir o cruzamento com CARTEIRA_SCOPE.');
  }

  return next;
}

function extractOutputRows(result) {
  let output = result?.result?.output;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return [];
    }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  return [];
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');

  const sf = await readServerFunctionMitra({ projectId, serverFunctionId: CALCULAR_BW_ID });
  const currentCode = sf?.result?.code || '';
  const nextCode = patchWeeklyScope(currentCode);

  if (nextCode === currentCode) {
    console.log('SF semanal já estava com carteira + BU aplicada.');
  } else {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: CALCULAR_BW_ID,
      code: nextCode,
      description: 'Calcula B/W semanal usando cliente na carteira e escopo de filial, departamento e seção.',
      jdbcId: sf?.result?.jdbcId || undefined,
    });
    console.log('SF semanal atualizada com regra cliente na carteira + filial + departamento + seção.');
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: CALCULAR_BW_ID,
    input: {
      vendedorId: '',
      scopeMode: 'ME',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
      ramoCliente: '',
      mes: '',
      ano: '',
      semanaNumero: '',
    },
  });
  console.log(JSON.stringify({ smokeRows: extractOutputRows(smoke).length }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao aplicar regra de carteira + BU no acompanhamento semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
