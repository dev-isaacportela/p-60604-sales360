import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { readFileSync } from 'node:fs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ALERTAS_POPULAR_ID = 130;

const FULL_BU_SCOPE_CTES = `WITH CARTEIRA AS (
  SELECT DISTINCT
    EC.ID_VENDEDOR,
    CAST(TRIM(CAST(BV.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    CASE
      WHEN BV.ID_SECAO IS NOT NULL AND TRIM(CAST(BV.ID_SECAO AS CHAR)) <> ''
        THEN LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
      ELSE NULL
    END AS ID_SECAO,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    EC.ID_CLIENTE,
    LEFT(COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), NULLIF(TRIM(C.RAZAO_SOCIAL), ''), CONCAT('Cliente ', EC.ID_CLIENTE)), 200) AS NOME_CLIENTE,
    COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'Sem segmento') AS SEGMENTO
  FROM EQUIPE_CLIENTE EC
  JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
  JOIN BU_VENDEDOR BV
    ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
   AND COALESCE(BV.ATIVO, TRUE) = TRUE
   AND BV.CODFILIAL IS NOT NULL
   AND TRIM(CAST(BV.CODFILIAL AS CHAR)) <> ''
   AND BV.BU_CODIGO IS NOT NULL
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) <> ''
  WHERE EC.ID_VENDEDOR IS NOT NULL
    AND __VENDEDOR_FILTER__
    AND EC.ID_CLIENTE IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM PEDIDOS_SEMANAIS_SYNC_RAW R_SCOPE
      WHERE CAST(R_SCOPE.CLIENTE_ID AS CHAR) = CAST(EC.ID_CLIENTE AS CHAR)
        AND TRIM(CAST(R_SCOPE.CODEPTO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
        AND CAST(TRIM(CAST(R_SCOPE.CODFILIAL AS CHAR)) AS UNSIGNED) = CAST(TRIM(CAST(BV.CODFILIAL AS CHAR)) AS UNSIGNED)
        AND (
          BV.ID_SECAO IS NULL
          OR LEFT(TRIM(CAST(R_SCOPE.ID_SECAO AS CHAR)), 20) = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
          OR LPAD(LEFT(TRIM(CAST(R_SCOPE.ID_SECAO AS CHAR)), 20), 2, '0') = LEFT(TRIM(CAST(BV.ID_SECAO AS CHAR)), 20)
        )
        AND R_SCOPE.ATIVO = TRUE
        AND R_SCOPE.STATUS_INGESTAO = 'ATIVO'
        AND R_SCOPE.CODPROD IS NOT NULL
        AND TRIM(COALESCE(CAST(R_SCOPE.CODFILIAL AS CHAR), '')) <> ''
        AND R_SCOPE.DATA_SAIDA IS NOT NULL
        AND R_SCOPE.DATA_SAIDA <> ''
        AND LENGTH(R_SCOPE.DATA_SAIDA) >= 10
        AND STR_TO_DATE(R_SCOPE.DATA_SAIDA, '%Y-%m-%d') >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
    )
),
BASE_VENDAS AS (
  SELECT
    C.ID_VENDEDOR,
    C.CODFILIAL,
    COALESCE(C.ID_SECAO, LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20)) AS ID_SECAO,
    C.CODEPTO,
    C.ID_CLIENTE,
    C.NOME_CLIENTE,
    C.SEGMENTO,
    R.CODPROD,
    LEFT(COALESCE(NULLIF(TRIM(R.DESCRICAO), ''), CONCAT('Produto ', R.CODPROD)), 200) AS PRODUTO,
    COALESCE(R.TOTAL, 0) AS VALOR,
    COALESCE(R.QT, 0) AS QT,
    STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') AS DATA_REF,
    COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), NULLIF(CAST(R.NUMTRANSVENDA AS CHAR), ''), NULLIF(CAST(R.NUMNOTA AS CHAR), ''), CONCAT('AUTO-', R.ID)) AS PEDIDO_CHAVE
  FROM CARTEIRA C
  JOIN PEDIDOS_SEMANAIS_SYNC_RAW R
    ON CAST(R.CLIENTE_ID AS CHAR) = CAST(C.ID_CLIENTE AS CHAR)
   AND TRIM(CAST(R.CODEPTO AS CHAR)) = C.CODEPTO
   AND CAST(TRIM(CAST(R.CODFILIAL AS CHAR)) AS UNSIGNED) = C.CODFILIAL
   AND (
     C.ID_SECAO IS NULL
     OR LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20) = C.ID_SECAO
     OR LPAD(LEFT(TRIM(CAST(R.ID_SECAO AS CHAR)), 20), 2, '0') = C.ID_SECAO
   )
  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.CODPROD IS NOT NULL
    AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) <> ''
    AND R.DATA_SAIDA IS NOT NULL
    AND R.DATA_SAIDA <> ''
    AND LENGTH(R.DATA_SAIDA) >= 10
    AND STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
),`;

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

