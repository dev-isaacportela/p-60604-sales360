import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function visibleOwnerPredicate(ownerUserExpr, viewerUserExpr = ':VAR_USER') {
  return `(
    ${ownerUserExpr} = ${viewerUserExpr}
    OR EXISTS (
      SELECT 1
      FROM FUNCIONARIOS FS
      WHERE FS.ID = ${ownerUserExpr}
        AND FS.ID_SUBSTITUTO = ${viewerUserExpr}
    )
    OR EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_DONO
      JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
      JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
      WHERE VR_DONO.USER_ID = ${ownerUserExpr}
        AND VR_SUB.USER_ID = ${viewerUserExpr}
        AND COALESCE(FV.ATIVO, TRUE) = TRUE
        AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
    )
  )`;
}

const VISITAS_POR_STATUS_SEMANA_SQL = `
  SELECT V.STATUS AS name, COUNT(*) AS value
  FROM VISITAS V
  WHERE SUBSTRING(V.DATA_AGENDADA, 1, 10) BETWEEN
    DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), '%Y-%m-%d')
    AND DATE_FORMAT(DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), INTERVAL 6 DAY), '%Y-%m-%d')
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  GROUP BY V.STATUS
  ORDER BY value DESC
`;

const VISITAS_DO_DIA_SQL = `
  SELECT
    V.ID,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    V.HORA_FIM,
    V.TIPO,
    V.STATUS,
    V.CHECKIN_HORA,
    V.CHECKOUT_HORA,
    V.RELATO,
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.ENDERECO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA = '{{data}}'
    AND ${visibleOwnerPredicate('V.VENDEDOR_ID')}
  ORDER BY V.HORA_INICIO
`;

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
  const functions = await listServerFunctionsMitra({ projectId });
  const list = Array.isArray(functions?.result) ? functions.result : functions;
  const visitasPorStatus = list.find((fn) => fn.name === 'visitasPorStatus');
  const visitasDoDia = list.find((fn) => fn.name === 'visitasDoDia');
  if (!visitasPorStatus) throw new Error('Server Function visitasPorStatus nao encontrada.');
  if (!visitasDoDia) throw new Error('Server Function visitasDoDia nao encontrada.');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: visitasPorStatus.id,
    code: VISITAS_POR_STATUS_SEMANA_SQL,
    description: 'Distribuicao de visitas por status na semana atual filtrada pelo usuario logado.',
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: visitasDoDia.id,
    code: VISITAS_DO_DIA_SQL,
    description: 'Lista visitas do dia filtradas pelo usuario logado.',
  });

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: visitasPorStatus.id,
    input: {},
  });
  const hoje = new Date().toISOString().slice(0, 10);
  const smokeHoje = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: visitasDoDia.id,
    input: { data: hoje },
  });
  const status = String(smoke?.result?.executionStatus || '');
  const error = String(smoke?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || status);

  const statusHoje = String(smokeHoje?.result?.executionStatus || '');
  const errorHoje = String(smokeHoje?.result?.error || '').trim();
  if ((statusHoje && statusHoje !== 'COMPLETED') || errorHoje) throw new Error(errorHoje || statusHoje);

  console.log(`visitasPorStatus atualizada (${extractRows(smoke).length} linha(s) no smoke).`);
  console.log(`visitasDoDia atualizada (${extractRows(smokeHoje).length} linha(s) no smoke).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
