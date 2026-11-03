import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  runDdlMitra,
  runDmlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

async function addColumnIfMissing(sql) {
  try {
    await runDdlMitra({ projectId, sql });
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
    if (!message.includes('duplicate') && !message.includes('exists')) throw error;
  }
}

const historicoVisitasCliente = `
  WITH BASE AS (
    SELECT
      V.ID,
      V.DATA_AGENDADA,
      V.HORA_INICIO,
      COALESCE(V.TIPO, 'Visita') AS TIPO,
      V.STATUS,
      V.RELATO,
      V.PLANEJAMENTO,
      V.CRIADO_EM,
      V.CHECKOUT_HORA AS DATA_CONCLUSAO,
      'VISITA' AS TIPO_REGISTRO
    FROM VISITAS V
    WHERE V.CLIENTE_ID = {{clienteId}}
      AND V.VENDEDOR_ID = :VAR_USER

    UNION ALL

    SELECT
      T.ID,
      COALESCE(NULLIF(SUBSTRING(T.CONCLUIDO_EM, 1, 10), ''), NULLIF(T.DATA_LIMITE, ''), SUBSTRING(T.CRIADO_EM, 1, 10)) AS DATA_AGENDADA,
      COALESCE(NULLIF(SUBSTRING(T.CONCLUIDO_EM, 12, 5), ''), NULLIF(SUBSTRING(T.CRIADO_EM, 12, 5), ''), '--:--') AS HORA_INICIO,
      COALESCE(NULLIF(T.TITULO, ''), 'Atividade concluída') AS TIPO,
      T.STATUS,
      COALESCE(NULLIF(T.DESCRICAO, ''), T.TITULO) AS RELATO,
      NULL AS PLANEJAMENTO,
      T.CRIADO_EM,
      COALESCE(NULLIF(T.CONCLUIDO_EM, ''), CONCAT(COALESCE(NULLIF(T.DATA_LIMITE, ''), SUBSTRING(T.CRIADO_EM, 1, 10)), 'T00:00:00')) AS DATA_CONCLUSAO,
      'TAREFA' AS TIPO_REGISTRO
    FROM TAREFAS T
    WHERE T.CLIENTE_ID = {{clienteId}}
      AND T.VENDEDOR_ID = :VAR_USER
      AND T.STATUS = 'CONCLUIDA'
      AND NOT (
        T.TITULO LIKE 'Mix enviado:%'
        AND COALESCE(T.DESCRICAO, '') LIKE '%Mix enviado diretamente pelo Mix Builder.%'
      )
  ), FILTRADO AS (
    SELECT *
    FROM BASE
    WHERE ('{{status}}' = '' OR STATUS = '{{status}}')
      AND ('{{dataInicio}}' = '' OR DATA_AGENDADA >= '{{dataInicio}}')
      AND ('{{dataFim}}' = '' OR DATA_AGENDADA <= '{{dataFim}}')
  )
  SELECT
    F.ID,
    F.DATA_AGENDADA,
    F.HORA_INICIO,
    F.TIPO,
    F.STATUS,
    F.RELATO,
    F.PLANEJAMENTO,
    F.CRIADO_EM,
    F.DATA_CONCLUSAO,
    F.TIPO_REGISTRO,
    (SELECT COUNT(*) FROM FILTRADO FV WHERE FV.TIPO_REGISTRO = 'VISITA') AS TOTAL_VISITAS_PERIODO,
    (SELECT COUNT(*) FROM FILTRADO FT WHERE FT.TIPO_REGISTRO = 'TAREFA') AS TOTAL_TAREFAS_PERIODO
  FROM FILTRADO F
  ORDER BY F.DATA_AGENDADA DESC, F.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

async function smoke(id, input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou no smoke: ${error || status}`);
}

async function main() {
  await addColumnIfMissing('ALTER TABLE PRODUCT_MIX ADD COLUMN ENVIADO_HISTORICO BOOLEAN DEFAULT FALSE');
  await addColumnIfMissing('ALTER TABLE PRODUCT_MIX ADD COLUMN DT_ENVIO_HISTORICO VARCHAR(19)');

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE PRODUCT_MIX M
      SET M.ENVIADO_HISTORICO = TRUE,
          M.DT_ENVIO_HISTORICO = COALESCE(M.DT_ENVIO_HISTORICO, (
            SELECT MAX(T.CRIADO_EM)
            FROM TAREFAS T
            WHERE T.CLIENTE_ID = M.ID_CLIENTE
              AND T.STATUS = 'CONCLUIDA'
              AND T.TITULO = CONCAT('Mix enviado: ', COALESCE(NULLIF(M.NOME, ''), CONCAT('Mix #', M.ID)))
              AND T.DESCRICAO LIKE '%Mix enviado diretamente pelo Mix Builder.%'
          ))
      WHERE EXISTS (
        SELECT 1
        FROM TAREFAS T
        WHERE T.CLIENTE_ID = M.ID_CLIENTE
          AND T.STATUS = 'CONCLUIDA'
          AND T.TITULO = CONCAT('Mix enviado: ', COALESCE(NULLIF(M.NOME, ''), CONCAT('Mix #', M.ID)))
          AND T.DESCRICAO LIKE '%Mix enviado diretamente pelo Mix Builder.%'
      )
    `,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 22,
    code: historicoVisitasCliente,
    description: 'Histórico de visitas e atividades do cliente, sem registrar envio de mix como atividade.',
  });

  await smoke(22, { clienteId: '1', status: '', dataInicio: '', dataFim: '', limit: '5', offset: '0' });

  console.log('Envio de mix ajustado para aparecer somente como Mix no histórico.');
}

main().catch((error) => {
  console.error('Falha ao ajustar envio de mix no histórico:');
  console.error(error?.message || error);
  process.exit(1);
});
