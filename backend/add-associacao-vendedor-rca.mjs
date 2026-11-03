import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  createDataLoaderMitra,
  listDataLoadersMitra,
  updateDataLoaderMitra,
  executeDataLoaderMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'RCA_CLIENTE_WINTHOR';
const STAGING_TABLE = 'IMP_RCA_CLIENTE_WINTHOR';

const QUERY_RCA_CLIENTE = `
  SELECT DISTINCT
      v.codcli,
      v.codusur AS cod_rca,
      u.nome AS rca,
      r.nome AS supervisor
  FROM view_vendas_resumo_faturamento v,
       view_devol_resumo_faturamento d,
       pcusuari u,
       pcsuperv r,
       pcdepto dpto,
       pcsecao s
  WHERE v.numtransvenda = d.numtransvenda(+)
    AND v.codusur = u.codusur
    AND v.codsupervisor = r.codsupervisor
    AND v.codepto = dpto.codepto
    AND v.codsec = s.codsec
    AND v.codoper = 'S'
    AND v.codcli IS NOT NULL
    AND v.codusur IS NOT NULL
`;

function errorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

function getDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
}

async function ensureSchema() {
  const alters = [
    'ALTER TABLE CLIENTE_BU_VENDEDOR ADD COLUMN WINTHOR_COD_RCA INT',
    'ALTER TABLE CLIENTE_BU_VENDEDOR ADD COLUMN RCA_NOME VARCHAR(200)',
    'ALTER TABLE CLIENTE_BU_VENDEDOR ADD COLUMN SUPERVISOR_NOME VARCHAR(200)',
  ];

  for (const sql of alters) {
    try {
      await runDdlMitra({ projectId, sql });
    } catch (error) {
      const msg = errorText(error);
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE VENDEDOR_RCA (
        USER_ID INT NOT NULL,
        COD_RCA INT NOT NULL,
        COD_SUPERVISOR INT,
        PRIMARY KEY (USER_ID),
        UNIQUE KEY UX_VENDEDOR_RCA_COD_RCA (COD_RCA),
        KEY IX_VENDEDOR_RCA_SUP (COD_SUPERVISOR),
        CONSTRAINT FK_VENDEDOR_RCA_USER FOREIGN KEY (USER_ID) REFERENCES INT_USER(ID),
        CONSTRAINT FK_VENDEDOR_RCA_COD FOREIGN KEY (COD_RCA) REFERENCES RCA_TOTVS(COD_RCA),
        CONSTRAINT FK_VENDEDOR_RCA_SUP FOREIGN KEY (COD_SUPERVISOR) REFERENCES RCA_TOTVS(COD_RCA)
      )`,
    });
  } catch (error) {
    const msg = errorText(error);
    if (!msg.includes('already exists')) throw error;
  }
}

async function syncDataLoader() {
  let dataLoaderId = null;
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => {
    const name = loader?.name || loader?.NAME || '';
    return name === DATA_LOADER_NAME;
  });

  if (existing) {
    dataLoaderId = Number(existing.id || existing.dataLoaderId || existing.ID || 0) || null;
  }

  if (dataLoaderId) {
    try {
      await updateDataLoaderMitra({
        projectId,
        dataLoaderId,
        name: DATA_LOADER_NAME,
        jdbcId: WINTHOR_JDBC_ID,
        query: QUERY_RCA_CLIENTE,
      });
    } catch {
      dataLoaderId = null;
    }
  }

  if (!dataLoaderId) {
    const created = await createDataLoaderMitra({
      projectId,
      jdbcId: WINTHOR_JDBC_ID,
      name: DATA_LOADER_NAME,
      query: QUERY_RCA_CLIENTE,
      runWhenCreate: false,
    });
    dataLoaderId = getDataLoaderId(created);
  }

  if (!dataLoaderId) {
    throw new Error('Não foi possível resolver o ID do Data Loader RCA_CLIENTE_WINTHOR.');
  }

  await executeDataLoaderMitra({ projectId, dataLoaderId });
  return dataLoaderId;
}

async function applyAssociations() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO CLIENTE_BU_VENDEDOR (CLIENTE_ID, BU, VENDEDOR_ID, WINTHOR_COD_RCA, RCA_NOME, SUPERVISOR_NOME, ATUALIZADO_EM)
      SELECT
        M.CODCLI,
        'PADRAO',
        NULL,
        M.COD_RCA,
        M.RCA,
        M.SUPERVISOR,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM (
        SELECT
          CODCLI,
          MAX(COD_RCA) AS COD_RCA,
          MAX(RCA) AS RCA,
          MAX(SUPERVISOR) AS SUPERVISOR
        FROM ${STAGING_TABLE}
        WHERE CODCLI IS NOT NULL
        GROUP BY CODCLI
      ) M
      WHERE NOT EXISTS (
        SELECT 1
        FROM CLIENTE_BU_VENDEDOR C
        WHERE C.CLIENTE_ID = M.CODCLI
          AND C.BU = 'PADRAO'
      )
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE CLIENTE_BU_VENDEDOR C
      JOIN (
        SELECT
          CODCLI,
          MAX(COD_RCA) AS COD_RCA,
          MAX(RCA) AS RCA,
          MAX(SUPERVISOR) AS SUPERVISOR
        FROM ${STAGING_TABLE}
        WHERE CODCLI IS NOT NULL
        GROUP BY CODCLI
      ) M ON M.CODCLI = C.CLIENTE_ID
      SET
        C.WINTHOR_COD_RCA = M.COD_RCA,
        C.RCA_NOME = M.RCA,
        C.SUPERVISOR_NOME = M.SUPERVISOR,
        C.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
      SELECT
        U.ID,
        M.COD_RCA,
        R.COD_SUPERVISOR
      FROM INT_USER U
      JOIN (
        SELECT
          COD_RCA,
          MAX(RCA) AS RCA,
          MAX(SUPERVISOR) AS SUPERVISOR
        FROM ${STAGING_TABLE}
        WHERE COD_RCA IS NOT NULL
        GROUP BY COD_RCA
      ) M ON M.COD_RCA = U.ID
      LEFT JOIN RCA_TOTVS R ON R.COD_RCA = M.COD_RCA
      ON DUPLICATE KEY UPDATE
        COD_RCA = VALUES(COD_RCA),
        COD_SUPERVISOR = VALUES(COD_SUPERVISOR)
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE CLIENTE_BU_VENDEDOR C
      JOIN VENDEDOR_RCA VR ON VR.COD_RCA = C.WINTHOR_COD_RCA
      SET
        C.VENDEDOR_ID = VR.USER_ID,
        C.ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE CLIENTES CL
      JOIN CLIENTE_BU_VENDEDOR C ON C.CLIENTE_ID = CL.ID AND C.BU = 'PADRAO'
      SET CL.VENDEDOR_ID = C.VENDEDOR_ID
    `,
  });

  try {
    await runDmlMitra({
      projectId,
      sql: `
        UPDATE EQUIPE_CLIENTE E
        JOIN CLIENTE_BU_VENDEDOR C ON C.CLIENTE_ID = E.ID_CLIENTE AND C.BU = E.ID_BU
        SET E.ID_VENDEDOR = C.VENDEDOR_ID,
            E.CRIADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      `,
    });
  } catch (error) {
    const msg = errorText(error);
    if (!msg.includes('doesn\'t exist') && !msg.includes('unknown table')) throw error;
  }
}

