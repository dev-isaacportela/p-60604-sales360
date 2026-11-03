import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runDmlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const SF_LISTAR_SEGMENTOS = 'listarSegmentosClientes';

const LISTAR_SEGMENTOS_CODE = `
  SELECT
    S.ID,
    S.NOME,
    S.ATIVO,
    COALESCE(S.ORDEM, 0) AS ORDEM
  FROM SEGMENTOS S
  WHERE COALESCE(S.ATIVO, TRUE) = TRUE
  ORDER BY COALESCE(S.ORDEM, 999999), S.NOME
`;

async function ensureTabelaSegmentos() {
  await runDdlMitra({
    projectId,
    sql: `
      CREATE TABLE IF NOT EXISTS SEGMENTOS (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        NOME VARCHAR(120) NOT NULL,
        ATIVO BOOLEAN DEFAULT TRUE,
        ORDEM INT DEFAULT 0,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19),
        UNIQUE KEY UK_SEGMENTOS_NOME (NOME)
      )
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO SEGMENTOS (NOME, ATIVO, ORDEM, CRIADO_EM, ATUALIZADO_EM)
      SELECT DISTINCT
        TRIM(C.SEGMENTO) AS NOME,
        TRUE,
        0,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM CLIENTES C
      WHERE COALESCE(TRIM(C.SEGMENTO), '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM SEGMENTOS S
          WHERE UPPER(TRIM(S.NOME)) = UPPER(TRIM(C.SEGMENTO))
        )
    `,
  });
}

async function upsertListarSegmentos() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed.result || []).find((sf) => sf.name === SF_LISTAR_SEGMENTOS);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: LISTAR_SEGMENTOS_CODE,
      description: 'Lista segmentos ativos para seleção nos formulários de clientes.',
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SF_LISTAR_SEGMENTOS,
    type: 'SQL',
    code: LISTAR_SEGMENTOS_CODE,
    description: 'Lista segmentos ativos para seleção nos formulários de clientes.',
  });
  return created.result?.serverFunctionId;
}

async function main() {
  await ensureTabelaSegmentos();
  const sfId = await upsertListarSegmentos();
  console.log('Tabela SEGMENTOS pronta.');
  console.log(`${SF_LISTAR_SEGMENTOS}: ${sfId}`);
}

main().catch((error) => {
  console.error('Falha ao preparar dropdown de segmentos:', error);
  process.exit(1);
});
