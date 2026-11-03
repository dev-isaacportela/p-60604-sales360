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

const LISTAR_CURVAS_NAME = 'listarCurvasMinhaCarteira';
const ATUALIZAR_CURVA_NAME = 'atualizarCurvaClienteCarteira';

const LISTAR_CURVAS_CODE = `
  SELECT
    EC.ID_CLIENTE,
    MAX(UPPER(TRIM(COALESCE(EC.CURVA_CLASSIFICACAO, '')))) AS CURVA
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    AND COALESCE(NULLIF(TRIM(EC.CURVA_CLASSIFICACAO), ''), '') <> ''
  GROUP BY EC.ID_CLIENTE
`;

const ATUALIZAR_CURVA_CODE = `
  UPDATE EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  SET EC.CURVA_CLASSIFICACAO = CASE
    WHEN UPPER(TRIM('{{curva}}')) IN ('A', 'B', 'C', 'D') THEN UPPER(TRIM('{{curva}}'))
    ELSE NULL
  END
  WHERE EC.ID_CLIENTE = {{clienteId}}
    AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
`;

async function addColumnIfNeeded() {
  try {
    await runDdlMitra({
      projectId,
      sql: "ALTER TABLE EQUIPE_CLIENTE ADD COLUMN CURVA_CLASSIFICACAO VARCHAR(1) NULL",
    });
    console.log('Coluna CURVA_CLASSIFICACAO adicionada em EQUIPE_CLIENTE.');
  } catch (error) {
    const message = String(error?.message?.message || error?.details?.error?.message || error?.message || error || '');
    if (message.toLowerCase().includes('duplicate column')) {
      console.log('Coluna CURVA_CLASSIFICACAO já existe em EQUIPE_CLIENTE.');
      return;
    }
    throw error;
  }
}

async function upsertServerFunction(name, code, description) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed.result || []).find((sf) => sf.name === name);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code,
      description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name,
    type: 'SQL',
    code,
    description,
  });
  return created.result?.serverFunctionId;
}

async function main() {
  await addColumnIfNeeded();

  const listarCurvasId = await upsertServerFunction(
    LISTAR_CURVAS_NAME,
    LISTAR_CURVAS_CODE,
    'Lista curva manual A/B/C/D por cliente da carteira do vendedor logado.',
  );

  const atualizarCurvaId = await upsertServerFunction(
    ATUALIZAR_CURVA_NAME,
    ATUALIZAR_CURVA_CODE,
    'Atualiza curva manual A/B/C/D do cliente na carteira do vendedor logado.',
  );

  console.log('SFs prontas:');
  console.log(`- ${LISTAR_CURVAS_NAME}: ${listarCurvasId}`);
  console.log(`- ${ATUALIZAR_CURVA_NAME}: ${atualizarCurvaId}`);
}

main().catch((error) => {
  console.error('Falha ao preparar curva manual da carteira:', error);
  process.exit(1);
});
