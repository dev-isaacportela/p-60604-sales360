import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

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
const __dirname = dirname(fileURLToPath(import.meta.url));

function extractSf104StableCode() {
  const source = readFileSync(join(__dirname, 'update-sf104-alinhar-escopo-mensal.mjs'), 'utf8');
  const match = source.match(/const SF104_CODE = `([\s\S]*?)`;\n\nasync function main\(\)/);
  if (!match) throw new Error('Nao foi possivel extrair SF104_CODE estavel.');
  return match[1];
}

function addRamoFilter(code) {
  let next = code;

  next = next.replace(
    `    CASE
      WHEN '{{segmento}}' = '' OR LOCATE('{', '{{segmento}}') > 0 THEN NULL
      ELSE UPPER('{{segmento}}')
    END AS SEGMENTO_PARAM,`,
    `    CASE
      WHEN '{{segmento}}' = '' OR LOCATE('{', '{{segmento}}') > 0 THEN NULL
      ELSE UPPER('{{segmento}}')
    END AS SEGMENTO_PARAM,
    CASE
      WHEN '{{ramoCliente}}' = '' OR LOCATE('{', '{{ramoCliente}}') > 0 THEN NULL
      ELSE UPPER('{{ramoCliente}}')
    END AS RAMO_PARAM,`,
  );

  next = next.replace(
    `  JOIN INPUTS I ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID`,
    `  JOIN INPUTS I ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_FILTRO
    ON CAST(ICT_FILTRO.CODCLI AS CHAR) = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
  JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID`,
  );

  next = next.replace(
    `    AND (I.SEGMENTO_PARAM IS NULL OR UPPER(R.SEGMENTO) = I.SEGMENTO_PARAM)
    AND (I.CODFILIAL_PARAM IS NULL OR R.CODFILIAL = I.CODFILIAL_PARAM)`,
    `    AND (I.SEGMENTO_PARAM IS NULL OR UPPER(R.SEGMENTO) = I.SEGMENTO_PARAM)
    AND (
      I.RAMO_PARAM IS NULL
      OR UPPER(CASE
        WHEN ICT_FILTRO.RAMO IS NULL OR TRIM(CAST(ICT_FILTRO.RAMO AS CHAR)) = '' THEN 'Sem ramo'
        ELSE TRIM(CAST(ICT_FILTRO.RAMO AS CHAR))
      END) = I.RAMO_PARAM
    )
    AND (I.CODFILIAL_PARAM IS NULL OR R.CODFILIAL = I.CODFILIAL_PARAM)`,
  );

  next = next.replace(
    `  JOIN PERIODO_ANTERIOR PA ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID`,
    `  JOIN PERIODO_ANTERIOR PA ON 1 = 1
  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = R.CLIENTE_ID
  LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_FILTRO
    ON CAST(ICT_FILTRO.CODCLI AS CHAR) = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
  JOIN ESCOPO_RCA_DEPTO E ON E.TARGET_USER_ID = CS.TARGET_USER_ID`,
  );

  next = next.replace(
    `  BC.SEGMENTO,
  BC.VENDEDOR_ID,`,
    `  BC.SEGMENTO,
  COALESCE(NULLIF(TRIM(CAST(ICT_OUT.RAMO AS CHAR)), ''), 'Sem ramo') AS RAMO_CLIENTE,
  BC.VENDEDOR_ID,`,
  );

  next = next.replace(
    `LEFT JOIN CLIENTES C ON C.ID = BC.CLIENTE_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = BC.VENDEDOR_ID`,
    `LEFT JOIN CLIENTES C ON C.ID = BC.CLIENTE_ID
LEFT JOIN IMP_CLIENTES_TOTVS ICT_OUT
  ON CAST(ICT_OUT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
LEFT JOIN FUNCIONARIOS F ON F.ID = BC.VENDEDOR_ID`,
  );

  if (!next.includes('RAMO_PARAM') || !next.includes('AS RAMO_CLIENTE')) {
    throw new Error('Patch de ramo nao foi aplicado na SF 104.');
  }

  return next;
}

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID invalido.');

  const stableCode = addRamoFilter(extractSf104StableCode());
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: 104 });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 104,
    code: stableCode,
    description: 'Calcula B/W semanal estavel com carteira + COD_RCA + departamento e filtro por ramo TOTVS.',
  });

  console.log(JSON.stringify({
    updated: [{ id: 104, name: current?.result?.name || 'calcular-bw-semanal' }],
    restoredFrom: 'update-sf104-alinhar-escopo-mensal.mjs',
    preserved: ['ramoCliente', 'RAMO_CLIENTE'],
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao restaurar SF 104 da Minha Semana:');
  console.error(error?.message || error);
  process.exit(1);
});
