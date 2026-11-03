import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const payload = raw.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
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

const COMMON_CTES = `
INPUTS AS (
  SELECT
    CASE WHEN '{{codfilial}}' = '' OR LOCATE('{', '{{codfilial}}') > 0 THEN NULL ELSE TRIM('{{codfilial}}') END AS CODFILIAL_PARAM,
    CASE WHEN '{{codepto}}' = '' OR LOCATE('{', '{{codepto}}') > 0 THEN NULL ELSE TRIM('{{codepto}}') END AS CODEPTO_PARAM,
    CASE WHEN '{{ramoCliente}}' = '' OR LOCATE('{', '{{ramoCliente}}') > 0 THEN NULL ELSE UPPER(TRIM('{{ramoCliente}}')) END AS RAMO_PARAM,
    CASE WHEN '{{cliente}}' = '' OR LOCATE('{', '{{cliente}}') > 0 THEN NULL ELSE UPPER(TRIM('{{cliente}}')) END AS CLIENTE_PARAM,
    CASE WHEN '{{userId}}' REGEXP '^[0-9]+$' THEN CAST('{{userId}}' AS UNSIGNED) ELSE NULL END AS VENDEDOR_PARAM,
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE 2026 END AS ANO_REF
),
ADMIN AS (
  SELECT CASE WHEN LOWER(COALESCE(DESCR, '')) = 'ti@benenutri.com' THEN 1 ELSE 0 END AS PODE_ACESSAR
  FROM INT_USER
  WHERE ID = :VAR_USER
),
BU_SCOPE_RAW AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM BU_VENDEDOR BV
  JOIN INPUTS I ON I.VENDEDOR_PARAM IS NULL OR I.VENDEDOR_PARAM = BV.VENDEDOR_ID
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
BU_SCOPE AS (
  SELECT
    CODFILIAL,
    CODEPTO,
    ID_SECAO,
    MIN(TARGET_USER_ID) AS TARGET_USER_ID
  FROM BU_SCOPE_RAW
  GROUP BY CODFILIAL, CODEPTO, ID_SECAO
),
BASE AS (
  SELECT
    D.AUTO_ID,
    CAST(D.NOTA_DEVOLUCAO AS CHAR) AS NOTA_DEVOLUCAO,
    CAST(D.NUMTRANSENT AS CHAR) AS NUMTRANSENT,
    CAST(D.NOTA_VENDA_ORIGINAL AS CHAR) AS NOTA_VENDA_ORIGINAL,
    CAST(D.NUMPED AS CHAR) AS NUMPED,
    CAST(D.DATA_VENDA AS CHAR) AS DATA_VENDA,
    CAST(D.DATA_DEVOLUCAO AS CHAR) AS DATA_DEVOLUCAO,
    TRIM(CAST(D.CODFILIAL AS CHAR)) AS CODFILIAL,
    D.CODCLI,
    COALESCE(NULLIF(TRIM(CAST(D.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', D.CODCLI)) AS CLIENTE,
    COALESCE(NULLIF(TRIM(CAST(D.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo') AS RAMO_CLIENTE,
    TRIM(CAST(D.CODEPTO AS CHAR)) AS CODEPTO,
    COALESCE(NULLIF(TRIM(CAST(D.DEPARTAMENTO AS CHAR)), ''), CONCAT('Depto ', D.CODEPTO)) AS DEPARTAMENTO,
    D.CODSEC,
    COALESCE(NULLIF(TRIM(CAST(D.SECAO AS CHAR)), ''), CONCAT('Seção ', D.CODSEC)) AS SECAO,
    D.CODPROD,
    COALESCE(NULLIF(TRIM(CAST(D.DESCRICAO AS CHAR)), ''), CONCAT('Produto ', D.CODPROD)) AS DESCRICAO,
    COALESCE(D.QT_DEVOLVIDA, 0) AS QT_DEVOLVIDA,
    COALESCE(D.VALOR_DEVOLVIDO, 0) AS VALOR_DEVOLVIDO,
    D.COD_RCA,
    COALESCE(NULLIF(TRIM(CAST(D.RCA AS CHAR)), ''), RT.RCA_NOME, CONCAT('RCA ', D.COD_RCA)) AS RCA,
    D.TIPODESCARGA,
    B.TARGET_USER_ID AS VENDEDOR_BU_USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuário ', B.TARGET_USER_ID), 'Sem BU vinculada') AS VENDEDOR_BU
  FROM IMP_DEVOLUCOES_TOTVS D
  JOIN INPUTS I ON 1 = 1
  JOIN ADMIN A ON A.PODE_ACESSAR = 1
  LEFT JOIN BU_SCOPE B ON
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
          WHERE B2.CODFILIAL = B.CODFILIAL
            AND B2.CODEPTO = B.CODEPTO
            AND B2.ID_SECAO IS NOT NULL
            AND (
              TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))
              OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(D.CODSEC AS CHAR))
            )
        )
      )
    )
  LEFT JOIN FUNCIONARIOS F ON F.ID = B.TARGET_USER_ID
  LEFT JOIN INT_USER U ON U.ID = B.TARGET_USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = D.COD_RCA
  WHERE D.DATA_DEVOLUCAO >= CONCAT(I.ANO_REF, '-', LPAD(I.MES_REF, 2, '0'), '-01')
    AND D.DATA_DEVOLUCAO < DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(I.ANO_REF, '-', LPAD(I.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d')
    AND (I.CODFILIAL_PARAM IS NULL OR TRIM(CAST(D.CODFILIAL AS CHAR)) = I.CODFILIAL_PARAM)
    AND (I.CODEPTO_PARAM IS NULL OR TRIM(CAST(D.CODEPTO AS CHAR)) = I.CODEPTO_PARAM)
    AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(NULLIF(TRIM(CAST(D.RAMO_CLIENTE AS CHAR)), ''), 'Sem ramo')) = I.RAMO_PARAM)
    AND (
      I.CLIENTE_PARAM IS NULL
      OR CAST(D.CODCLI AS CHAR) LIKE CONCAT('%', I.CLIENTE_PARAM, '%')
      OR UPPER(COALESCE(CAST(D.CLIENTE AS CHAR), '')) LIKE CONCAT('%', I.CLIENTE_PARAM, '%')
    )
    AND (I.VENDEDOR_PARAM IS NULL OR B.TARGET_USER_ID IS NOT NULL)
)
`;

