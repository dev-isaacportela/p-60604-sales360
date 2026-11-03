import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

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

const SF_DEFINITIONS = [
  {
    name: 'listarClientesDisponiveisMinhaBu',
    description: 'Lista clientes disponíveis da BU efetiva do vendedor logado (sem dono na carteira da BU).',
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
        ${BU_EFETIVA_SQL} AS ID_BU,
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
            AND COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = ${BU_EFETIVA_SQL}
        )
      ORDER BY C.NOME_FANTASIA
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'contarClientesDisponiveisMinhaBu',
    description: 'Conta clientes disponíveis da BU efetiva do vendedor logado (sem dono na carteira da BU).',
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
            AND COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = ${BU_EFETIVA_SQL}
        )
    `,
  },
  {
    name: 'adicionarClienteMinhaCarteira',
    description: 'Atribui cliente disponível para a carteira do usuário logado na BU efetiva.',
    code: `
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, ID_BU, CRIADO_EM)
      SELECT
        {{clienteId}},
        :VAR_USER,
        ${BU_EFETIVA_SQL},
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
            AND COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = ${BU_EFETIVA_SQL}
        )
    `,
  },
];

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];

  const updated = [];
  for (const definition of SF_DEFINITIONS) {
    const sf = existing.find((item) => item.name === definition.name);
    if (!sf) {
      throw new Error(`SF não encontrada: ${definition.name}`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: sf.id,
      code: definition.code,
      description: definition.description,
    });

    updated.push({ id: sf.id, name: definition.name });
  }

  console.log('SFs de carteira atualizadas para BU efetiva do vendedor.');
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao atualizar regra de BU por vendedor na carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
