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

function isAlreadyExistsError(error) {
  const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return message.includes('already exists') || message.includes('duplicate');
}

async function ensureTable(sql, tableName) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`Tabela ${tableName} criada.`);
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log(`Tabela ${tableName} já existe.`);
  }
}

async function ensureSchema() {
  await ensureTable(
    `CREATE TABLE CUSTOPRODUTO (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CODPROD INT NOT NULL,
      CUSTO DECIMAL(12,2) NOT NULL,
      DATA VARCHAR(10) NOT NULL,
      FOREIGN KEY (CODPROD) REFERENCES PRODUTOS(ID)
    );`,
    'CUSTOPRODUTO',
  );

  await ensureTable(
    `CREATE TABLE COST_POLICIES (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      NAME VARCHAR(180) NOT NULL,
      STATUS VARCHAR(20) DEFAULT 'ATIVO',
      DT_START VARCHAR(10) NOT NULL,
      DT_END VARCHAR(10) NOT NULL,
      CRIADO_EM VARCHAR(19)
    );`,
    'COST_POLICIES',
  );

  await ensureTable(
    `CREATE TABLE POLICY_ITEMS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      POLICY_ID INT NOT NULL,
      PRODUCT_ID INT NOT NULL,
      SPECIAL_COST DECIMAL(12,2) NOT NULL,
      FOREIGN KEY (POLICY_ID) REFERENCES COST_POLICIES(ID),
      FOREIGN KEY (PRODUCT_ID) REFERENCES PRODUTOS(ID)
    );`,
    'POLICY_ITEMS',
  );

  await ensureTable(
    `CREATE TABLE PRODUCT_MIX (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      NOME VARCHAR(220) NOT NULL,
      DESCRICAO TEXT,
      ID_CLIENTE INT NOT NULL,
      ID_USUARIO_CRIACAO INT NOT NULL,
      TOTAL_CUSTO DECIMAL(14,2) DEFAULT 0,
      TOTAL_VENDA DECIMAL(14,2) DEFAULT 0,
      MARGEM_MEDIA DECIMAL(7,2) DEFAULT 0,
      DT_CRIACAO VARCHAR(19) NOT NULL,
      FOREIGN KEY (ID_CLIENTE) REFERENCES CLIENTES(ID)
    );`,
    'PRODUCT_MIX',
  );

  await ensureTable(
    `CREATE TABLE PRODUCT_MIX_ITEMS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      ID_MIX INT NOT NULL,
      ID_PRODUTO INT NOT NULL,
      QUANTIDADE INT NOT NULL,
      TIPO_CUSTO VARCHAR(40) NOT NULL,
      CUSTO_UNITARIO DECIMAL(12,2) NOT NULL,
      MARGEM_PERCENT DECIMAL(7,2) NOT NULL,
      PRECO_VENDA DECIMAL(12,2) NOT NULL,
      PRECO_CONCORRENTE DECIMAL(12,2),
      CMV_PERCENT DECIMAL(7,2),
      INDEX IDX_PRODUCT_MIX_ITEMS_ID_PRODUTO (ID_PRODUTO),
      FOREIGN KEY (ID_MIX) REFERENCES PRODUCT_MIX(ID)
    );`,
    'PRODUCT_MIX_ITEMS',
  );

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO CUSTOPRODUTO (CODPROD, CUSTO, DATA)
      SELECT P.ID, COALESCE(P.CUSTO, 0), SUBSTRING(CURRENT_DATE, 1, 10)
      FROM PRODUTOS P
      WHERE NOT EXISTS (
        SELECT 1
        FROM CUSTOPRODUTO C
        WHERE C.CODPROD = P.ID
      )
    `,
  });

  console.log('Carga inicial de CUSTOPRODUTO garantida.');
}

const serverFunctions = [
  {
    name: 'mixCatalogoProdutosCustos',
    description: 'Catálogo do Mix Builder com custo padrão e custo por política ativa.',
    code: `
      SELECT
        P.ID AS PRODUCT_ID,
        P.ID AS CODPROD,
        P.CODIGO,
        P.NOME,
        P.CATEGORIA,
        COALESCE(CUSTO_STD.CUSTO_STD, P.CUSTO, 0) AS CUSTO_STD,
        CUSTO_POLICY.POLICY_ID,
        CUSTO_POLICY.SPECIAL_COST AS CUSTO_POLICY,
        CASE
          WHEN CUSTO_POLICY.SPECIAL_COST IS NOT NULL THEN CUSTO_POLICY.SPECIAL_COST
          ELSE COALESCE(CUSTO_STD.CUSTO_STD, P.CUSTO, 0)
        END AS CUSTO_APLICADO,
        CASE
          WHEN CUSTO_POLICY.SPECIAL_COST IS NOT NULL THEN CONCAT('policy:', CUSTO_POLICY.POLICY_ID)
          ELSE 'STD'
        END AS TIPO_CUSTO,
        COALESCE(P.PRECO_TABELA, 0) AS PRECO_TABELA,
        CUSTO_STD.DATA_STD AS DATA_CUSTO_STD
      FROM PRODUTOS P
      LEFT JOIN (
        SELECT CP.CODPROD, CP.CUSTO AS CUSTO_STD, CP.DATA AS DATA_STD
        FROM CUSTOPRODUTO CP
        INNER JOIN (
          SELECT CODPROD, MAX(DATA) AS MAX_DATA
          FROM CUSTOPRODUTO
          GROUP BY CODPROD
        ) ULT ON ULT.CODPROD = CP.CODPROD AND ULT.MAX_DATA = CP.DATA
      ) CUSTO_STD ON CUSTO_STD.CODPROD = P.ID
      LEFT JOIN (
        SELECT
          PI.PRODUCT_ID,
          MAX(PI.POLICY_ID) AS POLICY_ID,
          MAX(PI.SPECIAL_COST) AS SPECIAL_COST
        FROM POLICY_ITEMS PI
        JOIN COST_POLICIES CP ON CP.ID = PI.POLICY_ID
        WHERE UPPER(CP.STATUS) = 'ATIVO'
          AND CP.DT_START <= SUBSTRING(CURRENT_DATE, 1, 10)
          AND CP.DT_END >= SUBSTRING(CURRENT_DATE, 1, 10)
        GROUP BY PI.PRODUCT_ID
      ) CUSTO_POLICY ON CUSTO_POLICY.PRODUCT_ID = P.ID
      WHERE P.ATIVO = TRUE
        AND ('{{busca}}' = '' OR P.NOME LIKE '%{{busca}}%' OR P.CODIGO LIKE '%{{busca}}%')
      ORDER BY P.NOME
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'mixListar',
    description: 'Lista cabeçalhos de mix salvos (PRODUCT_MIX).',
    code: `
      SELECT
        M.ID,
        M.NOME,
        M.DESCRICAO,
        M.ID_CLIENTE,
        M.ID_USUARIO_CRIACAO,
        M.TOTAL_CUSTO,
        M.TOTAL_VENDA,
        M.MARGEM_MEDIA,
        M.DT_CRIACAO,
        C.NOME_FANTASIA AS CLIENTE
      FROM PRODUCT_MIX M
      JOIN CLIENTES C ON C.ID = M.ID_CLIENTE
      WHERE ('{{clienteId}}' = '' OR M.ID_CLIENTE = {{clienteId}})
        AND ('{{usuarioId}}' = '' OR M.ID_USUARIO_CRIACAO = {{usuarioId}})
      ORDER BY M.DT_CRIACAO DESC, M.ID DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'mixItens',
    description: 'Lista itens de um mix salvo (PRODUCT_MIX_ITEMS).',
    code: `
      SELECT
        I.ID,
        I.ID_MIX,
        I.ID_PRODUTO,
        I.QUANTIDADE,
        I.TIPO_CUSTO,
        I.CUSTO_UNITARIO,
        I.MARGEM_PERCENT,
        I.PRECO_VENDA,
        I.PRECO_CONCORRENTE,
        I.CMV_PERCENT,
        CAST(COALESCE(PC.CODPROD, P.ID, I.ID_PRODUTO) AS CHAR) AS CODIGO,
        COALESCE(PC.NOME, P.NOME, CONCAT('Produto ', CAST(I.ID_PRODUTO AS CHAR))) AS NOME,
        CASE
          WHEN PC.CODPROD IS NOT NULL THEN CONCAT('Depto ', PC.DEPARTAMENTO_ID, ' / Seção ', PC.SECAO_ID)
          ELSE COALESCE(P.CATEGORIA, '')
        END AS CATEGORIA
      FROM PRODUCT_MIX_ITEMS I
      LEFT JOIN PRODUTOS_CUSTOS PC ON PC.CODPROD = I.ID_PRODUTO
      LEFT JOIN PRODUTOS P ON P.ID = I.ID_PRODUTO
      WHERE I.ID_MIX = {{mixId}}
      ORDER BY I.ID
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);

    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: sf.code,
        description: sf.description,
      });
      ids[sf.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: 'SQL',
      code: sf.code,
      description: sf.description,
    });

    ids[sf.name] = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
  }

  return ids;
}

async function main() {
  await ensureSchema();
  const ids = await upsertServerFunctions();
  console.log('Estrutura e SFs do Mix Builder configuradas com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar estrutura do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
