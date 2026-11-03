import 'dotenv/config';
import { configureSdkMitra, createJdbcConnectionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const jdbcUser = process.env.WINTHOR_DB_USER || 'mitra';
const jdbcPassword = process.env.WINTHOR_DB_PASSWORD;

async function criarIntegracaoWinthor() {
  if (!jdbcPassword) {
    throw new Error('Defina WINTHOR_DB_PASSWORD no ambiente para executar este script novamente.');
  }

  const result = await createJdbcConnectionMitra({
    projectId,
    name: 'TOTVS WINTHOR Oracle',
    type: 'oracle',
    host: '177.154.155.180',
    port: 1521,
    database: 'WINT',
    user: jdbcUser,
    password: jdbcPassword,
  });

  console.log('Conexao JDBC criada com sucesso.');
  console.log(JSON.stringify(result, null, 2));
}

criarIntegracaoWinthor().catch((error) => {
  console.error('Falha ao criar conexao JDBC TOTVS WINTHOR:');
  console.error(error?.message || error);
  process.exit(1);
});
