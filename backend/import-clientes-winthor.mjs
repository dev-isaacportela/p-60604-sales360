import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  createDataLoaderMitra,
  listDataLoadersMitra,
  updateDataLoaderMitra,
  executeDataLoaderMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const WINTHOR_JDBC_ID = 2;
const DATA_LOADER_NAME = 'CLIENTES_WINTHOR';
const STAGING_TABLE = 'IMP_CLIENTES_WINTHOR';
const SYNC_SF_NAME = 'syncClientesWinthor';
const SYNC_CRON = '0 0 4 */2 * *';

const CLIENTES_QUERY = `
  SELECT
    C.CODCLI,
    C.CLIENTE,
    C.FANTASIA,
    C.CGCENT,
    A.RAMO AS BU
  FROM PCCLIENT C
    INNER JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
  WHERE C.CODCLI IS NOT NULL
    AND C.CGCENT IS NOT NULL
    AND LENGTH(REPLACE(REPLACE(REPLACE(TRIM(C.CGCENT), '.', ''), '/', ''), '-', '')) = 14
`;

const CLEANUP_CLIENTES_SQL = `
  DELETE FROM CLIENTES
  WHERE WINTHOR_CODCLI IS NOT NULL
    AND ID <> WINTHOR_CODCLI
`;

const UPSERT_CLIENTES_SQL = `
  INSERT INTO CLIENTES (
    ID,
    WINTHOR_CODCLI,
    RAZAO_SOCIAL,
    NOME_FANTASIA,
    CNPJ,
    ENDERECO,
    CIDADE,
    UF,
    SEGMENTO,
    STATUS,
    TELEFONE,
    EMAIL,
    VENDEDOR_ID,
    CRIADO_EM
  )
  SELECT
    I.CODCLI,
    I.CODCLI,
    COALESCE(NULLIF(TRIM(I.CLIENTE), ''), CONCAT('Cliente ', I.CODCLI)),
    COALESCE(NULLIF(TRIM(I.FANTASIA), ''), COALESCE(NULLIF(TRIM(I.CLIENTE), ''), CONCAT('Cliente ', I.CODCLI))),
    COALESCE(TRIM(I.CGCENT), ''),
    '',
    '',
    '',
    COALESCE(NULLIF(TRIM(I.BU), ''), 'Sem segmento'),
    'ATIVO',
    '',
    '',
    NULL,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM (
    SELECT
      CODCLI,
      MAX(CLIENTE) AS CLIENTE,
      MAX(FANTASIA) AS FANTASIA,
      MAX(CGCENT) AS CGCENT,
      MAX(BU) AS BU
    FROM ${STAGING_TABLE}
    WHERE CODCLI IS NOT NULL
      AND CGCENT IS NOT NULL
      AND LENGTH(REPLACE(REPLACE(REPLACE(TRIM(CGCENT), '.', ''), '/', ''), '-', '')) = 14
    GROUP BY CODCLI
  ) I
  ON DUPLICATE KEY UPDATE
    ID = VALUES(ID),
    WINTHOR_CODCLI = VALUES(WINTHOR_CODCLI),
    RAZAO_SOCIAL = VALUES(RAZAO_SOCIAL),
    NOME_FANTASIA = VALUES(NOME_FANTASIA),
    CNPJ = VALUES(CNPJ),
    SEGMENTO = VALUES(SEGMENTO),
    STATUS = VALUES(STATUS),
    VENDEDOR_ID = NULL
`;

const UPSERT_CLIENTE_BU_SQL = `
  INSERT INTO CLIENTE_BU_VENDEDOR (
    CLIENTE_ID,
    BU,
    VENDEDOR_ID,
    ATUALIZADO_EM
  )
  SELECT
    I.CODCLI,
    COALESCE(NULLIF(TRIM(I.BU), ''), 'Sem segmento'),
    NULL,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM ${STAGING_TABLE} I
  WHERE I.CODCLI IS NOT NULL
  ON DUPLICATE KEY UPDATE
    VENDEDOR_ID = NULL,
    ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
`;