const resumoCode = `
WITH
${COMMON_CTES},
RESUMO AS (
  SELECT
    ROUND(COALESCE(SUM(VALOR_DEVOLVIDO), 0), 2) AS TOTAL_DEVOLVIDO,
    ROUND(COALESCE(SUM(QT_DEVOLVIDA), 0), 2) AS QT_DEVOLVIDA,
    COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
    COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
    COUNT(*) AS QTD_ITENS,
    COUNT(DISTINCT CODPROD) AS QTD_PRODUTOS
  FROM BASE
),
RAMOS_AGG AS (
  SELECT
    RAMO_CLIENTE,
    ROUND(SUM(VALOR_DEVOLVIDO), 2) AS TOTAL_DEVOLVIDO,
    ROUND(SUM(QT_DEVOLVIDA), 2) AS QT_DEVOLVIDA,
    COUNT(DISTINCT CODCLI) AS QTD_CLIENTES,
    COUNT(DISTINCT NUMPED) AS QTD_PEDIDOS,
    COUNT(*) AS QTD_ITENS
  FROM BASE
  GROUP BY RAMO_CLIENTE
),
UNIONED AS (
  SELECT
    'RESUMO' AS TIPO,
    NULL AS RAMO_CLIENTE,
    TOTAL_DEVOLVIDO,
    QT_DEVOLVIDA,
    QTD_CLIENTES,
    QTD_PEDIDOS,
    QTD_ITENS,
    QTD_PRODUTOS,
    NULL AS PERC_TOTAL
  FROM RESUMO
  UNION ALL
  SELECT
    'RAMO' AS TIPO,
    R.RAMO_CLIENTE,
    R.TOTAL_DEVOLVIDO,
    R.QT_DEVOLVIDA,
    R.QTD_CLIENTES,
    R.QTD_PEDIDOS,
    R.QTD_ITENS,
    NULL AS QTD_PRODUTOS,
    ROUND(CASE WHEN S.TOTAL_DEVOLVIDO = 0 THEN 0 ELSE (R.TOTAL_DEVOLVIDO / S.TOTAL_DEVOLVIDO) * 100 END, 2) AS PERC_TOTAL
  FROM RAMOS_AGG R
  JOIN RESUMO S ON 1 = 1
)
SELECT *
FROM UNIONED
ORDER BY CASE TIPO WHEN 'RESUMO' THEN 0 ELSE 1 END, TOTAL_DEVOLVIDO DESC, RAMO_CLIENTE
`;

