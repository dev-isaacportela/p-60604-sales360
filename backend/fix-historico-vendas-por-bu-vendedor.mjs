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
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;
const projectId = Number(process.env.MITRA_PROJECT_ID);

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const targets = [
  { id: 25, name: 'historicoPedidosCliente' },
  { id: 26, name: 'detalhesPedidoCliente' },
];

const carteiraScopeBlock = `CARTEIRA_SCOPE AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR AS VENDEDOR_DONO_CLIENTE
  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
),`;

const buScopeBlock = `${carteiraScopeBlock}
BU_SCOPE AS (
  SELECT DISTINCT
    CS.VENDEDOR_DONO_CLIENTE AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM CARTEIRA_SCOPE CS
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = CS.VENDEDOR_DONO_CLIENTE
  JOIN INPUT_SCOPE I ON 1 = 1
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
),`;

const rcaJoinRegex = /\n  JOIN VENDEDOR_RCA VR_VENDA\n    ON VR_VENDA\.USER_ID = CS\.VENDEDOR_DONO_CLIENTE\n   AND CAST\(VR_VENDA\.COD_RCA AS CHAR\) = CAST\(V\.COD_RCA AS CHAR\)/;

const scopeJoin = `
  JOIN BU_SCOPE B
    ON B.TARGET_USER_ID = CS.VENDEDOR_DONO_CLIENTE
   AND B.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
   AND B.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
   AND (
     (B.ID_SECAO IS NOT NULL AND (TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR)) OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))))
     OR (B.ID_SECAO IS NULL AND NOT EXISTS (
       SELECT 1
       FROM BU_SCOPE B2
       WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
         AND B2.CODFILIAL = B.CODFILIAL
         AND B2.CODEPTO = B.CODEPTO
         AND B2.ID_SECAO IS NOT NULL
         AND (TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR)) OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR)))
     ))
   )`;

function enforceBuSellerScope(code) {
  let next = String(code || '');
  if (!next.includes('BU_SCOPE AS (')) {
    next = next.replace(carteiraScopeBlock, buScopeBlock);
  }
  next = next.replace(rcaJoinRegex, '');
  if (!next.includes('JOIN BU_SCOPE B')) {
    next = next.replace('  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = CCLI.ID', `  JOIN CARTEIRA_SCOPE CS ON CS.ID_CLIENTE = CCLI.ID${scopeJoin}`);
  }
  return next;
}

async function main() {
  if (!baseURL) throw new Error('baseURL nao identificado.');
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao identificado.');

  const updated = [];
  for (const target of targets) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
    const code = String(current?.result?.code || '');
    if (!code) throw new Error(`Codigo atual da SF ${target.name} nao encontrado.`);

    const nextCode = enforceBuSellerScope(code);
    if (nextCode === code) {
      console.log(`${target.name}: sem alteracao necessaria.`);
      continue;
    }
    if (!/\bBU_SCOPE\b/.test(nextCode) || /VR_VENDA/.test(nextCode)) {
      throw new Error(`A SF ${target.name} nao ficou no padrao esperado de escopo por BU_VENDEDOR.`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: target.id,
      code: nextCode,
      description: `${current?.result?.description || target.name} Vendas filtradas pelo escopo filial/departamento/secao cadastrado em BU_VENDEDOR, sem depender de RCA.`,
    });
    updated.push(target.name);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar historico de vendas por escopo BU_VENDEDOR:');
  console.error(error?.message || error);
  process.exit(1);
});