async function garantirColunaDeChaveExterna() {
  try {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE CLIENTES ADD COLUMN WINTHOR_CODCLI INT',
    });
    console.log('Coluna WINTHOR_CODCLI adicionada em CLIENTES.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`;
    if (message.toLowerCase().includes('duplicate column') || message.toLowerCase().includes('already exists')) {
      console.log('Coluna WINTHOR_CODCLI já existe em CLIENTES.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_CLIENTES_WINTHOR_CODCLI ON CLIENTES(WINTHOR_CODCLI)',
    });
    console.log('Índice único UX_CLIENTES_WINTHOR_CODCLI criado.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`;
    if (message.toLowerCase().includes('duplicate key name') || message.toLowerCase().includes('already exists')) {
      console.log('Índice UX_CLIENTES_WINTHOR_CODCLI já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE CLIENTE_BU_VENDEDOR (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        CLIENTE_ID INT NOT NULL,
        BU VARCHAR(100) NOT NULL,
        VENDEDOR_ID INT,
        ATUALIZADO_EM VARCHAR(19),
        FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID)
      )`,
    });
    console.log('Tabela CLIENTE_BU_VENDEDOR criada.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`;
    if (message.toLowerCase().includes('already exists')) {
      console.log('Tabela CLIENTE_BU_VENDEDOR já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_CLIENTE_BU_UNICO ON CLIENTE_BU_VENDEDOR(CLIENTE_ID, BU)',
    });
    console.log('Índice único UX_CLIENTE_BU_UNICO criado.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`;
    if (message.toLowerCase().includes('duplicate key name') || message.toLowerCase().includes('already exists')) {
      console.log('Índice UX_CLIENTE_BU_UNICO já existe.');
    } else {
      throw error;
    }
  }
}

function getDataLoaderId(createResponse) {
  return (
    createResponse?.result?.id
    || createResponse?.result?.dataLoaderId
    || createResponse?.id
    || createResponse?.dataLoaderId
    || null
  );
}

async function importarClientesDoWinthor() {
  console.log('Obtendo ou criando Data Loader de clientes do Winthor...');

  let dataLoaderId = null;
  const dataLoaders = await listDataLoadersMitra({ projectId });
  const existingLoader = (dataLoaders?.result || []).find((loader) => {
    const loaderName = loader?.name || loader?.NAME || '';
    return loaderName === DATA_LOADER_NAME;
  });

  if (existingLoader) {
    dataLoaderId = Number(existingLoader.id || existingLoader.dataLoaderId || existingLoader.ID || 0) || null;
  }

  if (dataLoaderId) {
    try {
      await updateDataLoaderMitra({
        projectId,
        dataLoaderId,
        name: DATA_LOADER_NAME,
        jdbcId: WINTHOR_JDBC_ID,
        query: CLIENTES_QUERY,
      });
      console.log(`Data Loader ${dataLoaderId} atualizado.`);
    } catch {
      dataLoaderId = null;
    }
  }

  if (!dataLoaderId) {
    const createResponse = await createDataLoaderMitra({
      projectId,
      jdbcId: WINTHOR_JDBC_ID,
      name: DATA_LOADER_NAME,
      query: CLIENTES_QUERY,
      runWhenCreate: false,
    });

    dataLoaderId = getDataLoaderId(createResponse);
    if (!dataLoaderId) {
      throw new Error(`Não foi possível obter o ID do Data Loader (${DATA_LOADER_NAME}).`);
    }

    console.log(`Data Loader criado com ID ${dataLoaderId}.`);
  }

  console.log(`Executando importação via Data Loader ${dataLoaderId}...`);
  await executeDataLoaderMitra({
    projectId,
    dataLoaderId,
  });

  console.log(`Staging ${STAGING_TABLE} atualizada. Iniciando upsert para CLIENTES e CLIENTE_BU_VENDEDOR...`);

  await runDmlMitra({
    projectId,
    sql: CLEANUP_CLIENTES_SQL,
  });

  await runDmlMitra({
    projectId,
    sql: UPSERT_CLIENTES_SQL,
  });

  await runDmlMitra({
    projectId,
    sql: UPSERT_CLIENTE_BU_SQL,
  });

  console.log('Upsert concluído: CLIENTES agora usa dados importados do Winthor.');
  return dataLoaderId;
}

function getServerFunctionId(payload) {
  return (
    payload?.result?.serverFunctionId
    || payload?.serverFunctionId
    || payload?.result?.id
    || payload?.id
    || null
  );
}

function buildSyncCode(dataLoaderId) {
  return `
    const { executeDataLoaderMitra, runDmlMitra } = require('mitra-sdk');
    const projectId = Number(process.env.MITRA_PROJECT_ID);

    await executeDataLoaderMitra({ projectId, dataLoaderId: ${dataLoaderId} });
    await runDmlMitra({ projectId, sql: ${JSON.stringify(CLEANUP_CLIENTES_SQL)} });
    await runDmlMitra({ projectId, sql: ${JSON.stringify(UPSERT_CLIENTES_SQL)} });
    await runDmlMitra({ projectId, sql: ${JSON.stringify(UPSERT_CLIENTE_BU_SQL)} });

    return {
      message: 'Sincronização de clientes Winthor concluída',
      dataLoaderId: ${dataLoaderId},
      syncedAt: new Date().toISOString(),
    };
  `;
}

async function configurarSincronizacaoAutomatica(dataLoaderId) {
  const allFunctions = await listServerFunctionsMitra({ projectId });
  const existing = allFunctions?.result?.find((fn) => fn.name === SYNC_SF_NAME) || null;
  const code = buildSyncCode(dataLoaderId);

  let serverFunctionId = null;

  if (existing) {
    serverFunctionId = existing.id;
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId,
      code,
      description: 'Sincroniza clientes do Winthor/TOTVS (CODCLI PK), segmento por RAMO e relação cliente/BU/vendedor',
    });
    console.log(`SF ${SYNC_SF_NAME} atualizada (ID ${serverFunctionId}).`);
  } else {
    const created = await createServerFunctionMitra({
      projectId,
      name: SYNC_SF_NAME,
      type: 'JAVASCRIPT',
      code,
      description: 'Sincroniza clientes do Winthor/TOTVS (CODCLI PK), segmento por RAMO e relação cliente/BU/vendedor',
    });
    serverFunctionId = getServerFunctionId(created);
    console.log(`SF ${SYNC_SF_NAME} criada (ID ${serverFunctionId}).`);
  }

  if (!serverFunctionId) {
    throw new Error('Não foi possível resolver o ID da SF de sincronização do Winthor.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    cronExpression: SYNC_CRON,
  });

  console.log(`Cron ${SYNC_CRON} aplicado na SF ${serverFunctionId} (a cada 2 dias as 04:00).`);
}

async function main() {
  await garantirColunaDeChaveExterna();
  const dataLoaderId = await importarClientesDoWinthor();
  await configurarSincronizacaoAutomatica(dataLoaderId);
  console.log('Importação e sincronização automática finalizadas com sucesso.');
}

main().catch((error) => {
  console.error('Falha na importação de clientes do Winthor:');
  console.error(error?.message || error);
  process.exit(1);
});
