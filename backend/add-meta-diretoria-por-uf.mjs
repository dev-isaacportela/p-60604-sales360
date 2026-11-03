/**
 * Meta que o coordenador recebe da diretoria passa a vir do planejamento
 * estrategico por UF, e nao mais do rateio linear da meta total da BU.
 *
 * Antes: META_INTEGRADA (soma de TODAS as UFs da BU) / numero de escopos do
 * proprio coordenador. Um coordenador com 1 filial recebia a meta inteira da
 * BU no Brasil; um com 4 filiais recebia 1/4 em cada uma, sem relacao com a UF.
 *
 * Agora: cada filial tem UF (coluna FILIAL.UF) e recebe a meta de
 * INTG_MONTHLY_BILLING_TARGET da sua BU + sua UF. Quando mais de uma filial da
 * mesma BU esta na mesma UF, a meta da UF e rateada entre elas pelo
 * faturamento dos ultimos 12 meses (empate/sem historico: divisao igual).
 * Metas de UF sem filial correspondente (ex.: MEDICAMENTO / Outros Estados)
 * sao rateadas entre as filiais da BU pelo mesmo criterio, para que a soma das
 * metas dos coordenadores continue igual a meta do planejamento por BU.
 *
 * Meta lancada manualmente pela diretoria em METAS_BU continua tendo
 * precedencia sobre o calculo.
 */
import 'dotenv/config';
import { configureSdkMitra, runDdlMitra, runDmlMitra, updateServerFunctionMitra } from 'mitra-sdk';

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
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({ baseURL, token: process.env.MITRA_TOKEN, integrationURL });

const projectId = Number(process.env.MITRA_PROJECT_ID);
const SF_METAS_BU_RECEBIDAS = 195;

/**
 * UF de cada filial. Derivado da UF predominante dos clientes faturados por
 * filial em todo o historico de IMP_VENDAS_DASHBOARD_TOTVS_RCA:
 *   1 DF 77% | 2 GO 95% | 3 DF 55% | 4 GO 95% | 5 GO 45% | 6 TO 88% | 7 DF 100% | 8 RS 94%
 * A diretoria pode corrigir qualquer linha direto na coluna FILIAL.UF — o
 * calculo da meta le sempre a tabela, nunca uma lista fixa no codigo.
 */
const UF_POR_FILIAL = {
  1: 'DF',
  2: 'GO',
  3: 'DF',
  4: 'GO',
  5: 'GO',
  6: 'TO',
  7: 'DF',
  8: 'RS',
};

