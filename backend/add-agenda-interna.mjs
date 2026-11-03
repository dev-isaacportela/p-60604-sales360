import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

const INPUT_SCOPE_SQL = `INPUT_SCOPE AS (
  SELECT
    CASE WHEN '{{scopeMode}}' IN ('TEAM', 'SELLER') THEN '{{scopeMode}}' ELSE 'ME' END AS SCOPE_MODE,
    CASE WHEN '{{scopeUserId}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeUserId}}' AS UNSIGNED) ELSE NULL END AS SCOPE_USER_ID,
    CASE WHEN '{{scopeCodRca}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodRca}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_RCA,
    CASE WHEN '{{scopeCodFilial}}' = '' OR LOCATE('{', '{{scopeCodFilial}}') > 0 THEN NULL ELSE TRIM('{{scopeCodFilial}}') END AS SCOPE_CODFILIAL,
    CASE WHEN '{{scopeCodepto}}' = '' OR LOCATE('{', '{{scopeCodepto}}') > 0 THEN NULL ELSE TRIM('{{scopeCodepto}}') END AS SCOPE_CODEPTO,
    CASE WHEN '{{scopeIdSecao}}' = '' OR LOCATE('{', '{{scopeIdSecao}}') > 0 THEN NULL ELSE TRIM('{{scopeIdSecao}}') END AS SCOPE_ID_SECAO
),
TARGET_USERS AS (
  SELECT :VAR_USER AS USER_ID
  FROM INPUT_SCOPE I
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT F.ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'

  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE I.SCOPE_MODE = 'TEAM'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )

  UNION

  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
),
VENDEDOR_INFO AS (
  SELECT
    VR.USER_ID,
    MIN(VR.COD_RCA) AS COD_RCA,
    MAX(COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, RT.RCA_NOME, CONCAT('Vendedor ', VR.USER_ID))) AS VENDEDOR_NOME
  FROM VENDEDOR_RCA VR
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  LEFT JOIN INT_USER U ON U.ID = VR.USER_ID
  GROUP BY VR.USER_ID
)`;

