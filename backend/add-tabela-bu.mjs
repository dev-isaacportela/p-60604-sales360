import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

async function ensureTabelaBu() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE BU (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        CODIGO VARCHAR(100) NOT NULL,
        NOME VARCHAR(150) NOT NULL,
        ATIVO BOOLEAN DEFAULT TRUE,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela BU criada.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
    if (message.includes('already exists')) {
      console.log('Tabela BU já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_BU_CODIGO ON BU(CODIGO)',
    });
    console.log('Índice UX_BU_CODIGO criado.');
  } catch (error) {
    const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
    if (message.includes('duplicate key name') || message.includes('already exists')) {
      console.log('Índice UX_BU_CODIGO já existe.');
    } else {
      throw error;
    }
  }
}

async function popularBuInicial() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT DISTINCT
        origem.CODIGO,
        origem.NOME,
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM (
        SELECT
          COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO') AS CODIGO,
          COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO') AS NOME
        FROM CLIENTE_BU_VENDEDOR CBV

        UNION

        SELECT
          COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') AS CODIGO,
          COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') AS NOME
        FROM EQUIPE_CLIENTE EC
      ) origem
      WHERE NOT EXISTS (
        SELECT 1
        FROM BU B
        WHERE B.CODIGO = origem.CODIGO
      )
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        'PADRAO',
        'PADRAO',
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE NOT EXISTS (
        SELECT 1 FROM BU WHERE CODIGO = 'PADRAO'
      )
    `,
  });

  console.log('Carga inicial da tabela BU concluída.');
}

async function main() {
  await ensureTabelaBu();
  await popularBuInicial();
  console.log('Tabela BU pronta para uso.');
}

main().catch((error) => {
  console.error('Erro ao criar tabela BU:');
  console.error(error?.message || error);
  process.exit(1);
});
