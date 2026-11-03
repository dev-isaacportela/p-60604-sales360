import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
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

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

function extractSfId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id || null;
}

async function ensureBuTable() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE BU (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        CODIGO VARCHAR(100) NOT NULL,
        NOME VARCHAR(150) NOT NULL,
        ATIVO BOOLEAN DEFAULT TRUE,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela BU criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists')) {
      console.log('Tabela BU já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_BU_CODIGO ON BU(CODIGO)',
    });
    console.log('Índice UX_BU_CODIGO criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists') || text.includes('duplicate key name')) {
      console.log('Índice UX_BU_CODIGO já existe.');
    } else {
      throw error;
    }
  }

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        origem.CODIGO,
        origem.NOME,
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM (
        SELECT
          COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO') AS CODIGO,
          COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO') AS NOME
        FROM CLIENTE_BU_VENDEDOR CBV

        UNION

        SELECT
          COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') AS CODIGO,
          COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') AS NOME
        FROM EQUIPE_CLIENTE EC
      ) origem
      WHERE NOT EXISTS (
        SELECT 1
        FROM BU B
        WHERE B.CODIGO = origem.CODIGO
      )
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        'PADRAO',
        'PADRAO',
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE NOT EXISTS (
        SELECT 1
        FROM BU
        WHERE CODIGO = 'PADRAO'
      )
    `,
  });
}

async function ensureBuVendedorTable() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE BU_VENDEDOR (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        BU_CODIGO VARCHAR(100) NOT NULL,
        VENDEDOR_ID INT NOT NULL,
        ATIVO BOOLEAN DEFAULT TRUE,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela BU_VENDEDOR criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists')) {
      console.log('Tabela BU_VENDEDOR já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_BU_VENDEDOR ON BU_VENDEDOR(BU_CODIGO, VENDEDOR_ID)',
    });
    console.log('Índice UX_BU_VENDEDOR criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists') || text.includes('duplicate key name')) {
      console.log('Índice UX_BU_VENDEDOR já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE INDEX IX_BU_VENDEDOR_VENDEDOR ON BU_VENDEDOR(VENDEDOR_ID)',
    });
    console.log('Índice IX_BU_VENDEDOR_VENDEDOR criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists') || text.includes('duplicate key name')) {
      console.log('Índice IX_BU_VENDEDOR_VENDEDOR já existe.');
    } else {
      throw error;
    }
  }

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO') AS BU_CODIGO,
        CBV.VENDEDOR_ID,
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM CLIENTE_BU_VENDEDOR CBV
      WHERE CBV.VENDEDOR_ID IS NOT NULL
      ON DUPLICATE KEY UPDATE
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });
}

const sfDefinitions = [
  {
    name: 'adminListarBus',
    description: 'Lista BUs com busca e total de vendedores vinculados.',
    code: `
      SELECT
        B.ID,
        B.CODIGO,
        B.NOME,
        COALESCE(B.ATIVO, TRUE) AS ATIVO,
        COUNT(DISTINCT CASE WHEN BV.ATIVO = TRUE THEN BV.VENDEDOR_ID END) AS TOTAL_VENDEDORES
      FROM BU B
      LEFT JOIN BU_VENDEDOR BV ON BV.BU_CODIGO = B.CODIGO
      WHERE (
        '{{busca}}' = ''
        OR B.CODIGO LIKE '%{{busca}}%'
        OR B.NOME LIKE '%{{busca}}%'
      )
      GROUP BY B.ID, B.CODIGO, B.NOME, B.ATIVO
      ORDER BY COALESCE(B.ATIVO, TRUE) DESC, B.NOME ASC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'adminContarBus',
    description: 'Conta BUs para paginação da gestão de BUs.',
    code: `
      SELECT COUNT(*) AS TOTAL
      FROM BU B
      WHERE (
        '{{busca}}' = ''
        OR B.CODIGO LIKE '%{{busca}}%'
        OR B.NOME LIKE '%{{busca}}%'
      )
    `,
  },
  {
    name: 'adminCriarBu',
    description: 'Cria BU nova com código gerado automaticamente.',
    code: `
      INSERT INTO BU (CODIGO, NOME, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      SELECT
        CONCAT('BU', LPAD(COALESCE(MAX(B.ID), 0) + 1, 4, '0')),
        TRIM('{{nome}}'),
        {{ativo}},
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM BU B
    `,
  },
  {
    name: 'adminAtualizarBu',
    description: 'Atualiza nome e status da BU pelo ID.',
    code: `
      UPDATE BU
      SET
        NOME = TRIM('{{nome}}'),
        ATIVO = {{ativo}},
        ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE ID = {{buId}}
    `,
  },
  {
    name: 'adminListarVendedoresBu',
    description: 'Lista vendedores para vinculação com BUs.',
    code: `
      SELECT
        U.ID AS VENDEDOR_ID,
        COALESCE(F.NOME, U.DESCR) AS VENDEDOR_NOME,
        U.DESCR AS EMAIL
      FROM INT_USER U
      LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
      WHERE (
        '{{busca}}' = ''
        OR CAST(U.ID AS CHAR) LIKE '%{{busca}}%'
        OR COALESCE(F.NOME, U.DESCR) LIKE '%{{busca}}%'
        OR U.DESCR LIKE '%{{busca}}%'
      )
      ORDER BY VENDEDOR_NOME
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'adminListarVinculosBuVendedor',
    description: 'Lista vínculos ativos entre BUs e vendedores.',
    code: `
      SELECT
        BV.ID,
        BV.BU_CODIGO,
        B.NOME AS BU_NOME,
        BV.VENDEDOR_ID,
        COALESCE(F.NOME, U.DESCR) AS VENDEDOR_NOME,
        U.DESCR AS EMAIL,
        COALESCE(BV.ATIVO, TRUE) AS ATIVO,
        BV.ATUALIZADO_EM
      FROM BU_VENDEDOR BV
      LEFT JOIN BU B ON B.CODIGO = BV.BU_CODIGO
      LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND (
          '{{busca}}' = ''
          OR BV.BU_CODIGO LIKE '%{{busca}}%'
          OR COALESCE(B.NOME, '') LIKE '%{{busca}}%'
          OR CAST(BV.VENDEDOR_ID AS CHAR) LIKE '%{{busca}}%'
          OR COALESCE(F.NOME, U.DESCR) LIKE '%{{busca}}%'
          OR COALESCE(U.DESCR, '') LIKE '%{{busca}}%'
        )
      ORDER BY BV.BU_CODIGO ASC, VENDEDOR_NOME ASC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'adminContarVinculosBuVendedor',
    description: 'Conta vínculos ativos de BU e vendedor para paginação.',
    code: `
      SELECT COUNT(*) AS TOTAL
      FROM BU_VENDEDOR BV
      LEFT JOIN BU B ON B.CODIGO = BV.BU_CODIGO
      LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
        AND (
          '{{busca}}' = ''
          OR BV.BU_CODIGO LIKE '%{{busca}}%'
          OR COALESCE(B.NOME, '') LIKE '%{{busca}}%'
          OR CAST(BV.VENDEDOR_ID AS CHAR) LIKE '%{{busca}}%'
          OR COALESCE(F.NOME, U.DESCR) LIKE '%{{busca}}%'
          OR COALESCE(U.DESCR, '') LIKE '%{{busca}}%'
        )
    `,
  },
  {
    name: 'adminVincularBuVendedor',
    description: 'Vincula uma BU a um vendedor.',
    code: `
      INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CRIADO_EM, ATUALIZADO_EM)
      VALUES (
        UPPER(TRIM('{{buCodigo}}')),
        {{vendedorId}},
        TRUE,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      )
      ON DUPLICATE KEY UPDATE
        ATIVO = TRUE,
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  },
  {
    name: 'adminDesvincularBuVendedor',
    description: 'Inativa vínculo entre BU e vendedor.',
    code: `
      UPDATE BU_VENDEDOR
      SET
        ATIVO = FALSE,
        ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE ID = {{vinculoId}}
    `,
  },
];

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

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const sfIds = {};

  for (const definition of sfDefinitions) {
    sfIds[definition.name] = await upsertSf(definition, existing);
  }

  return sfIds;
}

async function main() {
  await ensureBuTable();
  await ensureBuVendedorTable();
  const sfIds = await upsertServerFunctions();

  console.log('Gestão de BUs e vínculos com vendedores configurada com sucesso.');
  console.log(JSON.stringify({ sfIds }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar gestão de BUs e vendedores:');
  console.error(error?.message || error);
  process.exit(1);
});