function extractSourcePopulateSql() {
  const source = readFileSync(new URL('./add-alertas-inteligentes.mjs', import.meta.url), 'utf8');
  const match = source.match(/const POPULATE_SQL = `([\s\S]*?)`;\n\nfunction buildPopularCode/);
  if (!match) throw new Error('POPULATE_SQL de referência não encontrado.');
  return match[1];
}

function addCodeptoToPopulateSql(sql) {
  let next = sql;
  if (!next.includes('\n  CODEPTO,\n  ID_CLIENTE')) {
    next = next.replace('\n  ID_SECAO,\n  ID_CLIENTE,', '\n  ID_SECAO,\n  CODEPTO,\n  ID_CLIENTE,');
    next = next.replace('\n  G.ID_SECAO,\n  G.ID_CLIENTE,', '\n  G.ID_SECAO,\n  G.CODEPTO,\n  G.ID_CLIENTE,');
    next = next.replace(
      'AND ((AI.ID_SECAO IS NULL AND G.ID_SECAO IS NULL) OR AI.ID_SECAO = G.ID_SECAO)\n    AND AI.ID_CLIENTE = G.ID_CLIENTE',
      "AND ((AI.ID_SECAO IS NULL AND G.ID_SECAO IS NULL) OR AI.ID_SECAO = G.ID_SECAO)\n    AND COALESCE(AI.CODEPTO, '') = COALESCE(G.CODEPTO, '')\n    AND AI.ID_CLIENTE = G.ID_CLIENTE",
    );
  }

  const replacements = [
    ['BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['SELECT DISTINCT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'SELECT DISTINCT ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['PARTITION BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'PARTITION BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['GROUP BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'GROUP BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE', 'C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.CODEPTO, C.ID_CLIENTE'],
    ['PARTITION BY C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE', 'PARTITION BY C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.CODEPTO, C.ID_CLIENTE'],
    ['BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE', 'BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE'],
    ['GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE', 'GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE'],
    ['SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE', 'P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.CODEPTO, P.ID_CLIENTE'],
    ['PARTITION BY P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE', 'PARTITION BY P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.CODEPTO, P.ID_CLIENTE'],
    ['ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE', 'ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE, NOME_CLIENTE'],
  ];

  for (const [from, to] of replacements) next = next.split(from).join(to);
  return next;
}

function replacePopulateBase(code, populateSql) {
  const start = code.indexOf('  const populateBase = ');
  const end = code.indexOf('\n  const processados', start);
  if (start === -1 || end === -1) throw new Error('Trecho populateBase não encontrado no código atual.');
  return `${code.slice(0, start)}  const populateBase = ${JSON.stringify(populateSql)};${code.slice(end)}`;
}

