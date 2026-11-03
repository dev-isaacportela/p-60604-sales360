/**
 * Corrige a integridade da feature Analytics > Metas — parte 2.
 *
 * 1) Granularidade da distribuicao por ramo/UF.
 *    A SF 295 sempre agrupou por (VENDEDOR_ID, BU_CODE, RAMO, UF) e rateou a
 *    meta TOTAL do vendedor — CODFILIAL nunca entrou no agrupamento, so filtrava
 *    o escopo. Como o frontend chamava a SF uma vez por (filial, BU, vendedor) e
 *    carimbava a filial na resposta, um vendedor presente em N filiais da mesma
 *    BU tinha as MESMAS linhas contadas N vezes (vendedor 13: 3x). Isso inflava
 *    "Meta geral" com filtro de UF/ramo, o grafico por ramo e a ocupacao por UF.
 *    Agora a SF aceita uma lista de vendedores e devolve cada combinacao uma vez.
 *
 * 2) Le de volta a personalizacao salva em METAS_BU_VENDEDOR_RAMO_UF.
 *    Ate aqui a SF 296 gravava e nenhuma SF lia: o ajuste do coordenador era
 *    descartado no proximo carregamento. A tabela passa a ter grao
 *    (CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF) — coerente com o rateio —
 *    e CODFILIAL fixo em 0 ("vale para todas as filiais da BU").
 *
 * 3) Reduz o N+1: uma chamada para todos os vendedores em vez de uma por
 *    (filial, BU, vendedor). Eram ~67 execucoes por abertura da aba.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

function replaceOnce(code, from, to, label) {
  const parts = code.split(from);
  if (parts.length !== 2) throw new Error(`${label}: ancora casou ${parts.length - 1}x (esperado 1x)`);
  return parts.join(to);
}
function replaceExactly(code, from, to, vezes, label) {
  const parts = code.split(from);
  if (parts.length - 1 !== vezes) throw new Error(`${label}: ancora casou ${parts.length - 1}x (esperado ${vezes}x)`);
  return parts.join(to);
}

// ---------------------------------------------------------------- SF 295 ----
const SF295 = [
  {
    label: 'PARAMS aceita lista de vendedores',
    vezes: 1,
    from: `    CASE WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN CAST('{{vendedorId}}' AS UNSIGNED) ELSE :VAR_USER END AS VENDEDOR_ID,`,
    to: `    CASE
      WHEN '{{vendedorIds}}' REGEXP '^[0-9]+(,[0-9]+)*$' THEN '{{vendedorIds}}'
      WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN '{{vendedorId}}'
      ELSE CAST(:VAR_USER AS CHAR)
    END AS VENDEDOR_IDS,`,
  },
  {
    label: 'CTE VENDEDORES',
    vezes: 1,
    from: `),
BU_SCOPE AS (`,
    to: `),
VENDEDORES AS (
  SELECT DISTINCT CAST(BV.VENDEDOR_ID AS UNSIGNED) AS VENDEDOR_ID
  FROM BU_VENDEDOR BV
  JOIN PARAMS P ON FIND_IN_SET(BV.VENDEDOR_ID, P.VENDEDOR_IDS)
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
),
BU_SCOPE AS (`,
  },
  {
    label: 'BU_SCOPE por lista',
    vezes: 1,
    from: `  FROM BU_VENDEDOR BV
  JOIN PARAMS P ON P.VENDEDOR_ID = BV.VENDEDOR_ID
  WHERE BV.ATIVO = TRUE`,
    to: `  FROM BU_VENDEDOR BV
  JOIN VENDEDORES VD ON VD.VENDEDOR_ID = BV.VENDEDOR_ID
  JOIN PARAMS P ON 1 = 1
  WHERE BV.ATIVO = TRUE`,
  },
  {
    label: 'META_TOTAL por lista + CTE CUSTOM_RAMO_UF',
    vezes: 1,
    from: `META_TOTAL AS (
  SELECT P.VENDEDOR_ID, COALESCE(MV.VALOR_META, 0) AS META_TOTAL
  FROM PARAMS P
  LEFT JOIN VW_META_VENDEDOR_MES MV
    ON MV.USER_ID = P.VENDEDOR_ID
   AND MV.ANO = P.ANO_REF
   AND MV.MES = P.MES_REF
),`,
    to: `META_TOTAL AS (
  SELECT VD.VENDEDOR_ID, COALESCE(MV.VALOR_META, 0) AS META_TOTAL
  FROM VENDEDORES VD
  JOIN PARAMS P ON 1 = 1
  LEFT JOIN VW_META_VENDEDOR_MES MV
    ON MV.USER_ID = VD.VENDEDOR_ID
   AND MV.ANO = P.ANO_REF
   AND MV.MES = P.MES_REF
),
CUSTOM_RAMO_UF AS (
  SELECT
    R.VENDEDOR_ID,
    R.CODEPTO,
    R.RAMO_CODE,
    R.UF,
    MAX(R.PERCENTUAL_META) AS PERCENTUAL_META,
    MAX(R.META_VALOR) AS META_VALOR
  FROM METAS_BU_VENDEDOR_RAMO_UF R
  JOIN VENDEDORES VD ON VD.VENDEDOR_ID = R.VENDEDOR_ID
  JOIN PARAMS P ON P.ANO_REF = R.ANO AND P.MES_REF = R.MES
  GROUP BY R.VENDEDOR_ID, R.CODEPTO, R.RAMO_CODE, R.UF
),`,
  },
  {
    label: 'TARGET_BASE: vendedor vem do escopo de BU',
    vezes: 1,
    from: `  JOIN PARAMS P ON P.ANO_REF = T.YEAR_REF AND P.MES_REF = T.MONTH_REF
  JOIN (SELECT DISTINCT VENDEDOR_ID, BU_CODE FROM BU_SCOPE WHERE BU_CODE IS NOT NULL) B
    ON B.VENDEDOR_ID = P.VENDEDOR_ID AND B.BU_CODE = BU.CODE`,
    to: `  JOIN PARAMS P ON P.ANO_REF = T.YEAR_REF AND P.MES_REF = T.MONTH_REF
  JOIN (SELECT DISTINCT VENDEDOR_ID, BU_CODE FROM BU_SCOPE WHERE BU_CODE IS NOT NULL) B
    ON B.BU_CODE = BU.CODE`,
  },
  {
    label: 'TARGET_BASE: projecao e agrupamento',
    vezes: 1,
    from: `TARGET_BASE AS (
  SELECT
    P.VENDEDOR_ID,
    BU.CODE AS BU_CODE,`,
    to: `TARGET_BASE AS (
  SELECT
    B.VENDEDOR_ID,
    BU.CODE AS BU_CODE,`,
  },
  {
    label: 'TARGET_BASE: GROUP BY',
    vezes: 1,
    from: `  GROUP BY P.VENDEDOR_ID, BU.CODE, R.CODE, RAMO_CODE, RAMO_NOME`,
    to: `  GROUP BY B.VENDEDOR_ID, BU.CODE, R.CODE, RAMO_CODE, RAMO_NOME`,
  },
  {
    label: 'VENDAS/DEVOLUCOES: projecao do vendedor',
    vezes: 2,
    from: `  SELECT
    P.VENDEDOR_ID,
    BS.BU_CODE,`,
    to: `  SELECT
    BS.VENDEDOR_ID,
    BS.BU_CODE,`,
  },
  {
    label: 'VENDAS/DEVOLUCOES: join de escopo',
    vezes: 2,
    from: `    ON BS.VENDEDOR_ID = P.VENDEDOR_ID
   AND BS.CODFILIAL = `,
    to: `    ON BS.CODFILIAL = `,
  },
  {
    label: 'VENDAS/DEVOLUCOES: carteira do vendedor',
    vezes: 2,
    from: `    ON EC.ID_VENDEDOR = P.VENDEDOR_ID`,
    to: `    ON EC.ID_VENDEDOR = BS.VENDEDOR_ID`,
  },
  {
    label: 'VENDAS/DEVOLUCOES: GROUP BY',
    vezes: 2,
    from: `  GROUP BY P.VENDEDOR_ID, BS.BU_CODE, RAMO_CODE, UF`,
    to: `  GROUP BY BS.VENDEDOR_ID, BS.BU_CODE, RAMO_CODE, UF`,
  },
  {
    label: 'SELECT final: CODEPTO + personalizacao salva',
    vezes: 1,
    from: `  CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
       ELSE ROUND((TB.TARGET_VALUE / TT.TARGET_TOTAL) * 100, 4)
  END AS PERCENTUAL_DISTRIBUICAO,
  CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
       ELSE ROUND(MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL), 2)
  END AS META_VENDEDOR_RAMO_UF,`,
    to: `  CASE
    WHEN TB.BU_CODE = 'NUTRICAO' THEN 1
    WHEN TB.BU_CODE = 'ENFERMAGEM' THEN 2
    WHEN TB.BU_CODE = 'MEDICAMENTO' THEN 8
    WHEN TB.BU_CODE = 'ESTETICA_E_INJETAVEIS' THEN 9
    ELSE 0
  END AS CODEPTO,
  COALESCE(CU.PERCENTUAL_META,
    CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
         ELSE ROUND((TB.TARGET_VALUE / TT.TARGET_TOTAL) * 100, 4)
    END) AS PERCENTUAL_DISTRIBUICAO,
  COALESCE(CU.META_VALOR,
    CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
         ELSE ROUND(MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL), 2)
    END) AS META_VENDEDOR_RAMO_UF,
  CASE WHEN CU.META_VALOR IS NULL THEN 0 ELSE 1 END AS PERSONALIZADO,`,
  },
  {
    label: 'SELECT final: atingimento usa a meta efetiva',
    vezes: 1,
    from: `  CASE
    WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 OR MT.META_TOTAL = 0 THEN 0
    ELSE ROUND(((COALESCE(VB.FATURAMENTO_BRUTO, 0) - COALESCE(DB.VALOR_DEVOLVIDO, 0)) / (MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL))) * 100, 2)
  END AS PERCENTUAL_META`,
    to: `  CASE
    WHEN COALESCE(CU.META_VALOR,
      CASE WHEN COALESCE(TT.TARGET_TOTAL, 0) = 0 THEN 0
           ELSE ROUND(MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL), 2)
      END) <= 0 THEN 0
    ELSE ROUND(((COALESCE(VB.FATURAMENTO_BRUTO, 0) - COALESCE(DB.VALOR_DEVOLVIDO, 0)) / COALESCE(CU.META_VALOR,
      ROUND(MT.META_TOTAL * (TB.TARGET_VALUE / TT.TARGET_TOTAL), 2))) * 100, 2)
  END AS PERCENTUAL_META`,
  },
  {
    label: 'SELECT final: join da personalizacao',
    vezes: 1,
    from: `WHERE ('{{ramoCode}}' = '' OR TB.RAMO_CODE = '{{ramoCode}}')`,
    to: `LEFT JOIN CUSTOM_RAMO_UF CU
  ON CU.VENDEDOR_ID = TB.VENDEDOR_ID
 AND CU.RAMO_CODE = TB.RAMO_CODE
 AND CU.UF = TB.UF
 AND CU.CODEPTO = CASE
   WHEN TB.BU_CODE = 'NUTRICAO' THEN 1
   WHEN TB.BU_CODE = 'ENFERMAGEM' THEN 2
   WHEN TB.BU_CODE = 'MEDICAMENTO' THEN 8
   WHEN TB.BU_CODE = 'ESTETICA_E_INJETAVEIS' THEN 9
   ELSE 0
 END
WHERE ('{{ramoCode}}' = '' OR TB.RAMO_CODE = '{{ramoCode}}')`,
  },
  {
    label: 'ORDER BY inclui o vendedor',
    vezes: 1,
    from: `ORDER BY TB.BU_CODE, TB.RAMO_NOME, TB.UF`,
    to: `ORDER BY TB.VENDEDOR_ID, TB.BU_CODE, TB.RAMO_NOME, TB.UF`,
  },
];

// ---------------------------------------------------------------- SF 296 ----
const SF296 = [
  {
    label: 'grava CODFILIAL = 0 (vale para todas as filiais da BU)',
    vezes: 1,
    from: `    SELECT
      CAST('{{codfilial}}' AS UNSIGNED),`,
    to: `    SELECT
      0,`,
  },
];

async function aplicar(id, regras) {
  const fn = (await readServerFunctionMitra({ projectId, serverFunctionId: id })).result;
  let code = String(fn.code || '');
  for (const r of regras) {
    code = r.vezes === 1
      ? replaceOnce(code, r.from, r.to, `SF ${id} :: ${r.label}`)
      : replaceExactly(code, r.from, r.to, r.vezes, `SF ${id} :: ${r.label}`);
    console.log(`   ok: ${r.label}`);
  }
  if (id === 295 && /\bP\.VENDEDOR_ID\b/.test(code)) {
    throw new Error('SF 295: sobrou referencia a P.VENDEDOR_ID');
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, code });
  console.log(`   SF ${id} (${fn.name}) atualizada.`);
}

async function main() {
  console.log('== 1. Grao da tabela de metas por ramo/UF ==');
  await runDdlMitra({ projectId, sql: 'DROP INDEX UX_METAS_BU_VENDEDOR_RAMO_UF ON METAS_BU_VENDEDOR_RAMO_UF' });
  await runDdlMitra({
    projectId,
    sql: 'CREATE UNIQUE INDEX UX_METAS_BU_VENDEDOR_RAMO_UF ON METAS_BU_VENDEDOR_RAMO_UF (CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF)',
  });
  console.log('   chave unica agora e (CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF)');

  console.log('\n== 2. SF 295 (leitura) ==');
  await aplicar(295, SF295);

  console.log('\n== 3. SF 296 (escrita) ==');
  await aplicar(296, SF296);

  console.log('\nOK');
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
