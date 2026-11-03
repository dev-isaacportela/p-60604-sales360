import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  listTablesMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const GESTAO_SCOPE_SQL = `
  EXISTS (
    SELECT 1
    FROM USUARIO_CARGO UC
    WHERE UC.USER_ID = :VAR_USER
      AND UC.CARGO IN ('GESTOR', 'ADMIN')
  )
`;

const AGENDA_VERIFICAR_CONFLITO_SQL = `
SELECT
  COUNT(*) AS TOTAL,
  MIN(V.HORA_INICIO) AS HORARIO_CONFLITO
FROM VISITAS V
WHERE V.VENDEDOR_ID = :VAR_USER
  AND V.DATA_AGENDADA = '{{dataAgendada}}'
  AND V.HORA_INICIO = '{{horaInicio}}'
  AND COALESCE(V.STATUS, '') <> 'CANCELADA'
`;

const AGENDA_CRIAR_VISITA_SQL = `
  INSERT INTO VISITAS (
    CLIENTE_ID,
    VENDEDOR_ID,
    DATA_AGENDADA,
    HORA_INICIO,
    HORA_FIM,
    TIPO,
    STATUS,
    RELATO,
    CRIADO_EM
  )
  SELECT
    C.ID,
    :VAR_USER,
    '{{dataAgendada}}',
    '{{horaInicio}}',
    '{{horaFim}}',
    '{{tipo}}',
    'AGENDADA',
    NULLIF('{{relato}}', ''),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM CLIENTES C
  WHERE C.ID = {{clienteId}}
    AND EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = C.ID
        AND (
          EC.ID_VENDEDOR = :VAR_USER
          OR F.ID_SUBSTITUTO = :VAR_USER
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM VISITAS V
      WHERE V.VENDEDOR_ID = :VAR_USER
        AND V.DATA_AGENDADA = '{{dataAgendada}}'
        AND V.HORA_INICIO = '{{horaInicio}}'
        AND COALESCE(V.STATUS, '') <> 'CANCELADA'
    )
  LIMIT 1
`;

const HISTORICO_VISITAS_SQL = `
  WITH BASE AS (
    SELECT
      V.ID,
      V.DATA_AGENDADA,
      V.HORA_INICIO,
      COALESCE(V.TIPO, 'Visita') AS TIPO,
      V.STATUS,
      V.RELATO,
      'VISITA' AS TIPO_REGISTRO
    FROM VISITAS V
    WHERE V.CLIENTE_ID = {{clienteId}}

    UNION ALL

    SELECT
      T.ID,
      COALESCE(NULLIF(T.DATA_LIMITE, ''), SUBSTRING(T.CRIADO_EM, 1, 10)) AS DATA_AGENDADA,
      COALESCE(NULLIF(SUBSTRING(T.CRIADO_EM, 12, 5), ''), '--:--') AS HORA_INICIO,
      'Tarefa' AS TIPO,
      T.STATUS,
      COALESCE(NULLIF(T.DESCRICAO, ''), T.TITULO) AS RELATO,
      'TAREFA' AS TIPO_REGISTRO
    FROM TAREFAS T
    WHERE T.CLIENTE_ID = {{clienteId}}
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
    F.TIPO_REGISTRO,
    (SELECT COUNT(*) FROM FILTRADO FV WHERE FV.TIPO_REGISTRO = 'VISITA') AS TOTAL_VISITAS_PERIODO,
    (SELECT COUNT(*) FROM FILTRADO FT WHERE FT.TIPO_REGISTRO = 'TAREFA') AS TOTAL_TAREFAS_PERIODO
  FROM FILTRADO F
  ORDER BY F.DATA_AGENDADA DESC, F.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const HISTORICO_RESUMO_PEDIDOS_SQL = `
  WITH PED AS (
    SELECT
      VT.NUMPED,
      MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
      ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    WHERE VT.CODCLI = {{clienteId}}
      AND VT.COD_RCA IN (
        SELECT DISTINCT VR.COD_RCA
        FROM EQUIPE_CLIENTE EC
        LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
        JOIN VENDEDOR_RCA VR ON VR.USER_ID = EC.ID_VENDEDOR
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
      )
    GROUP BY VT.NUMPED
  )
  SELECT *
  FROM (
    SELECT
      'TOTAL' AS TIPO_LINHA,
      0 AS QUARTER_NUM,
      '' AS QUARTER_LABEL,
      COUNT(*) AS TOTAL_PEDIDOS,
      ROUND(AVG(PED.VALOR_TOTAL), 2) AS TICKET_MEDIO
    FROM PED

    UNION ALL

    SELECT
      'QUARTER' AS TIPO_LINHA,
      QUARTER(CAST(PED.DATA_PEDIDO AS DATE)) AS QUARTER_NUM,
      CONCAT('Q', QUARTER(CAST(PED.DATA_PEDIDO AS DATE))) AS QUARTER_LABEL,
      COUNT(*) AS TOTAL_PEDIDOS,
      ROUND(AVG(PED.VALOR_TOTAL), 2) AS TICKET_MEDIO
    FROM PED
    WHERE PED.DATA_PEDIDO IS NOT NULL AND PED.DATA_PEDIDO <> ''
    GROUP BY QUARTER(CAST(PED.DATA_PEDIDO AS DATE))
  ) RESUMO
  ORDER BY CASE WHEN RESUMO.TIPO_LINHA = 'TOTAL' THEN 0 ELSE 1 END, RESUMO.QUARTER_NUM
