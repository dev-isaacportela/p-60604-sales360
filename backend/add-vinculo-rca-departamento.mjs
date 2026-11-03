import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

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

const sfDefinitions = [
  {
    name: 'vincularRcaDepartamento',
    description: 'Vincula um RCA a um departamento (BU) e filial do TOTVS.',
    code: `
      INSERT INTO RCA_DEPARTAMENTO (COD_RCA, COD_DEPARTAMENTO, DEPARTAMENTO_NOME, COD_FILIAL, FILIAL_NOME, ATIVO, ATUALIZADO_EM)
      SELECT
        {{codRca}},
        TRIM('{{codDepartamento}}'),
        CASE
          WHEN '{{departamentoNome}}' = '' THEN TRIM('{{codDepartamento}}')
          ELSE TRIM('{{departamentoNome}}')
        END,
        TRIM('{{codFilial}}'),
        NULLIF(TRIM('{{filialNome}}'), ''),
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE TRIM('{{codDepartamento}}') <> ''
        AND TRIM('{{codFilial}}') <> ''
      ON DUPLICATE KEY UPDATE
        DEPARTAMENTO_NOME = CASE
          WHEN '{{departamentoNome}}' = '' THEN DEPARTAMENTO_NOME
          ELSE VALUES(DEPARTAMENTO_NOME)
        END,
        FILIAL_NOME = CASE
          WHEN '{{filialNome}}' = '' THEN FILIAL_NOME
          ELSE VALUES(FILIAL_NOME)
        END,
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  },
  {
    name: 'desvincularRcaDepartamento',
    description: 'Desativa vínculo entre RCA e departamento/filial.',
    code: `
      UPDATE RCA_DEPARTAMENTO
      SET
        ATIVO = FALSE,
        ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE COD_RCA = {{codRca}}
        AND COD_DEPARTAMENTO = TRIM('{{codDepartamento}}')
        AND ('{{codFilial}}' = '' OR COD_FILIAL = TRIM('{{codFilial}}'))
    `,
  },
  {
    name: 'listarDepartamentosPorRca',
    description: 'Lista departamentos (BU) e filiais vinculados ao RCA.',
    code: `
      SELECT
        ID,
        COD_RCA,
        COD_DEPARTAMENTO,
        DEPARTAMENTO_NOME,
        COD_FILIAL,
        FILIAL_NOME,
        ATIVO,
        ATUALIZADO_EM
      FROM RCA_DEPARTAMENTO
      WHERE COD_RCA = {{codRca}}
        AND ('{{codDepartamento}}' = '' OR COD_DEPARTAMENTO = TRIM('{{codDepartamento}}'))
        AND ('{{codFilial}}' = '' OR COD_FILIAL = TRIM('{{codFilial}}'))
        AND ('{{somenteAtivos}}' = '' OR ATIVO = {{somenteAtivos}})
      ORDER BY COD_DEPARTAMENTO, COD_FILIAL
    `,
  },
];

async function ensureBuTotvsSync() {
  await runDdlSafe(
    `CREATE TABLE IF NOT EXISTS BU (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CODIGO VARCHAR(100) NOT NULL,
      NOME VARCHAR(150) NOT NULL,
      ATIVO BOOLEAN DEFAULT TRUE,
      CRIADO_EM VARCHAR(19),
      ATUALIZADO_EM VARCHAR(19)
    )`,
    ['already exists'],
  );

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_BU_CODIGO ON BU(CODIGO)',
    ['already exists', 'duplicate key name'],
  );

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        CAST(V.CODEPTO AS CHAR) AS CODIGO,
        COALESCE(NULLIF(TRIM(V.DEPARTAMENTO), ''), CAST(V.CODEPTO AS CHAR)) AS NOME,
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
      WHERE V.CODEPTO IS NOT NULL
      GROUP BY CAST(V.CODEPTO AS CHAR), COALESCE(NULLIF(TRIM(V.DEPARTAMENTO), ''), CAST(V.CODEPTO AS CHAR))
      ON DUPLICATE KEY UPDATE
        NOME = VALUES(NOME),
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });
}

async function ensureTable() {
  await runDdlSafe(
    `CREATE TABLE IF NOT EXISTS RCA_DEPARTAMENTO (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      COD_RCA INT NOT NULL,
      COD_DEPARTAMENTO VARCHAR(150) NOT NULL,
      DEPARTAMENTO_NOME VARCHAR(200),
      COD_FILIAL VARCHAR(30) NOT NULL,
      FILIAL_NOME VARCHAR(200),
      ATIVO BOOLEAN DEFAULT TRUE,
      ATUALIZADO_EM VARCHAR(19),
      UNIQUE KEY UX_RCA_DEP_FILIAL (COD_RCA, COD_DEPARTAMENTO, COD_FILIAL),
      KEY IX_RCA_DEPARTAMENTO_RCA (COD_RCA),
      KEY IX_RCA_DEPARTAMENTO_DEP (COD_DEPARTAMENTO),
      KEY IX_RCA_DEPARTAMENTO_FILIAL (COD_FILIAL),
      KEY IX_RCA_DEPARTAMENTO_ATIVO (ATIVO)
    )`,
    ['already exists'],
  );

  await runDdlSafe(
    'ALTER TABLE RCA_DEPARTAMENTO MODIFY COLUMN COD_DEPARTAMENTO VARCHAR(150) NOT NULL',
    ['doesn\'t exist', 'unknown table'],
  );

  await runDdlSafe(
    'ALTER TABLE RCA_DEPARTAMENTO ADD COLUMN COD_FILIAL VARCHAR(30) NOT NULL DEFAULT \'0\' AFTER DEPARTAMENTO_NOME',
    ['duplicate column', 'already exists'],
  );

  await runDdlSafe(
    'ALTER TABLE RCA_DEPARTAMENTO ADD COLUMN FILIAL_NOME VARCHAR(200) AFTER COD_FILIAL',
    ['duplicate column', 'already exists'],
  );

  await runDdlSafe(
    'ALTER TABLE RCA_DEPARTAMENTO DROP INDEX UX_RCA_DEPARTAMENTO',
    ['can\'t drop', 'check that column/key exists', 'doesn\'t exist'],
  );

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_RCA_DEP_FILIAL ON RCA_DEPARTAMENTO(COD_RCA, COD_DEPARTAMENTO, COD_FILIAL)',
    ['already exists', 'duplicate key name'],
  );

  await runDdlSafe(
    'CREATE INDEX IX_RCA_DEPARTAMENTO_FILIAL ON RCA_DEPARTAMENTO(COD_FILIAL)',
    ['already exists', 'duplicate key name'],
  );
}

async function upsertServerFunction(definition, existingList) {
  const existing = existingList.find((item) => item.name === definition.name);
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
  await ensureBuTotvsSync();
  await ensureTable();

  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const def of sfDefinitions) {
    ids[def.name] = await upsertServerFunction(def, existing);
  }

  console.log('Vínculo RCA x Departamento configurado com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar vínculo RCA x Departamento:');
  console.error(error?.message || error);
  process.exit(1);
});
