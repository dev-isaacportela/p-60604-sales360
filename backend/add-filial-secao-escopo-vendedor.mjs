import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
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
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';

function errText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: OK`);
  } catch (error) {
    const text = errText(error);
    if (text.includes('already exists') || text.includes('duplicate') || text.includes('duplicate key') || text.includes('exists')) {
      console.log(`${label}: já existente`);
      return;
    }
    throw error;
  }
}

async function runDml(sql) {
  await runDmlMitra({ projectId, sql });
}

async function query(sql) {
  const res = await runQueryMitra({ projectId, sql });
  return res?.result?.rows || [];
}

async function tableColumns(tableName) {
  return query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
  `);
}

async function tableIndexes(tableName) {
  return query(`
    SELECT DISTINCT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
  `);
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  const cols = await tableColumns(tableName);
  const hasColumn = cols.some((row) => String(row.COLUMN_NAME).toUpperCase() === String(columnName).toUpperCase());
  if (hasColumn) return;
  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${ddl}` });
  console.log(`Coluna ${tableName}.${columnName}: criada`);
}

async function dropIndexIfExists(tableName, indexName) {
  const idx = await tableIndexes(tableName);
  const hasIndex = idx.some((row) => String(row.INDEX_NAME) === indexName);
  if (!hasIndex) return;
  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} DROP INDEX ${indexName}` });
  console.log(`Índice ${tableName}.${indexName}: removido`);
}

async function upsertServerFunction(name, code, description) {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === name);

  if (found) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: found.id,
      code,
      description,
    });
    return found.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name,
    type: 'SQL',
    code,
    description,
  });

  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id || null;
}

async function ensureFilialAndSecao() {
  await runDdlSafe(
    `CREATE TABLE FILIAL (
      CODFILIAL VARCHAR(10) PRIMARY KEY,
      NOME_FILIAL VARCHAR(100) NOT NULL,
      ATIVO BOOLEAN DEFAULT TRUE,
      CRIADO_EM VARCHAR(19),
      ATUALIZADO_EM VARCHAR(19)
    )`,
    'Tabela FILIAL',
  );

  await runDdlSafe(
    `CREATE TABLE SECAO (
      ID INT PRIMARY KEY,
      NOME_SECAO VARCHAR(100) NOT NULL,
      ID_BU INT,
      ATIVO BOOLEAN DEFAULT TRUE,
      CRIADO_EM VARCHAR(19),
      ATUALIZADO_EM VARCHAR(19),
      UNIQUE KEY UX_SECAO_NOME_BU (NOME_SECAO, ID_BU),
      KEY IX_SECAO_BU (ID_BU),
      CONSTRAINT FK_SECAO_BU FOREIGN KEY (ID_BU) REFERENCES BU(ID)
    )`,
    'Tabela SECAO',
  );

  await runDml(`
    INSERT INTO FILIAL (CODFILIAL, NOME_FILIAL, ATIVO, CRIADO_EM, ATUALIZADO_EM)
    SELECT
      LEFT(TRIM(CAST(I.CODFILIAL AS CHAR)), 10) AS CODFILIAL,
      CONCAT('Filial ', LEFT(TRIM(CAST(I.CODFILIAL AS CHAR)), 10)) AS NOME_FILIAL,
      TRUE,
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    FROM ${STAGING_TABLE} I
    WHERE I.CODFILIAL IS NOT NULL
      AND TRIM(CAST(I.CODFILIAL AS CHAR)) <> ''
    GROUP BY LEFT(TRIM(CAST(I.CODFILIAL AS CHAR)), 10)
    ON DUPLICATE KEY UPDATE
      NOME_FILIAL = VALUES(NOME_FILIAL),
      ATIVO = TRUE,
      ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);

  await runDml(`
    INSERT INTO SECAO (ID, NOME_SECAO, ID_BU, ATIVO, CRIADO_EM, ATUALIZADO_EM)
    SELECT
      CAST(I.CODSEC AS SIGNED) AS ID,
      LEFT(
        TRIM(
          COALESCE(
            NULLIF(CAST(I.SECAO AS CHAR), ''),
            CONCAT('SECAO ', CAST(I.CODSEC AS CHAR))
          )
        ),
        100
      ) AS NOME_SECAO,
      B.ID AS ID_BU,
      TRUE,
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    FROM ${STAGING_TABLE} I
    LEFT JOIN BU B ON B.CODIGO = CAST(I.CODEPTO AS CHAR)
    WHERE I.CODSEC IS NOT NULL
    GROUP BY CAST(I.CODSEC AS SIGNED), B.ID
    ON DUPLICATE KEY UPDATE
      NOME_SECAO = VALUES(NOME_SECAO),
      ID_BU = VALUES(ID_BU),
      ATIVO = TRUE,
      ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);
}

