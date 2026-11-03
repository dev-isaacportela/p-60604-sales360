import 'dotenv/config';
import { configureSdkMitra, runDmlMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const COD_RCA = 936;
const RCA_NOME = 'ANNA TERRA RODRIGUES MORAIS E M';
const COD_SUPERVISOR = 7;

async function main() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO RCA_TOTVS (COD_RCA, RCA_NOME, SUPERVISOR_NOME, COD_SUPERVISOR, ATIVO, ATUALIZADO_EM)
      SELECT
        ${COD_RCA},
        '${RCA_NOME}',
        COALESCE((SELECT S.RCA_NOME FROM RCA_TOTVS S WHERE S.COD_RCA = ${COD_SUPERVISOR} LIMIT 1), 'RCA ${COD_SUPERVISOR}'),
        ${COD_SUPERVISOR},
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      ON DUPLICATE KEY UPDATE
        RCA_NOME = VALUES(RCA_NOME),
        SUPERVISOR_NOME = VALUES(SUPERVISOR_NOME),
        COD_SUPERVISOR = VALUES(COD_SUPERVISOR),
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });

  const validation = await runQueryMitra({
    projectId,
    sql: `
      SELECT COD_RCA, RCA_NOME, COD_SUPERVISOR, SUPERVISOR_NOME, ATIVO
      FROM RCA_TOTVS
      WHERE COD_RCA = ${COD_RCA}
    `,
  });

  console.log(JSON.stringify(validation?.result?.rows || validation?.rows || validation?.result || validation, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
