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
const DATA_LOADER_NAME = 'RCAS_TOTVS_UNICOS';
const STAGING_TABLE = 'IMP_RCAS_TOTVS_UNICOS';
const SF_LISTAR_RCAS = 'listarRcasTotvs';

const QUERY_RCAS_UNICOS = `
  SELECT DISTINCT
    u.codusur AS COD_RCA,
    u.nome AS RCA,
    COALESCE(r.nome, '') AS SUPERVISOR,
    (
      SELECT MIN(u2.codusur)
      FROM pcusuari u2
      WHERE r.nome IS NOT NULL
        AND TRIM(UPPER(u2.nome)) = TRIM(UPPER(r.nome))
    ) AS COD_SUPERVISOR
  FROM pcusuari u
  LEFT JOIN pcsuperv r ON r.codsupervisor = u.codsupervisor
  WHERE u.codusur IS NOT NULL
`;

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

function resolveDataLoaderId(payload) {
  return payload?.result?.id || payload?.result?.dataLoaderId || payload?.id || payload?.dataLoaderId || null;
}

async function ensureRcaTable() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE RCA_TOTVS (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        COD_RCA INT NOT NULL,
        RCA_NOME VARCHAR(200),
        SUPERVISOR_NOME VARCHAR(200),
        COD_SUPERVISOR INT,
        ATIVO BOOLEAN DEFAULT TRUE,
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela RCA_TOTVS criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('already exists')) throw error;
    console.log('Tabela RCA_TOTVS já existe.');
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_RCA_TOTVS_COD ON RCA_TOTVS(COD_RCA)',
    });
    console.log('Índice único UX_RCA_TOTVS_COD criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('duplicate key name') && !text.includes('already exists')) throw error;
    console.log('Índice UX_RCA_TOTVS_COD já existe.');
  }
}

async function upsertDataLoader() {
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => {
    const name = loader?.name || loader?.NAME || '';
    return name === DATA_LOADER_NAME;
  });

  let dataLoaderId = existing ? Number(existing.id || existing.dataLoaderId || 0) : null;

  if (dataLoaderId) {
    try {
      await updateDataLoaderMitra({
        projectId,
        dataLoaderId,
        name: DATA_LOADER_NAME,
        jdbcId: WINTHOR_JDBC_ID,
        query: QUERY_RCAS_UNICOS,
      });
      return dataLoaderId;
    } catch {
      dataLoaderId = null;
    }
  }

  const created = await createDataLoaderMitra({
    projectId,
    jdbcId: WINTHOR_JDBC_ID,
    name: DATA_LOADER_NAME,
    query: QUERY_RCAS_UNICOS,
    runWhenCreate: false,
  });

  dataLoaderId = resolveDataLoaderId(created);
  if (!dataLoaderId) {
    throw new Error('Não foi possível obter o ID do Data Loader RCAS_TOTVS_UNICOS.');
  }

  return dataLoaderId;
}

async function ensureCodSupervisorColumn() {
  try {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE RCA_TOTVS ADD COLUMN COD_SUPERVISOR INT',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('duplicate column') && !text.includes('already exists')) throw error;
  }
}

async function persistRcasSemRepeticao() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO RCA_TOTVS (COD_RCA, RCA_NOME, SUPERVISOR_NOME, COD_SUPERVISOR, ATIVO, ATUALIZADO_EM)
      SELECT
        X.COD_RCA,
        X.RCA,
        X.SUPERVISOR,
        X.COD_SUPERVISOR,
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM (
        SELECT
          COD_RCA,
          MAX(RCA) AS RCA,
          MAX(SUPERVISOR) AS SUPERVISOR,
          MAX(COD_SUPERVISOR) AS COD_SUPERVISOR
        FROM ${STAGING_TABLE}
        WHERE COD_RCA IS NOT NULL
        GROUP BY COD_RCA
      ) X
      ON DUPLICATE KEY UPDATE
        RCA_NOME = VALUES(RCA_NOME),
        SUPERVISOR_NOME = VALUES(SUPERVISOR_NOME),
        COD_SUPERVISOR = VALUES(COD_SUPERVISOR),
        ATIVO = VALUES(ATIVO),
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });
}

async function upsertListarRcasSf() {
  const sfCode = `
    SELECT
      COD_RCA,
      RCA_NOME,
      SUPERVISOR_NOME,
      COD_SUPERVISOR,
      ATIVO,
      ATUALIZADO_EM
    FROM RCA_TOTVS
    ORDER BY RCA_NOME
  `;

  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === SF_LISTAR_RCAS);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: sfCode,
      description: 'Lista todos os RCAs únicos importados do TOTVS',
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SF_LISTAR_RCAS,
    type: 'SQL',
    code: sfCode,
    description: 'Lista todos os RCAs únicos importados do TOTVS',
  });

  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id || null;
}

async function main() {
  await ensureRcaTable();
  await ensureCodSupervisorColumn();
  const dataLoaderId = await upsertDataLoader();
  await executeDataLoaderMitra({ projectId, dataLoaderId });
  await persistRcasSemRepeticao();
  const sfId = await upsertListarRcasSf();

  console.log('Extração de RCAs do TOTVS concluída sem repetição.');
  console.log(JSON.stringify({ dataLoaderId, serverFunctionId: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao extrair RCAs do TOTVS:');
  console.error(error?.message || error);
  process.exit(1);
});
