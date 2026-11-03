import 'dotenv/config';
import {
  configureSdkMitra,
  listTablesMitra,
  runDdlMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function isAlreadyExistsError(error) {
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists')
    || text.includes('duplicate key name')
    || text.includes('duplicate')
    || text.includes('exists');
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: criado`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label}: ja existe`);
      return;
    }
    throw error;
  }
}

function extractTables(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

async function assertTablesCreated() {
  const response = await listTablesMitra({ projectId });
  const tables = extractTables(response);
  const required = ['COORDENADORES', 'COORDENADORES_BU', 'METAS_BU', 'FERIAS_VENDEDOR'];
  const existing = new Set(tables.map((table) => table.name));
  const missing = required.filter((tableName) => !existing.has(tableName));

  if (missing.length > 0) {
    throw new Error(`Tabelas nao encontradas apos DDL: ${missing.join(', ')}`);
  }

  console.log(`Tabelas validadas: ${required.join(', ')}`);
}

async function main() {
  await runDdlSafe(`CREATE TABLE COORDENADORES (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    COD_SUPERVISOR INT NOT NULL,
    NOME VARCHAR(100) NOT NULL,
    EMAIL VARCHAR(150),
    USER_ID INT,
    ATIVO BOOLEAN DEFAULT TRUE,
    CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, 'Tabela COORDENADORES');

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_COORDENADORES_COD_SUPERVISOR ON COORDENADORES(COD_SUPERVISOR)',
    'Indice UX_COORDENADORES_COD_SUPERVISOR',
  );
  await runDdlSafe(
    'CREATE INDEX IX_COORDENADORES_USER_ID ON COORDENADORES(USER_ID)',
    'Indice IX_COORDENADORES_USER_ID',
  );

  await runDdlSafe(`CREATE TABLE COORDENADORES_BU (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    COD_SUPERVISOR INT NOT NULL,
    CODFILIAL INT NOT NULL,
    CODEPTO INT NOT NULL,
    FOREIGN KEY (COD_SUPERVISOR) REFERENCES COORDENADORES(COD_SUPERVISOR)
  )`, 'Tabela COORDENADORES_BU');

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_COORDENADORES_BU_ESCOPO ON COORDENADORES_BU(COD_SUPERVISOR, CODFILIAL, CODEPTO)',
    'Indice UX_COORDENADORES_BU_ESCOPO',
  );
  await runDdlSafe(
    'CREATE INDEX IX_COORDENADORES_BU_BU ON COORDENADORES_BU(CODFILIAL, CODEPTO)',
    'Indice IX_COORDENADORES_BU_BU',
  );

  await runDdlSafe(`CREATE TABLE METAS_BU (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    CODFILIAL INT NOT NULL,
    CODEPTO INT NOT NULL,
    MES INT NOT NULL,
    ANO INT NOT NULL,
    META_VALOR DECIMAL(15,2) NOT NULL DEFAULT 0,
    CRIADO_POR VARCHAR(100),
    CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, 'Tabela METAS_BU');

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_METAS_BU_PERIODO ON METAS_BU(CODFILIAL, CODEPTO, ANO, MES)',
    'Indice UX_METAS_BU_PERIODO',
  );
  await runDdlSafe(
    'CREATE INDEX IX_METAS_BU_PERIODO ON METAS_BU(ANO, MES)',
    'Indice IX_METAS_BU_PERIODO',
  );

  await runDdlSafe(`CREATE TABLE FERIAS_VENDEDOR (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    COD_RCA INT NOT NULL,
    RCA VARCHAR(100),
    DT_INICIO DATE NOT NULL,
    DT_FIM DATE NOT NULL,
    COD_RCA_SUBSTITUTO INT NOT NULL,
    RCA_SUBSTITUTO VARCHAR(100),
    ATIVO BOOLEAN DEFAULT TRUE,
    CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, 'Tabela FERIAS_VENDEDOR');

  await runDdlSafe(
    'CREATE INDEX IX_FERIAS_VENDEDOR_RCA_PERIODO ON FERIAS_VENDEDOR(COD_RCA, DT_INICIO, DT_FIM, ATIVO)',
    'Indice IX_FERIAS_VENDEDOR_RCA_PERIODO',
  );
  await runDdlSafe(
    'CREATE INDEX IX_FERIAS_VENDEDOR_SUBSTITUTO ON FERIAS_VENDEDOR(COD_RCA_SUBSTITUTO, ATIVO)',
    'Indice IX_FERIAS_VENDEDOR_SUBSTITUTO',
  );

  await assertTablesCreated();
  console.log('Parte 1 concluida.');
}

main().catch((error) => {
  console.error('Erro ao criar tabelas da Parte 1:');
  console.error(error?.message || error);
  process.exit(1);
});
