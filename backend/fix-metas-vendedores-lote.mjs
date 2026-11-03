/**
 * Corrige a integridade da feature Analytics > Metas — parte 3.
 *
 * SF 196 passa a atender TODAS as BUs do escopo numa unica execucao.
 * Antes, o frontend chamava a SF uma vez por BU (32 execucoes no escopo da
 * diretoria). A SF nao podia atender varias BUs porque o SELECT final fazia
 * BU_SELECIONADA x VENDEDORES_BU com "ON 1 = 1": com mais de uma BU, todo
 * vendedor apareceria sob todas as BUs. Agora a BU viaja junto do vendedor e
 * as agregacoes de venda/devolucao sao por (filial, BU, vendedor).
 *
 * Compatibilidade: passar codfilial/codepto continua filtrando uma BU so.
 */
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

const REGRAS = [
  {
    label: 'BU_SELECIONADA: sem parametro = todas as BUs do escopo',
    from: `BU_SELECIONADA AS (
  SELECT E.CODFILIAL, E.CODEPTO
  FROM ESCOPO_BU E
  JOIN FILTRO_BU F ON F.CODFILIAL_PARAM = E.CODFILIAL AND F.CODEPTO_PARAM = E.CODEPTO
),`,
    to: `BU_SELECIONADA AS (
  SELECT DISTINCT E.CODFILIAL, E.CODEPTO
  FROM ESCOPO_BU E
  JOIN FILTRO_BU F ON 1 = 1
  WHERE (F.CODFILIAL_PARAM IS NULL OR F.CODFILIAL_PARAM = E.CODFILIAL)
    AND (F.CODEPTO_PARAM IS NULL OR F.CODEPTO_PARAM = E.CODEPTO)
),`,
  },
  {
    label: 'VENDEDORES_BU carrega a BU do vendedor',
    from: `VENDEDORES_BU AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID,`,
    to: `VENDEDORES_BU AS (
  SELECT DISTINCT
    B.CODFILIAL,
    B.CODEPTO,
    BV.VENDEDOR_ID,`,
  },
  {
    label: 'VENDAS_AGG por (filial, BU, vendedor)',
    from: `VENDAS_AGG AS (
  SELECT VENDEDOR_ID, ROUND(SUM(TOTAL), 2) AS FATURAMENTO_BRUTO, COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
  FROM VENDAS_ATRIBUIDAS
  GROUP BY VENDEDOR_ID
),`,
    to: `VENDAS_AGG AS (
  SELECT CODFILIAL, CODEPTO, VENDEDOR_ID, ROUND(SUM(TOTAL), 2) AS FATURAMENTO_BRUTO, COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS
  FROM VENDAS_ATRIBUIDAS
  GROUP BY CODFILIAL, CODEPTO, VENDEDOR_ID
),`,
  },
  {
    label: 'DEV_AGG por (filial, BU, vendedor)',
    from: `DEV_AGG AS (
  SELECT VENDEDOR_ID, ROUND(SUM(VALOR_DEVOLVIDO), 2) AS TOTAL_DEVOLVIDO
  FROM DEVOLUCOES_ATRIBUIDAS
  GROUP BY VENDEDOR_ID
)`,
    to: `DEV_AGG AS (
  SELECT CODFILIAL, CODEPTO, VENDEDOR_ID, ROUND(SUM(VALOR_DEVOLVIDO), 2) AS TOTAL_DEVOLVIDO
  FROM DEVOLUCOES_ATRIBUIDAS
  GROUP BY CODFILIAL, CODEPTO, VENDEDOR_ID
)`,
  },
  {
    label: 'SELECT final sem produto cartesiano entre BU e vendedor',
    from: `SELECT
  B.CODFILIAL,
  B.CODEPTO,
  VB.VENDEDOR_ID,`,
    to: `SELECT
  VB.CODFILIAL,
  VB.CODEPTO,
  VB.VENDEDOR_ID,`,
  },
  {
    label: 'FROM/JOINs do SELECT final',
    from: `FROM BU_SELECIONADA B
JOIN VENDEDORES_BU VB ON 1 = 1
JOIN PERIODO P ON 1 = 1
LEFT JOIN METAS_BU_VENDEDOR MBV
  ON MBV.CODFILIAL = B.CODFILIAL
 AND MBV.CODEPTO = B.CODEPTO
 AND MBV.VENDEDOR_ID = VB.VENDEDOR_ID
 AND MBV.MES = P.MES_REF
 AND MBV.ANO = P.ANO_REF
LEFT JOIN VENDAS_AGG VA ON VA.VENDEDOR_ID = VB.VENDEDOR_ID
LEFT JOIN DEV_AGG DA ON DA.VENDEDOR_ID = VB.VENDEDOR_ID
ORDER BY VB.RCA`,
    to: `FROM VENDEDORES_BU VB
JOIN PERIODO P ON 1 = 1
LEFT JOIN METAS_BU_VENDEDOR MBV
  ON MBV.CODFILIAL = VB.CODFILIAL
 AND MBV.CODEPTO = VB.CODEPTO
 AND MBV.VENDEDOR_ID = VB.VENDEDOR_ID
 AND MBV.MES = P.MES_REF
 AND MBV.ANO = P.ANO_REF
LEFT JOIN VENDAS_AGG VA
  ON VA.CODFILIAL = CAST(VB.CODFILIAL AS CHAR)
 AND VA.CODEPTO = VB.CODEPTO
 AND VA.VENDEDOR_ID = VB.VENDEDOR_ID
LEFT JOIN DEV_AGG DA
  ON DA.CODFILIAL = CAST(VB.CODFILIAL AS CHAR)
 AND DA.CODEPTO = VB.CODEPTO
 AND DA.VENDEDOR_ID = VB.VENDEDOR_ID
ORDER BY VB.CODFILIAL, VB.CODEPTO, VB.RCA`,
  },
];

async function main() {
  const fn = (await readServerFunctionMitra({ projectId, serverFunctionId: 196 })).result;
  let code = String(fn.code || '');
  for (const r of REGRAS) {
    const parts = code.split(r.from);
    if (parts.length !== 2) throw new Error(`SF 196 :: ${r.label}: ancora casou ${parts.length - 1}x (esperado 1x)`);
    code = parts.join(r.to);
    console.log(`   ok: ${r.label}`);
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: 196, code });
  console.log(`   SF 196 (${fn.name}) atualizada.`);
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
