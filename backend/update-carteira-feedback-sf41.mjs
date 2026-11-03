import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
  createServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const jdbcId = 1;

const BU_EFETIVA_SQL = `COALESCE(
  NULLIF(TRIM('{{idBu}}'), ''),
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = :VAR_USER
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
  ),
  'PADRAO'
)`;

const BU_POR_VENDEDOR_SQL = (vendedorExpr) => `COALESCE(
  (
    SELECT MIN(COALESCE(NULLIF(TRIM(BV.BU_CODIGO), ''), 'PADRAO'))
    FROM BU_VENDEDOR BV
    WHERE BV.VENDEDOR_ID = ${vendedorExpr}
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
  ),
  'PADRAO'
)`;

const SQL_VALIDAR_ADICAO = `
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM CLIENTES C
        WHERE C.ID = {{clienteId}}
      ) THEN 'CLIENTE_NAO_ENCONTRADO'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
      ) THEN 'JA_NA_SUA_CARTEIRA'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
      ) THEN 'MESMA_BU_OCUPADA'
      ELSE 'SUCCESS'
    END AS STATUS,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM CLIENTES C
        WHERE C.ID = {{clienteId}}
      ) THEN 'Cliente não encontrado para vinculação.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
      ) THEN 'Cliente já está na sua carteira.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
      ) THEN 'Este cliente já pertence à carteira de um vendedor da sua BU.'
      ELSE 'Cliente disponível para adicionar na carteira.'
    END AS MESSAGE
`;

const SQL_INSERIR_ADICAO = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM)
  SELECT
    {{clienteId}},
    :VAR_USER,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE EXISTS (
    SELECT 1
    FROM CLIENTES C
    WHERE C.ID = {{clienteId}}
  )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR = :VAR_USER
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND ${BU_POR_VENDEDOR_SQL('EC.ID_VENDEDOR')} = ${BU_EFETIVA_SQL}
    )
`;

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const functions = list?.result || [];

  const sf41 = functions.find((item) => item.id === 41 || item.name === 'adicionarClienteMinhaCarteira');
  if (!sf41) {
    throw new Error('SF 41 (adicionarClienteMinhaCarteira) não encontrada.');
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf41.id,
    code: SQL_VALIDAR_ADICAO,
    description:
      'Valida inclusão de cliente na carteira e retorna status/mensagem explícitos para cliente inexistente, duplicata própria e conflito de mesma BU.',
    jdbcId,
  });

  let sfInserir = functions.find((item) => item.name === 'inserirClienteMinhaCarteira');

  if (sfInserir) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: sfInserir.id,
      code: SQL_INSERIR_ADICAO,
      description:
        'Insere cliente na carteira do usuário logado apenas quando não há duplicata própria nem conflito de vendedor da mesma BU.',
      jdbcId,
    });
  } else {
    const created = await createServerFunctionMitra({
      projectId,
      name: 'inserirClienteMinhaCarteira',
      type: 'SQL',
      code: SQL_INSERIR_ADICAO,
      description:
        'Insere cliente na carteira do usuário logado apenas quando não há duplicata própria nem conflito de vendedor da mesma BU.',
      jdbcId,
    });

    sfInserir = { id: created?.result?.serverFunctionId, name: 'inserirClienteMinhaCarteira' };
  }

  console.log('SF de feedback e SF de inserção da carteira atualizadas com sucesso.');
  console.log(
    JSON.stringify(
      {
        validarSf: { id: sf41.id, name: sf41.name },
        inserirSf: { id: sfInserir?.id, name: sfInserir?.name },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Erro ao atualizar feedback explícito da carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