async function ensureEscopoColumnsAndIndexes() {
  await addColumnIfMissing('BU_VENDEDOR', 'CODFILIAL', 'CODFILIAL VARCHAR(10)');
  await addColumnIfMissing('BU_VENDEDOR', 'ID_SECAO', 'ID_SECAO INT');

  await addColumnIfMissing('EQUIPE_CLIENTE', 'CODFILIAL', 'CODFILIAL VARCHAR(10)');
  await addColumnIfMissing('EQUIPE_CLIENTE', 'ID_SECAO', 'ID_SECAO INT');

  await runDdlSafe(
    'ALTER TABLE BU_VENDEDOR ADD CONSTRAINT FK_BU_VENDEDOR_FILIAL FOREIGN KEY (CODFILIAL) REFERENCES FILIAL(CODFILIAL)',
    'FK BU_VENDEDOR -> FILIAL',
  );
  await runDdlSafe(
    'ALTER TABLE BU_VENDEDOR ADD CONSTRAINT FK_BU_VENDEDOR_SECAO FOREIGN KEY (ID_SECAO) REFERENCES SECAO(ID)',
    'FK BU_VENDEDOR -> SECAO',
  );

  await runDdlSafe(
    'ALTER TABLE EQUIPE_CLIENTE ADD CONSTRAINT FK_EQUIPE_CLIENTE_FILIAL FOREIGN KEY (CODFILIAL) REFERENCES FILIAL(CODFILIAL)',
    'FK EQUIPE_CLIENTE -> FILIAL',
  );
  await runDdlSafe(
    'ALTER TABLE EQUIPE_CLIENTE ADD CONSTRAINT FK_EQUIPE_CLIENTE_SECAO FOREIGN KEY (ID_SECAO) REFERENCES SECAO(ID)',
    'FK EQUIPE_CLIENTE -> SECAO',
  );

  await dropIndexIfExists('BU_VENDEDOR', 'UX_BU_VENDEDOR');
  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_BU_VENDEDOR_ESCOPO ON BU_VENDEDOR (VENDEDOR_ID, BU_CODIGO, CODFILIAL, ID_SECAO)',
    'Índice único BU_VENDEDOR escopo',
  );

  await dropIndexIfExists('EQUIPE_CLIENTE', 'UX_EQUIPE_CLIENTE_CLIENTE_VENDEDOR');
  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_EQUIPE_CLIENTE_ESCOPO ON EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO)',
    'Índice único EQUIPE_CLIENTE escopo',
  );
  await runDdlSafe(
    'CREATE INDEX IX_EQUIPE_CLIENTE_CLIENTE ON EQUIPE_CLIENTE (ID_CLIENTE)',
    'Índice de performance EQUIPE_CLIENTE por cliente',
  );
}

