import 'dotenv/config';
import { configureSdkMitra, runDmlMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const USER_ID = 8;
const EMAIL = 'comunicacao@benenutri.com';
const COD_SUPERVISOR = 868;
const NOME_COORDENADOR = 'Comunicacao Benenutri';
const CODEPTO = 9;
const FILIAIS = [1, 2, 6];

async function query(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function assertTargetUser() {
  const rows = await query(`
    SELECT ID, DESCR
    FROM INT_USER
    WHERE ID = ${USER_ID}
      AND LOWER(DESCR) = '${EMAIL}'
  `);

  if (rows.length !== 1) {
    throw new Error(`Usuario ${EMAIL} nao encontrado com ID ${USER_ID}.`);
  }
}

async function applyCoordinatorRole() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO USUARIO_CARGO (USER_ID, CARGO, ATUALIZADO_EM)
      VALUES (${USER_ID}, 'COORDENADOR', SUBSTRING(CURRENT_TIMESTAMP, 1, 19))
      ON DUPLICATE KEY UPDATE
        CARGO = 'COORDENADOR',
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO COORDENADORES (COD_SUPERVISOR, NOME, EMAIL, USER_ID, ATIVO, CREATED_AT)
      VALUES (${COD_SUPERVISOR}, '${NOME_COORDENADOR}', '${EMAIL}', ${USER_ID}, TRUE, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        NOME = VALUES(NOME),
        EMAIL = VALUES(EMAIL),
        USER_ID = VALUES(USER_ID),
        ATIVO = TRUE
    `,
  });

  for (const filial of FILIAIS) {
    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO COORDENADORES_BU (COD_SUPERVISOR, CODFILIAL, CODEPTO)
        VALUES (${COD_SUPERVISOR}, ${filial}, ${CODEPTO})
        ON DUPLICATE KEY UPDATE
          COD_SUPERVISOR = VALUES(COD_SUPERVISOR),
          CODFILIAL = VALUES(CODFILIAL),
          CODEPTO = VALUES(CODEPTO)
      `,
    });
  }
}

async function validate() {
  const cargo = await query(`
    SELECT UC.USER_ID, U.DESCR, UC.CARGO, UC.ATUALIZADO_EM
    FROM USUARIO_CARGO UC
    JOIN INT_USER U ON U.ID = UC.USER_ID
    WHERE UC.USER_ID = ${USER_ID}
  `);

  const coordenador = await query(`
    SELECT COD_SUPERVISOR, NOME, EMAIL, USER_ID, ATIVO
    FROM COORDENADORES
    WHERE COD_SUPERVISOR = ${COD_SUPERVISOR}
      AND USER_ID = ${USER_ID}
  `);

  const bus = await query(`
    SELECT COD_SUPERVISOR, CODFILIAL, CODEPTO
    FROM COORDENADORES_BU
    WHERE COD_SUPERVISOR = ${COD_SUPERVISOR}
      AND CODEPTO = ${CODEPTO}
      AND CODFILIAL IN (${FILIAIS.join(',')})
    ORDER BY CODFILIAL
  `);

  const coverage = await query(`
    SELECT
      COUNT(DISTINCT CODCLI) AS CLIENTES,
      COUNT(*) AS ITENS,
      ROUND(SUM(COALESCE(TOTAL, 0)), 2) AS VALOR
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA
    WHERE CODEPTO = ${CODEPTO}
      AND CODFILIAL IN (${FILIAIS.join(',')})
  `);

  return { cargo, coordenador, bus, coverage };
}

async function main() {
  await assertTargetUser();
  await applyCoordinatorRole();
  const result = await validate();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Falha ao transformar comunicacao em gestor coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
