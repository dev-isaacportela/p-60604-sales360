import 'dotenv/config';
import { configureSdkMitra, runDdlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

async function criarTabelaLocalVendedorRca() {
  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS VENDEDOR_RCA (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        USER_ID INT NOT NULL,
        COD_RCA INT NOT NULL,
        RCA_NOME VARCHAR(200),
        SUPERVISOR_NOME VARCHAR(200),
        ATIVO BOOLEAN DEFAULT TRUE,
        ATUALIZADO_EM VARCHAR(19),
        UNIQUE KEY UX_VENDEDOR_RCA_USER (USER_ID),
        UNIQUE KEY UX_VENDEDOR_RCA_COD (COD_RCA),
        KEY IX_VENDEDOR_RCA_ATIVO (ATIVO)
      )
    `,
  });

  console.log('Tabela local VENDEDOR_RCA criada/validada com sucesso.');
}

criarTabelaLocalVendedorRca().catch((error) => {
  console.error('Erro ao criar tabela local VENDEDOR_RCA:', error);
  process.exit(1);
});