const SQL_METAS_BU_RECEBIDAS = `WITH

PARAMS AS (
  SELECT
    CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) ELSE MONTH(CURRENT_DATE) END AS MES_REF,
    CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE YEAR(CURRENT_DATE) END AS ANO_REF,
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER', 'GLOBAL') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR,
    CASE WHEN (
      SELECT COUNT(*)
      FROM INT_USER U
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
        AND (COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN') OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com')
    ) > 0 THEN 1 ELSE 0 END AS IS_DIRETORIA
),
PERIODO AS (
  SELECT
    P.MES_REF,
    P.ANO_REF,
    DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS DATA_INICIO,
    DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m-%d') AS DATA_FIM,
    DATE_FORMAT(DATE_SUB(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), INTERVAL 12 MONTH), '%Y-%m') AS PESO_MES_INICIO,
    DATE_FORMAT(STR_TO_DATE(CONCAT(P.ANO_REF, '-', LPAD(P.MES_REF, 2, '0'), '-01'), '%Y-%m-%d'), '%Y-%m') AS PESO_MES_FIM
  FROM PARAMS P
),
COORD AS (
  SELECT
    C.COD_SUPERVISOR,
    C.NOME,
    C.EMAIL,
    C.USER_ID
  FROM COORDENADORES C
  JOIN PARAMS P ON 1 = 1
  WHERE COALESCE(C.ATIVO, TRUE) = TRUE
    AND (
      (P.SCOPE_MODE = 'GLOBAL' AND P.IS_DIRETORIA = 1 AND (P.SCOPE_COD_SUPERVISOR IS NULL OR C.COD_SUPERVISOR = P.SCOPE_COD_SUPERVISOR))
      OR (P.SCOPE_MODE = 'GLOBAL' AND P.IS_DIRETORIA = 0 AND C.USER_ID = :VAR_USER)
      OR (P.SCOPE_MODE <> 'GLOBAL' AND C.USER_ID = :VAR_USER)
    )
),
-- Escopo do coordenador que esta olhando a tela: define quais linhas aparecem.
ESCOPO_BU AS (
  -- Sem COD_SUPERVISOR no DISTINCT: BU com mais de um coordenador vinha
  -- duplicada e dobrava a meta da diretoria no escopo global.
  SELECT DISTINCT
    CB.CODFILIAL,
    CB.CODEPTO,
    CASE
      WHEN CAST(CB.CODEPTO AS CHAR) = '1' THEN 'NUTRICAO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '2' THEN 'ENFERMAGEM'
      WHEN CAST(CB.CODEPTO AS CHAR) = '8' THEN 'MEDICAMENTO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '9' THEN 'ESTETICA_E_INJETAVEIS'
      ELSE CAST(CB.CODEPTO AS CHAR)
    END AS BU_CODE
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
ESCOPO_BU_EMPRESA AS (
  -- Universo da empresa inteira, nao so o escopo de quem abriu a tela: se o
  -- denominador do rateio dependesse de quem esta olhando, a meta da mesma
  -- filial mudaria de coordenador para coordenador.
  SELECT DISTINCT
    CB.CODFILIAL,
    CB.CODEPTO,
    CASE
      WHEN CAST(CB.CODEPTO AS CHAR) = '1' THEN 'NUTRICAO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '2' THEN 'ENFERMAGEM'
      WHEN CAST(CB.CODEPTO AS CHAR) = '8' THEN 'MEDICAMENTO'
      WHEN CAST(CB.CODEPTO AS CHAR) = '9' THEN 'ESTETICA_E_INJETAVEIS'
      ELSE CAST(CB.CODEPTO AS CHAR)
    END AS BU_CODE
  FROM COORDENADORES_BU CB
  JOIN COORDENADORES C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
  WHERE COALESCE(C.ATIVO, TRUE) = TRUE
),
FILIAL_UF AS (
  SELECT
    CAST(TRIM(CAST(F.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    UPPER(TRIM(COALESCE(NULLIF(TRIM(F.UF), ''), 'NAO_INFORMADO'))) AS UF
  FROM FILIAL F
  WHERE TRIM(COALESCE(CAST(F.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
),
BU_DESC AS (
  SELECT
    CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    V.CODEPTO,
    MAX(COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO))) AS DEPARTAMENTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND V.CODEPTO IS NOT NULL
  GROUP BY CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED), V.CODEPTO
),
-- Planejamento estrategico: meta do mes por BU e UF.
META_BU_UF AS (
  SELECT
    BU.CODE AS BU_CODE,
    R.CODE AS UF,
    ROUND(SUM(COALESCE(T.TARGET_VALUE, 0)), 2) AS META_UF
  FROM INTG_MONTHLY_BILLING_TARGET T
  JOIN INTG_BUSINESS_UNIT BU ON BU.SOURCE_BUSINESS_UNIT_ID = T.SOURCE_BUSINESS_UNIT_ID
  JOIN INTG_REGION R ON R.SOURCE_REGION_ID = T.SOURCE_REGION_ID
  JOIN PERIODO P ON P.ANO_REF = T.YEAR_REF AND P.MES_REF = T.MONTH_REF
  WHERE T.ACTIVE = TRUE
  GROUP BY BU.CODE, R.CODE
),
-- Peso do rateio: faturamento dos 12 meses anteriores ao mes da meta.
PESO_BASE AS (
  SELECT
    CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED) AS CODFILIAL,
    V.CODEPTO,
    ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN PERIODO P ON 1 = 1
  WHERE TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), '')) REGEXP '^[0-9]+$'
    AND V.CODEPTO IS NOT NULL
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 7) >= P.PESO_MES_INICIO
    AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 7) < P.PESO_MES_FIM
  GROUP BY CAST(TRIM(CAST(V.CODFILIAL AS CHAR)) AS UNSIGNED), V.CODEPTO
),
ESCOPO_PESO AS (
  SELECT
    E.CODFILIAL,
    E.CODEPTO,
    E.BU_CODE,
    COALESCE(FU.UF, 'NAO_INFORMADO') AS UF,
    COALESCE(PB.FATURAMENTO, 0) AS FATURAMENTO
  FROM ESCOPO_BU_EMPRESA E
  LEFT JOIN FILIAL_UF FU ON FU.CODFILIAL = E.CODFILIAL
  LEFT JOIN PESO_BASE PB ON PB.CODFILIAL = E.CODFILIAL AND PB.CODEPTO = E.CODEPTO
),
TOTAL_UF AS (
  SELECT BU_CODE, UF, SUM(FATURAMENTO) AS FATURAMENTO_UF, COUNT(*) AS FILIAIS_UF
  FROM ESCOPO_PESO
  GROUP BY BU_CODE, UF
),
TOTAL_BU AS (
  SELECT BU_CODE, SUM(FATURAMENTO) AS FATURAMENTO_BU, COUNT(*) AS FILIAIS_BU
  FROM ESCOPO_PESO
  GROUP BY BU_CODE
),
RESIDUO_BU AS (
  -- Meta de UF sem filial correspondente (ex.: Outros Estados). Sem redistribuir
  -- esse resto, a soma das metas dos coordenadores ficaria menor que o
  -- planejamento da BU.
  SELECT MU.BU_CODE, ROUND(SUM(MU.META_UF), 2) AS META_RESIDUO
  FROM META_BU_UF MU
  WHERE NOT EXISTS (
    SELECT 1 FROM TOTAL_UF TU WHERE TU.BU_CODE = MU.BU_CODE AND TU.UF = MU.UF
  )
  GROUP BY MU.BU_CODE
),
META_FILIAL AS (
  SELECT
    EP.CODFILIAL,
    EP.CODEPTO,
    EP.BU_CODE,
    EP.UF,
    COALESCE(MU.META_UF, 0) AS META_UF,
    CASE
      WHEN COALESCE(MU.META_UF, 0) = 0 THEN 0
      WHEN COALESCE(TU.FATURAMENTO_UF, 0) > 0 THEN ROUND(MU.META_UF * (EP.FATURAMENTO / TU.FATURAMENTO_UF), 2)
      ELSE ROUND(MU.META_UF / NULLIF(TU.FILIAIS_UF, 0), 2)
    END AS META_UF_FILIAL,
    CASE
      WHEN COALESCE(RB.META_RESIDUO, 0) = 0 THEN 0
      WHEN COALESCE(TB.FATURAMENTO_BU, 0) > 0 THEN ROUND(RB.META_RESIDUO * (EP.FATURAMENTO / TB.FATURAMENTO_BU), 2)
      ELSE ROUND(RB.META_RESIDUO / NULLIF(TB.FILIAIS_BU, 0), 2)
    END AS META_OUTRAS_UF
  FROM ESCOPO_PESO EP
  LEFT JOIN TOTAL_UF TU ON TU.BU_CODE = EP.BU_CODE AND TU.UF = EP.UF
  LEFT JOIN TOTAL_BU TB ON TB.BU_CODE = EP.BU_CODE
  LEFT JOIN META_BU_UF MU ON MU.BU_CODE = EP.BU_CODE AND MU.UF = EP.UF
  LEFT JOIN RESIDUO_BU RB ON RB.BU_CODE = EP.BU_CODE
),
METAS_RECEBIDAS AS (
  SELECT
    E.CODFILIAL,
    E.CODEPTO,
    COALESCE(BD.DEPARTAMENTO, CONCAT('Departamento ', E.CODEPTO)) AS DEPARTAMENTO,
    COALESCE(MF.UF, 'NAO_INFORMADO') AS UF,
    P.MES_REF AS MES,
    P.ANO_REF AS ANO,
    COALESCE(MF.META_UF, 0) AS META_UF_TOTAL,
    COALESCE(MF.META_UF_FILIAL, 0) AS META_UF_FILIAL,
    COALESCE(MF.META_OUTRAS_UF, 0) AS META_OUTRAS_UF,
    COALESCE(
      NULLIF(M.META_VALOR, 0),
      ROUND(COALESCE(MF.META_UF_FILIAL, 0) + COALESCE(MF.META_OUTRAS_UF, 0), 2),
      0
    ) AS META_DIRETORIA,
    CASE WHEN NULLIF(M.META_VALOR, 0) IS NOT NULL THEN 'MANUAL' ELSE 'PLANEJAMENTO_UF' END AS ORIGEM_META
  FROM ESCOPO_BU E
  JOIN PERIODO P ON 1 = 1
  LEFT JOIN BU_DESC BD ON BD.CODFILIAL = E.CODFILIAL AND BD.CODEPTO = E.CODEPTO
  LEFT JOIN METAS_BU M ON M.CODFILIAL = E.CODFILIAL AND M.CODEPTO = E.CODEPTO AND M.MES = P.MES_REF AND M.ANO = P.ANO_REF
  LEFT JOIN META_FILIAL MF ON MF.CODFILIAL = E.CODFILIAL AND MF.CODEPTO = E.CODEPTO
),
DISTRIBUIDO AS (
  SELECT
    MBV.CODFILIAL,
    MBV.CODEPTO,
    ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS META_DISTRIBUIDA,
    COUNT(DISTINCT MBV.VENDEDOR_ID) AS VENDEDORES_COM_META
  FROM METAS_BU_VENDEDOR MBV
  JOIN PERIODO P ON P.MES_REF = MBV.MES AND P.ANO_REF = MBV.ANO
  GROUP BY MBV.CODFILIAL, MBV.CODEPTO
),
VENDEDORES_BU AS (
  SELECT
    E.CODFILIAL,
    E.CODEPTO,
    COUNT(DISTINCT BV.VENDEDOR_ID) AS TOTAL_VENDEDORES
  FROM ESCOPO_BU E
  LEFT JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
   AND COALESCE(BV.ATIVO, TRUE) = TRUE
  GROUP BY E.CODFILIAL, E.CODEPTO
)
SELECT
  MR.CODFILIAL,
  MR.CODEPTO,
  MR.DEPARTAMENTO,
  MR.UF,
  MR.MES,
  MR.ANO,
  MR.META_DIRETORIA,
  MR.META_UF_TOTAL,
  MR.META_UF_FILIAL,
  MR.META_OUTRAS_UF,
  MR.ORIGEM_META,
  COALESCE(D.META_DISTRIBUIDA, 0) AS META_DISTRIBUIDA,
  ROUND(MR.META_DIRETORIA - COALESCE(D.META_DISTRIBUIDA, 0), 2) AS SALDO_DISTRIBUIR,
  CASE WHEN MR.META_DIRETORIA <= 0 THEN 0 ELSE ROUND((COALESCE(D.META_DISTRIBUIDA, 0) / MR.META_DIRETORIA) * 100, 2) END AS PERCENTUAL_DISTRIBUIDO,
  COALESCE(VB.TOTAL_VENDEDORES, 0) AS TOTAL_VENDEDORES,
  COALESCE(D.VENDEDORES_COM_META, 0) AS VENDEDORES_COM_META
FROM METAS_RECEBIDAS MR
LEFT JOIN DISTRIBUIDO D ON D.CODFILIAL = MR.CODFILIAL AND D.CODEPTO = MR.CODEPTO
LEFT JOIN VENDEDORES_BU VB ON VB.CODFILIAL = MR.CODFILIAL AND VB.CODEPTO = MR.CODEPTO
ORDER BY MR.CODFILIAL, MR.CODEPTO`;

