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
const analyticsRcaVisitasId = 187;

function replaceOnce(code, search, replacement, label) {
  if (!code.includes(search)) throw new Error(`Trecho nao encontrado: ${label}`);
  return code.replace(search, replacement);
}

function ensureProspectVisits(code) {
  if (code.includes('PROSPECT_VISITAS_PERIODO AS')) return code;

  let next = code;

  next = replaceOnce(
    next,
    `VISITAS_TIPO_BASE AS (
  SELECT 'Aumento de mix' AS TIPO_VISITA
  UNION ALL SELECT 'Padronização de produto'
  UNION ALL SELECT 'Positivação'
  UNION ALL SELECT 'Renegociação'
  UNION ALL SELECT 'Manutenção'
),`,
    `PROSPECT_VISITAS_PERIODO AS (
  SELECT COUNT(*) AS QTD_VISITAS
  FROM PROSPECT_VISITAS PV
  JOIN TARGET_USERS TU ON TU.USER_ID = PV.EXECUTIVO_ID
  JOIN PERIODO P ON 1 = 1
  WHERE PV.DATA_VISITA >= DATE_FORMAT(P.DT_INICIO, '%Y-%m-%d')
    AND PV.DATA_VISITA <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')
    AND UPPER(COALESCE(PV.STATUS, '')) = 'CONCLUIDA'
),
VISITAS_TIPO_BASE AS (
  SELECT 'Aumento de mix' AS TIPO_VISITA
  UNION ALL SELECT 'Padronização de produto'
  UNION ALL SELECT 'Positivação'
  UNION ALL SELECT 'Renegociação'
  UNION ALL SELECT 'Manutenção'
  UNION ALL SELECT 'Prospecção'
),`,
    'insercao de PROSPECT_VISITAS_PERIODO e tipo Prospecção',
  );

  next = replaceOnce(
    next,
    `VISITAS_TIPO_REAL AS (
  SELECT
    CASE
      WHEN TRIM(COALESCE(V.TIPO, '')) IN ('Aumento de mix', 'Padronização de produto', 'Positivação', 'Renegociação', 'Manutenção') THEN TRIM(V.TIPO)
      ELSE 'Outros'
    END AS TIPO_VISITA,
    COUNT(*) AS QTD_TIPO
  FROM VISITAS V
  JOIN TARGET_USERS TU ON TU.USER_ID = V.VENDEDOR_ID
  JOIN PERIODO P ON 1 = 1
  WHERE V.DATA_AGENDADA >= DATE_FORMAT(P.DT_INICIO, '%Y-%m-%d')
    AND V.DATA_AGENDADA <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')
    AND UPPER(COALESCE(V.STATUS, '')) = 'CONCLUIDA'
  GROUP BY
    CASE
      WHEN TRIM(COALESCE(V.TIPO, '')) IN ('Aumento de mix', 'Padronização de produto', 'Positivação', 'Renegociação', 'Manutenção') THEN TRIM(V.TIPO)
      ELSE 'Outros'
    END
),`,
    `VISITAS_TIPO_REAL AS (
  SELECT TIPO_VISITA, SUM(QTD_TIPO) AS QTD_TIPO
  FROM (
    SELECT
      CASE
        WHEN TRIM(COALESCE(V.TIPO, '')) IN ('Aumento de mix', 'Padronização de produto', 'Positivação', 'Renegociação', 'Manutenção') THEN TRIM(V.TIPO)
        ELSE 'Outros'
      END AS TIPO_VISITA,
      COUNT(*) AS QTD_TIPO
    FROM VISITAS V
    JOIN TARGET_USERS TU ON TU.USER_ID = V.VENDEDOR_ID
    JOIN PERIODO P ON 1 = 1
    WHERE V.DATA_AGENDADA >= DATE_FORMAT(P.DT_INICIO, '%Y-%m-%d')
      AND V.DATA_AGENDADA <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')
      AND UPPER(COALESCE(V.STATUS, '')) = 'CONCLUIDA'
    GROUP BY
      CASE
        WHEN TRIM(COALESCE(V.TIPO, '')) IN ('Aumento de mix', 'Padronização de produto', 'Positivação', 'Renegociação', 'Manutenção') THEN TRIM(V.TIPO)
        ELSE 'Outros'
      END

    UNION ALL

    SELECT 'Prospecção' AS TIPO_VISITA, COUNT(*) AS QTD_TIPO
    FROM PROSPECT_VISITAS PV
    JOIN TARGET_USERS TU ON TU.USER_ID = PV.EXECUTIVO_ID
    JOIN PERIODO P ON 1 = 1
    WHERE PV.DATA_VISITA >= DATE_FORMAT(P.DT_INICIO, '%Y-%m-%d')
      AND PV.DATA_VISITA <= DATE_FORMAT(P.DT_FIM, '%Y-%m-%d')
      AND UPPER(COALESCE(PV.STATUS, '')) = 'CONCLUIDA'
  ) T
  GROUP BY TIPO_VISITA
),`,
    'VISITAS_TIPO_REAL com prospeccao',
  );

  next = replaceOnce(
    next,
    `RESUMO AS (
  SELECT
    COALESCE(SUM(VP.QTD_VISITAS), 0) AS TOTAL_VISITAS,
    ROUND(COALESCE(SUM(VP.QTD_VISITAS), 0) / GREATEST((SELECT DIAS_PERIODO FROM PERIODO) / 7, 1), 2) AS MEDIA_SEMANAL
  FROM CARTEIRA_FILTRADA C
  LEFT JOIN VISITAS_PERIODO VP ON VP.CLIENTE_ID = C.CLIENTE_ID
),`,
    `RESUMO AS (
  SELECT
    COALESCE(SUM(VP.QTD_VISITAS), 0) + COALESCE((SELECT QTD_VISITAS FROM PROSPECT_VISITAS_PERIODO), 0) AS TOTAL_VISITAS,
    ROUND((COALESCE(SUM(VP.QTD_VISITAS), 0) + COALESCE((SELECT QTD_VISITAS FROM PROSPECT_VISITAS_PERIODO), 0)) / GREATEST((SELECT DIAS_PERIODO FROM PERIODO) / 7, 1), 2) AS MEDIA_SEMANAL
  FROM CARTEIRA_FILTRADA C
  LEFT JOIN VISITAS_PERIODO VP ON VP.CLIENTE_ID = C.CLIENTE_ID
),`,
    'RESUMO somando prospeccao',
  );

  return next;
}

async function main() {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: analyticsRcaVisitasId });
  const code = current?.result?.code || '';
  const nextCode = ensureProspectVisits(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: analyticsRcaVisitasId,
      code: nextCode,
      description: 'Frequencia de visitas por carteira com visitas de prospeccao no resumo e tipos.',
    });
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: analyticsRcaVisitasId,
    input: {
      dataInicio: '2026-06-08',
      dataFim: '2026-06-12',
      filiais: '',
      departamentos: '',
      secoes: '',
      ramos: '',
      limit: '20',
      offset: '0',
      scopeMode: 'ME',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
    },
  });

  const output = smoke?.result?.output;
  const rows = typeof output === 'string' ? JSON.parse(output).rows : output?.rows;
  const prospeccao = (rows || []).find((row) => row.TIPO === 'TIPO_VISITA' && row.TIPO_VISITA === 'Prospecção');
  console.log(JSON.stringify({ changed: nextCode !== code, rows: rows?.length || 0, prospeccao }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar analytics de visitas com prospeccao:');
  console.error(error?.message || error);
  process.exit(1);
});