const EVENTOS_CTE_SQL = `WITH ${INPUT_SCOPE_SQL},
EVENTOS AS (
  SELECT
    V.ID,
    'VISITA' AS ORIGEM,
    NULL AS TITULO_INTERNO,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    V.HORA_FIM,
    V.TIPO,
    V.STATUS,
    V.CHECKIN_HORA,
    V.CHECKOUT_HORA,
    V.RELATO,
    V.PLANEJAMENTO,
    V.VENDEDOR_ID,
    NULL AS ORIGEM_DESLOCAMENTO,
    NULL AS DESTINO_DESLOCAMENTO,
    VI.COD_RCA,
    COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', V.VENDEDOR_ID)) AS VENDEDOR_NOME,
    CASE WHEN (
      V.VENDEDOR_ID = :VAR_USER
      OR EXISTS (SELECT 1 FROM FUNCIONARIOS FS WHERE FS.ID = V.VENDEDOR_ID AND FS.ID_SUBSTITUTO = :VAR_USER)
      OR EXISTS (
        SELECT 1
        FROM VENDEDOR_RCA VR_DONO
        JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
        JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
        WHERE VR_DONO.USER_ID = V.VENDEDOR_ID
          AND VR_SUB.USER_ID = :VAR_USER
          AND COALESCE(FV.ATIVO, TRUE) = TRUE
          AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
      )
    ) THEN 1 ELSE 0 END AS PODE_OPERAR,
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.UF,
    C.ENDERECO,
    NULL AS PARTICIPANTES
  FROM VISITAS V
  JOIN TARGET_USERS TU ON TU.USER_ID = V.VENDEDOR_ID
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = V.VENDEDOR_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'

  UNION ALL

  SELECT DISTINCT
    A.ID,
    'INTERNA' AS ORIGEM,
    A.TITULO AS TITULO_INTERNO,
    A.DATA_AGENDADA,
    A.HORA_INICIO,
    A.HORA_FIM,
    COALESCE(NULLIF(A.TIPO, ''), 'Agenda interna') AS TIPO,
    A.STATUS,
    NULL AS CHECKIN_HORA,
    NULL AS CHECKOUT_HORA,
    NULL AS RELATO,
    A.DESCRICAO AS PLANEJAMENTO,
    A.CRIADOR_ID AS VENDEDOR_ID,
    A.ORIGEM_DESLOCAMENTO,
    A.DESTINO_DESLOCAMENTO,
    VI.COD_RCA,
    COALESCE(VI.VENDEDOR_NOME, CONCAT('Vendedor ', A.CRIADOR_ID)) AS VENDEDOR_NOME,
    CASE WHEN A.CRIADOR_ID = :VAR_USER THEN 1 ELSE 0 END AS PODE_OPERAR,
    NULL AS CLIENTE_ID,
    A.TITULO AS CLIENTE,
    'Interno' AS CIDADE,
    NULL AS UF,
    NULL AS ENDERECO,
    (
      SELECT GROUP_CONCAT(COALESCE(VIP.VENDEDOR_NOME, CONCAT('Vendedor ', P.VENDEDOR_ID)) ORDER BY VIP.VENDEDOR_NOME SEPARATOR ', ')
      FROM AGENDA_INTERNA_PARTICIPANTES P
      LEFT JOIN VENDEDOR_INFO VIP ON VIP.USER_ID = P.VENDEDOR_ID
      WHERE P.AGENDA_ID = A.ID
    ) AS PARTICIPANTES
  FROM AGENDA_INTERNA A
  JOIN TARGET_USERS TU
    ON TU.USER_ID = A.CRIADOR_ID
    OR EXISTS (
      SELECT 1
      FROM AGENDA_INTERNA_PARTICIPANTES AP
      WHERE AP.AGENDA_ID = A.ID
        AND AP.VENDEDOR_ID = TU.USER_ID
    )
  LEFT JOIN VENDEDOR_INFO VI ON VI.USER_ID = A.CRIADOR_ID
  WHERE A.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
)`;

const LISTAR_VISITAS_PERIODO_SQL = `${EVENTOS_CTE_SQL}
SELECT *
FROM EVENTOS
ORDER BY DATA_AGENDADA, HORA_INICIO`;

const VISITAS_DO_DIA_SQL = `${EVENTOS_CTE_SQL.replaceAll('{{dataInicio}}', '{{data}}').replaceAll('{{dataFim}}', '{{data}}')}
SELECT *
FROM EVENTOS
ORDER BY HORA_INICIO`;

const AGENDA_LISTAR_PAGINADO_SQL = `${EVENTOS_CTE_SQL}
SELECT *
FROM EVENTOS
WHERE ('{{status}}' = '' OR STATUS = '{{status}}')
  AND (
    '{{busca}}' = ''
    OR COALESCE(CLIENTE, '') LIKE '%{{busca}}%'
    OR COALESCE(TITULO_INTERNO, '') LIKE '%{{busca}}%'
    OR COALESCE(VENDEDOR_NOME, '') LIKE '%{{busca}}%'
    OR CAST(COALESCE(COD_RCA, '') AS CHAR) LIKE '%{{busca}}%'
    OR COALESCE(PARTICIPANTES, '') LIKE '%{{busca}}%'
  )
ORDER BY DATA_AGENDADA DESC, HORA_INICIO DESC
LIMIT {{limit}} OFFSET {{offset}}`;

