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
const analyticsRcaMixProdutosId = 184;

const fornecedoresCte = `VENDAS_FORNECEDOR AS (
  SELECT
    COALESCE(V.CODFORNEC, 0) AS CODFORNEC,
    CONCAT('Fornecedor ', COALESCE(CAST(V.CODFORNEC AS CHAR), 'não informado')) AS FORNECEDOR,
    ROUND(SUM(COALESCE(V.QT, 0)), 2) AS QTD_FORNECEDOR,
    ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VALOR_FORNECEDOR
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  
    JOIN BU_SCOPE BS
      ON BS.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
     AND BS.ID_BU = TRIM(CAST(V.CODEPTO AS CHAR))
     AND (
       BS.ID_SECAO IS NULL
       OR TRIM(CAST(BS.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
       OR LPAD(TRIM(CAST(BS.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
     )
  
  
    JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID
  
  JOIN PERIODO P ON 1 = 1
  WHERE V.CODPROD IS NOT NULL
  
    AND V.DTSAIDA >= DATE_FORMAT(P.DT_INICIO, '%Y-%m-%d')
    AND V.DTSAIDA <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')
    AND (
      P.DEPARTAMENTOS_PARAM IS NULL
      OR INSTR(CONCAT('|', P.DEPARTAMENTOS_PARAM, '|'), CONCAT('|', TRIM(CAST(V.CODEPTO AS CHAR)), '|')) > 0
    )
    AND (
      P.RAMOS_PARAM IS NULL
      OR INSTR(
        CONCAT('|', P.RAMOS_PARAM, '|'),
        CONCAT('|', REPLACE(COALESCE(NULLIF(TRIM(CAST(V.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo'), '''', ''), '|')
      ) > 0
    )
    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(V.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )
   
  GROUP BY COALESCE(V.CODFORNEC, 0)
),
FORNECEDORES AS (
  SELECT
    VF.CODFORNEC,
    VF.FORNECEDOR,
    VF.QTD_FORNECEDOR,
    VF.VALOR_FORNECEDOR,
    ROUND(CASE WHEN SUM(VF.VALOR_FORNECEDOR) OVER() = 0 THEN 0 ELSE (VF.VALOR_FORNECEDOR / SUM(VF.VALOR_FORNECEDOR) OVER()) * 100 END, 2) AS PERC_FORNECEDOR
  FROM VENDAS_FORNECEDOR VF
  ORDER BY VF.VALOR_FORNECEDOR DESC
  LIMIT 10
)`;

function updateCode(code) {
  if (code.includes('VENDAS_FORNECEDOR AS')) return code;

  const cteInsertBefore = 'TOP_PRODUTOS AS (';
  const cteIndex = code.indexOf(cteInsertBefore);
  if (cteIndex === -1) throw new Error('Ponto de inserção TOP_PRODUTOS não encontrado.');
  const withFornecedorCte = `${code.slice(0, cteIndex)}${fornecedoresCte},\n${code.slice(cteIndex)}`;

  const oldFinal = `SELECT 'TOP_PRODUTO' AS TIPO, CODPROD, DESCRICAO, QT, VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, NULL AS RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO
FROM TOP_PRODUTOS
UNION ALL
SELECT 'TOP_PRODUTO_RAMO' AS TIPO, CODPROD, DESCRICAO, QT, VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO
FROM TOP_PRODUTOS_RAMO
UNION ALL
SELECT 'DEPTO_SECAO' AS TIPO, NULL AS CODPROD, NULL AS DESCRICAO, NULL AS QT, TOTAL AS VALOR, DEPARTAMENTO, SECAO, NULL AS RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO
FROM DEPTO_SECAO
UNION ALL
SELECT 'PRODUTO_DEVOLUCAO' AS TIPO, CODPROD, DESCRICAO, NULL AS QT, NULL AS VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, NULL AS RAMO, QT_DEVOLVIDA, VALOR_DEVOLVIDO, PERC_FATURADO
FROM PRODUTOS_DEVOLUCAO`;

  const newFinal = `SELECT 'TOP_PRODUTO' AS TIPO, CODPROD, DESCRICAO, QT, VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, NULL AS RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO, NULL AS CODFORNEC, NULL AS FORNECEDOR, NULL AS QTD_FORNECEDOR, NULL AS VALOR_FORNECEDOR, NULL AS PERC_FORNECEDOR
FROM TOP_PRODUTOS
UNION ALL
SELECT 'TOP_PRODUTO_RAMO' AS TIPO, CODPROD, DESCRICAO, QT, VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO, NULL AS CODFORNEC, NULL AS FORNECEDOR, NULL AS QTD_FORNECEDOR, NULL AS VALOR_FORNECEDOR, NULL AS PERC_FORNECEDOR
FROM TOP_PRODUTOS_RAMO
UNION ALL
SELECT 'DEPTO_SECAO' AS TIPO, NULL AS CODPROD, NULL AS DESCRICAO, NULL AS QT, TOTAL AS VALOR, DEPARTAMENTO, SECAO, NULL AS RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO, NULL AS CODFORNEC, NULL AS FORNECEDOR, NULL AS QTD_FORNECEDOR, NULL AS VALOR_FORNECEDOR, NULL AS PERC_FORNECEDOR
FROM DEPTO_SECAO
UNION ALL
SELECT 'PRODUTO_DEVOLUCAO' AS TIPO, CODPROD, DESCRICAO, NULL AS QT, NULL AS VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, NULL AS RAMO, QT_DEVOLVIDA, VALOR_DEVOLVIDO, PERC_FATURADO, NULL AS CODFORNEC, NULL AS FORNECEDOR, NULL AS QTD_FORNECEDOR, NULL AS VALOR_FORNECEDOR, NULL AS PERC_FORNECEDOR
FROM PRODUTOS_DEVOLUCAO
UNION ALL
SELECT 'FORNECEDOR' AS TIPO, NULL AS CODPROD, NULL AS DESCRICAO, NULL AS QT, NULL AS VALOR, NULL AS DEPARTAMENTO, NULL AS SECAO, NULL AS RAMO, NULL AS QT_DEVOLVIDA, NULL AS VALOR_DEVOLVIDO, NULL AS PERC_FATURADO, CODFORNEC, FORNECEDOR, QTD_FORNECEDOR, VALOR_FORNECEDOR, PERC_FORNECEDOR
FROM FORNECEDORES`;

  if (!withFornecedorCte.includes(oldFinal)) throw new Error('Bloco final da consulta de mix não encontrado.');
  return withFornecedorCte.replace(oldFinal, newFinal);
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

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: analyticsRcaMixProdutosId });
  const code = current?.result?.code || '';
  const nextCode = updateCode(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: analyticsRcaMixProdutosId,
      code: nextCode,
      description: current?.result?.description || 'Mix de produtos com distribuição por fornecedor.',
    });
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: analyticsRcaMixProdutosId,
    input: { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', dataInicio: '2026-01-01', dataFim: '2026-01-31', departamentos: '', ramos: '', limit: '5', offset: '0' },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  const rows = extractRows(smoke);
  const fornecedores = rows.filter((row) => row.TIPO === 'FORNECEDOR');
  console.log(`SF ${analyticsRcaMixProdutosId}: fornecedores OK (${fornecedores.length} fornecedor(es), ${rows.length} linha(s) no smoke).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar distribuição por fornecedores:');
  console.error(error?.message || error);
  process.exit(1);
});