`;

const LISTAR_TAREFAS_SQL = `
SELECT
  T.ID,
  T.TITULO,
  T.DESCRICAO,
  T.STATUS,
  T.PRIORIDADE,
  T.DATA_LIMITE,
  T.CRIADO_EM,
  T.CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE
FROM TAREFAS T
LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
WHERE T.VENDEDOR_ID = :VAR_USER
  AND ('{{status}}' = '' OR T.STATUS = '{{status}}')
  AND ('{{prioridade}}' = '' OR T.PRIORIDADE = '{{prioridade}}')
ORDER BY
  CASE T.STATUS WHEN 'PENDENTE' THEN 1 WHEN 'EM_ANDAMENTO' THEN 2 WHEN 'CONCLUIDA' THEN 3 END,
  CASE T.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'BAIXA' THEN 3 END,
  T.DATA_LIMITE
`;

const CRIAR_TAREFA_SQL = `
INSERT INTO TAREFAS (
  VENDEDOR_ID,
  CLIENTE_ID,
  TITULO,
  DESCRICAO,
  STATUS,
  PRIORIDADE,
  DATA_LIMITE,
  CRIADO_EM
)
VALUES (
  :VAR_USER,
  NULLIF('{{clienteId}}', ''),
  '{{titulo}}',
  NULLIF('{{descricao}}', ''),
  'PENDENTE',
  '{{prioridade}}',
  NULLIF('{{dataLimite}}', ''),
  '{{criadoEm}}'
)
`;

const TAREFAS_ATUALIZAR_DADOS_SQL = `
UPDATE TAREFAS T
SET
  T.TITULO = '{{titulo}}',
  T.DESCRICAO = NULLIF('{{descricao}}', ''),
  T.PRIORIDADE = '{{prioridade}}',
  T.DATA_LIMITE = NULLIF('{{dataLimite}}', ''),
  T.CLIENTE_ID = NULLIF('{{clienteId}}', '')
WHERE T.ID = {{tarefaId}}
  AND (
    ${GESTAO_SCOPE_SQL}
    OR T.VENDEDOR_ID = :VAR_USER
  )
LIMIT 1
`;

const ATIVIDADES_REGISTRAR_LOG_SQL = `
INSERT INTO ATIVIDADES_LOG (
  ID_ATIVIDADE,
  CAMPO_ALTERADO,
  VALOR_ANTERIOR,
  VALOR_NOVO,
  DATA_ALTERACAO,
  ID_USUARIO
)
SELECT
  T.ID,
  '{{campoAlterado}}',
  NULLIF('{{valorAnterior}}', ''),
  NULLIF('{{valorNovo}}', ''),
  '{{dataAlteracao}}',
  :VAR_USER
FROM TAREFAS T
WHERE T.ID = {{tarefaId}}
  AND (
    ${GESTAO_SCOPE_SQL}
    OR T.VENDEDOR_ID = :VAR_USER
  )
LIMIT 1
`;

const ATIVIDADES_LISTAR_LOG_SQL = `
SELECT
  L.ID,
  L.ID_ATIVIDADE,
  L.CAMPO_ALTERADO,
  L.VALOR_ANTERIOR,
  L.VALOR_NOVO,
  L.DATA_ALTERACAO,
  L.ID_USUARIO,
  COALESCE(U.DESCR, CONCAT('Usuário ', L.ID_USUARIO)) AS USUARIO
FROM ATIVIDADES_LOG L
LEFT JOIN INT_USER U ON U.ID = L.ID_USUARIO
WHERE L.ID_ATIVIDADE = {{tarefaId}}
  AND EXISTS (
    SELECT 1
    FROM TAREFAS T
    WHERE T.ID = L.ID_ATIVIDADE
      AND (
        ${GESTAO_SCOPE_SQL}
        OR T.VENDEDOR_ID = :VAR_USER
      )
  )