const AGENDA_CONTAR_PAGINADO_SQL = `${EVENTOS_CTE_SQL}
SELECT COUNT(*) AS TOTAL
FROM EVENTOS
WHERE ('{{status}}' = '' OR STATUS = '{{status}}')
  AND (
    '{{busca}}' = ''
    OR COALESCE(CLIENTE, '') LIKE '%{{busca}}%'
    OR COALESCE(TITULO_INTERNO, '') LIKE '%{{busca}}%'
    OR COALESCE(VENDEDOR_NOME, '') LIKE '%{{busca}}%'
    OR CAST(COALESCE(COD_RCA, '') AS CHAR) LIKE '%{{busca}}%'
    OR COALESCE(PARTICIPANTES, '') LIKE '%{{busca}}%'
  )`;

const AGENDA_CRIAR_INTERNA_SQL = `
INSERT INTO AGENDA_INTERNA (
  TITULO,
  DESCRICAO,
  DATA_AGENDADA,
  HORA_INICIO,
  HORA_FIM,
  TIPO,
  ORIGEM_DESLOCAMENTO,
  DESTINO_DESLOCAMENTO,
  STATUS,
  CRIADOR_ID,
  CRIADO_EM,
  ATUALIZADO_EM
)
VALUES (
  '{{titulo}}',
  NULLIF('{{descricao}}', ''),
  '{{dataAgendada}}',
  '{{horaInicio}}',
  '{{horaFim}}',
  NULLIF('{{tipo}}', ''),
  NULLIF('{{origemDeslocamento}}', ''),
  NULLIF('{{destinoDeslocamento}}', ''),
  'AGENDADA',
  :VAR_USER,
  '{{criadoEm}}',
  '{{criadoEm}}'
)`;

const AGENDA_ADICIONAR_PARTICIPANTE_SQL = `
INSERT INTO AGENDA_INTERNA_PARTICIPANTES (AGENDA_ID, VENDEDOR_ID, CRIADO_EM)
SELECT
  CAST('{{agendaId}}' AS UNSIGNED),
  CAST('{{vendedorId}}' AS UNSIGNED),
  '{{criadoEm}}'
WHERE '{{agendaId}}' REGEXP '^[0-9]+$'
  AND '{{vendedorId}}' REGEXP '^[0-9]+$'
  AND EXISTS (
    SELECT 1
    FROM AGENDA_INTERNA A
    WHERE A.ID = CAST('{{agendaId}}' AS UNSIGNED)
      AND A.CRIADOR_ID = :VAR_USER
  )
  AND NOT EXISTS (
    SELECT 1
    FROM AGENDA_INTERNA_PARTICIPANTES P
    WHERE P.AGENDA_ID = CAST('{{agendaId}}' AS UNSIGNED)
      AND P.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED)
  )`;

const AGENDA_LISTAR_VENDEDORES_SQL = `
SELECT DISTINCT
  BV.VENDEDOR_ID AS USER_ID,
  COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Vendedor ', BV.VENDEDOR_ID)) AS NOME,
  U.DESCR AS EMAIL
FROM BU_VENDEDOR BV
LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
  AND BV.VENDEDOR_ID IS NOT NULL
ORDER BY NOME, USER_ID`;