const detalheCode = `
WITH
${COMMON_CTES},
PAGINADA AS (
  SELECT
    AUTO_ID,
    NOTA_DEVOLUCAO,
    NUMTRANSENT,
    NOTA_VENDA_ORIGINAL,
    NUMPED,
    DATA_VENDA,
    DATA_DEVOLUCAO,
    CODFILIAL,
    CODCLI,
    CLIENTE,
    RAMO_CLIENTE,
    DEPARTAMENTO,
    SECAO,
    CODPROD,
    DESCRICAO,
    QT_DEVOLVIDA,
    VALOR_DEVOLVIDO,
    COD_RCA,
    RCA,
    TIPODESCARGA,
    VENDEDOR_BU_USER_ID,
    VENDEDOR_BU,
    COUNT(*) OVER() AS TOTAL_REGISTROS,
    SUM(QT_DEVOLVIDA) OVER() AS QT_DEVOLVIDA_FILTRADO,
    SUM(VALOR_DEVOLVIDO) OVER() AS VALOR_DEVOLVIDO_FILTRADO
  FROM BASE
)
SELECT
  NOTA_DEVOLUCAO,
  NUMTRANSENT,
  NOTA_VENDA_ORIGINAL,
  NUMPED,
  DATA_VENDA,
  DATA_DEVOLUCAO,
  CODFILIAL,
  CODCLI,
  CLIENTE,
  RAMO_CLIENTE,
  DEPARTAMENTO,
  SECAO,
  CODPROD,
  DESCRICAO,
  QT_DEVOLVIDA,
  VALOR_DEVOLVIDO,
  COD_RCA,
  RCA,
  TIPODESCARGA,
  VENDEDOR_BU_USER_ID,
  VENDEDOR_BU,
  TOTAL_REGISTROS,
  QT_DEVOLVIDA_FILTRADO,
  VALOR_DEVOLVIDO_FILTRADO
FROM PAGINADA
ORDER BY
  CASE WHEN '{{sortBy}}' = 'NOTA_DEVOLUCAO' AND '{{sortDir}}' = 'ASC' THEN NOTA_DEVOLUCAO END ASC,
  CASE WHEN '{{sortBy}}' = 'NOTA_DEVOLUCAO' AND '{{sortDir}}' = 'DESC' THEN NOTA_DEVOLUCAO END DESC,
  CASE WHEN '{{sortBy}}' = 'NUMTRANSENT' AND '{{sortDir}}' = 'ASC' THEN NUMTRANSENT END ASC,
  CASE WHEN '{{sortBy}}' = 'NUMTRANSENT' AND '{{sortDir}}' = 'DESC' THEN NUMTRANSENT END DESC,
  CASE WHEN '{{sortBy}}' = 'NOTA_VENDA_ORIGINAL' AND '{{sortDir}}' = 'ASC' THEN NOTA_VENDA_ORIGINAL END ASC,
  CASE WHEN '{{sortBy}}' = 'NOTA_VENDA_ORIGINAL' AND '{{sortDir}}' = 'DESC' THEN NOTA_VENDA_ORIGINAL END DESC,
  CASE WHEN '{{sortBy}}' = 'NUMPED' AND '{{sortDir}}' = 'ASC' THEN NUMPED END ASC,
  CASE WHEN '{{sortBy}}' = 'NUMPED' AND '{{sortDir}}' = 'DESC' THEN NUMPED END DESC,
  CASE WHEN '{{sortBy}}' = 'DATA_VENDA' AND '{{sortDir}}' = 'ASC' THEN DATA_VENDA END ASC,
  CASE WHEN '{{sortBy}}' = 'DATA_VENDA' AND '{{sortDir}}' = 'DESC' THEN DATA_VENDA END DESC,
  CASE WHEN '{{sortBy}}' = 'DATA_DEVOLUCAO' AND '{{sortDir}}' = 'ASC' THEN DATA_DEVOLUCAO END ASC,
  CASE WHEN '{{sortBy}}' = 'DATA_DEVOLUCAO' AND '{{sortDir}}' = 'DESC' THEN DATA_DEVOLUCAO END DESC,
  CASE WHEN '{{sortBy}}' = 'CODFILIAL' AND '{{sortDir}}' = 'ASC' THEN CODFILIAL END ASC,
  CASE WHEN '{{sortBy}}' = 'CODFILIAL' AND '{{sortDir}}' = 'DESC' THEN CODFILIAL END DESC,
  CASE WHEN '{{sortBy}}' = 'CODCLI' AND '{{sortDir}}' = 'ASC' THEN CODCLI END ASC,
  CASE WHEN '{{sortBy}}' = 'CODCLI' AND '{{sortDir}}' = 'DESC' THEN CODCLI END DESC,
  CASE WHEN '{{sortBy}}' = 'CLIENTE' AND '{{sortDir}}' = 'ASC' THEN CLIENTE END ASC,
  CASE WHEN '{{sortBy}}' = 'CLIENTE' AND '{{sortDir}}' = 'DESC' THEN CLIENTE END DESC,
  CASE WHEN '{{sortBy}}' = 'RAMO_CLIENTE' AND '{{sortDir}}' = 'ASC' THEN RAMO_CLIENTE END ASC,
  CASE WHEN '{{sortBy}}' = 'RAMO_CLIENTE' AND '{{sortDir}}' = 'DESC' THEN RAMO_CLIENTE END DESC,
  CASE WHEN '{{sortBy}}' = 'DEPARTAMENTO' AND '{{sortDir}}' = 'ASC' THEN DEPARTAMENTO END ASC,
  CASE WHEN '{{sortBy}}' = 'DEPARTAMENTO' AND '{{sortDir}}' = 'DESC' THEN DEPARTAMENTO END DESC,
  CASE WHEN '{{sortBy}}' = 'SECAO' AND '{{sortDir}}' = 'ASC' THEN SECAO END ASC,
  CASE WHEN '{{sortBy}}' = 'SECAO' AND '{{sortDir}}' = 'DESC' THEN SECAO END DESC,
  CASE WHEN '{{sortBy}}' = 'CODPROD' AND '{{sortDir}}' = 'ASC' THEN CODPROD END ASC,
  CASE WHEN '{{sortBy}}' = 'CODPROD' AND '{{sortDir}}' = 'DESC' THEN CODPROD END DESC,
  CASE WHEN '{{sortBy}}' = 'DESCRICAO' AND '{{sortDir}}' = 'ASC' THEN DESCRICAO END ASC,
  CASE WHEN '{{sortBy}}' = 'DESCRICAO' AND '{{sortDir}}' = 'DESC' THEN DESCRICAO END DESC,
  CASE WHEN '{{sortBy}}' = 'QT_DEVOLVIDA' AND '{{sortDir}}' = 'ASC' THEN QT_DEVOLVIDA END ASC,
  CASE WHEN '{{sortBy}}' = 'QT_DEVOLVIDA' AND '{{sortDir}}' = 'DESC' THEN QT_DEVOLVIDA END DESC,
  CASE WHEN '{{sortBy}}' = 'VALOR_DEVOLVIDO' AND '{{sortDir}}' = 'ASC' THEN VALOR_DEVOLVIDO END ASC,
  CASE WHEN '{{sortBy}}' = 'VALOR_DEVOLVIDO' AND '{{sortDir}}' = 'DESC' THEN VALOR_DEVOLVIDO END DESC,
  CASE WHEN '{{sortBy}}' = 'COD_RCA' AND '{{sortDir}}' = 'ASC' THEN COD_RCA END ASC,
  CASE WHEN '{{sortBy}}' = 'COD_RCA' AND '{{sortDir}}' = 'DESC' THEN COD_RCA END DESC,
  CASE WHEN '{{sortBy}}' = 'RCA' AND '{{sortDir}}' = 'ASC' THEN RCA END ASC,
  CASE WHEN '{{sortBy}}' = 'RCA' AND '{{sortDir}}' = 'DESC' THEN RCA END DESC,
  CASE WHEN '{{sortBy}}' = 'VENDEDOR_BU' AND '{{sortDir}}' = 'ASC' THEN VENDEDOR_BU END ASC,
  CASE WHEN '{{sortBy}}' = 'VENDEDOR_BU' AND '{{sortDir}}' = 'DESC' THEN VENDEDOR_BU END DESC,
  AUTO_ID ASC
LIMIT {{limit}} OFFSET {{offset}}
`;