ORDER BY L.DATA_ALTERACAO DESC, L.ID DESC
`;

function extractServerFunctions(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function extractId(response) {
  return response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null;
}

async function getTables() {
  const tables = await listTablesMitra({ projectId });
  if (Array.isArray(tables)) return tables;
  if (Array.isArray(tables?.result)) return tables.result;
  if (Array.isArray(tables?.data)) return tables.data;
  return [];
}

async function ensureColumn(tableName, columnName, ddl) {
  const tables = await getTables();
  const table = tables.find((item) => item.name === tableName);
  const exists = table?.columns?.some((column) => column.name === columnName);
  if (exists) {
    console.log(`Coluna ${tableName}.${columnName} já existe`);
    return;
  }

  await runDdlMitra({ projectId, sql: ddl });
  console.log(`Coluna ${tableName}.${columnName} criada`);
}

async function ensureLogTable() {
  const tables = await getTables();
  if (tables.some((table) => table.name === 'ATIVIDADES_LOG')) {
    console.log('Tabela ATIVIDADES_LOG já existe');
    return;
  }

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE ATIVIDADES_LOG (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      ID_ATIVIDADE INT NOT NULL,
      CAMPO_ALTERADO VARCHAR(80) NOT NULL,
      VALOR_ANTERIOR VARCHAR(255),
      VALOR_NOVO VARCHAR(255),
      DATA_ALTERACAO VARCHAR(19) NOT NULL,
      ID_USUARIO INT NOT NULL,
      FOREIGN KEY (ID_ATIVIDADE) REFERENCES TAREFAS(ID)
    );`,
  });
  console.log('Tabela ATIVIDADES_LOG criada');
}

async function upsertServerFunction(name, payload) {
  const listed = extractServerFunctions(await listServerFunctionsMitra({ projectId }));
  const existing = listed.find((sf) => sf.name === name);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      ...payload,
    });
    console.log(`SF atualizada: ${name} (ID ${existing.id})`);
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name,
    type: 'SQL',
    ...payload,
  });
  const id = extractId(created);
  if (!id) throw new Error(`Não foi possível obter ID da SF ${name}`);
  console.log(`SF criada: ${name} (ID ${id})`);
  return id;
}

async function main() {
  await ensureColumn('TAREFAS', 'CLIENTE_ID', 'ALTER TABLE TAREFAS ADD COLUMN CLIENTE_ID INT NULL');
  await ensureLogTable();

  const ids = {};
  ids.agendaVerificarConflitoVisita = await upsertServerFunction('agendaVerificarConflitoVisita', {
    code: AGENDA_VERIFICAR_CONFLITO_SQL,
    description: 'Verifica conflito de agenda do usuário logado por dia e horário.',
  });
  ids.agendaCriarVisita = await upsertServerFunction('agendaCriarVisita', {
    code: AGENDA_CRIAR_VISITA_SQL,
    description: 'Cria visita apenas para cliente da carteira, bloqueando conflito de horário do usuário logado.',
  });
  ids.historicoVisitasCliente = await upsertServerFunction('historicoVisitasCliente', {
    code: HISTORICO_VISITAS_SQL,
    description: 'Histórico de visitas e tarefas do cliente com totais separados e filtro por intervalo.',
  });
  ids.historicoResumoPedidosCliente = await upsertServerFunction('historicoResumoPedidosCliente', {
    code: HISTORICO_RESUMO_PEDIDOS_SQL,
    description: 'Resumo de ticket médio total e por trimestre considerando pedidos TOTVS do cliente.',
  });
  ids.listarTarefas = await upsertServerFunction('listarTarefas', {
    code: LISTAR_TAREFAS_SQL,
    description: 'Lista atividades do vendedor logado com código do cliente e data de cadastro.',
  });
  ids.criarTarefa = await upsertServerFunction('criarTarefa', {
    code: CRIAR_TAREFA_SQL,
    description: 'Cria atividade do vendedor logado, opcionalmente vinculada ao código do cliente.',
  });
  ids.tarefasAtualizarDados = await upsertServerFunction('tarefasAtualizarDados', {
    code: TAREFAS_ATUALIZAR_DADOS_SQL,
    description: 'Atualiza atividade com código do cliente e guarda de alçada.',
  });
  ids.atividadesRegistrarLog = await upsertServerFunction('atividadesRegistrarLog', {
    code: ATIVIDADES_REGISTRAR_LOG_SQL,
    description: 'Registra alterações de campos da atividade, incluindo mudanças de prazo.',
  });
  ids.atividadesListarLog = await upsertServerFunction('atividadesListarLog', {
    code: ATIVIDADES_LISTAR_LOG_SQL,
    description: 'Lista logs de alteração da atividade em ordem cronológica reversa.',
  });

  console.log('Hotfix publicado com sucesso. IDs:');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao publicar hotfix:');
  console.error(error?.message || error);
  process.exit(1);
});