async function ensureTables() {
  const tables = normalizeArray(await listTablesMitra({ projectId }));
  const names = new Set(tables.map((table) => table.name));

  if (!names.has('AGENDA_INTERNA')) {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE AGENDA_INTERNA (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        TITULO VARCHAR(200) NOT NULL,
        DESCRICAO TEXT,
        DATA_AGENDADA VARCHAR(10) NOT NULL,
        HORA_INICIO VARCHAR(5) NOT NULL,
        HORA_FIM VARCHAR(5) NOT NULL,
        TIPO VARCHAR(50),
        ORIGEM_DESLOCAMENTO VARCHAR(200),
        DESTINO_DESLOCAMENTO VARCHAR(200),
        STATUS VARCHAR(20),
        CRIADOR_ID INT NOT NULL,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela AGENDA_INTERNA criada.');
  } else {
    console.log('Tabela AGENDA_INTERNA ja existe.');
    await addColumnIfMissing('AGENDA_INTERNA', 'ORIGEM_DESLOCAMENTO', 'VARCHAR(200)');
    await addColumnIfMissing('AGENDA_INTERNA', 'DESTINO_DESLOCAMENTO', 'VARCHAR(200)');
  }

  if (!names.has('AGENDA_INTERNA_PARTICIPANTES')) {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE AGENDA_INTERNA_PARTICIPANTES (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        AGENDA_ID INT NOT NULL,
        VENDEDOR_ID INT NOT NULL,
        CRIADO_EM VARCHAR(19),
        FOREIGN KEY (AGENDA_ID) REFERENCES AGENDA_INTERNA(ID)
      )`,
    });
    console.log('Tabela AGENDA_INTERNA_PARTICIPANTES criada.');
  } else {
    console.log('Tabela AGENDA_INTERNA_PARTICIPANTES ja existe.');
  }
}

async function addColumnIfMissing(tableName, columnName, definition) {
  try {
    await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}` });
    console.log(`Coluna ${tableName}.${columnName} criada.`);
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase();
    if (message.includes('duplicate') || message.includes('already exists') || message.includes('existe')) {
      console.log(`Coluna ${tableName}.${columnName} ja existe.`);
      return;
    }
    throw error;
  }
}

async function upsertFunction(name, type, code, description) {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const existing = listed.find((sf) => sf.name === name);

  if (existing) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code, description });
    console.log(`SF ${name} atualizada (${existing.id}).`);
    return existing.id;
  }

  const created = await createServerFunctionMitra({ projectId, name, type, code, description });
  const id = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
  console.log(`SF ${name} criada (${id}).`);
  return id;
}

async function smoke(serverFunctionId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await executeServerFunctionMitra({
    projectId,
    serverFunctionId,
    input: {
      dataInicio: today,
      dataFim: today,
      scopeMode: 'ME',
      scopeUserId: '',
      scopeCodRca: '',
      scopeCodFilial: '',
      scopeCodepto: '',
      scopeIdSecao: '',
    },
  });
  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou: ${status}`);
  console.log('Smoke de listagem da agenda OK.');
}

async function main() {
  await ensureTables();

  const ids = {
    listarVisitasPeriodo: await upsertFunction('listarVisitasPeriodo', 'SQL', LISTAR_VISITAS_PERIODO_SQL, 'Lista visitas e compromissos internos do periodo conforme escopo.'),
    visitasDoDia: await upsertFunction('visitasDoDia', 'SQL', VISITAS_DO_DIA_SQL, 'Lista visitas e compromissos internos do dia.'),
    agendaListarVisitasPaginado: await upsertFunction('agendaListarVisitasPaginado', 'SQL', AGENDA_LISTAR_PAGINADO_SQL, 'Lista agenda paginada com visitas e compromissos internos.'),
    agendaContarVisitasPaginado: await upsertFunction('agendaContarVisitasPaginado', 'SQL', AGENDA_CONTAR_PAGINADO_SQL, 'Conta agenda paginada com visitas e compromissos internos.'),
    agendaCriarCompromissoInterno: await upsertFunction('agendaCriarCompromissoInterno', 'SQL', AGENDA_CRIAR_INTERNA_SQL, 'Cria compromisso interno sem cliente para o usuario logado.'),
    agendaAdicionarParticipanteInterno: await upsertFunction('agendaAdicionarParticipanteInterno', 'SQL', AGENDA_ADICIONAR_PARTICIPANTE_SQL, 'Adiciona vendedor convidado a compromisso interno criado pelo usuario logado.'),
    agendaListarVendedoresConvite: await upsertFunction('agendaListarVendedoresConvite', 'SQL', AGENDA_LISTAR_VENDEDORES_SQL, 'Lista vendedores ativos para convite em compromissos internos.'),
  };

  await smoke(ids.listarVisitasPeriodo);
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar agenda interna:');
  console.error(error?.message || error);
  process.exit(1);
});
