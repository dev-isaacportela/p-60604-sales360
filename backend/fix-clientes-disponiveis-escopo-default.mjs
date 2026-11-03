import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const jdbcId = 1;

const RAMO_EXPR = `CASE
  WHEN ICT_RAMO.RAMO IS NULL OR TRIM(CAST(ICT_RAMO.RAMO AS CHAR)) = '' THEN 'Sem ramo'
  ELSE TRIM(CAST(ICT_RAMO.RAMO AS CHAR))
END`;

const SCOPE_SQL = `
  SELECT
    UB.CODFILIAL,
    UB.ID_SECAO,
    UB.BU_CODIGO
  FROM BU_VENDEDOR UB
  WHERE UB.VENDEDOR_ID = :VAR_USER
    AND COALESCE(UB.ATIVO, TRUE) = TRUE
    AND COALESCE(TRIM(UB.CODFILIAL), '') <> ''
    AND UB.ID_SECAO IS NOT NULL
    AND ('{{codFilial}}' = '' OR UB.CODFILIAL = '{{codFilial}}')
    AND ('{{idSecao}}' = '' OR CAST(UB.ID_SECAO AS CHAR) = '{{idSecao}}')
  ORDER BY UB.ID DESC
  LIMIT 1
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
    ${RAMO_EXPR} AS RAMO_CLIENTE,
    C.STATUS,
    ES.CODFILIAL,
    ES.ID_SECAO
  FROM (${SCOPE_SQL}) ES
  JOIN CLIENTES C ON 1 = 1
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  WHERE (
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
    AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${RAMO_EXPR} = '{{ramoCliente}}')
    AND ${RAMO_EXPR} <> 'PESSOA FISICA'
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = C.ID
        AND EC.CODFILIAL = ES.CODFILIAL
        AND EC.ID_SECAO = ES.ID_SECAO
        AND BV.BU_CODIGO = ES.BU_CODIGO
    )
  ORDER BY C.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_DISPONIVEIS = `
  SELECT COUNT(*) AS TOTAL
  FROM (${SCOPE_SQL}) ES
  JOIN CLIENTES C ON 1 = 1
  LEFT JOIN IMP_CLIENTES_TOTVS ICT_RAMO ON CAST(ICT_RAMO.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  WHERE (
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
    AND ('{{ramoCliente}}' LIKE '{{%' OR '{{ramoCliente}}' = '' OR ${RAMO_EXPR} = '{{ramoCliente}}')
    AND ${RAMO_EXPR} <> 'PESSOA FISICA'
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = C.ID
        AND EC.CODFILIAL = ES.CODFILIAL
        AND EC.ID_SECAO = ES.ID_SECAO
        AND BV.BU_CODIGO = ES.BU_CODIGO
    )
`;

const SQL_VALIDAR_ADICAO = `
  SELECT
    CASE
      WHEN ES.CODFILIAL IS NULL THEN 'ESCOPO_NAO_VINCULADO'
      WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'CLIENTE_NAO_ENCONTRADO'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
          AND EC.CODFILIAL = ES.CODFILIAL
          AND EC.ID_SECAO = ES.ID_SECAO
      ) THEN 'JA_NA_SUA_CARTEIRA'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.CODFILIAL = ES.CODFILIAL
          AND EC.ID_SECAO = ES.ID_SECAO
          AND BV.BU_CODIGO = ES.BU_CODIGO
          AND EC.ID_VENDEDOR <> :VAR_USER
      ) THEN 'MESMO_ESCOPO_OCUPADO'
      ELSE 'SUCCESS'
    END AS STATUS,
    CASE
      WHEN ES.CODFILIAL IS NULL THEN 'Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.'
      WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'Cliente não encontrado para vinculação.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
          AND EC.CODFILIAL = ES.CODFILIAL
          AND EC.ID_SECAO = ES.ID_SECAO
      ) THEN 'Cliente já está na sua carteira para este escopo.'
      WHEN EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.CODFILIAL = ES.CODFILIAL
          AND EC.ID_SECAO = ES.ID_SECAO
          AND BV.BU_CODIGO = ES.BU_CODIGO
          AND EC.ID_VENDEDOR <> :VAR_USER
      ) THEN 'Este cliente já possui responsável no mesmo escopo da sua carteira.'
      ELSE 'Cliente disponível para adicionar na carteira.'
    END AS MESSAGE,
    ES.CODFILIAL,
    ES.ID_SECAO
  FROM (SELECT 1) D
  LEFT JOIN (${SCOPE_SQL}) ES ON 1 = 1
`;

const SQL_INSERIR_ADICAO = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CRIADO_EM)
  SELECT
    {{clienteId}},
    :VAR_USER,
    ES.CODFILIAL,
    ES.ID_SECAO,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM (${SCOPE_SQL}) ES
  WHERE EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}})
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.ID_VENDEDOR = :VAR_USER
        AND EC.CODFILIAL = ES.CODFILIAL
        AND EC.ID_SECAO = ES.ID_SECAO
    )
    AND NOT EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE EC.ID_CLIENTE = {{clienteId}}
        AND EC.CODFILIAL = ES.CODFILIAL
        AND EC.ID_SECAO = ES.ID_SECAO
        AND BV.BU_CODIGO = ES.BU_CODIGO
        AND EC.ID_VENDEDOR <> :VAR_USER
    )
`;

async function updateByName(functions, name, code, description) {
  const sf = functions.find((item) => item.name === name);
  if (!sf) throw new Error(`Server Function não encontrada: ${name}`);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf.id,
    code,
    description,
    jdbcId,
  });
  return sf.id;
}

async function main() {
  const list = await listServerFunctionsMitra({ projectId });
  const functions = list?.result || [];

  const ids = {
    listar: await updateByName(functions, 'listarClientesDisponiveisMinhaBu', SQL_LISTAR_DISPONIVEIS, 'Lista clientes disponíveis usando o escopo ativo padrão do usuário quando filial/seção não forem informados.'),
    contar: await updateByName(functions, 'contarClientesDisponiveisMinhaBu', SQL_CONTAR_DISPONIVEIS, 'Conta clientes disponíveis usando o escopo ativo padrão do usuário quando filial/seção não forem informados.'),
    validar: await updateByName(functions, 'adicionarClienteMinhaCarteira', SQL_VALIDAR_ADICAO, 'Valida inclusão na carteira resolvendo automaticamente o escopo ativo do usuário quando necessário.'),
    inserir: await updateByName(functions, 'inserirClienteMinhaCarteira', SQL_INSERIR_ADICAO, 'Insere cliente na carteira usando o escopo ativo padrão do usuário quando filial/seção não forem informados.'),
  };

  const input = {
    busca: '',
    segmento: '',
    ramoCliente: '',
    status: '',
    cidade: '',
    uf: '',
    codFilial: '',
    idSecao: '',
    limit: '1',
    offset: '0',
  };
  const sample = await executeServerFunctionMitra({ projectId, serverFunctionId: ids.listar, input });
  const rows = sample?.result?.output?.rows || [];
  const first = rows[0];
  let validation = null;
  if (first?.ID) {
    validation = await executeServerFunctionMitra({
      projectId,
      serverFunctionId: ids.validar,
      input: { clienteId: String(first.ID), codFilial: String(first.CODFILIAL || ''), idSecao: String(first.ID_SECAO || '') },
    });
  }

  console.log(JSON.stringify({
    updated: ids,
    sampleRow: first || null,
    validation: validation?.result?.output?.rows?.[0] || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
