import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
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

configureSdkMitra({ baseURL, token: process.env.MITRA_TOKEN, integrationURL });

const projectId = Number(process.env.MITRA_PROJECT_ID);
const CALCULAR_BW_ID = 104;
const LISTAR_RAMOS_NAME = 'listarRamosClientesTotvs';

const RAMOS_SQL = `
  SELECT DISTINCT
    CASE
      WHEN ICT.RAMO IS NULL OR TRIM(CAST(ICT.RAMO AS CHAR)) = '' THEN 'Sem ramo'
      ELSE TRIM(CAST(ICT.RAMO AS CHAR))
    END AS NOME
  FROM IMP_CLIENTES_TOTVS ICT
  ORDER BY NOME
`;

function patchCalcularBw(code) {
  let next = String(code || '');

  if (!/RAMO_PARAM/.test(next)) {
    next = next.replace(
      /CASE WHEN '\{\{segmento\}\}' = '' OR LOCATE\('\{', '\{\{segmento\}\}'\) > 0 THEN NULL ELSE UPPER\('\{\{segmento\}\}'\) END AS SEGMENTO_PARAM,/,
      "CASE WHEN '{{ramoCliente}}' = '' OR LOCATE('{', '{{ramoCliente}}') > 0 THEN NULL ELSE UPPER('{{ramoCliente}}') END AS RAMO_PARAM,",
    );
  }

  next = next.replace(
    /\n\s*AND \(I\.SEGMENTO_PARAM IS NULL OR UPPER\(R\.SEGMENTO\) = I\.SEGMENTO_PARAM\)/g,
    '',
  );

  if (!/BASE_ATUAL_RAW[\s\S]*?ICT_FILTRO/.test(next)) {
    next = next.replace(
      /JOIN INPUTS I ON 1 = 1\n\s*JOIN BU_SCOPE B ON/,
      `JOIN INPUTS I ON 1 = 1
      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
      LEFT JOIN IMP_CLIENTES_TOTVS ICT_FILTRO ON CAST(ICT_FILTRO.CODCLI AS CHAR) = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
      JOIN BU_SCOPE B ON`,
    );
  }

  next = next.replace(
    /JOIN PERIODO_ANTERIOR PA ON 1 = 1\n\s*JOIN BU_SCOPE B ON/,
    `JOIN PERIODO_ANTERIOR PA ON 1 = 1
      LEFT JOIN CLIENTES C_RM ON C_RM.ID = R.CLIENTE_ID
      LEFT JOIN IMP_CLIENTES_TOTVS ICT_FILTRO ON CAST(ICT_FILTRO.CODCLI AS CHAR) = CAST(COALESCE(C_RM.WINTHOR_CODCLI, C_RM.ID) AS CHAR)
      JOIN BU_SCOPE B ON`,
  );

  const filtroRamo = `
        AND (
          I.RAMO_PARAM IS NULL
          OR UPPER(CASE
            WHEN ICT_FILTRO.RAMO IS NULL OR TRIM(CAST(ICT_FILTRO.RAMO AS CHAR)) = '' THEN 'Sem ramo'
            ELSE TRIM(CAST(ICT_FILTRO.RAMO AS CHAR))
          END) = I.RAMO_PARAM
        )`;

  if (!/I\.RAMO_PARAM IS NULL/.test(next)) {
    next = next.replace(
      /(\n\s*AND \(I\.CODFILIAL_PARAM IS NULL OR TRIM\(COALESCE\(CAST\(R\.CODFILIAL AS CHAR\), ''\)\) = I\.CODFILIAL_PARAM\))/g,
      `${filtroRamo}$1`,
    );
  }

  return next;
}

async function upsertRamosSf() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf?.name === LISTAR_RAMOS_NAME);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: Number(existing.id),
      code: RAMOS_SQL,
      description: 'Lista ramos reais dos clientes importados do TOTVS',
    });
    console.log(`SF ${LISTAR_RAMOS_NAME} atualizada (ID ${existing.id}).`);
    return Number(existing.id);
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: LISTAR_RAMOS_NAME,
    type: 'SQL',
    code: RAMOS_SQL,
    description: 'Lista ramos reais dos clientes importados do TOTVS',
  });
  const id = Number(created?.result?.serverFunctionId || created?.result?.id || created?.id || 0);
  if (!id) throw new Error(`Não foi possível obter o ID da SF ${LISTAR_RAMOS_NAME}.`);
  console.log(`SF ${LISTAR_RAMOS_NAME} criada (ID ${id}).`);
  return id;
}

async function updateCalcularBw() {
  const sf = await readServerFunctionMitra({ projectId, serverFunctionId: CALCULAR_BW_ID });
  const currentCode = sf?.result?.code || '';
  const nextCode = patchCalcularBw(currentCode);

  if (nextCode === currentCode) {
    console.log(`SF ${CALCULAR_BW_ID} sem alteração.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: CALCULAR_BW_ID,
    code: nextCode,
    description: sf?.result?.description || 'Calcula acompanhamento semanal filtrando por ramo TOTVS',
    jdbcId: sf?.result?.jdbcId || undefined,
  });
  console.log(`SF ${CALCULAR_BW_ID} republicada com filtro por ramo.`);
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');
  const listarRamosId = await upsertRamosSf();
  await updateCalcularBw();
  console.log(JSON.stringify({ listarRamosId, calcularBwId: CALCULAR_BW_ID }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao trocar acompanhamento para filtro por ramo:');
  console.error(error?.message || error);
  process.exit(1);
});
