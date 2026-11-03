import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

async function upsertServerFunction(definition) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((fn) => fn.name === definition.name);
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
  return extractSfId(created);
}

await runDdlMitra({
  projectId,
  sql: `CREATE TABLE IF NOT EXISTS METAS_BU_VENDEDOR_RAMO_UF (
    AUTO_ID INT AUTO_INCREMENT PRIMARY KEY,
    CODFILIAL INT NOT NULL,
    CODEPTO INT NOT NULL,
    VENDEDOR_ID INT NOT NULL,
    MES INT NOT NULL,
    ANO INT NOT NULL,
    RAMO_CODE VARCHAR(120) NOT NULL,
    RAMO_NOME VARCHAR(200),
    UF VARCHAR(30) NOT NULL,
    PERCENTUAL_META DECIMAL(10,4) NOT NULL DEFAULT 0,
    META_VALOR DECIMAL(15,2) NOT NULL DEFAULT 0,
    CRIADO_POR VARCHAR(150),
    CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UX_METAS_BU_VENDEDOR_RAMO_UF (CODFILIAL, CODEPTO, VENDEDOR_ID, ANO, MES, RAMO_CODE, UF),
    KEY IX_METAS_BU_VENDEDOR_RAMO_UF_PERIODO (CODFILIAL, CODEPTO, ANO, MES),
    KEY IX_METAS_BU_VENDEDOR_RAMO_UF_VENDEDOR (VENDEDOR_ID, ANO, MES)
  )`,
});

const saveSfId = await upsertServerFunction({
  name: 'painelCoordenadorSalvarMetaVendedorRamoUf',
  description: 'Cria ou atualiza a meta personalizada de um vendedor por ramo de atividade e UF dentro da BU e periodo.',
  code: `
    INSERT INTO METAS_BU_VENDEDOR_RAMO_UF (CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, RAMO_CODE, RAMO_NOME, UF, PERCENTUAL_META, META_VALOR, CRIADO_POR, CREATED_AT, UPDATED_AT)
    SELECT
      CAST('{{codfilial}}' AS UNSIGNED),
      CAST('{{codepto}}' AS UNSIGNED),
      CAST('{{vendedorId}}' AS UNSIGNED),
      CAST('{{mes}}' AS UNSIGNED),
      CAST('{{ano}}' AS UNSIGNED),
      '{{ramoCode}}',
      '{{ramoNome}}',
      '{{uf}}',
      CAST('{{percentual}}' AS DECIMAL(10,4)),
      CAST('{{metaValor}}' AS DECIMAL(15,2)),
      COALESCE(U.DESCR, CONCAT('USER ', U.ID)),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM INT_USER U
    JOIN COORDENADORES C ON C.USER_ID = U.ID AND COALESCE(C.ATIVO, TRUE) = TRUE
    JOIN COORDENADORES_BU CB
      ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
     AND CB.CODFILIAL = CAST('{{codfilial}}' AS UNSIGNED)
     AND CB.CODEPTO = CAST('{{codepto}}' AS UNSIGNED)
    WHERE U.ID = :VAR_USER
      AND EXISTS (
        SELECT 1
        FROM BU_VENDEDOR BV
        WHERE BV.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED)
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
      )
    ON DUPLICATE KEY UPDATE
      RAMO_NOME = VALUES(RAMO_NOME),
      PERCENTUAL_META = VALUES(PERCENTUAL_META),
      META_VALOR = VALUES(META_VALOR),
      CRIADO_POR = VALUES(CRIADO_POR),
      UPDATED_AT = CURRENT_TIMESTAMP
  `,
});

console.log(JSON.stringify({ painelCoordenadorSalvarMetaVendedorRamoUf: saveSfId }, null, 2));
