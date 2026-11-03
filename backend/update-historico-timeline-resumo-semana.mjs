import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  listTablesMitra,
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

const HISTORICO_TIMELINE_SQL = `
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
      AND T.STATUS = 'CONCLUIDA'
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

const TAREFAS_ATUALIZAR_STATUS_SQL = `
UPDATE TAREFAS T
SET
  T.STATUS = '{{novoStatus}}',
  T.CONCLUIDO_EM = CASE
    WHEN '{{novoStatus}}' = 'CONCLUIDA' THEN SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHEN T.STATUS = 'CONCLUIDA' AND '{{novoStatus}}' <> 'CONCLUIDA' THEN NULL
    ELSE T.CONCLUIDO_EM
  END
WHERE T.ID = {{tarefaId}}
  AND (
    EXISTS (
      SELECT 1
      FROM USUARIO_CARGO UC
      WHERE UC.USER_ID = :VAR_USER
        AND UC.CARGO IN ('GESTOR', 'ADMIN')
    )
    OR T.VENDEDOR_ID = :VAR_USER
  )
LIMIT 1
`;

const DASHBOARD_VISITAS_SEMANA_SQL = `
  SELECT
    V.ID,
    V.DATA_AGENDADA AS DATA_VISITA,
    CASE
      WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NULL THEN ''
      ELSE CASE
        WHEN COALESCE(V.CHECKOUT_HORA, '') REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN SUBSTRING(V.CHECKOUT_HORA, 1, 10)
        ELSE V.DATA_AGENDADA
      END
    END AS DATA_RELATO,
    COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CONCAT('Cliente ', V.CLIENTE_ID)) AS CLIENTE,
    V.STATUS AS STATUS_VISITA,
    CASE
      WHEN COALESCE(V.STATUS, '') = 'CANCELADA' THEN 'CANCELADA'
      WHEN COALESCE(V.STATUS, '') = 'CONCLUIDA' THEN 'CONCLUIDA'
      WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NOT NULL THEN 'REAGENDADA'
      ELSE V.STATUS
    END AS SITUACAO_VISITA,
    COALESCE(NULLIF(F.NOME, ''), NULLIF(U.DESCR, ''), CONCAT('Responsável ', V.VENDEDOR_ID)) AS RESPONSAVEL_VISITA,
    V.RELATO,
    CASE
      WHEN NULLIF(TRIM(COALESCE(V.RELATO, '')), '') IS NULL THEN 'RELATO_PENDENTE'
      ELSE 'OK'
    END AS STATUS_RELATO
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = V.VENDEDOR_ID
  LEFT JOIN INT_USER U ON U.ID = V.VENDEDOR_ID
  WHERE V.VENDEDOR_ID = :VAR_USER
    AND V.DATA_AGENDADA >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), '%Y-%m-%d')
    AND V.DATA_AGENDADA <= DATE_FORMAT(DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), INTERVAL 6 DAY), '%Y-%m-%d')
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT 12
`;

async function ensureTarefasConcluidoEm() {
  const tables = normalizeArray(await listTablesMitra({ projectId }));
  const tarefas = tables.find((table) => table.name === 'TAREFAS');
  const exists = tarefas?.columns?.some((column) => column.name === 'CONCLUIDO_EM');
  if (!exists) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE TAREFAS ADD COLUMN CONCLUIDO_EM VARCHAR(19)' });
    console.log('Coluna TAREFAS.CONCLUIDO_EM criada.');
  } else {
    console.log('Coluna TAREFAS.CONCLUIDO_EM ja existe.');
  }

  await runDmlMitra({
    projectId,
    sql: `UPDATE TAREFAS
      SET CONCLUIDO_EM = COALESCE(NULLIF(CONCLUIDO_EM, ''), CONCAT(COALESCE(NULLIF(DATA_LIMITE, ''), SUBSTRING(CRIADO_EM, 1, 10)), 'T00:00:00'))
      WHERE STATUS = 'CONCLUIDA'
        AND (CONCLUIDO_EM IS NULL OR CONCLUIDO_EM = '')`,
  });
  console.log('Datas de conclusao historicas preenchidas quando ausentes.');
}

async function upsertServerFunction(name, payload) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const existing = listed.find((sf) => sf.name === name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      ...payload,
    });
    console.log(`SF atualizada: ${name} (${existing.id})`);
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name,
    type: 'SQL',
    ...payload,
  });
  const id = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
  if (!id) throw new Error(`Nao foi possivel obter ID da SF ${name}`);
  console.log(`SF criada: ${name} (${id})`);
  return id;
}

async function main() {
  await ensureTarefasConcluidoEm();

  const ids = {};
  ids.historicoVisitasCliente = await upsertServerFunction('historicoVisitasCliente', {
    code: HISTORICO_TIMELINE_SQL,
    description: 'Linha do tempo do cliente com visitas, planejamento, relato e atividades concluidas.',
  });
  ids.tarefasAtualizarStatusSeguro = await upsertServerFunction('tarefasAtualizarStatusSeguro', {
    code: TAREFAS_ATUALIZAR_STATUS_SQL,
    description: 'Atualiza status da atividade gravando data de conclusao quando aplicavel.',
  });
  ids.dashboardVisitasSemanaResumo = await upsertServerFunction('dashboardVisitasSemanaResumo', {
    code: DASHBOARD_VISITAS_SEMANA_SQL,
    description: 'Lista ultimas visitas da semana com data do relato e status visual.',
  });

  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar historico e resumo da semana:');
  console.error(error?.message || error);
  process.exit(1);
});
