import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const sfDefinitions = [
  {
    name: 'listarClientesDisponiveisMinhaBu',
    description: 'Lista clientes disponíveis da BU do usuário logado (sem dono na carteira da BU).',
    code: `
      SELECT
        C.ID,
        C.RAZAO_SOCIAL,
        C.NOME_FANTASIA,
        C.CNPJ,
        C.CIDADE,
        C.UF,
        C.SEGMENTO,
        C.STATUS,
        CASE WHEN '{{idBu}}' = '' THEN 'PADRAO' ELSE '{{idBu}}' END AS ID_BU,
        0 AS IS_COBERTURA,
        '' AS TAG_COBERTURA
      FROM CLIENTES C
      WHERE (
          '{{busca}}' = ''
          OR C.NOME_FANTASIA LIKE '%{{busca}}%'
          OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
          OR C.CNPJ LIKE '%{{busca}}%'
          OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
        )
        AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
        AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
        AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
        AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
        AND NOT EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = C.ID
            AND (
              '{{idBu}}' = ''
              OR COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = '{{idBu}}'
            )
        )
      ORDER BY C.NOME_FANTASIA
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'contarClientesDisponiveisMinhaBu',
    description: 'Conta clientes disponíveis da BU do usuário logado (sem dono na carteira da BU).',
    code: `
      SELECT COUNT(*) AS TOTAL
      FROM CLIENTES C
      WHERE (
          '{{busca}}' = ''
          OR C.NOME_FANTASIA LIKE '%{{busca}}%'
          OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
          OR C.CNPJ LIKE '%{{busca}}%'
          OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
        )
        AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
        AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
        AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
        AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
        AND NOT EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = C.ID
            AND (
              '{{idBu}}' = ''
              OR COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = '{{idBu}}'
            )
        )
    `,
  },
  {
    name: 'adicionarClienteMinhaCarteira',
    description: 'Atribui cliente disponível da BU do usuário para a carteira do usuário logado.',
    code: `
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, ID_BU, CRIADO_EM)
      SELECT
        {{clienteId}},
        :VAR_USER,
        CASE WHEN '{{idBu}}' = '' THEN 'PADRAO' ELSE '{{idBu}}' END,
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
        )
    `,
  },
];

function extractSfId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function upsertSf(definition, existingList) {
  const existing = existingList.find((sf) => sf.name === definition.name);
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

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const sfIds = {};

  for (const definition of sfDefinitions) {
    sfIds[definition.name] = await upsertSf(definition, existing);
  }

  console.log('SFs de clientes disponíveis/publicação na carteira configuradas.');
  console.log(JSON.stringify({ sfIds }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar SFs de clientes disponíveis da BU:');
  console.error(error?.message || error);
  process.exit(1);
});
