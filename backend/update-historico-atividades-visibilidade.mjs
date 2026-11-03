import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const historicoVisitasSql = `
  SELECT
    BASE.ID,
    BASE.DATA_AGENDADA,
    BASE.HORA_INICIO,
    BASE.TIPO,
    BASE.STATUS,
    BASE.RELATO
  FROM (
    SELECT
      V.ID,
      V.DATA_AGENDADA,
      V.HORA_INICIO,
      COALESCE(V.TIPO, 'Visita') AS TIPO,
      V.STATUS,
      V.RELATO
    FROM VISITAS V
    WHERE V.CLIENTE_ID = {{clienteId}}

    UNION ALL

    SELECT
      T.ID,
      COALESCE(NULLIF(T.DATA_LIMITE, ''), SUBSTRING(T.CRIADO_EM, 1, 10)) AS DATA_AGENDADA,
      COALESCE(NULLIF(SUBSTRING(T.CRIADO_EM, 12, 5), ''), '--:--') AS HORA_INICIO,
      'Tarefa' AS TIPO,
      T.STATUS,
      COALESCE(NULLIF(T.DESCRICAO, ''), T.TITULO) AS RELATO
    FROM TAREFAS T
    WHERE T.CLIENTE_ID = {{clienteId}}
  ) BASE
  WHERE ('{{status}}' = '' OR BASE.STATUS = '{{status}}')
    AND (
      '{{periodoDias}}' = 'ALL'
      OR BASE.DATA_AGENDADA >= DATE_FORMAT(
        DATE_SUB(CURRENT_DATE, INTERVAL CAST('{{periodoDias}}' AS UNSIGNED) DAY),
        '%Y-%m-%d'
      )
    )
  ORDER BY BASE.DATA_AGENDADA DESC, BASE.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];

  const sf = existing.find((item) => item.name === 'historicoVisitasCliente');
  if (!sf) {
    throw new Error("SF 'historicoVisitasCliente' não encontrada no projeto.");
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    code: historicoVisitasSql,
    description: 'Histórico de atividades (visitas e tarefas) do cliente.',
  });

  console.log('SF historicoVisitasCliente atualizada com sucesso.');
  console.log(JSON.stringify({ historicoVisitasCliente: sf.id }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao atualizar SF historicoVisitasCliente:');
  console.error(error?.message || error);
  process.exit(1);
});
