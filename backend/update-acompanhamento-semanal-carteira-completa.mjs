import 'dotenv/config';
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
const SF104_ID = 104;

// Trecho atual: a lista de clientes da tela nasce so do que teve movimento no mes.
const BASE_CLIENTES_ATUAL = `BASE_CLIENTES AS (
  SELECT VENDEDOR_ID, CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO, MAX(RAMO_CLIENTE_FILTRADO) AS RAMO_CLIENTE
  FROM BASE_ATUAL
  GROUP BY VENDEDOR_ID, CLIENTE_ID
),`;

// Novo trecho: a carteira inteira entra, com ou sem venda no mes.
const BASE_CLIENTES_NOVO = `-- CARTEIRA_DETALHE: mesma carteira do CTE CARTEIRA, mas carregando filial e secao do vinculo.
-- Fica separado de propostito: incluir colunas no CTE CARTEIRA mudaria o DISTINCT dele e
-- poderia duplicar linhas de venda em BASE_ATUAL / BASE_ANTERIOR.
CARTEIRA_DETALHE AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    T.TARGET_USER_ID,
    NULLIF(TRIM(CAST(EC.CODFILIAL AS CHAR)), '') AS CODFILIAL,
    EC.ID_SECAO
  FROM TARGET T
  JOIN EQUIPE_CLIENTE EC ON EC.ID_VENDEDOR = T.TARGET_USER_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE (EC.ID_VENDEDOR = T.TARGET_USER_ID OR F.ID_SUBSTITUTO = T.TARGET_USER_ID)
),
-- CARTEIRA_COMPLETA: todo cliente da carteira do escopo aparece no acompanhamento,
-- mesmo sem nenhuma venda no mes (as semanas ficam zeradas nos LEFT JOINs abaixo).
CARTEIRA_COMPLETA AS (
  SELECT DISTINCT
    CASE WHEN P.SCOPE_MODE IN ('TEAM','GLOBAL') THEN 0 ELSE E.TARGET_USER_ID END AS VENDEDOR_ID,
    CD.ID_CLIENTE AS CLIENTE_ID,
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo') AS RAMO_CLIENTE
  FROM CARTEIRA_DETALHE CD
  JOIN PARAMS P ON 1 = 1
  JOIN VENDEDOR_ESCOPO E ON E.TARGET_USER_ID = CD.TARGET_USER_ID
    AND (CD.CODFILIAL IS NULL OR TRIM(CAST(E.CODFILIAL AS CHAR)) = TRIM(CAST(CD.CODFILIAL AS CHAR)))
    AND (
      CD.ID_SECAO IS NULL
      OR E.ID_SECAO IS NULL
      OR TRIM(CAST(E.ID_SECAO AS CHAR)) = TRIM(CAST(CD.ID_SECAO AS CHAR))
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(CD.ID_SECAO AS CHAR))
    )
  LEFT JOIN CLIENTES C_FILTRO ON C_FILTRO.ID = CD.ID_CLIENTE
  LEFT JOIN CLIENTES_RAMO CR ON CR.CODCLI = CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID, CD.ID_CLIENTE) AS CHAR)
  WHERE ('{{ramoCliente}}' = '' OR FIND_IN_SET(UPPER(COALESCE(CR.RAMO_CLIENTE, 'Sem ramo')), UPPER(REPLACE('{{ramoCliente}}', '|', ','))) > 0)
    AND (P.CLIENTE_PARAM IS NULL OR FIND_IN_SET(CAST(COALESCE(C_FILTRO.WINTHOR_CODCLI, C_FILTRO.ID, CD.ID_CLIENTE) AS CHAR), P.CLIENTE_PARAM) > 0)
),
BASE_CLIENTES AS (
  SELECT
    CC.VENDEDOR_ID,
    CC.CLIENTE_ID,
    MAX(BA.SEGMENTO) AS SEGMENTO,
    MAX(COALESCE(BA.RAMO_CLIENTE_FILTRADO, CC.RAMO_CLIENTE)) AS RAMO_CLIENTE
  FROM CARTEIRA_COMPLETA CC
  LEFT JOIN BASE_ATUAL BA ON BA.VENDEDOR_ID = CC.VENDEDOR_ID AND BA.CLIENTE_ID = CC.CLIENTE_ID
  GROUP BY CC.VENDEDOR_ID, CC.CLIENTE_ID
),`;

const NOTA_ATUAL = "'Exibindo apenas clientes da carteira do vendedor selecionado. Faturamento liquido: vendas menos devolucoes.' AS NOTA_ESCOPO";
const NOTA_NOVA = "'Exibindo toda a carteira do vendedor selecionado, inclusive clientes sem venda no mes (valores zerados). Faturamento liquido: vendas menos devolucoes.' AS NOTA_ESCOPO";

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID invalido.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: SF104_ID });
  const code = String(current?.result?.code || '');

  if (!code) throw new Error('Nao foi possivel ler o codigo atual da SF 104.');

  if (code.includes('CARTEIRA_COMPLETA')) {
    console.log(JSON.stringify({ skipped: 'SF 104 ja lista a carteira completa.' }, null, 2));
    return;
  }

  if (!code.includes(BASE_CLIENTES_ATUAL)) {
    throw new Error('Trecho BASE_CLIENTES esperado nao encontrado na SF 104. Reveja o codigo vivo antes de aplicar.');
  }

  let novoCodigo = code.replace(BASE_CLIENTES_ATUAL, BASE_CLIENTES_NOVO);
  if (novoCodigo.includes(NOTA_ATUAL)) novoCodigo = novoCodigo.replace(NOTA_ATUAL, NOTA_NOVA);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: SF104_ID,
    code: novoCodigo,
    description: 'Calcula B/W semanal de toda a carteira do escopo (clientes sem venda no mes aparecem zerados), com faturamento liquido.',
  });

  console.log(JSON.stringify({ updated: { id: SF104_ID, tamanhoAntes: code.length, tamanhoDepois: novoCodigo.length } }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar a SF 104 (acompanhamento semanal):');
  console.error(error?.message || error);
  process.exit(1);
});
