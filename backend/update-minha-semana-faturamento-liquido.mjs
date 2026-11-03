import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
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

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const DEV_BU_MATCH = `
  B.CODFILIAL = TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), ''))
  AND B.CODEPTO = TRIM(CAST(D.CODEPTO AS CHAR))
  AND (
    (
      B.ID_SECAO IS NOT NULL
      AND (
        TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
        OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
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
            TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
            OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
          )
      )
    )
  )
`;

function replaceOnce(code, search, replacement, label) {
  const idx = code.indexOf(search);
  if (idx === -1) throw new Error(`Trecho nao encontrado: ${label}`);
  return code.slice(0, idx) + replacement + code.slice(idx + search.length);
}

function assertLiquidCode(code, id) {
  if (!/IMP_DEVOLUCOES_TOTVS/i.test(code)) {
    throw new Error(`SF ${id}: devolucoes nao foram incorporadas ao calculo liquido.`);
  }
  if (!/VALOR_DEVOLVIDO/i.test(code)) {
    throw new Error(`SF ${id}: VALOR_DEVOLVIDO nao encontrado.`);
  }
}

function transformSf104(code) {
  if (/BASE_ATUAL_LIQUIDA\s+AS/i.test(code) && /BASE_ANTERIOR_LIQUIDA\s+AS/i.test(code)) {
    assertLiquidCode(code, 104);
    return code;
  }

  let next = code;

  next = replaceOnce(
    next,
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID, R.SEMANA_NUMERO
    ),
    BASE_CLIENTES AS (`,
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID, R.SEMANA_NUMERO
    ),
    DEVOLUCOES_ATUAL_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        CD.ID AS CLIENTE_ID,
        MAX(COALESCE(NULLIF(TRIM(CD.SEGMENTO), ''), 'WINTHOR')) AS SEGMENTO,
        LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7))) AS SEMANA_NUMERO,
        ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR
      FROM IMP_DEVOLUCOES_TOTVS D
      JOIN INPUTS I ON 1 = 1
      JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
      JOIN BU_SCOPE B ON ${DEV_BU_MATCH}
      JOIN CARTEIRA_SCOPE CS
        ON CS.TARGET_USER_ID = B.TARGET_USER_ID
       AND CS.ID_CLIENTE = CD.ID
      LEFT JOIN CLIENTES_RAMO CR_FILTRO ON CR_FILTRO.CODCLI = CAST(COALESCE(CD.WINTHOR_CODCLI, CD.ID) AS CHAR)
      WHERE CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED) = I.ANO_REF
        AND CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED) = I.MES_REF
        AND (I.SEGMENTO_PARAM IS NULL OR UPPER(COALESCE(NULLIF(TRIM(CD.SEGMENTO), ''), 'WINTHOR')) = I.SEGMENTO_PARAM)
        AND (I.CODFILIAL_PARAM IS NULL OR TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), '')) = I.CODFILIAL_PARAM)
        AND (I.IDSECAO_PARAM IS NULL OR D.CODSEC = I.IDSECAO_PARAM)
        AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR_FILTRO.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
      GROUP BY B.TARGET_USER_ID, CD.ID, LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7)))
    ),
    BASE_ATUAL_LIQUIDA AS (
      SELECT
        VENDEDOR_ID,
        CLIENTE_ID,
        MAX(SEGMENTO) AS SEGMENTO,
        SEMANA_NUMERO,
        ROUND(SUM(VALOR), 2) AS VALOR
      FROM (
        SELECT VENDEDOR_ID, CLIENTE_ID, SEGMENTO, SEMANA_NUMERO, VALOR FROM BASE_ATUAL_RAW
        UNION ALL
        SELECT VENDEDOR_ID, CLIENTE_ID, SEGMENTO, SEMANA_NUMERO, VALOR FROM DEVOLUCOES_ATUAL_RAW
      ) MOV
      GROUP BY VENDEDOR_ID, CLIENTE_ID, SEMANA_NUMERO
    ),
    BASE_CLIENTES AS (`,
    'SF 104: inserir devolucoes atuais',
  );

  next = next.replace('      FROM BASE_ATUAL_RAW\n      GROUP BY VENDEDOR_ID, CLIENTE_ID', '      FROM BASE_ATUAL_LIQUIDA\n      GROUP BY VENDEDOR_ID, CLIENTE_ID');
  next = next.replace('      FROM BASE_ATUAL_RAW\n      GROUP BY VENDEDOR_ID, CLIENTE_ID', '      FROM BASE_ATUAL_LIQUIDA\n      GROUP BY VENDEDOR_ID, CLIENTE_ID');
  next = next.replace('      FROM BASE_ATUAL_RAW BAR', '      FROM BASE_ATUAL_LIQUIDA BAR');

  next = replaceOnce(
    next,
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID
    )
    SELECT`,
    `      GROUP BY B.TARGET_USER_ID, R.CLIENTE_ID
    ),
    DEVOLUCOES_ANTERIOR_RAW AS (
      SELECT
        B.TARGET_USER_ID AS VENDEDOR_ID,
        CD.ID AS CLIENTE_ID,
        ROUND(-SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)), 2) AS VALOR_ANTERIOR
      FROM IMP_DEVOLUCOES_TOTVS D
      JOIN INPUTS I ON 1 = 1
      JOIN PERIODO_ANTERIOR PA ON 1 = 1
      JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
      JOIN BU_SCOPE B ON ${DEV_BU_MATCH}
      JOIN CARTEIRA_SCOPE CS
        ON CS.TARGET_USER_ID = B.TARGET_USER_ID
       AND CS.ID_CLIENTE = CD.ID
      LEFT JOIN CLIENTES_RAMO CR_FILTRO ON CR_FILTRO.CODCLI = CAST(COALESCE(CD.WINTHOR_CODCLI, CD.ID) AS CHAR)
      WHERE CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED) = PA.ANO_ANT
        AND CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED) = PA.MES_ANT
        AND LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7))) = I.SEMANA_REF
        AND (I.SEGMENTO_PARAM IS NULL OR UPPER(COALESCE(NULLIF(TRIM(CD.SEGMENTO), ''), 'WINTHOR')) = I.SEGMENTO_PARAM)
        AND (I.CODFILIAL_PARAM IS NULL OR TRIM(COALESCE(CAST(D.CODFILIAL AS CHAR), '')) = I.CODFILIAL_PARAM)
        AND (I.IDSECAO_PARAM IS NULL OR D.CODSEC = I.IDSECAO_PARAM)
        AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(CR_FILTRO.RAMO_CLIENTE, 'Sem ramo')) = I.RAMO_PARAM)
      GROUP BY B.TARGET_USER_ID, CD.ID
    ),
    BASE_ANTERIOR_LIQUIDA AS (
      SELECT VENDEDOR_ID, CLIENTE_ID, ROUND(SUM(VALOR_ANTERIOR), 2) AS VALOR_ANTERIOR
      FROM (
        SELECT VENDEDOR_ID, CLIENTE_ID, VALOR_ANTERIOR FROM BASE_ANTERIOR_RAW
        UNION ALL
        SELECT VENDEDOR_ID, CLIENTE_ID, VALOR_ANTERIOR FROM DEVOLUCOES_ANTERIOR_RAW
      ) MOV
      GROUP BY VENDEDOR_ID, CLIENTE_ID
    )
    SELECT`,
    'SF 104: inserir devolucoes anteriores',
  );

  next = next.replace('LEFT JOIN BASE_ANTERIOR_RAW SA2', 'LEFT JOIN BASE_ANTERIOR_LIQUIDA SA2');
  next = next.replace(
    'Escopo semanal: carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR',
    'Faturamento liquido: vendas menos devolucoes, com carteira + CODFILIAL + CODEPTO + CODSEC via BU_VENDEDOR',
  );

  assertLiquidCode(next, 104);
  return next;
}

function detailDevolucoesCte() {
  return `,
    DEVOLUCOES_RAW AS (
      SELECT
        CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED) AS ANO,
        CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED) AS MES,
        LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7))) AS SEMANA_NUMERO,
        CAST(D.NUMPED AS CHAR) AS NUMPED,
        CAST(D.NOTA_DEVOLUCAO AS CHAR) AS NUMTRANSVENDA,
        D.CODPROD,
        D.DESCRICAO,
        CD.ID AS CLIENTE_ID,
        SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) AS DATA_DEVOLUCAO,
        COALESCE(D.QT_DEVOLVIDA, 0) AS QT_DEVOLVIDA,
        COALESCE(D.VALOR_DEVOLVIDO, 0) AS VALOR_DEVOLVIDO
      FROM IMP_DEVOLUCOES_TOTVS D
      JOIN INPUTS I ON 1 = 1
      JOIN CLIENTES CD ON CD.WINTHOR_CODCLI = D.CODCLI
      JOIN BU_SCOPE B ON ${DEV_BU_MATCH}
      JOIN CARTEIRA_SCOPE CS
        ON CS.TARGET_USER_ID = B.TARGET_USER_ID
       AND CS.ID_CLIENTE = CD.ID
      WHERE CAST(D.DATA_DEVOLUCAO AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND CD.ID = I.CLIENTE_PARAM
        AND (I.ANO_PARAM IS NULL OR CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED) = I.ANO_PARAM)
        AND (I.MES_PARAM IS NULL OR CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED) = I.MES_PARAM)
    )`;
}

function splitDetailCode(code, id) {
  const baseIdx = code.indexOf('    BASE_RAW AS (');
  const selectIdx = code.indexOf('\n    SELECT', baseIdx);
  if (baseIdx === -1 || selectIdx === -1) throw new Error(`SF ${id}: estrutura BASE_RAW/SELECT nao encontrada.`);
  const prefix = code.slice(0, baseIdx);
  const baseRaw = code.slice(baseIdx, selectIdx).trimEnd();
  return `${prefix}${baseRaw}${detailDevolucoesCte()}`;
}

function transformSf109(code) {
  if (/MOVIMENTOS_SEMANA\s+AS/i.test(code)) return code;
  const ctes = splitDetailCode(code, 109);
  const next = `${ctes},
    MOVIMENTOS_SEMANA AS (
      SELECT
        R.ANO,
        R.MES,
        R.SEMANA_NUMERO,
        MIN(R.DATA_SAIDA) AS DATA_INICIO,
        MAX(R.DATA_SAIDA) AS DATA_FIM,
        COUNT(DISTINCT COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))) AS TOTAL_PEDIDOS,
        SUM(COALESCE(R.TOTAL, 0)) AS VALOR
      FROM BASE_RAW R
      GROUP BY R.ANO, R.MES, R.SEMANA_NUMERO

      UNION ALL

      SELECT
        D.ANO,
        D.MES,
        D.SEMANA_NUMERO,
        MIN(D.DATA_DEVOLUCAO) AS DATA_INICIO,
        MAX(D.DATA_DEVOLUCAO) AS DATA_FIM,
        0 AS TOTAL_PEDIDOS,
        -SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)) AS VALOR
      FROM DEVOLUCOES_RAW D
      GROUP BY D.ANO, D.MES, D.SEMANA_NUMERO
    )
    SELECT
      M.ANO,
      M.MES,
      M.SEMANA_NUMERO,
      DATE_FORMAT(MIN(STR_TO_DATE(M.DATA_INICIO, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_INICIO_SEMANA,
      DATE_FORMAT(MAX(STR_TO_DATE(M.DATA_FIM, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_FIM_SEMANA,
      SUM(M.TOTAL_PEDIDOS) AS TOTAL_PEDIDOS,
      ROUND(SUM(M.VALOR), 2) AS VALOR_TOTAL_SEMANA
    FROM MOVIMENTOS_SEMANA M
    GROUP BY M.ANO, M.MES, M.SEMANA_NUMERO
    ORDER BY M.ANO DESC, M.MES DESC, M.SEMANA_NUMERO DESC`;
  assertLiquidCode(next, 109);
  return next;
}

function transformSf110(code) {
  if (/MOVIMENTOS_PRODUTO\s+AS/i.test(code)) return code;
  const ctes = splitDetailCode(code, 110);
  const next = `${ctes},
    MOVIMENTOS_PRODUTO AS (
      SELECT
        R.CODPROD,
        R.DESCRICAO AS DESCRICAO_PRODUTO,
        SUM(COALESCE(R.QT, 0)) AS QT_TOTAL_SEMANA,
        SUM(COALESCE(R.TOTAL, 0)) AS VALOR
      FROM BASE_RAW R
      JOIN INPUTS I ON 1 = 1
      WHERE (I.SEMANA_PARAM IS NULL OR R.SEMANA_NUMERO = I.SEMANA_PARAM)
      GROUP BY R.CODPROD, R.DESCRICAO

      UNION ALL

      SELECT
        D.CODPROD,
        D.DESCRICAO AS DESCRICAO_PRODUTO,
        0 AS QT_TOTAL_SEMANA,
        -SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)) AS VALOR
      FROM DEVOLUCOES_RAW D
      JOIN INPUTS I ON 1 = 1
      WHERE (I.SEMANA_PARAM IS NULL OR D.SEMANA_NUMERO = I.SEMANA_PARAM)
      GROUP BY D.CODPROD, D.DESCRICAO
    )
    SELECT
      M.CODPROD,
      M.DESCRICAO_PRODUTO,
      ROUND(SUM(M.QT_TOTAL_SEMANA), 6) AS QT_TOTAL_SEMANA,
      ROUND(CASE WHEN SUM(M.QT_TOTAL_SEMANA) = 0 THEN 0 ELSE SUM(M.VALOR) / SUM(M.QT_TOTAL_SEMANA) END, 6) AS VALOR_UNITARIO,
      ROUND(SUM(M.VALOR), 2) AS VALOR_TOTAL_PRODUTO_SEMANA
    FROM MOVIMENTOS_PRODUTO M
    GROUP BY M.CODPROD, M.DESCRICAO_PRODUTO
    ORDER BY M.CODPROD`;
  assertLiquidCode(next, 110);
  return next;
}

function transformSf111(code) {
  if (/MOVIMENTOS_PEDIDO\s+AS/i.test(code)) return code;
  const ctes = splitDetailCode(code, 111);
  const next = `${ctes},
    MOVIMENTOS_PEDIDO AS (
      SELECT
        COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR)) AS NUMPEDIDO,
        MAX(R.DATA_SAIDA) AS DATA_MOVIMENTO,
        SUM(COALESCE(R.TOTAL, 0)) AS VALOR
      FROM BASE_RAW R
      JOIN INPUTS I ON 1 = 1
      WHERE (I.SEMANA_PARAM IS NULL OR R.SEMANA_NUMERO = I.SEMANA_PARAM)
      GROUP BY COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))

      UNION ALL

      SELECT
        COALESCE(NULLIF(CAST(D.NUMPED AS CHAR), ''), CAST(D.NUMTRANSVENDA AS CHAR)) AS NUMPEDIDO,
        MAX(D.DATA_DEVOLUCAO) AS DATA_MOVIMENTO,
        -SUM(COALESCE(D.VALOR_DEVOLVIDO, 0)) AS VALOR
      FROM DEVOLUCOES_RAW D
      JOIN INPUTS I ON 1 = 1
      WHERE (I.SEMANA_PARAM IS NULL OR D.SEMANA_NUMERO = I.SEMANA_PARAM)
      GROUP BY COALESCE(NULLIF(CAST(D.NUMPED AS CHAR), ''), CAST(D.NUMTRANSVENDA AS CHAR))
    )
    SELECT
      M.NUMPEDIDO,
      ROUND(SUM(M.VALOR), 2) AS VALOR_TOTAL_PEDIDO,
      DATE_FORMAT(MAX(STR_TO_DATE(M.DATA_MOVIMENTO, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_PEDIDO
    FROM MOVIMENTOS_PEDIDO M
    GROUP BY M.NUMPEDIDO
    ORDER BY DATA_PEDIDO DESC, NUMPEDIDO DESC`;
  assertLiquidCode(next, 111);
  return next;
}

async function updateSf(serverFunctionId, transform, description) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current?.result?.code || '';
  const nextCode = transform(code);

  if (nextCode === code) {
    return { id: serverFunctionId, name: current?.result?.name, changed: false };
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description,
  });

  return { id: serverFunctionId, name: current?.result?.name, changed: true };
}

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

async function smoke(serverFunctionId, input = {}) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou: ${error || status}`);
  }
  return extractRows(response);
}