function buildFullPopularCode(populateSql) {
  const cleanupSql = 'DELETE FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)';
  const ramoBackfillSql = `UPDATE ALERTAS_INTELIGENTES A
    JOIN CLIENTES C ON C.ID = A.ID_CLIENTE
    LEFT JOIN IMP_CLIENTES_TOTVS ICT ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
    SET A.RAMO_CLIENTE = LEFT(COALESCE(NULLIF(TRIM(ICT.RAMO), ''), 'Sem ramo'), 100)
    WHERE A.ID_CLIENTE IS NOT NULL
      AND (A.RAMO_CLIENTE IS NULL OR A.RAMO_CLIENTE = '')`;

  return `
const { runDmlMitra, runQueryMitra } = require('mitra-sdk');

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};
  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || ${projectId});
  if (!projectId) {
    return { rows: [{ STATUS: 'FAILED', MENSAGEM: 'projectId nao identificado.' }] };
  }

  await runDmlMitra({ projectId, sql: ${JSON.stringify(cleanupSql)} });

  const vendedoresRes = await runQueryMitra({
    projectId,
    sql: "SELECT DISTINCT VENDEDOR_ID FROM BU_VENDEDOR WHERE VENDEDOR_ID IS NOT NULL AND COALESCE(ATIVO, TRUE) = TRUE ORDER BY VENDEDOR_ID",
  });
  const vendedores = (vendedoresRes?.result?.rows || [])
    .map((row) => Number(row.VENDEDOR_ID || row.vendedor_id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);

  const refresh = ['true', '1', 'sim', 's'].includes(String(evt.refresh || evt.atualizar || '').toLowerCase());

  let avisosArquivados = 0;
  if (refresh) {
    const archiveRes = await runDmlMitra({
      projectId,
      sql: "UPDATE ALERTAS_INTELIGENTES SET LIDO = 1, DATA_LEITURA = CURRENT_TIMESTAMP WHERE COALESCE(LIDO, 0) = 0 AND DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)",
    });
    avisosArquivados = Number(archiveRes?.result?.rowCount || archiveRes?.result?.affectedRows || archiveRes?.rowCount || 0);
  }

  const vendedorFiltro = Number(evt.vendedorId || evt.idVendedor || evt.sellerId || 0);
  const batchLimit = Number(evt.limit || evt.limite || 0);
  const batchOffset = Number(evt.offset || 0);
  let vendedoresParaProcessar = Number.isFinite(vendedorFiltro) && vendedorFiltro > 0
    ? vendedores.filter((id) => id === vendedorFiltro)
    : vendedores;
  if (Number.isFinite(batchOffset) && batchOffset > 0) {
    vendedoresParaProcessar = vendedoresParaProcessar.slice(batchOffset);
  }
  if (Number.isFinite(batchLimit) && batchLimit > 0) {
    vendedoresParaProcessar = vendedoresParaProcessar.slice(0, batchLimit);
  }

  const populateBase = ${JSON.stringify(populateSql)};
  const processados = [];
  for (const vendedorId of vendedoresParaProcessar) {
    const sql = populateBase.replace('__VENDEDOR_FILTER__', 'EC.ID_VENDEDOR = ' + vendedorId);
    await runDmlMitra({ projectId, sql });
    processados.push(vendedorId);
  }

  await runDmlMitra({ projectId, sql: ${JSON.stringify(ramoBackfillSql)} });

  const total = await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS TOTAL FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)",
  });
  const porVendedor = await runQueryMitra({
    projectId,
    sql: "SELECT ID_VENDEDOR, COUNT(*) AS TOTAL FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY) GROUP BY ID_VENDEDOR ORDER BY TOTAL DESC, ID_VENDEDOR",
  });
  const row = total?.result?.rows?.[0] || {};
  return {
    rows: [
      {
        STATUS: 'OK',
        MODO: refresh ? 'REFRESH' : 'INCREMENTAL',
        AVISOS_ARQUIVADOS: avisosArquivados,
        VENDEDORES_PROCESSADOS: processados.join(','),
        VENDEDORES_ATIVOS: vendedores.join(','),
        TOTAL_ALERTAS_ATIVOS: Number(row.TOTAL || 0),
      },
      ...(porVendedor?.result?.rows || []).map((item) => ({
        STATUS: 'COUNT_POR_VENDEDOR',
        ID_VENDEDOR: Number(item.ID_VENDEDOR || 0),
        TOTAL: Number(item.TOTAL || 0),
      })),
    ],
  };
}

return run();
`;
}

function applyFullBuScope(populateSql) {
  const start = populateSql.indexOf('WITH CARTEIRA AS (');
  const marker = '\nPRODUTO_PERDIDO_BASE AS (';
  const end = populateSql.indexOf(marker);
  if (start === -1 || end === -1) throw new Error('CTEs de carteira/base de vendas não encontradas.');

  return `${populateSql.slice(0, start)}${FULL_BU_SCOPE_CTES}${populateSql.slice(end)}`
    .replace(/TRIM\(COALESCE\(CAST\(R\.CODFILIAL AS CHAR\), ''\)\) REGEXP '[^']*'/g, "TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) <> ''")
    .replace(/R\.DATA_SAIDA REGEXP '[^']*'/g, 'LENGTH(R.DATA_SAIDA) >= 10')
    .replace(/REGEXP '[^']*'/g, "<> ''")
    .replace(/\n\n  UNION ALL\n\n  SELECT\n    ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE, NOME_CLIENTE,\n    'PRODUTO_NAO_EXPLORADO',[\s\S]*?  FROM NAO_EXPLORADO_BASE\n  WHERE RN <= 3/g, '')
    .replace(/\n\n  UNION ALL\n\n  SELECT\n    ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE, NOME_CLIENTE,\n    'PEDIDO_INCOMPLETO',[\s\S]*?  FROM PEDIDO_INCOMPLETO_BASE\n  WHERE RN = 1/g, '')
    .replace(/\$'/g, "'");
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID inválido.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: ALERTAS_POPULAR_ID });
  const nextSql = applyFullBuScope(addCodeptoToPopulateSql(extractSourcePopulateSql()));
  const nextCode = buildFullPopularCode(nextSql);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: ALERTAS_POPULAR_ID,
    code: nextCode,
    description: current?.result?.description || 'Gera alertas inteligentes da carteira comercial usando escopo completo de B.U.',
  });
  console.log('Função alertasInteligentesPopular atualizada para escopo completo de B.U.');

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: ALERTAS_POPULAR_ID,
    input: { vendedorId: '11', force: 'true' },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou com status ${status}`);

  console.log('Smoke usuário 11 OK.');
  console.log(JSON.stringify(extractRows(smoke), null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