async function upsertCoreFunctions() {
  const sfListarDisponiveis = `
    SELECT
      C.ID,
      C.RAZAO_SOCIAL,
      C.NOME_FANTASIA,
      C.CNPJ,
      C.CIDADE,
      C.UF,
      C.SEGMENTO,
      C.STATUS,
      '{{codFilial}}' AS CODFILIAL,
      {{idSecao}} AS ID_SECAO
    FROM CLIENTES C
    WHERE '{{codFilial}}' <> ''
      AND '{{idSecao}}' <> ''
      AND (
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
      AND EXISTS (
        SELECT 1
        FROM BU_VENDEDOR UB
        WHERE UB.VENDEDOR_ID = :VAR_USER
          AND COALESCE(UB.ATIVO, TRUE) = TRUE
          AND UB.CODFILIAL = '{{codFilial}}'
          AND UB.ID_SECAO = {{idSecao}}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = C.ID
          AND EC.CODFILIAL = '{{codFilial}}'
          AND EC.ID_SECAO = {{idSecao}}
          AND BV.BU_CODIGO = (
            SELECT UB2.BU_CODIGO
            FROM BU_VENDEDOR UB2
            WHERE UB2.VENDEDOR_ID = :VAR_USER
              AND COALESCE(UB2.ATIVO, TRUE) = TRUE
              AND UB2.CODFILIAL = '{{codFilial}}'
              AND UB2.ID_SECAO = {{idSecao}}
            ORDER BY UB2.ID DESC
            LIMIT 1
          )
      )
    ORDER BY C.NOME_FANTASIA
    LIMIT {{limit}} OFFSET {{offset}}
  `;

  const sfContarDisponiveis = `
    SELECT COUNT(*) AS TOTAL
    FROM CLIENTES C
    WHERE '{{codFilial}}' <> ''
      AND '{{idSecao}}' <> ''
      AND (
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
      AND EXISTS (
        SELECT 1
        FROM BU_VENDEDOR UB
        WHERE UB.VENDEDOR_ID = :VAR_USER
          AND COALESCE(UB.ATIVO, TRUE) = TRUE
          AND UB.CODFILIAL = '{{codFilial}}'
          AND UB.ID_SECAO = {{idSecao}}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = C.ID
          AND EC.CODFILIAL = '{{codFilial}}'
          AND EC.ID_SECAO = {{idSecao}}
          AND BV.BU_CODIGO = (
            SELECT UB2.BU_CODIGO
            FROM BU_VENDEDOR UB2
            WHERE UB2.VENDEDOR_ID = :VAR_USER
              AND COALESCE(UB2.ATIVO, TRUE) = TRUE
              AND UB2.CODFILIAL = '{{codFilial}}'
              AND UB2.ID_SECAO = {{idSecao}}
            ORDER BY UB2.ID DESC
            LIMIT 1
          )
      )
  `;

  const sfAdicionarCarteira = `
    SELECT
      CASE
        WHEN '{{codFilial}}' = '' OR '{{idSecao}}' = '' THEN 'ESCOPO_OBRIGATORIO'
        WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'CLIENTE_NAO_ENCONTRADO'
        WHEN NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR UB
          WHERE UB.VENDEDOR_ID = :VAR_USER
            AND COALESCE(UB.ATIVO, TRUE) = TRUE
            AND UB.CODFILIAL = '{{codFilial}}'
            AND UB.ID_SECAO = {{idSecao}}
        ) THEN 'ESCOPO_NAO_VINCULADO'
        WHEN EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND EC.ID_VENDEDOR = :VAR_USER
            AND EC.CODFILIAL = '{{codFilial}}'
            AND EC.ID_SECAO = {{idSecao}}
        ) THEN 'JA_NA_SUA_CARTEIRA'
        WHEN EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
            AND BV.CODFILIAL = EC.CODFILIAL
            AND BV.ID_SECAO = EC.ID_SECAO
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND EC.CODFILIAL = '{{codFilial}}'
            AND EC.ID_SECAO = {{idSecao}}
            AND BV.BU_CODIGO = (
              SELECT UB2.BU_CODIGO
              FROM BU_VENDEDOR UB2
              WHERE UB2.VENDEDOR_ID = :VAR_USER
                AND COALESCE(UB2.ATIVO, TRUE) = TRUE
                AND UB2.CODFILIAL = '{{codFilial}}'
                AND UB2.ID_SECAO = {{idSecao}}
              ORDER BY UB2.ID DESC
              LIMIT 1
            )
            AND EC.ID_VENDEDOR <> :VAR_USER
        ) THEN 'MESMA_BU_OCUPADA'
        ELSE 'SUCCESS'
      END AS STATUS,
      CASE
        WHEN '{{codFilial}}' = '' OR '{{idSecao}}' = '' THEN 'Informe filial e seção para adicionar cliente na carteira.'
        WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}}) THEN 'Cliente não encontrado para vinculação.'
        WHEN NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR UB
          WHERE UB.VENDEDOR_ID = :VAR_USER
            AND COALESCE(UB.ATIVO, TRUE) = TRUE
            AND UB.CODFILIAL = '{{codFilial}}'
            AND UB.ID_SECAO = {{idSecao}}
        ) THEN 'Seu usuário não possui vínculo ativo para este escopo de filial/seção.'
        WHEN EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND EC.ID_VENDEDOR = :VAR_USER
            AND EC.CODFILIAL = '{{codFilial}}'
            AND EC.ID_SECAO = {{idSecao}}
        ) THEN 'Cliente já está na sua carteira para este escopo.'
        WHEN EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
            AND BV.CODFILIAL = EC.CODFILIAL
            AND BV.ID_SECAO = EC.ID_SECAO
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND EC.CODFILIAL = '{{codFilial}}'
            AND EC.ID_SECAO = {{idSecao}}
            AND BV.BU_CODIGO = (
              SELECT UB2.BU_CODIGO
              FROM BU_VENDEDOR UB2
              WHERE UB2.VENDEDOR_ID = :VAR_USER
                AND COALESCE(UB2.ATIVO, TRUE) = TRUE
                AND UB2.CODFILIAL = '{{codFilial}}'
                AND UB2.ID_SECAO = {{idSecao}}
              ORDER BY UB2.ID DESC
              LIMIT 1
            )
            AND EC.ID_VENDEDOR <> :VAR_USER
        ) THEN CONCAT(
          'Este cliente já possui responsável de ',
          COALESCE((
            SELECT B.NOME
            FROM BU_VENDEDOR UB
            LEFT JOIN BU B ON B.CODIGO = UB.BU_CODIGO
            WHERE UB.VENDEDOR_ID = :VAR_USER
              AND UB.CODFILIAL = '{{codFilial}}'
              AND UB.ID_SECAO = {{idSecao}}
              AND COALESCE(UB.ATIVO, TRUE) = TRUE
            ORDER BY UB.ID DESC
            LIMIT 1
          ), 'BU'),
          ' / ',
          COALESCE((SELECT S.NOME_SECAO FROM SECAO S WHERE S.ID = {{idSecao}} LIMIT 1), CONCAT('Seção ', '{{idSecao}}')),
          ' na filial ',
          '{{codFilial}}'
        )
        ELSE 'Cliente disponível para adicionar na carteira.'
      END AS MESSAGE
  `;

  const sfInserirCarteira = `
    INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CRIADO_EM)
    SELECT
      {{clienteId}},
      :VAR_USER,
      '{{codFilial}}',
      {{idSecao}},
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    WHERE '{{codFilial}}' <> ''
      AND '{{idSecao}}' <> ''
      AND EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = {{clienteId}})
      AND EXISTS (
        SELECT 1
        FROM BU_VENDEDOR UB
        WHERE UB.VENDEDOR_ID = :VAR_USER
          AND COALESCE(UB.ATIVO, TRUE) = TRUE
          AND UB.CODFILIAL = '{{codFilial}}'
          AND UB.ID_SECAO = {{idSecao}}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.ID_VENDEDOR = :VAR_USER
          AND EC.CODFILIAL = '{{codFilial}}'
          AND EC.ID_SECAO = {{idSecao}}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM EQUIPE_CLIENTE EC
        JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
          AND BV.CODFILIAL = EC.CODFILIAL
          AND BV.ID_SECAO = EC.ID_SECAO
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
        WHERE EC.ID_CLIENTE = {{clienteId}}
          AND EC.CODFILIAL = '{{codFilial}}'
          AND EC.ID_SECAO = {{idSecao}}
          AND BV.BU_CODIGO = (
            SELECT UB2.BU_CODIGO
            FROM BU_VENDEDOR UB2
            WHERE UB2.VENDEDOR_ID = :VAR_USER
              AND COALESCE(UB2.ATIVO, TRUE) = TRUE
              AND UB2.CODFILIAL = '{{codFilial}}'
              AND UB2.ID_SECAO = {{idSecao}}
            ORDER BY UB2.ID DESC
            LIMIT 1
          )
          AND EC.ID_VENDEDOR <> :VAR_USER
      )
  `;

  const sfHistoricoPedidos = `
    SELECT
      BASE.PEDIDO_ID,
      BASE.DATA_PEDIDO,
      BASE.STATUS_PEDIDO,
      BASE.VALOR_TOTAL,
      BASE.MARGEM_MEDIA,
      BASE.TOTAL_ITENS,
      'Exibindo apenas itens do seu departamento/seção' AS NOTA_ESCOPO
    FROM (
      SELECT
        CAST(VT.NUMPED AS SIGNED) AS PEDIDO_ID,
        MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) AS DATA_PEDIDO,
        'FATURADO' AS STATUS_PEDIDO,
        ROUND(SUM(COALESCE(VT.TOTAL, 0)), 2) AS VALOR_TOTAL,
        0 AS MARGEM_MEDIA,
        COUNT(*) AS TOTAL_ITENS,
        ROW_NUMBER() OVER (
          ORDER BY MAX(SUBSTRING(VT.DTSAIDA, 1, 10)) DESC, CAST(VT.NUMPED AS SIGNED) DESC
        ) AS RN
      FROM ${STAGING_TABLE} VT
      JOIN CLIENTES C ON C.WINTHOR_CODCLI = VT.CODCLI
      WHERE C.ID = {{clienteId}}
        AND EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
          JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
            AND BV.CODFILIAL = EC.CODFILIAL
            AND BV.ID_SECAO = EC.ID_SECAO
            AND COALESCE(BV.ATIVO, TRUE) = TRUE
          JOIN SECAO S ON S.ID = EC.ID_SECAO
          WHERE EC.ID_CLIENTE = {{clienteId}}
            AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
            AND TRIM(COALESCE(CAST(VT.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(EC.CODFILIAL, ''))
            AND CAST(VT.CODEPTO AS CHAR) = CAST(BV.BU_CODIGO AS CHAR)
            AND CAST(VT.CODSEC AS SIGNED) = S.ID
        )
      GROUP BY VT.NUMPED
    ) BASE
    WHERE BASE.RN > {{offset}}
      AND BASE.RN <= ({{offset}} + {{limit}})
    ORDER BY BASE.RN
  `;

  const sfListarFiliais = `
    SELECT
      CODFILIAL,
      NOME_FILIAL
    FROM FILIAL
    WHERE COALESCE(ATIVO, TRUE) = TRUE
    ORDER BY NOME_FILIAL, CODFILIAL
  `;

  const sfListarSecoes = `
    SELECT
      S.ID,
      S.NOME_SECAO,
      S.ID_BU,
      B.CODIGO AS BU_CODIGO,
      B.NOME AS BU_NOME
    FROM SECAO S
    LEFT JOIN BU B ON B.ID = S.ID_BU
    WHERE COALESCE(S.ATIVO, TRUE) = TRUE
      AND (
        ('{{idBu}}' <> '' AND S.ID_BU = CAST('{{idBu}}' AS SIGNED))
        OR (
          '{{idBu}}' = ''
          AND EXISTS (
            SELECT 1
            FROM BU_VENDEDOR BV
            JOIN BU B2 ON B2.CODIGO = BV.BU_CODIGO
            WHERE BV.VENDEDOR_ID = :VAR_USER
              AND COALESCE(BV.ATIVO, TRUE) = TRUE
              AND B2.ID = S.ID_BU
          )
        )
      )
    ORDER BY S.NOME_SECAO
  `;

  const sfVincularBuVendedor = `
    INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, CODFILIAL, ID_SECAO, ATIVO, CRIADO_EM, ATUALIZADO_EM)
    VALUES (
      UPPER(TRIM('{{buCodigo}}')),
      {{vendedorId}},
      NULLIF(TRIM('{{codFilial}}'), ''),
      CASE WHEN '{{idSecao}}' = '' THEN NULL ELSE CAST('{{idSecao}}' AS SIGNED) END,
      TRUE,
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    )
    ON DUPLICATE KEY UPDATE
      ATIVO = TRUE,
      ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `;

  const sfListarVinculosBu = `
    SELECT
      BV.ID,
      BV.BU_CODIGO,
      B.NOME AS BU_NOME,
      BV.VENDEDOR_ID,
      COALESCE(F.NOME, U.DESCR) AS VENDEDOR_NOME,
      U.DESCR AS EMAIL,
      BV.CODFILIAL,
      BV.ID_SECAO,
      S.NOME_SECAO,
      COALESCE(BV.ATIVO, TRUE) AS ATIVO,
      BV.ATUALIZADO_EM
    FROM BU_VENDEDOR BV
    LEFT JOIN BU B ON B.CODIGO = BV.BU_CODIGO
    LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
    LEFT JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
    LEFT JOIN FUNCIONARIOS F ON F.ID = BV.VENDEDOR_ID
    WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
      AND (
        '{{busca}}' = ''
        OR BV.BU_CODIGO LIKE '%{{busca}}%'
        OR COALESCE(B.NOME, '') LIKE '%{{busca}}%'
        OR COALESCE(BV.CODFILIAL, '') LIKE '%{{busca}}%'
        OR COALESCE(S.NOME_SECAO, '') LIKE '%{{busca}}%'
        OR CAST(BV.VENDEDOR_ID AS CHAR) LIKE '%{{busca}}%'
        OR COALESCE(F.NOME, U.DESCR) LIKE '%{{busca}}%'
        OR COALESCE(U.DESCR, '') LIKE '%{{busca}}%'
      )
    ORDER BY BV.BU_CODIGO ASC, BV.CODFILIAL ASC, VENDEDOR_NOME ASC
    LIMIT {{limit}} OFFSET {{offset}}
  `;

  const ids = {};
  ids[39] = await upsertServerFunction(
    'listarClientesDisponiveisMinhaBu',
    sfListarDisponiveis,
    'Lista clientes disponíveis por escopo filial + BU + seção do vendedor logado.',
  );
  ids[40] = await upsertServerFunction(
    'contarClientesDisponiveisMinhaBu',
    sfContarDisponiveis,
    'Conta clientes disponíveis por escopo filial + BU + seção do vendedor logado.',
  );
  ids[41] = await upsertServerFunction(
    'adicionarClienteMinhaCarteira',
    sfAdicionarCarteira,
    'Valida inclusão na carteira por escopo filial + BU + seção.',
  );
  ids[116] = await upsertServerFunction(
    'inserirClienteMinhaCarteira',
    sfInserirCarteira,
    'Insere cliente na carteira do usuário no escopo filial + seção informado.',
  );
  ids[25] = await upsertServerFunction(
    'historicoPedidosCliente',
    sfHistoricoPedidos,
    'Histórico de pedidos restrito ao escopo de departamento/seção do usuário.',
  );
  ids.listarFiliais = await upsertServerFunction(
    'listarFiliais',
    sfListarFiliais,
    'Lista filiais ativas para seleção de escopo.',
  );
  ids.listarSecoesDisponiveis = await upsertServerFunction(
    'listarSecoesDisponiveis',
    sfListarSecoes,
    'Lista seções ativas por BU para seleção de escopo.',
  );
  ids[101] = await upsertServerFunction(
    'adminVincularBuVendedor',
    sfVincularBuVendedor,
    'Vincula BU a vendedor com escopo de filial e seção.',
  );
  ids[99] = await upsertServerFunction(
    'adminListarVinculosBuVendedor',
    sfListarVinculosBu,
    'Lista vínculos ativos entre BU e vendedor com filial e seção.',
  );

  return ids;
}

async function validateStructure() {
  const columns = await query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('FILIAL', 'SECAO', 'BU_VENDEDOR', 'EQUIPE_CLIENTE')
      AND COLUMN_NAME IN ('CODFILIAL', 'ID_SECAO', 'ID', 'NOME_SECAO', 'ID_BU')
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);

  const indexes = await query(`
    SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUNAS
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('BU_VENDEDOR', 'EQUIPE_CLIENTE')
    GROUP BY TABLE_NAME, INDEX_NAME
    ORDER BY TABLE_NAME, INDEX_NAME
  `);

  return { columns, indexes };
}

async function main() {
  console.log('Aplicando refatoração estrutural de escopo por Filial + BU + Seção...');

  await ensureFilialAndSecao();
  await ensureEscopoColumnsAndIndexes();
  const sfIds = await upsertCoreFunctions();
  const structure = await validateStructure();

  console.log('Refatoração estrutural concluída.');
  console.log(JSON.stringify({ sfIds, structure }, null, 2));
}

main().catch((error) => {
  console.error('Falha na refatoração estrutural de escopo:');
  console.error(error?.message || error);
  process.exit(1);
});
