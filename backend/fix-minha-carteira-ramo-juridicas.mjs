import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
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

function ramoExpr(alias) {
  return `CASE
    WHEN ${alias}.RAMO IS NULL OR TRIM(CAST(${alias}.RAMO AS CHAR)) = '' THEN 'Sem ramo'
    ELSE TRIM(CAST(${alias}.RAMO AS CHAR))
  END`;
}

function removeBadWindowRamoFilter(code) {
  return code.replace(
    /PARTITION BY CLR\.ID_CLIENTE\s+AND\s+\('\{\{ramoCliente\}\}' LIKE '\{\{%'[\s\S]*?END\s*=\s*'\{\{ramoCliente\}\}'\)\s+ORDER BY/g,
    'PARTITION BY CLR.ID_CLIENTE\n        ORDER BY',
  );
}

function repairBaseVendasClienteJoin(code) {
  return code.replace(
    /JOIN CLIENTES CCLI\s+LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO[\s\S]*?\n\s+ON CCLI\.ID/g,
    'JOIN CLIENTES CCLI\n    ON CCLI.ID',
  );
}

function ensureFinalClienteRamoJoin(code) {
  if (/\bICT_CLIENTE\b/.test(code)) return code;
  return code.replace(
    /JOIN CLIENTES C ON C\.ID = CL\.ID_CLIENTE/g,
    `JOIN CLIENTES C ON C.ID = CL.ID_CLIENTE
    LEFT JOIN IMP_CLIENTES_TOTVS ICT_CLIENTE ON CAST(ICT_CLIENTE.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)`,
  );
}

function ensureRamoSelect(code) {
  if (/\bAS RAMO_CLIENTE\b/i.test(code)) return code;
  return code.replace(/(\n\s*C\.SEGMENTO,)/, `$1\n        MAX(${ramoExpr('ICT_CLIENTE')}) AS RAMO_CLIENTE,`);
}

function ensureJuridicaFilter(code, alias) {
  const expr = ramoExpr(alias);
  const juridicaCondition = `AND ${expr} <> 'PESSOA FISICA'`;
  const ramoCondition = `AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${expr} = '{{ramoCliente}}')`;
  let next = code;

  if (!next.includes(juridicaCondition)) {
    next = next.replace(
      /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\))/,
      `$1\n        ${juridicaCondition}`,
    );
  }

  if (!/ramoCliente/i.test(next)) {
    next = next.replace(
      /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\)(?:\n\s*AND CASE[\s\S]*?<>'PESSOA FISICA')?)/,
      `$1\n        ${ramoCondition}`,
    );
  }

  return next;
}

function fixCarteiraList(code) {
  let next = removeBadWindowRamoFilter(code);
  next = repairBaseVendasClienteJoin(next);
  next = ensureFinalClienteRamoJoin(next);
  next = ensureRamoSelect(next);
  next = ensureJuridicaFilter(next, 'ICT_CLIENTE');
  return next;
}

function fixCarteiraCount(code) {
  let next = code;
  const juridicaCondition = `AND ${ramoExpr('ICT_RAMO')} <> 'PESSOA FISICA'`;
  if (!next.includes(juridicaCondition)) {
    next = next.replace(
      /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\))/,
      `$1\n    ${juridicaCondition}`,
    );
  }
  return next;
}

function fixDisponiveis(code) {
  let next = code;
  const juridicaCondition = `AND ${ramoExpr('ICT_RAMO')} <> 'PESSOA FISICA'`;
  if (!next.includes(juridicaCondition)) {
    next = next.replace(
      /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\))/,
      `$1\n      ${juridicaCondition}`,
    );
  }
  if (!/ramoCliente/i.test(next)) {
    next = next.replace(
      /(\n\s*AND \('\{\{uf\}\}' = '' OR C\.UF = '\{\{uf\}\}'\)(?:\n\s*AND CASE[\s\S]*?<>'PESSOA FISICA')?)/,
      `$1\n      AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${ramoExpr('ICT_RAMO')} = '{{ramoCliente}}')`,
    );
  }
  return next;
}

async function updateSf(serverFunctionId, transform) {
  const sf = await readServerFunctionMitra({ projectId, serverFunctionId });
  const currentCode = sf?.result?.code || '';
  const nextCode = transform(currentCode);
  if (nextCode === currentCode) {
    console.log(`SF ${serverFunctionId} (${sf?.result?.name}) sem alteração.`);
    return false;
  }
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: sf?.result?.description || `SF ${serverFunctionId} corrigida para carteira jurídica`,
    jdbcId: sf?.result?.jdbcId || undefined,
  });
  console.log(`SF ${serverFunctionId} (${sf?.result?.name}) republicada.`);
  return true;
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');
  const updated = [];
  if (await updateSf(27, fixCarteiraList)) updated.push(27);
  if (await updateSf(84, fixCarteiraList)) updated.push(84);
  if (await updateSf(38, fixCarteiraCount)) updated.push(38);
  if (await updateSf(39, fixDisponiveis)) updated.push(39);
  if (await updateSf(40, fixDisponiveis)) updated.push(40);
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir Minha Carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
