import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
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

const sameScope = `COALESCE(EC.CODFILIAL, '') = '{{codFilial}}'
  AND COALESCE(CAST(EC.ID_SECAO AS CHAR), '') = '{{idSecao}}'`;

const ramoClienteExpr = `CASE
    WHEN ICT_RAMO.RAMO IS NULL OR TRIM(CAST(ICT_RAMO.RAMO AS CHAR)) = '' THEN 'Sem ramo'
    ELSE TRIM(CAST(ICT_RAMO.RAMO AS CHAR))
  END`;

const SQL_DISPONIVEIS_WHERE = `
    WHERE '{{codFilial}}' <> ''
      AND '{{idSecao}}' <> ''
      AND (
        '{{busca}}' = ''
        OR C.NOME_FANTASIA LIKE '%{{busca}}%'
        OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
        OR C.CNPJ LIKE '%{{busca}}%'
        OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
        OR CAST(C.WINTHOR_CODCLI AS CHAR) LIKE '%{{busca}}%'
      )
      AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
      AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
      AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
      AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
      AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${ramoClienteExpr} = '{{ramoCliente}}')
      AND ${ramoClienteExpr} <> 'PESSOA FISICA'
      AND EXISTS (
        SELECT 1
        FROM BU_VENDEDOR UB
        WHERE UB.VENDEDOR_ID = :VAR_USER
          AND COALESCE(UB.ATIVO, TRUE) = TRUE
          AND UB.CODFILIAL = '{{codFilial}}'
          AND COALESCE(CAST(UB.ID_SECAO AS CHAR), '') = '{{idSecao}}'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = C.ID
          AND EC.ID_VENDEDOR = :VAR_USER
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = C.ID
          AND EC.ID_VENDEDOR <> :VAR_USER
          AND ${sameScope}
      )
`;

const SQL_LISTAR_DISPONIVEIS = `
  SELECT
    C.ID,
    C.RAZAO_SOCIAL,
    C.NOME_FANTASIA,
    C.CNPJ,
    C.CIDADE,
    C.UF,
    C.SEGMENTO,
    ${ramoClienteExpr} AS RAMO_CLIENTE,
    C.STATUS,
    '{{codFilial}}' AS CODFILIAL,
    CASE WHEN '{{idSecao}}' = '' THEN NULL ELSE CAST('{{idSecao}}' AS SIGNED) END AS ID_SECAO
  FROM CLIENTES C
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  ${SQL_DISPONIVEIS_WHERE}
  ORDER BY C.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_DISPONIVEIS = `
  SELECT COUNT(*) AS TOTAL
  FROM CLIENTES C
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  ${SQL_DISPONIVEIS_WHERE}
`;

const SQL_VALIDAR_ADICAO = `
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'CLIENTE_NAO_ENCONTRADO'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
          AND ${sameScope}
      ) THEN 'JA_NA_SUA_CARTEIRA'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR <> :VAR_USER
          AND ${sameScope}
      ) THEN 'MESMO_ESCOPO_OCUPADO'
      ELSE 'SUCCESS'
    END AS STATUS,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'Cliente não encontrado para vinculação.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
          AND ${sameScope}
      ) THEN 'Cliente já está na sua carteira para este escopo.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR <> :VAR_USER
          AND ${sameScope}
      ) THEN CONCAT(
        'Este cliente já está na carteira de outro vendedor no mesmo escopo: ',
        COALESCE(NULLIF('{{codFilial}}', ''), 'sem filial'),
        ' / ',
        CASE
          WHEN '{{idSecao}}' = '' THEN 'sem seção'
          ELSE COALESCE((SELECT S.NOME_SECAO FROM SECAO S WHERE S.ID = CAST('{{idSecao}}' AS SIGNED) LIMIT 1), CONCAT('Seção ', '{{idSecao}}'))
        END
      )
      ELSE 'Cliente disponível para adicionar na carteira.'
    END AS MESSAGE
`;

const SQL_INSERIR_ADICAO = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CRIADO_EM)
  SELECT
    {{clienteId}},
    :VAR_USER,
    '{{codFilial}}',
    CASE WHEN '{{idSecao}}' = '' THEN NULL ELSE CAST('{{idSecao}}' AS SIGNED) END,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}})
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR = :VAR_USER
        AND ${sameScope}
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR <> :VAR_USER
        AND ${sameScope}
    )
`;

async function main() {
  const listarDisponiveis = await readServerFunctionMitra({ projectId, serverFunctionId: 39 });
  const contarDisponiveis = await readServerFunctionMitra({ projectId, serverFunctionId: 40 });
  const validar = await readServerFunctionMitra({ projectId, serverFunctionId: 41 });
  const inserir = await readServerFunctionMitra({ projectId, serverFunctionId: 116 });

  if (!listarDisponiveis?.result) throw new Error('Função de listagem de clientes disponíveis não encontrada.');
  if (!contarDisponiveis?.result) throw new Error('Função de contagem de clientes disponíveis não encontrada.');
  if (!validar?.result) throw new Error('Função de validação da carteira não encontrada.');
  if (!inserir?.result) throw new Error('Função de inserção da carteira não encontrada.');

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 39,
    code: SQL_LISTAR_DISPONIVEIS,
    description: 'Lista clientes disponíveis excluindo sempre clientes já presentes na carteira do usuário e clientes de outro vendedor no mesmo escopo.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 40,
    code: SQL_CONTAR_DISPONIVEIS,
    description: 'Conta clientes disponíveis excluindo sempre clientes já presentes na carteira do usuário e clientes de outro vendedor no mesmo escopo.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 41,
    code: SQL_VALIDAR_ADICAO,
    description: 'Valida inclusão na carteira sem exigir filial, seção ou vínculo do vendedor; bloqueia apenas outro vendedor no mesmo escopo.',
    jdbcId,
  });

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 116,
    code: SQL_INSERIR_ADICAO,
    description: 'Insere cliente na carteira sem validar filial/seção do usuário; respeita bloqueio por outro vendedor no mesmo escopo.',
    jdbcId,
  });

  console.log('Regras de inclusão na carteira atualizadas sem validação de filial.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
