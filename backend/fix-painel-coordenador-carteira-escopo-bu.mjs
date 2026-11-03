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

const PAINEL_IDS = [154, 155, 156, 189, 190, 191, 192, 193, 194];

const OLD_COORD_CARTEIRA = `CLIENTES_CARTEIRA_COORDENADOR AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  JOIN VENDEDORES_COORDENADOR VC ON VC.VENDEDOR_ID = EC.ID_VENDEDOR
)`;

const NEW_COORD_CARTEIRA = `CLIENTES_CARTEIRA_COORDENADOR AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR
  FROM EQUIPE_CLIENTE EC
  JOIN VENDEDORES_COORDENADOR VC ON VC.VENDEDOR_ID = EC.ID_VENDEDOR
  JOIN BU_VENDEDOR BV_SCOPE
    ON BV_SCOPE.VENDEDOR_ID = EC.ID_VENDEDOR
   AND COALESCE(BV_SCOPE.ATIVO, TRUE) = TRUE
  JOIN ESCOPO_BU E_SCOPE
    ON TRIM(COALESCE(CAST(BV_SCOPE.CODFILIAL AS CHAR), '')) = CAST(E_SCOPE.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV_SCOPE.BU_CODIGO AS CHAR)) = CAST(E_SCOPE.CODEPTO AS CHAR)
  WHERE (
      EC.CODFILIAL IS NULL
      OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = ''
      OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV_SCOPE.CODFILIAL AS CHAR), ''))
    )
    AND (
      EC.ID_SECAO IS NULL
      OR TRIM(COALESCE(CAST(EC.ID_SECAO AS CHAR), '')) = ''
      OR TRIM(CAST(EC.ID_SECAO AS CHAR)) = TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(EC.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR))
    )
)`;

const OLD_BU_CARTEIRA = `CLIENTES_CARTEIRA AS (
        SELECT DISTINCT EC.ID_CLIENTE, EC.ID_VENDEDOR
        FROM EQUIPE_CLIENTE EC
        JOIN VENDEDORES_BU VB ON VB.VENDEDOR_ID = EC.ID_VENDEDOR
      )`;

const NEW_BU_CARTEIRA = `CLIENTES_CARTEIRA AS (
        SELECT DISTINCT EC.ID_CLIENTE, EC.ID_VENDEDOR
        FROM EQUIPE_CLIENTE EC
        JOIN VENDEDORES_BU VB ON VB.VENDEDOR_ID = EC.ID_VENDEDOR
        JOIN BU_VENDEDOR BV_SCOPE
          ON BV_SCOPE.VENDEDOR_ID = EC.ID_VENDEDOR
         AND COALESCE(BV_SCOPE.ATIVO, TRUE) = TRUE
        JOIN BU_SELECIONADA B_SCOPE
          ON TRIM(COALESCE(CAST(BV_SCOPE.CODFILIAL AS CHAR), '')) = CAST(B_SCOPE.CODFILIAL AS CHAR)
         AND TRIM(CAST(BV_SCOPE.BU_CODIGO AS CHAR)) = CAST(B_SCOPE.CODEPTO AS CHAR)
        WHERE (
            EC.CODFILIAL IS NULL
            OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = ''
            OR TRIM(COALESCE(CAST(EC.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV_SCOPE.CODFILIAL AS CHAR), ''))
          )
          AND (
            EC.ID_SECAO IS NULL
            OR TRIM(COALESCE(CAST(EC.ID_SECAO AS CHAR), '')) = ''
            OR TRIM(CAST(EC.ID_SECAO AS CHAR)) = TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR))
            OR LPAD(TRIM(CAST(EC.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(BV_SCOPE.ID_SECAO AS CHAR))
          )
      )`;

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

function patchCode(code) {
  let next = code;
  if (next.includes(OLD_COORD_CARTEIRA) && !next.includes('BV_SCOPE')) {
    next = next.replace(OLD_COORD_CARTEIRA, NEW_COORD_CARTEIRA);
  }
  if (next.includes(OLD_BU_CARTEIRA) && !next.includes('B_SCOPE')) {
    next = next.replace(OLD_BU_CARTEIRA, NEW_BU_CARTEIRA);
  }
  return next;
}

async function smoke(id, input = {}) {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: id,
    input: {
      mes: String(new Date().getMonth() + 1),
      ano: String(new Date().getFullYear()),
      codfilial: '1',
      codepto: '1',
      ...input,
    },
  });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id}: ${error || status}`);
  return extractRows(response).length;
}

async function main() {
  const updated = [];
  const skipped = [];

  for (const id of PAINEL_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const code = current?.result?.code || '';
    const nextCode = patchCode(code);
    if (nextCode === code) {
      skipped.push(id);
      continue;
    }
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      code: nextCode,
      description: current?.result?.description || `Painel do coordenador com carteira filtrada por escopo BU`,
    });
    updated.push(id);
  }

  const current196 = await readServerFunctionMitra({ projectId, serverFunctionId: 196 });
  const code196 = current196?.result?.code || '';
  const next196 = patchCode(code196);
  if (next196 !== code196) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: 196,
      code: next196,
      description: current196?.result?.description || 'Metas por vendedor com realizado filtrado por BU selecionada.',
    });
    updated.push(196);
  } else {
    skipped.push(196);
  }

  for (const id of [154, 155, 190, 196]) {
    const rows = await smoke(id);
    console.log(`SF ${id}: smoke OK (${rows} linha(s)).`);
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao isolar vendas por escopo do coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