const sfDefinitions = [
  {
    name: 'painelGestaoVendedores',
    description: 'Lista vendedores com RCA e RCA do supervisor para filtro no painel de gestão.',
    code: `
      SELECT
        VR.USER_ID AS VENDEDOR_ID,
        CONCAT(COALESCE(F.NOME, U.DESCR), ' | RCA ', VR.COD_RCA, ' - ', COALESCE(R.RCA_NOME, 'SEM NOME')) AS VENDEDOR_NOME,
        U.DESCR AS EMAIL,
        VR.COD_RCA,
        R.RCA_NOME,
        VR.COD_SUPERVISOR,
        RS.RCA_NOME AS SUPERVISOR_NOME,
        'VENDEDOR' AS CARGO
      FROM VENDEDOR_RCA VR
      JOIN INT_USER U ON U.ID = VR.USER_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
      LEFT JOIN RCA_TOTVS R ON R.COD_RCA = VR.COD_RCA
      LEFT JOIN RCA_TOTVS RS ON RS.COD_RCA = VR.COD_SUPERVISOR
      ORDER BY VENDEDOR_NOME
    `,
  },
  {
    name: 'painelGestaoOperacional',
    description: 'Lista fila operacional com responsável via vínculo RCA.',
    code: `
      SELECT
        ITENS.TIPO,
        ITENS.REGISTRO_ID,
        ITENS.VENDEDOR_ID,
        ITENS.RESPONSAVEL,
        ITENS.ITEM,
        ITENS.STATUS,
        ITENS.DATA_REFERENCIA,
        ITENS.PRIORIDADE,
        ITENS.ACAO_RECOMENDADA
      FROM (
        SELECT
          'TAREFA' AS TIPO,
          T.ID AS REGISTRO_ID,
          T.VENDEDOR_ID,
          COALESCE(RT.RCA_NOME, F.NOME, U.DESCR) AS RESPONSAVEL,
          T.TITULO AS ITEM,
          T.STATUS,
          T.DATA_LIMITE AS DATA_REFERENCIA,
          T.PRIORIDADE,
          CASE
            WHEN T.DATA_LIMITE < CURRENT_DATE THEN 'Cobrar conclusão imediata'
            WHEN T.STATUS = 'EM_ANDAMENTO' THEN 'Acompanhar andamento'
            ELSE 'Priorizar na próxima rotina'
          END AS ACAO_RECOMENDADA,
          CASE
            WHEN T.DATA_LIMITE < CURRENT_DATE THEN 1
            WHEN T.STATUS = 'PENDENTE' THEN 2
            ELSE 3
          END AS ORDEM_PRIORIDADE
        FROM TAREFAS T
        LEFT JOIN INT_USER U ON U.ID = T.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F ON F.ID = T.VENDEDOR_ID
        LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = T.VENDEDOR_ID
        LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
        WHERE T.STATUS IN ('PENDENTE', 'EM_ANDAMENTO')
          AND ('{{vendedorId}}' = '' OR T.VENDEDOR_ID = {{vendedorId}})

        UNION ALL

        SELECT
          'VISITA' AS TIPO,
          V.ID AS REGISTRO_ID,
          V.VENDEDOR_ID,
          COALESCE(RV.RCA_NOME, F2.NOME, U2.DESCR) AS RESPONSAVEL,
          CONCAT('Visita ', COALESCE(C.NOME_FANTASIA, 'Cliente sem nome')) AS ITEM,
          V.STATUS,
          V.DATA_AGENDADA AS DATA_REFERENCIA,
          '-' AS PRIORIDADE,
          CASE
            WHEN V.DATA_AGENDADA < CURRENT_DATE THEN 'Reagendar ou concluir hoje'
            ELSE 'Confirmar agenda com cliente'
          END AS ACAO_RECOMENDADA,
          CASE
            WHEN V.DATA_AGENDADA < CURRENT_DATE THEN 1
            ELSE 2
          END AS ORDEM_PRIORIDADE
        FROM VISITAS V
        JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
        LEFT JOIN INT_USER U2 ON U2.ID = V.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F2 ON F2.ID = V.VENDEDOR_ID
        LEFT JOIN VENDEDOR_RCA VR2 ON VR2.USER_ID = V.VENDEDOR_ID
        LEFT JOIN RCA_TOTVS RV ON RV.COD_RCA = VR2.COD_RCA
        WHERE V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
          AND ('{{vendedorId}}' = '' OR V.VENDEDOR_ID = {{vendedorId}})
      ) ITENS
      ORDER BY ITENS.ORDEM_PRIORIDADE, ITENS.DATA_REFERENCIA, ITENS.RESPONSAVEL
      LIMIT 60
    `,
  },
  {
    name: 'listarVinculosVendedorRca',
    description: 'Lista vínculo entre usuário, RCA e RCA do supervisor.',
    code: `
      SELECT
        U.ID AS USER_ID,
        COALESCE(F.NOME, U.DESCR) AS USUARIO,
        U.DESCR AS EMAIL,
        VR.COD_RCA,
        R.RCA_NOME,
        VR.COD_SUPERVISOR,
        RS.RCA_NOME AS SUPERVISOR_NOME
      FROM INT_USER U
      LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
      LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = U.ID
      LEFT JOIN RCA_TOTVS R ON R.COD_RCA = VR.COD_RCA
      LEFT JOIN RCA_TOTVS RS ON RS.COD_RCA = VR.COD_SUPERVISOR
      ORDER BY USUARIO
    `,
  },
  {
    name: 'vincularVendedorRca',
    description: 'Vincula usuário ao RCA e ao RCA do supervisor.',
    code: `
      REPLACE INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
      VALUES (
        {{userId}},
        {{codRca}},
        CASE
          WHEN '{{codSupervisor}}' = '' THEN (
            SELECT COALESCE(
              R.COD_SUPERVISOR,
              MIN(S.COD_RCA)
            )
            FROM RCA_TOTVS R
            LEFT JOIN RCA_TOTVS S ON TRIM(UPPER(S.RCA_NOME)) = TRIM(UPPER(R.SUPERVISOR_NOME))
            WHERE R.COD_RCA = {{codRca}}
          )
          ELSE CAST('{{codSupervisor}}' AS UNSIGNED)
        END
      )
    `,
  },
];

async function upsertSf(definition, existingFunctions) {
  const existing = existingFunctions.find((sf) => sf.name === definition.name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: definition.code,
      description: definition.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });

  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id || null;
}

async function main() {
  await ensureSchema();
  const dataLoaderId = await syncDataLoader();
  await applyAssociations();

  const listed = await listServerFunctionsMitra({ projectId });
  const existingFunctions = listed?.result || [];
  const sfIds = {};

  for (const def of sfDefinitions) {
    sfIds[def.name] = await upsertSf(def, existingFunctions);
  }

  console.log('Associação vendedor x RCA aplicada com sucesso.');
  console.log(JSON.stringify({ dataLoaderId, sfIds }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar associação vendedor x RCA:');
  console.error(error?.message || error);
  process.exit(1);
});
