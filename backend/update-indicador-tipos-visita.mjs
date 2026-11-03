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

const tiposVisitaCte = `VISITAS_TIPO_BASE AS (
  SELECT 'Aumento de mix' AS TIPO_VISITA
  UNION ALL SELECT 'Padronização de produto'
  UNION ALL SELECT 'Positivação'
  UNION ALL SELECT 'Renegociação'
  UNION ALL SELECT 'Manutenção'
),
VISITAS_TIPO_REAL AS (
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
),
VISITAS_TIPO AS (
  SELECT
    B.TIPO_VISITA,
    COALESCE(R.QTD_TIPO, 0) AS QTD_TIPO,
    ROUND(CASE WHEN SUM(COALESCE(R.QTD_TIPO, 0)) OVER() = 0 THEN 0 ELSE (COALESCE(R.QTD_TIPO, 0) / SUM(COALESCE(R.QTD_TIPO, 0)) OVER()) * 100 END, 2) AS PERC_TIPO
  FROM (
    SELECT TIPO_VISITA FROM VISITAS_TIPO_BASE
    UNION ALL
    SELECT 'Outros' FROM VISITAS_TIPO_REAL WHERE TIPO_VISITA = 'Outros'
  ) B
  LEFT JOIN VISITAS_TIPO_REAL R ON R.TIPO_VISITA = B.TIPO_VISITA
)`;

function updateCode(code) {
  if (code.includes('VISITAS_TIPO_BASE AS')) return code;

  const insertBefore = 'VISITAS_HIST AS (';
  const insertIndex = code.indexOf(insertBefore);
  if (insertIndex === -1) throw new Error('Ponto de inserção VISITAS_HIST não encontrado.');

  const withTipos = `${code.slice(0, insertIndex)}${tiposVisitaCte},\n${code.slice(insertIndex)}`;

  const oldFinal = `SELECT 'RESUMO' AS TIPO, NULL AS CODCLI, NULL AS CLIENTE, NULL AS RAMO, NULL AS ULTIMA_VISITA, NULL AS DIAS_DESDE_ULTIMA_VISITA, NULL AS QTD_VISITAS_PERIODO, TOTAL_VISITAS, MEDIA_SEMANAL, NULL AS TOTAL_REGISTROS
FROM RESUMO
UNION ALL
SELECT 'CLIENTE' AS TIPO, CODCLI, CLIENTE, RAMO, ULTIMA_VISITA, DIAS_DESDE_ULTIMA_VISITA, QTD_VISITAS_PERIODO, NULL AS TOTAL_VISITAS, NULL AS MEDIA_SEMANAL, TOTAL_REGISTROS
FROM CLIENTES`;

  const newFinal = `SELECT 'RESUMO' AS TIPO, NULL AS CODCLI, NULL AS CLIENTE, NULL AS RAMO, NULL AS ULTIMA_VISITA, NULL AS DIAS_DESDE_ULTIMA_VISITA, NULL AS QTD_VISITAS_PERIODO, TOTAL_VISITAS, MEDIA_SEMANAL, NULL AS TOTAL_REGISTROS, NULL AS TIPO_VISITA, NULL AS QTD_TIPO, NULL AS PERC_TIPO
FROM RESUMO
UNION ALL
SELECT 'TIPO_VISITA' AS TIPO, NULL AS CODCLI, NULL AS CLIENTE, NULL AS RAMO, NULL AS ULTIMA_VISITA, NULL AS DIAS_DESDE_ULTIMA_VISITA, NULL AS QTD_VISITAS_PERIODO, NULL AS TOTAL_VISITAS, NULL AS MEDIA_SEMANAL, NULL AS TOTAL_REGISTROS, TIPO_VISITA, QTD_TIPO, PERC_TIPO
FROM VISITAS_TIPO
UNION ALL
SELECT 'CLIENTE' AS TIPO, CODCLI, CLIENTE, RAMO, ULTIMA_VISITA, DIAS_DESDE_ULTIMA_VISITA, QTD_VISITAS_PERIODO, NULL AS TOTAL_VISITAS, NULL AS MEDIA_SEMANAL, TOTAL_REGISTROS, NULL AS TIPO_VISITA, NULL AS QTD_TIPO, NULL AS PERC_TIPO
FROM CLIENTES`;

  if (!withTipos.includes(oldFinal)) throw new Error('Bloco final da consulta de visitas não encontrado.');
  return withTipos.replace(oldFinal, newFinal);
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
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: analyticsRcaVisitasId });
  const code = current?.result?.code || '';
  const nextCode = updateCode(code);

  if (nextCode !== code) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: analyticsRcaVisitasId,
      code: nextCode,
      description: current?.result?.description || 'Frequência de visitas por carteira e tipo de visita.',
    });
  }

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: analyticsRcaVisitasId,
    input: { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', dataInicio: '2026-01-01', dataFim: '2026-01-31', departamentos: '', ramos: '', limit: '5', offset: '0' },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  const rows = extractRows(smoke);
  const tipos = rows.filter((row) => row.TIPO === 'TIPO_VISITA');
  console.log(`SF ${analyticsRcaVisitasId}: indicador por tipo OK (${tipos.length} tipo(s), ${rows.length} linha(s) no smoke).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar indicador de tipos de visita:');
  console.error(error?.message || error);
  process.exit(1);
});
