import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
  createServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const BACKUP_TABLE = 'VENDEDOR_RCA_BKP_20260408';

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

async function runDdlSafe(sql, ignorePatterns = []) {
  try {
    await runDdlMitra({ projectId, sql });
  } catch (error) {
    const text = getErrorText(error);
    const shouldIgnore = ignorePatterns.some((pattern) => text.includes(pattern));
    if (!shouldIgnore) throw error;
  }
}

async function reshapeVendedorRca() {
  await runDdlSafe(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`);
  await runDdlSafe(`CREATE TABLE ${BACKUP_TABLE} AS SELECT * FROM VENDEDOR_RCA`, ['doesn\'t exist', 'unknown table']);
  await runDdlSafe('DROP TABLE IF EXISTS VENDEDOR_RCA');

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

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
      SELECT
        B.USER_ID,
        B.COD_RCA,
        R.COD_SUPERVISOR AS COD_SUPERVISOR
      FROM ${BACKUP_TABLE} B
      JOIN INT_USER U ON U.ID = B.USER_ID
      JOIN RCA_TOTVS R ON R.COD_RCA = B.COD_RCA
      WHERE B.USER_ID IS NOT NULL
        AND B.COD_RCA IS NOT NULL
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT IGNORE INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
      SELECT
        X.USER_ID,
        X.COD_RCA,
        X.COD_SUPERVISOR
      FROM (
        SELECT
          C.VENDEDOR_ID AS USER_ID,
          C.WINTHOR_COD_RCA AS COD_RCA,
          R.COD_SUPERVISOR AS COD_SUPERVISOR
        FROM CLIENTE_BU_VENDEDOR C
        LEFT JOIN RCA_TOTVS R ON R.COD_RCA = C.WINTHOR_COD_RCA
        WHERE C.VENDEDOR_ID IS NOT NULL
          AND C.WINTHOR_COD_RCA IS NOT NULL
        GROUP BY C.VENDEDOR_ID, C.WINTHOR_COD_RCA, R.COD_SUPERVISOR
      ) X
      JOIN INT_USER U ON U.ID = X.USER_ID
      JOIN RCA_TOTVS R ON R.COD_RCA = X.COD_RCA
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

async function upsertSf(definition, existingList) {
  const existing = existingList.find((sf) => sf.name === definition.name);

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
  await reshapeVendedorRca();

  const listed = await listServerFunctionsMitra({ projectId });
  const sfList = listed?.result || [];
  const ids = {};

  for (const def of sfDefinitions) {
    ids[def.name] = await upsertSf(def, sfList);
  }

  console.log('VENDEDOR_RCA ajustada para modelo apenas de FKs.');
  console.log(JSON.stringify({ backupTable: BACKUP_TABLE, sfIds: ids }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao ajustar VENDEDOR_RCA:');
  console.error(error?.message || error);
  process.exit(1);
});