async function main() {
  const updated = [];
  updated.push(await updateSf(104, transformSf104, 'Calcula B/W semanal com faturamento liquido: vendas menos devolucoes, exigindo territorio BU_VENDEDOR e cliente na carteira.'));
  updated.push(await updateSf(109, transformSf109, 'Detalha semanas do cliente com faturamento liquido: vendas menos devolucoes, exigindo territorio BU_VENDEDOR e carteira.'));
  updated.push(await updateSf(110, transformSf110, 'Detalha itens da semana com faturamento liquido por produto, exigindo territorio BU_VENDEDOR e carteira.'));
  updated.push(await updateSf(111, transformSf111, 'Resume pedidos da semana com faturamento liquido por pedido, exigindo territorio BU_VENDEDOR e carteira.'));

  const weeklyRows = await smoke(104, {});
  const sample = weeklyRows.find((row) => row.CLIENTE_ID && row.VALOR_SEMANA_ATUAL !== undefined) || weeklyRows[0];
  const detailInput = sample ? {
    ID_CLIENTE: String(sample.CLIENTE_ID),
    ANO: String(new Date().getFullYear()),
    MES: String(new Date().getMonth() + 1),
    SEMANA_NUMERO: '',
    vendedorId: sample.VENDEDOR_ID ? String(sample.VENDEDOR_ID) : '',
  } : { ID_CLIENTE: '0', ANO: '', MES: '', SEMANA_NUMERO: '', vendedorId: '' };

  const details = [];
  for (const id of [109, 110, 111]) {
    const rows = await smoke(id, detailInput);
    details.push({ id, rows: rows.length });
  }

  console.log(JSON.stringify({ updated, sf104Rows: weeklyRows.length, detailInput, details }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar Minha Semana para faturamento liquido:');
  console.error(error?.message || error);
  process.exit(1);
});
