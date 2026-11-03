import 'dotenv/config';
import {
  configureSdkMitra,
  runDmlMitra,
  runQueryMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const vendedorId = 14;

async function query(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function main() {
  const before = await query(`
    SELECT COUNT(*) AS TOTAL
    FROM BU_VENDEDOR BV
    JOIN BU B ON B.CODIGO = BV.BU_CODIGO
    JOIN SECAO S ON S.ID = BV.ID_SECAO AND S.ID_BU = B.ID
    JOIN FILIAL F ON F.CODFILIAL = BV.CODFILIAL
    WHERE BV.VENDEDOR_ID = ${vendedorId}
      AND UPPER(B.NOME) = 'ENFERMAGEM'
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND COALESCE(S.ATIVO, TRUE) = TRUE
      AND COALESCE(F.ATIVO, TRUE) = TRUE
  `);

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CRIADO_EM, ATUALIZADO_EM, CODFILIAL, ID_SECAO)
      SELECT
        B.CODIGO AS BU_CODIGO,
        ${vendedorId} AS VENDEDOR_ID,
        TRUE AS ATIVO,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS CRIADO_EM,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS ATUALIZADO_EM,
        F.CODFILIAL,
        S.ID AS ID_SECAO
      FROM BU B
      JOIN SECAO S ON S.ID_BU = B.ID AND COALESCE(S.ATIVO, TRUE) = TRUE
      JOIN FILIAL F ON COALESCE(F.ATIVO, TRUE) = TRUE
      WHERE UPPER(B.NOME) = 'ENFERMAGEM'
        AND COALESCE(B.ATIVO, TRUE) = TRUE
      ON DUPLICATE KEY UPDATE
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });

  const after = await query(`
    SELECT
      B.CODIGO AS BU_CODIGO,
      B.NOME AS BU_NOME,
      F.CODFILIAL,
      S.ID AS ID_SECAO,
      S.NOME_SECAO,
      BV.ATIVO
    FROM BU_VENDEDOR BV
    JOIN BU B ON B.CODIGO = BV.BU_CODIGO
    JOIN SECAO S ON S.ID = BV.ID_SECAO AND S.ID_BU = B.ID
    JOIN FILIAL F ON F.CODFILIAL = BV.CODFILIAL
    WHERE BV.VENDEDOR_ID = ${vendedorId}
      AND UPPER(B.NOME) = 'ENFERMAGEM'
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
      AND COALESCE(S.ATIVO, TRUE) = TRUE
      AND COALESCE(F.ATIVO, TRUE) = TRUE
    ORDER BY CAST(F.CODFILIAL AS UNSIGNED), F.CODFILIAL, S.ID
  `);

  const expected = await query(`
    SELECT COUNT(*) AS TOTAL
    FROM BU B
    JOIN SECAO S ON S.ID_BU = B.ID AND COALESCE(S.ATIVO, TRUE) = TRUE
    JOIN FILIAL F ON COALESCE(F.ATIVO, TRUE) = TRUE
    WHERE UPPER(B.NOME) = 'ENFERMAGEM'
      AND COALESCE(B.ATIVO, TRUE) = TRUE
  `);

  console.log(JSON.stringify({
    vendedorId,
    antes: Number(before[0]?.TOTAL || 0),
    esperado: Number(expected[0]?.TOTAL || 0),
    depois: after.length,
    registros: after,
  }, null, 2));

  if (after.length !== Number(expected[0]?.TOTAL || 0)) {
    throw new Error('Escopo final diferente do total esperado para enfermagem.');
  }
}

main();