async function upsertServerFunction(definition) {
  const listed = await listServerFunctionsMitra({ projectId });
  const current = (listed?.result || listed || []).find((fn) => fn.name === definition.name);
  if (current?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: current.id,
      code: definition.code,
      description: definition.description,
    });
    return current.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });
  const id = created?.result?.serverFunctionId || created?.result?.id || created?.id || created?.serverFunctionId;
  if (!id) throw new Error(`Não foi possível obter o ID da SF ${definition.name}.`);
  return id;
}

async function main() {
  const resumoId = await upsertServerFunction({
    name: 'validacaoDevolucoesResumo',
    code: resumoCode,
    description: 'Resumo de devoluções TOTVS para o Painel de Validação com os mesmos filtros de faturamento.',
  });

  const detalheId = await upsertServerFunction({
    name: 'validacaoDevolucoesDetalhe',
    code: detalheCode,
    description: 'Detalhamento paginado de devoluções TOTVS para compor o faturamento no Painel de Validação.',
  });

  const smokeInput = {
    codfilial: '',
    codepto: '',
    ramoCliente: '',
    mes: '4',
    ano: '2026',
    cliente: '',
    userId: '',
    sortBy: 'DATA_DEVOLUCAO',
    sortDir: 'DESC',
    limit: '5',
    offset: '0',
  };

  const [resumoSmoke, detalheSmoke] = await Promise.all([
    executeServerFunctionMitra({ projectId, serverFunctionId: resumoId, input: smokeInput }),
    executeServerFunctionMitra({ projectId, serverFunctionId: detalheId, input: smokeInput }),
  ]);

  console.log(JSON.stringify({
    validacaoDevolucoesResumo: resumoId,
    validacaoDevolucoesDetalhe: detalheId,
    resumoStatus: resumoSmoke?.result?.executionStatus,
    detalheStatus: detalheSmoke?.result?.executionStatus,
    resumoErro: resumoSmoke?.result?.error || null,
    detalheErro: detalheSmoke?.result?.error || null,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao criar SFs de devoluções para o Painel de Validação:');
  console.error(error?.message || error);
  process.exit(1);
});