async function main() {
  console.log('1/3 - coluna FILIAL.UF');
  try {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE FILIAL ADD COLUMN UF VARCHAR(20) NULL',
    });
    console.log('    coluna UF criada');
  } catch (error) {
    const msg = JSON.stringify(error?.message ?? error?.response?.data ?? error) || String(error);
    if (/duplicate column|already exists/i.test(msg)) console.log('    coluna UF ja existia');
    else throw error;
  }

  console.log('2/3 - UF das filiais');
  const cases = Object.entries(UF_POR_FILIAL)
    .map(([cod, uf]) => `WHEN '${cod}' THEN '${uf}'`)
    .join(' ');
  const codigos = Object.keys(UF_POR_FILIAL).map((cod) => `'${cod}'`).join(', ');
  const dml = await runDmlMitra({
    projectId,
    generateMigration: true,
    sql: `UPDATE FILIAL
          SET UF = CASE TRIM(CAST(CODFILIAL AS CHAR)) ${cases} ELSE UF END,
              ATUALIZADO_EM = DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s')
          WHERE TRIM(CAST(CODFILIAL AS CHAR)) IN (${codigos})
            AND COALESCE(NULLIF(TRIM(UF), ''), '') = ''`,
  });
  const dmlResult = dml?.result ?? dml;
  console.log('    migration:', dmlResult?.migration ?? '(nao gerada)', '| motivo:', dmlResult?.migrationSkippedReason ?? '-');

  console.log('3/3 - SF 195 painelCoordenadorMetasBuRecebidas');
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: SF_METAS_BU_RECEBIDAS,
    code: SQL_METAS_BU_RECEBIDAS,
    description: 'Meta que o coordenador recebe da diretoria, vinda do planejamento estrategico por BU + UF da filial (METAS_BU manual tem precedencia)',
  });
  console.log('    SF atualizada');
  console.log('OK');
}

main().catch((error) => {
  console.error('FALHOU:', error?.message || error);
  process.exitCode = 1;
});
