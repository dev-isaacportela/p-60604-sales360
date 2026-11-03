/**
 * Reaplica a deducao de devolucoes (faturamento liquido) no acompanhamento semanal.
 *
 * Contexto: o script apply-query-base-faturamento-liquido.mjs (2026-07-29) deixou as SFs
 * 104, 109, 110 e 111 liquidas. Ajustes posteriores de escopo e de semana operacional
 * sobrescreveram as SFs 104 e 110, que voltaram a somar apenas PEDIDOS_SEMANAIS_SYNC_RAW
 * (bruto). A SF 146 (admin) nunca deduziu.
 *
 * Este script reintroduz a deducao em 104, 110 e 146 usando a mesma semana operacional
 * sexta-quinta recortada ao mes que ja vigora nas demais SFs.
 *
 * Uso:
 *   node fix-acompanhamento-semanal-devolucoes.mjs --dry-run
 *   node fix-acompanhamento-semanal-devolucoes.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
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
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const dryRun = process.argv.includes('--dry-run');
const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx >= 0 ? process.argv[previewIdx + 1] : null;

// --- Semana operacional sexta-quinta recortada ao mes (mesmas regras da SF 109/111) ---

function dateSql(alias, column) {
  return `STR_TO_DATE(LEFT(TRIM(CAST(${alias}.${column} AS CHAR)), 10), '%Y-%m-%d')`;
}

function monthStartOfSql(date) {
  return `DATE_SUB(${date}, INTERVAL (DAYOFMONTH(${date}) - 1) DAY)`;
}

function previousFridayOfSql(date) {
  return `DATE_SUB(${date}, INTERVAL ((WEEKDAY(${date}) + 3) % 7) DAY)`;
}

function firstFridayAfterMonthStartOfSql(date) {
  const monthStart = monthStartOfSql(date);
  const daysUntilFriday = `((4 - WEEKDAY(${monthStart}) + 7) % 7)`;
  const daysToNextFriday = `CASE WHEN ${daysUntilFriday} = 0 THEN 7 ELSE ${daysUntilFriday} END`;
  return `DATE_ADD(${monthStart}, INTERVAL (${daysToNextFriday}) DAY)`;
}

function weekStartOfSql(date) {
  return `GREATEST(${monthStartOfSql(date)}, ${previousFridayOfSql(date)})`;
}

function weekNumberOfSql(date) {
  const weekStart = weekStartOfSql(date);
  const monthStart = monthStartOfSql(date);
  const firstFriday = firstFridayAfterMonthStartOfSql(date);
  return `CASE WHEN ${weekStart} = ${monthStart} THEN 1 ELSE 2 + FLOOR(DATEDIFF(${weekStart}, ${firstFriday}) / 7) END`;
}

const DEV_DATE = dateSql('D', 'DATA_DEVOLUCAO');
const DEV_ANO = `CAST(DATE_FORMAT(${weekStartOfSql(DEV_DATE)}, '%Y') AS UNSIGNED)`;
const DEV_MES = `MONTH(${weekStartOfSql(DEV_DATE)})`;
const DEV_SEMANA = weekNumberOfSql(DEV_DATE);

const DEV_FILIAL = `TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), ''))`;
const DEV_DEPTO = `TRIM(CAST(D.CODEPTO AS CHAR))`;
const DEV_SECAO_CHAR = `TRIM(CAST(D.CODSEC AS CHAR))`;
const DEV_SECAO_INT = `CAST(D.CODSEC AS SIGNED)`;

// Devolucao so entra quando tem data valida e as chaves de escopo preenchidas,
// espelhando os filtros da ingestao de pedidos.
const DEV_WHERE_BASE = `    CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    AND D.CODCLI IS NOT NULL
    AND D.CODFILIAL IS NOT NULL
    AND TRIM(CAST(D.CODFILIAL AS CHAR)) <> ''
    AND D.CODEPTO IS NOT NULL
    AND D.CODSEC IS NOT NULL`;

const MARKER = 'DEDUCAO_DEVOLUCOES_ACOMPANHAMENTO_SEMANAL';

function replaceOnce(code, needle, replacement, label) {
  const first = code.indexOf(needle);
  if (first === -1) throw new Error(`${label}: trecho esperado nao encontrado.`);
  if (code.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`${label}: trecho esperado aparece mais de uma vez, substituicao ambigua.`);
  }
  return code.slice(0, first) + replacement + code.slice(first + needle.length);
}

function replaceExactly(code, needle, replacement, times, label) {
  const parts = code.split(needle);
  if (parts.length - 1 !== times) {
    throw new Error(`${label}: esperava ${times} ocorrencias, encontrei ${parts.length - 1}.`);
  }
  return parts.join(replacement);
}

// --- SF 104: grade do acompanhamento semanal (B/W por semana e fechamento do mes) ---

function transformSf104(code) {
  const anchor = `  GROUP BY R.CLIENTE_ID, R.CODFILIAL, R.CODEPTO, R.ID_SECAO, R.ANO_OPERACIONAL, R.MES_OPERACIONAL, R.SEMANA_NUMERO_OPERACIONAL
),
`;

  // Devolucoes no mesmo formato de PEDIDOS_SEMANAIS_SYNC_OPERACIONAL, com valor negativo.
  // MOVIMENTOS_LIQUIDOS alimenta apenas BASE_ATUAL/BASE_ANTERIOR: o perfil de compra do
  // cliente (frequencia, semana padrao, ticket medio) continua olhando so os pedidos, para
  // que uma devolucao isolada nao seja contada como semana de compra.
  const ctes = `${anchor}-- ${MARKER}: devolucoes entram como movimento negativo na mesma semana operacional.
DEVOLUCOES_OPERACIONAL AS (
  SELECT
    CD.ID AS CLIENTE_ID,
    0 AS VENDEDOR_ID,
    ${DEV_FILIAL} AS CODFILIAL,
    ${DEV_DEPTO} AS CODEPTO,
    ${DEV_SECAO_INT} AS ID_SECAO,
    CAST(NULL AS CHAR) AS SEGMENTO,
    ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR,
    ROUND(-SUM(COALESCE(D.QT_DEVOLVIDA, 0)), 6) AS QT,
    ${DEV_SEMANA} AS SEMANA_NUMERO,
    ${DEV_MES} AS MES,
    ${DEV_ANO} AS ANO,
    TRUE AS ATIVO
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
  WHERE
${DEV_WHERE_BASE}
  GROUP BY
    CD.ID,
    ${DEV_FILIAL},
    ${DEV_DEPTO},
    ${DEV_SECAO_INT},
    ${DEV_ANO},
    ${DEV_MES},
    ${DEV_SEMANA}
),
MOVIMENTOS_LIQUIDOS AS (
  SELECT CLIENTE_ID, VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, SEGMENTO, VALOR, QT, SEMANA_NUMERO, MES, ANO, ATIVO
  FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL
  UNION ALL
  SELECT CLIENTE_ID, VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, SEGMENTO, VALOR, QT, SEMANA_NUMERO, MES, ANO, ATIVO
  FROM DEVOLUCOES_OPERACIONAL
),
`;

  let next = replaceOnce(code, anchor, ctes, 'SF 104: inserir CTEs de devolucao');

  // Somente BASE_ATUAL e BASE_ANTERIOR passam a ler o movimento liquido.
  next = replaceExactly(
    next,
    `  FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL PS
  JOIN PARAMS P ON 1 = 1`,
    `  FROM MOVIMENTOS_LIQUIDOS PS
  JOIN PARAMS P ON 1 = 1`,
    2,
    'SF 104: apontar BASE_ATUAL/BASE_ANTERIOR para o movimento liquido',
  );

  return replaceOnce(
    next,
    `  'Exibindo apenas clientes da carteira do vendedor selecionado' AS NOTA_ESCOPO`,
    `  'Exibindo apenas clientes da carteira do vendedor selecionado. Faturamento liquido: vendas menos devolucoes.' AS NOTA_ESCOPO`,
    'SF 104: atualizar nota de escopo',
  );
}

// --- SF 110: itens (produtos) da semana no detalhe do cliente ---

function transformSf110(code) {
  let next = replaceOnce(
    code,
    `MOV AS (
  SELECT
    R.CODPROD,`,
    `MOV_PEDIDOS AS (
  SELECT
    R.CODPROD,`,
    'SF 110: renomear CTE de pedidos',
  );

  const anchor = `
),
AGG AS (`;

  const devolucoes = `
),
-- ${MARKER}: devolucao abate quantidade e valor do proprio produto na semana.
MOV_DEVOLUCOES AS (
  SELECT
    D.CODPROD,
    MAX(CAST(D.DESCRICAO AS CHAR)) AS DESCRICAO_PRODUTO,
    ${DEV_ANO} AS ANO,
    ${DEV_MES} AS MES,
    ${DEV_SEMANA} AS SEMANA_NUMERO,
    -SUM(COALESCE(D.QT_DEVOLVIDA, 0)) AS QT,
    -SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)) AS VALOR_TOTAL,
    0 AS VALOR_UNITARIO
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
  JOIN ESCOPO E ON E.ID_CLIENTE = CD.ID
    AND E.CODFILIAL = ${DEV_FILIAL}
    AND E.CODEPTO = ${DEV_DEPTO}
    AND (
      E.ID_SECAO IS NULL
      OR E.ID_SECAO = ${DEV_SECAO_INT}
      OR LPAD(TRIM(CAST(E.ID_SECAO AS CHAR)), 2, '0') = ${DEV_SECAO_CHAR}
    )
  JOIN PERIODO_CALC PC ON 1 = 1
  WHERE
${DEV_WHERE_BASE}
    AND D.CODPROD IS NOT NULL
    AND CD.ID = {{ID_CLIENTE}}
    AND (
      (${DEV_ANO} = PC.ANO_REF AND ${DEV_MES} = PC.MES_REF)
      OR (${DEV_ANO} = PC.ANO_ANT AND ${DEV_MES} = PC.MES_ANT)
    )
  GROUP BY D.CODPROD, ${DEV_ANO}, ${DEV_MES}, ${DEV_SEMANA}
),
-- Consolida pedidos e devolucoes por produto/semana e recalcula o valor unitario liquido.
MOV AS (
  SELECT
    X.CODPROD,
    MAX(X.DESCRICAO_PRODUTO) AS DESCRICAO_PRODUTO,
    X.ANO,
    X.MES,
    X.SEMANA_NUMERO,
    SUM(X.QT) AS QT,
    SUM(X.VALOR_TOTAL) AS VALOR_TOTAL,
    ROUND(
      CASE
        WHEN SUM(X.QT) = 0 THEN COALESCE(MAX(NULLIF(X.VALOR_UNITARIO, 0)), 0)
        ELSE SUM(X.VALOR_TOTAL) / SUM(X.QT)
      END,
      6
    ) AS VALOR_UNITARIO
  FROM (
    SELECT CODPROD, DESCRICAO_PRODUTO, ANO, MES, SEMANA_NUMERO, QT, VALOR_TOTAL, VALOR_UNITARIO FROM MOV_PEDIDOS
    UNION ALL
    SELECT CODPROD, DESCRICAO_PRODUTO, ANO, MES, SEMANA_NUMERO, QT, VALOR_TOTAL, VALOR_UNITARIO FROM MOV_DEVOLUCOES
  ) X
  GROUP BY X.CODPROD, X.ANO, X.MES, X.SEMANA_NUMERO
),
AGG AS (`;

  return replaceOnce(next, anchor, devolucoes, 'SF 110: inserir CTEs de devolucao');
}

// --- SF 146: listagem admin do acompanhamento semanal ---

function buScopeJoin(filialExpr, deptoExpr, secaoExpr) {
  return `  JOIN BU_SCOPE B ON 
  B.CODFILIAL = ${filialExpr}
  AND B.CODEPTO = ${deptoExpr}
  AND (
    (
      B.ID_SECAO IS NOT NULL
      AND (
        TRIM(CAST(B.ID_SECAO AS CHAR)) = ${secaoExpr}
        OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = ${secaoExpr}
      )
    )
    OR (
      B.ID_SECAO IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM BU_SCOPE B2
        WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
          AND B2.CODFILIAL = B.CODFILIAL
          AND B2.CODEPTO = B.CODEPTO
          AND B2.ID_SECAO IS NOT NULL
          AND (
            TRIM(CAST(B2.ID_SECAO AS CHAR)) = ${secaoExpr}
            OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = ${secaoExpr}
          )
      )
    )
  )`;
}

function transformSf146(code) {
  let next = replaceOnce(code, `\nBASE AS (\n  SELECT\n`, `\nBASE_MOV AS (\n  SELECT\n`, 'SF 146: renomear CTE base');

  const anchor = `
)
SELECT
  CLIENTE,`;

  const devolucoes = `

  UNION ALL

  -- ${MARKER}: devolucao entra como valor negativo na mesma semana operacional.
  SELECT
    CD.ID AS CLIENTE_ID,
    D.CODCLI AS CODCLI,
    COALESCE(CD.NOME_FANTASIA, CD.RAZAO_SOCIAL, CR.CLIENTE_TOTVS, CONCAT('Cliente ', D.CODCLI)) AS CLIENTE,
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo') AS RAMO_CLIENTE,
    ${DEV_SEMANA} AS SEMANA_NUMERO,
    D.COD_RCA,
    B.TARGET_USER_ID AS VENDEDOR_BU_USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', B.TARGET_USER_ID)) AS VENDEDOR_BU_NOME,
    ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS TOTAL,
    MAX(CASE WHEN EC.ID IS NULL THEN 0 ELSE 1 END) AS NA_CARTEIRA_FLAG
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN INPUTS I ON 1 = 1
  JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
${buScopeJoin(DEV_FILIAL, DEV_DEPTO, DEV_SECAO_CHAR)}
  LEFT JOIN CLIENTES_RAMO CR ON CR.CODCLI = D.CODCLI
  LEFT JOIN EQUIPE_CLIENTE EC
    ON EC.ID_VENDEDOR = I.VENDEDOR_PARAM
   AND EC.ID_CLIENTE = CD.ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = B.TARGET_USER_ID
  LEFT JOIN INT_USER U ON U.ID = B.TARGET_USER_ID
  WHERE
${DEV_WHERE_BASE}
    AND ${DEV_ANO} = I.ANO_REF
    AND ${DEV_MES} = I.MES_REF
    AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
  GROUP BY
    CD.ID,
    D.CODCLI,
    COALESCE(CD.NOME_FANTASIA, CD.RAZAO_SOCIAL, CR.CLIENTE_TOTVS, CONCAT('Cliente ', D.CODCLI)),
    COALESCE(CR.RAMO_CLIENTE, 'Sem ramo'),
    ${DEV_SEMANA},
    D.COD_RCA,
    B.TARGET_USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', B.TARGET_USER_ID))
),
-- Consolida pedidos e devolucoes na mesma linha de cliente/semana/RCA.
BASE AS (
  SELECT
    CLIENTE_ID,
    CODCLI,
    CLIENTE,
    RAMO_CLIENTE,
    SEMANA_NUMERO,
    COD_RCA,
    VENDEDOR_BU_USER_ID,
    VENDEDOR_BU_NOME,
    ROUND(SUM(TOTAL), 2) AS TOTAL,
    MAX(NA_CARTEIRA_FLAG) AS NA_CARTEIRA_FLAG
  FROM BASE_MOV
  GROUP BY
    CLIENTE_ID,
    CODCLI,
    CLIENTE,
    RAMO_CLIENTE,
    SEMANA_NUMERO,
    COD_RCA,
    VENDEDOR_BU_USER_ID,
    VENDEDOR_BU_NOME
)
SELECT
  CLIENTE,`;

  return replaceOnce(next, anchor, devolucoes, 'SF 146: inserir branch de devolucao');
}

// --- Aplicacao ---

const targets = [
  {
    id: 104,
    transform: transformSf104,
    description: 'Calcula B/W semanal com faturamento liquido (vendas menos devolucoes) por semana operacional sexta-quinta recortada ao mes.',
  },
  {
    id: 110,
    transform: transformSf110,
    description: 'Detalha itens da semana com faturamento liquido por produto (vendas menos devolucoes).',
  },
  {
    id: 146,
    transform: transformSf146,
    description: 'Admin: lista compras semanais por vendedor com faturamento liquido (vendas menos devolucoes).',
  },
];

function assertLiquido(code, id) {
  if (!code.includes(MARKER)) throw new Error(`SF ${id}: marcador de deducao ausente no codigo gerado.`);
  if (!/VALOR_DEVOLVIDO/.test(code)) throw new Error(`SF ${id}: deducao de devolucoes nao foi aplicada.`);
  if (!/WEEKDAY\s*\(/i.test(code)) throw new Error(`SF ${id}: regra de semana operacional perdida.`);
  const abre = (code.match(/\(/g) || []).length;
  const fecha = (code.match(/\)/g) || []).length;
  if (abre !== fecha) throw new Error(`SF ${id}: parenteses desbalanceados (${abre} x ${fecha}).`);
}

async function applyTarget(target) {
  const response = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  const current = response?.result || {};
  const code = String(current.code || '');
  if (!code) throw new Error(`SF ${target.id}: codigo atual vazio ou nao encontrado.`);

  if (code.includes(MARKER)) {
    return { id: target.id, name: current.name, changed: false, motivo: 'deducao ja aplicada' };
  }

  const nextCode = target.transform(code);
  assertLiquido(nextCode, target.id);

  if (previewDir) {
    fs.writeFileSync(`${previewDir}/sf-${target.id}.sql`, nextCode, 'utf8');
  }

  if (dryRun) {
    return { id: target.id, name: current.name, changed: true, dryRun: true, bytes: nextCode.length };
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    code: nextCode,
    description: target.description,
  });

  return { id: target.id, name: current.name, changed: true, bytes: nextCode.length };
}

async function smoke(serverFunctionId, input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = response?.result?.executionStatus;
  const error = response?.result?.error;
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou no smoke test: ${error || status}`);
  }
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { /* mantem string */ }
  }
  return output?.rows || [];
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao configurado.');

  const results = [];
  for (const target of targets) {
    results.push(await applyTarget(target));
  }

  if (!dryRun) {
    const grade = await smoke(104, {});
    results.push({ smoke: 104, linhas: grade.length });
    const admin = await smoke(146, { userId: '', mes: '', ano: '', ramoCliente: '' });
    results.push({ smoke: 146, linhas: admin.length });
  }

  console.log(JSON.stringify({ dryRun, results }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao reaplicar deducao de devolucoes:');
  console.error(error?.message || error);
  process.exit(1);
});
