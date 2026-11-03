import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runQueryMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  listServerFunctionsMitra,
  executeServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ownerUserId = 5;
const ownerEmail = 'ti@benenutri.com';

function normalizeArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response?.result?.rows)) return response.result.rows;
  return [];
}

function extractSfId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id;
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  return [];
}

const managerCondition = `EXISTS (
  SELECT 1
  FROM USUARIO_CARGO UC
  WHERE UC.USER_ID = :VAR_USER
    AND COALESCE(UC.CARGO, '') IN ('ADMIN', 'GESTOR', 'DIRETORIA', 'COORDENADOR')
)`;

const ownerCondition = `(:VAR_USER = ${ownerUserId} OR LOWER((SELECT COALESCE(DESCR, '') FROM INT_USER WHERE ID = :VAR_USER)) = '${ownerEmail}')`;

const serverFunctions = [
  {
    name: 'solicitacoesComprasPermissaoGestao',
    description: 'Indica se o usuario logado pode ver todas as solicitacoes de compras.',
    code: `
      SELECT
        U.ID AS USER_ID,
        U.DESCR AS EMAIL,
        CASE WHEN ${ownerCondition} THEN 1 ELSE 0 END AS PODE_ACESSAR,
        CASE WHEN ${ownerCondition} AND ${managerCondition} THEN 1 ELSE 0 END AS PODE_GERIR
      FROM INT_USER U
      WHERE U.ID = :VAR_USER
    `,
  },
  {
    name: 'solicitacoesComprasExecutivos',
    description: 'Lista executivos com solicitacoes para filtro de administradores e gestores.',
    code: `
      SELECT DISTINCT
        S.EXECUTIVO_ID AS ID,
        COALESCE(NULLIF(S.EXECUTIVO_EMAIL, ''), U.DESCR, CONCAT('Usuario ', S.EXECUTIVO_ID)) AS EMAIL,
        COALESCE(NULLIF(U.DESCR, ''), NULLIF(S.EXECUTIVO_EMAIL, ''), CONCAT('Usuario ', S.EXECUTIVO_ID)) AS NOME
      FROM SOLICITACOES S
      LEFT JOIN INT_USER U ON U.ID = S.EXECUTIVO_ID
      WHERE ${ownerCondition}
        AND ${managerCondition}
      ORDER BY NOME
    `,
  },
  {
    name: 'solicitacoesComprasListar',
    description: 'Lista solicitacoes de compras filtrando obrigatoriamente pelo executivo logado, exceto gestores/admins.',
    code: `
      SELECT
        S.ID,
        S.CLIENTE,
        S.TIPO_SOLICITACAO,
        S.DESCRICAO,
        S.PRIORIDADE,
        S.STATUS,
        S.PRAZO_DESEJADO,
        S.EXECUTIVO_ID,
        S.EXECUTIVO_EMAIL,
        S.REFERENCIA_COMERCIAL_ID,
        S.CRIADO_EM,
        S.ATUALIZADO_EM,
        R.MOTIVO_RECUSA,
        COALESCE(NULLIF(U.DESCR, ''), NULLIF(S.EXECUTIVO_EMAIL, ''), CONCAT('Usuario ', S.EXECUTIVO_ID)) AS RESPONSAVEL
      FROM SOLICITACOES S
      LEFT JOIN INT_USER U ON U.ID = S.EXECUTIVO_ID
      LEFT JOIN (
        SELECT
          SOLICITACAO_ID,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(COMPRAS_OBS_AVALIACAO), '') SEPARATOR ' | ') AS MOTIVO_RECUSA
        FROM SOLICITACAO_ITENS
        WHERE COALESCE(TRIM(COMPRAS_OBS_AVALIACAO), '') <> ''
        GROUP BY SOLICITACAO_ID
      ) R ON R.SOLICITACAO_ID = S.ID
      WHERE ${ownerCondition}
        AND (
          ${managerCondition}
          OR S.EXECUTIVO_ID = :VAR_USER
          OR LOWER(COALESCE(S.EXECUTIVO_EMAIL, '')) = LOWER((SELECT COALESCE(DESCR, '') FROM INT_USER WHERE ID = :VAR_USER))
        )
        AND (
          NOT ${managerCondition}
          OR '{{executivo}}' = ''
          OR CAST(S.EXECUTIVO_ID AS CHAR) = '{{executivo}}'
          OR LOWER(COALESCE(S.EXECUTIVO_EMAIL, '')) = LOWER('{{executivo}}')
        )
        AND ('{{status}}' = '' OR S.STATUS = '{{status}}')
        AND ('{{prioridade}}' = '' OR S.PRIORIDADE = '{{prioridade}}')
        AND ('{{busca}}' = '' OR LOWER(CONCAT(COALESCE(S.CLIENTE, ''), ' ', COALESCE(S.TIPO_SOLICITACAO, ''), ' ', COALESCE(S.DESCRICAO, ''))) LIKE LOWER(CONCAT('%', '{{busca}}', '%')))
      ORDER BY S.CRIADO_EM DESC, S.ID DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'solicitacoesComprasContar',
    description: 'Conta solicitacoes de compras com a mesma regra de visibilidade da listagem.',
    code: `
      SELECT COUNT(*) AS TOTAL
      FROM SOLICITACOES S
      WHERE ${ownerCondition}
        AND (
          ${managerCondition}
          OR S.EXECUTIVO_ID = :VAR_USER
          OR LOWER(COALESCE(S.EXECUTIVO_EMAIL, '')) = LOWER((SELECT COALESCE(DESCR, '') FROM INT_USER WHERE ID = :VAR_USER))
        )
        AND (
          NOT ${managerCondition}
          OR '{{executivo}}' = ''
          OR CAST(S.EXECUTIVO_ID AS CHAR) = '{{executivo}}'
          OR LOWER(COALESCE(S.EXECUTIVO_EMAIL, '')) = LOWER('{{executivo}}')
        )
        AND ('{{status}}' = '' OR S.STATUS = '{{status}}')
        AND ('{{prioridade}}' = '' OR S.PRIORIDADE = '{{prioridade}}')
        AND ('{{busca}}' = '' OR LOWER(CONCAT(COALESCE(S.CLIENTE, ''), ' ', COALESCE(S.TIPO_SOLICITACAO, ''), ' ', COALESCE(S.DESCRICAO, ''))) LIKE LOWER(CONCAT('%', '{{busca}}', '%')))
    `,
  },
  {
    name: 'solicitacoesComprasCriar',
    description: 'Cria solicitacao de compras vinculando o executivo ao usuario logado.',
    code: `
      INSERT INTO SOLICITACOES (
        CLIENTE,
        TIPO_SOLICITACAO,
        DESCRICAO,
        PRIORIDADE,
        STATUS,
        PRAZO_DESEJADO,
        CODFILIAL,
        FILIAL_NOME,
        EXECUTIVO_ID,
        EXECUTIVO_EMAIL,
        REFERENCIA_COMERCIAL_ID,
        CRIADO_EM,
        ATUALIZADO_EM
      )
      SELECT
        '{{cliente}}',
        '{{tipoSolicitacao}}',
        '{{descricao}}',
        '{{prioridade}}',
        'ABERTA',
        '{{prazoDesejado}}',
        '{{codfilial}}',
        '{{filialNome}}',
        U.ID,
        U.DESCR,
        NULLIF('{{referenciaComercialId}}', ''),
        '{{criadoEm}}',
        '{{criadoEm}}'
      FROM INT_USER U
      WHERE U.ID = :VAR_USER
        AND ${ownerCondition}
    `,
  },
  {
    name: 'solicitacoesComprasBuscarPorReferencia',
    description: 'Busca solicitacao de compras criada pelo usuario logado a partir da referencia comercial unica.',
    code: `
      SELECT ID
      FROM SOLICITACOES
      WHERE ${ownerCondition}
        AND EXECUTIVO_ID = :VAR_USER
        AND REFERENCIA_COMERCIAL_ID = '{{referenciaComercialId}}'
      ORDER BY ID DESC
      LIMIT 1
    `,
  },
  {
    name: 'solicitacoesComprasAdicionarItem',
    description: 'Adiciona produto e quantidade em uma solicitacao de compras do usuario autorizado.',
    code: `
      INSERT INTO SOLICITACAO_ITENS (
        SOLICITACAO_ID,
        CODPROD,
        CODFORNEC,
        PRODUTO,
        QUANTIDADE,
        OBSERVACAO,
        CRIADO_EM
      )
      SELECT
        S.ID,
        '{{codprod}}',
        {{codfornec}},
        '{{produto}}',
        {{quantidade}},
        '{{observacao}}',
        '{{criadoEm}}'
      FROM SOLICITACOES S
      WHERE ${ownerCondition}
        AND S.ID = {{solicitacaoId}}
        AND S.EXECUTIVO_ID = :VAR_USER
    `,
  },
  {
    name: 'solicitacoesComprasItensListar',
    description: 'Lista os itens de uma solicitacao de compras autorizada para exibir detalhes.',
    code: `
      SELECT
        I.ID,
        I.SOLICITACAO_ID,
        I.CODPROD,
        I.CODFORNEC,
        I.PRODUTO,
        I.QUANTIDADE,
        I.OBSERVACAO,
        I.COMPRAS_SOLICITACAO_ID,
        I.COMPRAS_STATUS,
        I.COMPRAS_CARD_ID,
        I.COMPRAS_AVALIADO_EM,
        I.COMPRAS_OBS_AVALIACAO,
        I.COMPRAS_SYNC_EM,
        I.COMPRAS_SYNC_ERRO,
        I.CRIADO_EM
      FROM SOLICITACAO_ITENS I
      JOIN SOLICITACOES S ON S.ID = I.SOLICITACAO_ID
      WHERE ${ownerCondition}
        AND I.SOLICITACAO_ID = {{solicitacaoId}}
        AND (
          ${managerCondition}
          OR S.EXECUTIVO_ID = :VAR_USER
          OR LOWER(COALESCE(S.EXECUTIVO_EMAIL, '')) = LOWER((SELECT COALESCE(DESCR, '') FROM INT_USER WHERE ID = :VAR_USER))
        )
      ORDER BY I.ID ASC
      LIMIT 100
    `,
  },
];

async function ensureSchema() {
  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS SOLICITACOES (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CLIENTE VARCHAR(300) NOT NULL,
      TIPO_SOLICITACAO VARCHAR(120) NOT NULL,
      DESCRICAO TEXT,
      PRIORIDADE VARCHAR(20) DEFAULT 'MEDIA',
      STATUS VARCHAR(30) DEFAULT 'ABERTA',
      PRAZO_DESEJADO VARCHAR(10),
      CODFILIAL VARCHAR(20),
      FILIAL_NOME VARCHAR(200),
      EXECUTIVO_ID INT,
      EXECUTIVO_EMAIL VARCHAR(200),
      REFERENCIA_COMERCIAL_ID VARCHAR(80),
      CRIADO_EM VARCHAR(19),
      ATUALIZADO_EM VARCHAR(19),
      INDEX IDX_SOLICITACOES_EXECUTIVO (EXECUTIVO_ID),
      INDEX IDX_SOLICITACOES_EMAIL (EXECUTIVO_EMAIL),
      INDEX IDX_SOLICITACOES_STATUS (STATUS),
      INDEX IDX_SOLICITACOES_CRIADO (CRIADO_EM)
    );`,
  });

  await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS SOLICITACAO_ITENS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      SOLICITACAO_ID INT NOT NULL,
      CODPROD VARCHAR(50),
      CODFORNEC INT,
      PRODUTO VARCHAR(300) NOT NULL,
      QUANTIDADE DECIMAL(12,3) DEFAULT 1,
      OBSERVACAO VARCHAR(500),
      CRIADO_EM VARCHAR(19),
      INDEX IDX_SOLICITACAO_ITENS_SOLICITACAO (SOLICITACAO_ID),
      INDEX IDX_SOLICITACAO_ITENS_CODPROD (CODPROD)
    );`,
  });

  const codfornecColumn = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS TOTAL
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'SOLICITACAO_ITENS'
            AND COLUMN_NAME = 'CODFORNEC'`,
  });
  const exists = Number((codfornecColumn?.result?.rows || codfornecColumn?.rows || [])[0]?.TOTAL || 0) > 0;
  if (!exists) {
    await runDdlMitra({ projectId, sql: 'ALTER TABLE SOLICITACAO_ITENS ADD COLUMN CODFORNEC INT AFTER CODPROD' });
  }
}

async function upsertServerFunctions() {
  const listed = normalizeArray(await listServerFunctionsMitra({ projectId }));
  const ids = {};

  for (const definition of serverFunctions) {
    const found = listed.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: definition.code,
        description: definition.description,
      });
      ids[definition.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: definition.name,
      type: 'SQL',
      code: definition.code,
      description: definition.description,
    });
    ids[definition.name] = extractSfId(created);
  }

  return ids;
}

async function smoke(ids) {
  const checks = [
    ['solicitacoesComprasPermissaoGestao', {}],
    ['solicitacoesComprasListar', { status: '', prioridade: '', executivo: '', busca: '', limit: '10', offset: '0' }],
    ['solicitacoesComprasContar', { status: '', prioridade: '', executivo: '', busca: '' }],
  ];

  for (const [name, input] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  await ensureSchema();
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Solicitacoes de compras configuradas.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar solicitacoes de compras:');
  console.error(error?.message || error);
  process.exit(1);
});
