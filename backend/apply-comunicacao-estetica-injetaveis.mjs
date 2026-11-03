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
const COD_RCA = 868;
const COD_SUPERVISOR = 868;
const CODEPTO = '9';
const DEPARTAMENTO = 'ESTETICA E INJETAVEIS';
const FILIAIS = ['1', '2', '6'];

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

async function assertTargetDepartment() {
  const rows = await query(`
    SELECT CODIGO, NOME
    FROM BU
    WHERE CODIGO = '${CODEPTO}'
  `);

  if (rows.length !== 1) {
    throw new Error(`BU/departamento ${CODEPTO} nao encontrado.`);
  }
}

async function applyLinks() {
  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
      VALUES (${USER_ID}, ${COD_RCA}, ${COD_SUPERVISOR})
      ON DUPLICATE KEY UPDATE
        USER_ID = VALUES(USER_ID),
        COD_RCA = VALUES(COD_RCA),
        COD_SUPERVISOR = VALUES(COD_SUPERVISOR)
    `,
  });

  for (const filial of FILIAIS) {
    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO RCA_DEPARTAMENTO (
          COD_RCA,
          COD_DEPARTAMENTO,
          DEPARTAMENTO_NOME,
          COD_FILIAL,
          FILIAL_NOME,
          ATIVO,
          ATUALIZADO_EM
        ) VALUES (
          ${COD_RCA},
          '${CODEPTO}',
          '${DEPARTAMENTO}',
          '${filial}',
          NULL,
          TRUE,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        )
        ON DUPLICATE KEY UPDATE
          DEPARTAMENTO_NOME = VALUES(DEPARTAMENTO_NOME),
          ATIVO = TRUE,
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE BU_VENDEDOR
        SET
          ATIVO = TRUE,
          ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE VENDEDOR_ID = ${USER_ID}
          AND BU_CODIGO = '${CODEPTO}'
          AND CODFILIAL = '${filial}'
          AND ID_SECAO IS NULL
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO BU_VENDEDOR (
          BU_CODIGO,
          VENDEDOR_ID,
          CODFILIAL,
          ID_SECAO,
          ATIVO,
          CRIADO_EM,
          ATUALIZADO_EM
        )
        SELECT
          '${CODEPTO}',
          ${USER_ID},
          '${filial}',
          NULL,
          TRUE,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR
          WHERE VENDEDOR_ID = ${USER_ID}
            AND BU_CODIGO = '${CODEPTO}'
            AND CODFILIAL = '${filial}'
            AND ID_SECAO IS NULL
        )
      `,
    });
  }
}

async function validate() {
  const vendedorRca = await query(`
    SELECT VR.USER_ID, U.DESCR, VR.COD_RCA, VR.COD_SUPERVISOR
    FROM VENDEDOR_RCA VR
    JOIN INT_USER U ON U.ID = VR.USER_ID
    WHERE VR.USER_ID = ${USER_ID}
      AND VR.COD_RCA = ${COD_RCA}
  `);

  const rcaDepartamento = await query(`
    SELECT COD_RCA, COD_DEPARTAMENTO, DEPARTAMENTO_NOME, COD_FILIAL, ATIVO
    FROM RCA_DEPARTAMENTO
    WHERE COD_RCA = ${COD_RCA}
      AND COD_DEPARTAMENTO = '${CODEPTO}'
      AND COD_FILIAL IN ('${FILIAIS.join("','")}')
    ORDER BY COD_FILIAL
  `);

  const buVendedor = await query(`
    SELECT BU_CODIGO, VENDEDOR_ID, CODFILIAL, ID_SECAO, ATIVO
    FROM BU_VENDEDOR
    WHERE VENDEDOR_ID = ${USER_ID}
      AND BU_CODIGO = '${CODEPTO}'
      AND CODFILIAL IN ('${FILIAIS.join("','")}')
      AND ID_SECAO IS NULL
    ORDER BY CODFILIAL
  `);

  const coverage = await query(`
    SELECT
      COUNT(DISTINCT CODCLI) AS CLIENTES,
      COUNT(*) AS ITENS,
      ROUND(SUM(COALESCE(TOTAL, 0)), 2) AS VALOR
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA
    WHERE CODEPTO = ${CODEPTO}
      AND CODFILIAL IN ('${FILIAIS.join("','")}')
  `);

  return { vendedorRca, rcaDepartamento, buVendedor, coverage };
}

async function main() {
  await assertTargetUser();
  await assertTargetDepartment();
  await applyLinks();
  const result = await validate();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Falha ao aplicar regra de comunicacao para estetica e injetaveis:');
  console.error(error?.message || error);
  process.exit(1);
});
