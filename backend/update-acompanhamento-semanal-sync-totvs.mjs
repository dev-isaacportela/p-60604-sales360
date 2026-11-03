import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
  listDataLoadersMitra,
  executeDataLoaderMitra,
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
const DATA_LOADER_NAME = 'VENDAS_DASHBOARD_TOTVS_RCA';
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';

function nowToken() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function escapeSql(value) {
  return String(value || '').replace(/'/g, "''");
}

function errText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

async function query(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

async function scalar(sql, column) {
  const rows = await query(sql);
  return Number(rows[0]?.[column] || 0);
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: OK`);
  } catch (error) {
    const text = errText(error);
    if (text.includes('already exists') || text.includes('duplicate') || text.includes('exists')) {
      console.log(`${label}: ja existente`);
      return;
    }
    throw error;
  }
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  const columns = await query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
  `);

  const hasColumn = columns.some((row) => String(row.COLUMN_NAME).toUpperCase() === String(columnName).toUpperCase());
  if (hasColumn) return;

  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${ddl}` });
  console.log(`Coluna ${tableName}.${columnName}: criada`);
}

async function ensureTables() {
  await runDdlSafe(
    `CREATE TABLE PEDIDOS_SEMANAIS_SYNC_RAW (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CHAVE_NATURAL VARCHAR(255) NOT NULL,
      NUMPED VARCHAR(30),
      NUMTRANSVENDA VARCHAR(30),
      NUMNOTA VARCHAR(30),
      CODFILIAL VARCHAR(10),
      CODPROD INT,
      DESCRICAO VARCHAR(255),
      COD_RCA INT,
      CODCLI INT,
      CODEPTO VARCHAR(50),
      DEPARTAMENTO VARCHAR(150),
      CODSECAO INT,
      SECAO_NOME VARCHAR(150),
      ID_SECAO INT,
      QT DECIMAL(14,6) DEFAULT 0,
      VLUNIT DECIMAL(14,6) DEFAULT 0,
      TOTAL DECIMAL(14,2) DEFAULT 0,
      DATA_SAIDA VARCHAR(10),
      ANO INT,
      MES INT,
      SEMANA_NUMERO INT,
      CLIENTE_ID INT,
      SEGMENTO VARCHAR(100),
      STATUS_INGESTAO VARCHAR(40) DEFAULT 'ATIVO',
      DETALHE_ERRO VARCHAR(500),
      ATIVO BOOLEAN DEFAULT TRUE,
      ULTIMA_EXECUCAO_ID VARCHAR(32),
      CRIADO_EM VARCHAR(19),
      ATUALIZADO_EM VARCHAR(19),
      UNIQUE KEY UX_PEDIDOS_SYNC_RAW_CHAVE (CHAVE_NATURAL),
      KEY IX_PEDIDOS_SYNC_RAW_EXEC (ULTIMA_EXECUCAO_ID),
      KEY IX_PEDIDOS_SYNC_RAW_SCOPE (CODFILIAL, CODEPTO, ID_SECAO, ANO, MES, SEMANA_NUMERO),
      KEY IX_PEDIDOS_SYNC_RAW_CLIENTE (CLIENTE_ID),
      KEY IX_PEDIDOS_SYNC_RAW_PEDIDO (NUMPED)
    )`,
    'Tabela PEDIDOS_SEMANAIS_SYNC_RAW',
  );

  await runDdlSafe(
    `CREATE TABLE PEDIDOS_SEMANAIS_SYNC (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CHAVE_AGREGADA VARCHAR(255) NOT NULL,
      CLIENTE_ID INT NOT NULL,
      CODFILIAL VARCHAR(10) NOT NULL,
      CODEPTO VARCHAR(50) NOT NULL,
      ID_SECAO INT NOT NULL,
      SEGMENTO VARCHAR(100) NOT NULL,
      VALOR DECIMAL(14,2) DEFAULT 0,
      QT DECIMAL(14,6) DEFAULT 0,
      SEMANA_NUMERO INT NOT NULL,
      MES INT NOT NULL,
      ANO INT NOT NULL,
      ATIVO BOOLEAN DEFAULT TRUE,
      ULTIMA_EXECUCAO_ID VARCHAR(32),
      ATUALIZADO_EM VARCHAR(19),
      UNIQUE KEY UX_PEDIDOS_SYNC_CHAVE (CHAVE_AGREGADA),
      KEY IX_PEDIDOS_SYNC_SCOPE (CODFILIAL, CODEPTO, ID_SECAO, ANO, MES, SEMANA_NUMERO, ATIVO),
      KEY IX_PEDIDOS_SYNC_CLIENTE (CLIENTE_ID)
    )`,
    'Tabela PEDIDOS_SEMANAIS_SYNC',
  );

  await runDdlSafe(
    `CREATE TABLE ACOMP_SEMANAL_SYNC_LOG (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      EXECUCAO_ID VARCHAR(32) NOT NULL,
      STATUS VARCHAR(20) NOT NULL,
      INICIO_EM VARCHAR(19),
      FIM_EM VARCHAR(19),
      TOTAL_FONTE INT DEFAULT 0,
      TOTAL_PROCESSADOS INT DEFAULT 0,
      TOTAL_VALIDOS INT DEFAULT 0,
      TOTAL_ERROS INT DEFAULT 0,
      TOTAL_INATIVADOS_RAW INT DEFAULT 0,
      TOTAL_INATIVADOS_AGG INT DEFAULT 0,
      TOTAL_AGREGADOS_ATIVOS INT DEFAULT 0,
      MENSAGEM VARCHAR(500),
      CRIADO_EM VARCHAR(19),
      UNIQUE KEY UX_ACOMP_SYNC_LOG_EXECUCAO (EXECUCAO_ID)
    )`,
    'Tabela ACOMP_SEMANAL_SYNC_LOG',
  );

  await runDdlSafe(
    `CREATE TABLE ACOMP_SEMANAL_SYNC_ERRO (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      EXECUCAO_ID VARCHAR(32) NOT NULL,
      TIPO_ERRO VARCHAR(50) NOT NULL,
      CHAVE_NATURAL VARCHAR(255),
      CODCLI INT,
      COD_RCA INT,
      NUMPED VARCHAR(30),
      CODPROD INT,
      CODFILIAL VARCHAR(10),
      CODEPTO VARCHAR(50),
      CODSECAO INT,
      DETALHE VARCHAR(500),
      OCORRIDO_EM VARCHAR(19),
      KEY IX_ACOMP_SYNC_ERRO_EXEC (EXECUCAO_ID),
      KEY IX_ACOMP_SYNC_ERRO_TIPO (TIPO_ERRO)
    )`,
    'Tabela ACOMP_SEMANAL_SYNC_ERRO',
  );

  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'CODFILIAL', 'CODFILIAL VARCHAR(10)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'CODEPTO', 'CODEPTO VARCHAR(50)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'DEPARTAMENTO', 'DEPARTAMENTO VARCHAR(150)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'CODSECAO', 'CODSECAO INT');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'SECAO_NOME', 'SECAO_NOME VARCHAR(150)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'ID_SECAO', 'ID_SECAO INT');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'DESCRICAO', 'DESCRICAO VARCHAR(255)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'QT', 'QT DECIMAL(14,6) DEFAULT 0');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'VLUNIT', 'VLUNIT DECIMAL(14,6) DEFAULT 0');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC_RAW', 'TOTAL', 'TOTAL DECIMAL(14,2) DEFAULT 0');

  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC', 'CODFILIAL', 'CODFILIAL VARCHAR(10)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC', 'CODEPTO', 'CODEPTO VARCHAR(50)');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC', 'ID_SECAO', 'ID_SECAO INT');
  await addColumnIfMissing('PEDIDOS_SEMANAIS_SYNC', 'QT', 'QT DECIMAL(14,6) DEFAULT 0');

  await addColumnIfMissing('ACOMP_SEMANAL_SYNC_ERRO', 'NUMPED', 'NUMPED VARCHAR(30)');
  await addColumnIfMissing('ACOMP_SEMANAL_SYNC_ERRO', 'CODFILIAL', 'CODFILIAL VARCHAR(10)');
  await addColumnIfMissing('ACOMP_SEMANAL_SYNC_ERRO', 'CODEPTO', 'CODEPTO VARCHAR(50)');
  await addColumnIfMissing('ACOMP_SEMANAL_SYNC_ERRO', 'CODSECAO', 'CODSECAO INT');
}

async function resolveDataLoaderId() {
  const list = await listDataLoadersMitra({ projectId });
  const found = (list?.result || []).find((item) => {
    const name = item?.name || item?.NAME || '';
    return name === DATA_LOADER_NAME;
  });

  const dataLoaderId = Number(found?.id || found?.dataLoaderId || 0) || 0;
  if (!dataLoaderId) {
    throw new Error(`Data Loader ${DATA_LOADER_NAME} nao encontrado.`);
  }
  return dataLoaderId;
}

async function runSyncExecution(executionId, dataLoaderId) {
  const execSql = escapeSql(executionId);

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO ACOMP_SEMANAL_SYNC_LOG (
        EXECUCAO_ID,
        STATUS,
        INICIO_EM,
        CRIADO_EM,
        MENSAGEM
      ) VALUES (
        '${execSql}',
        'RUNNING',
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        'Sincronizacao iniciada'
      )
      ON DUPLICATE KEY UPDATE
        STATUS = VALUES(STATUS),
        INICIO_EM = VALUES(INICIO_EM),
        MENSAGEM = VALUES(MENSAGEM)
    `,
  });

  const staleRawBefore = await scalar(
    `SELECT COUNT(*) AS TOTAL FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ATIVO = TRUE AND ULTIMA_EXECUCAO_ID <> '${execSql}'`,
    'TOTAL',
  );
  const staleAggBefore = await scalar(
    `SELECT COUNT(*) AS TOTAL FROM PEDIDOS_SEMANAIS_SYNC WHERE ATIVO = TRUE AND ULTIMA_EXECUCAO_ID <> '${execSql}'`,
    'TOTAL',
  );

  try {
    await executeDataLoaderMitra({ projectId, dataLoaderId });

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO PEDIDOS_SEMANAIS_SYNC_RAW (
          CHAVE_NATURAL,
          NUMPED,
          NUMTRANSVENDA,
          NUMNOTA,
          CODFILIAL,
          CODPROD,
          DESCRICAO,
          COD_RCA,
          CODCLI,
          CODEPTO,
          DEPARTAMENTO,
          CODSECAO,
          SECAO_NOME,
          ID_SECAO,
          QT,
          VLUNIT,
          TOTAL,
          DATA_SAIDA,
          ANO,
          MES,
          SEMANA_NUMERO,
          CLIENTE_ID,
          SEGMENTO,
          STATUS_INGESTAO,
          DETALHE_ERRO,
          ATIVO,
          ULTIMA_EXECUCAO_ID,
          CRIADO_EM,
          ATUALIZADO_EM
        )
        SELECT
          CONCAT(
            COALESCE(CAST(I.NUMPED AS CHAR), ''), '|',
            COALESCE(CAST(I.CODPROD AS CHAR), ''), '|',
            LEFT(TRIM(COALESCE(CAST(I.CODFILIAL AS CHAR), '')), 10)
          ) AS CHAVE_NATURAL,
          CAST(I.NUMPED AS CHAR),
          CAST(I.NUMTRANSVENDA AS CHAR),
          CAST(I.NUMNOTA AS CHAR),
          LEFT(TRIM(COALESCE(CAST(I.CODFILIAL AS CHAR), '')), 10) AS CODFILIAL,
          CAST(I.CODPROD AS SIGNED),
          LEFT(TRIM(COALESCE(CAST(I.DESCRICAO AS CHAR), '')), 255) AS DESCRICAO,
          CAST(I.COD_RCA AS SIGNED),
          CAST(I.CODCLI AS SIGNED),
          LEFT(TRIM(COALESCE(CAST(I.CODEPTO AS CHAR), '')), 50) AS CODEPTO,
          LEFT(TRIM(COALESCE(CAST(I.DEPARTAMENTO AS CHAR), '')), 150) AS DEPARTAMENTO,
          CAST(I.CODSEC AS SIGNED) AS CODSECAO,
          LEFT(TRIM(COALESCE(CAST(I.SECAO AS CHAR), '')), 150) AS SECAO_NOME,
          S.ID AS ID_SECAO,
          ROUND(COALESCE(I.QT, 0), 6) AS QT,
          ROUND(COALESCE(I.VLUNIT, 0), 6) AS VLUNIT,
          ROUND(COALESCE(I.TOTAL, 0), 2) AS TOTAL,
          LEFT(TRIM(COALESCE(CAST(I.DTSAIDA AS CHAR), '')), 10) AS DATA_SAIDA,
          CASE
            WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(SUBSTRING(I.DTSAIDA, 1, 4) AS UNSIGNED)
            ELSE NULL
          END AS ANO,
          CASE
            WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(SUBSTRING(I.DTSAIDA, 6, 2) AS UNSIGNED)
            ELSE NULL
          END AS MES,
          CASE
            WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(I.DTSAIDA, 9, 2) AS UNSIGNED) / 7)))
            ELSE NULL
          END AS SEMANA_NUMERO,
          C.ID AS CLIENTE_ID,
          COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'WINTHOR') AS SEGMENTO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'ERRO_DATA'
            WHEN C.ID IS NULL THEN 'ERRO_CLIENTE'
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN 'ERRO_FILIAL'
            WHEN I.CODEPTO IS NULL THEN 'ERRO_BU'
            WHEN I.CODSEC IS NULL THEN 'ERRO_SECAO'
            WHEN S.ID IS NULL THEN 'ERRO_SECAO_NAO_MAPEADA'
            ELSE 'ATIVO'
          END AS STATUS_INGESTAO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'Data de saida invalida na fonte TOTVS'
            WHEN C.ID IS NULL THEN CONCAT('Cliente TOTVS sem mapeamento interno (CODCLI=', COALESCE(CAST(I.CODCLI AS CHAR), 'NULL'), ')')
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN 'Filial nao informada no item TOTVS'
            WHEN I.CODEPTO IS NULL THEN 'Departamento (BU) nao informado no item TOTVS'
            WHEN I.CODSEC IS NULL THEN 'Secao (CODSEC) nao informada no item TOTVS'
            WHEN S.ID IS NULL THEN CONCAT('Secao nao encontrada na tabela SECAO (CODSEC=', COALESCE(CAST(I.CODSEC AS CHAR), 'NULL'), ', CODEPTO=', COALESCE(CAST(I.CODEPTO AS CHAR), 'NULL'), ')')
            ELSE NULL
          END AS DETALHE_ERRO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN FALSE
            WHEN C.ID IS NULL THEN FALSE
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN FALSE
            WHEN I.CODEPTO IS NULL THEN FALSE
            WHEN I.CODSEC IS NULL THEN FALSE
            WHEN S.ID IS NULL THEN FALSE
            ELSE TRUE
          END AS ATIVO,
          '${execSql}' AS ULTIMA_EXECUCAO_ID,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        FROM ${STAGING_TABLE} I
        LEFT JOIN CLIENTES C ON C.WINTHOR_CODCLI = I.CODCLI
        LEFT JOIN BU B ON B.CODIGO = CAST(I.CODEPTO AS CHAR)
        LEFT JOIN SECAO S ON S.ID = CAST(I.CODSEC AS SIGNED)
          AND (S.ID_BU = B.ID OR S.ID_BU IS NULL)
        WHERE I.NUMPED IS NOT NULL
          AND I.CODPROD IS NOT NULL
        ON DUPLICATE KEY UPDATE
          NUMPED = VALUES(NUMPED),
          NUMTRANSVENDA = VALUES(NUMTRANSVENDA),
          NUMNOTA = VALUES(NUMNOTA),
          CODFILIAL = VALUES(CODFILIAL),
          CODPROD = VALUES(CODPROD),
          DESCRICAO = VALUES(DESCRICAO),
          COD_RCA = VALUES(COD_RCA),
          CODCLI = VALUES(CODCLI),
          CODEPTO = VALUES(CODEPTO),
          DEPARTAMENTO = VALUES(DEPARTAMENTO),
          CODSECAO = VALUES(CODSECAO),
          SECAO_NOME = VALUES(SECAO_NOME),
          ID_SECAO = VALUES(ID_SECAO),
          QT = VALUES(QT),
          VLUNIT = VALUES(VLUNIT),
          TOTAL = VALUES(TOTAL),
          DATA_SAIDA = VALUES(DATA_SAIDA),
          ANO = VALUES(ANO),
          MES = VALUES(MES),
          SEMANA_NUMERO = VALUES(SEMANA_NUMERO),
          CLIENTE_ID = VALUES(CLIENTE_ID),
          SEGMENTO = VALUES(SEGMENTO),
          STATUS_INGESTAO = VALUES(STATUS_INGESTAO),
          DETALHE_ERRO = VALUES(DETALHE_ERRO),
          ATIVO = VALUES(ATIVO),
          ULTIMA_EXECUCAO_ID = VALUES(ULTIMA_EXECUCAO_ID),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE PEDIDOS_SEMANAIS_SYNC_RAW
        SET
          ATIVO = FALSE,
          STATUS_INGESTAO = 'INATIVO',
          DETALHE_ERRO = 'Registro ausente na ultima carga da fonte TOTVS',
          ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE ULTIMA_EXECUCAO_ID <> '${execSql}'
          AND ATIVO = TRUE
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO ACOMP_SEMANAL_SYNC_ERRO (
          EXECUCAO_ID,
          TIPO_ERRO,
          CHAVE_NATURAL,
          CODCLI,
          COD_RCA,
          NUMPED,
          CODPROD,
          CODFILIAL,
          CODEPTO,
          CODSECAO,
          DETALHE,
          OCORRIDO_EM
        )
        SELECT
          '${execSql}',
          R.STATUS_INGESTAO,
          R.CHAVE_NATURAL,
          R.CODCLI,
          R.COD_RCA,
          R.NUMPED,
          R.CODPROD,
          R.CODFILIAL,
          R.CODEPTO,
          R.CODSECAO,
          COALESCE(R.DETALHE_ERRO, 'Falha de mapeamento nao especificada'),
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE R.ULTIMA_EXECUCAO_ID = '${execSql}'
          AND (R.STATUS_INGESTAO LIKE 'ERRO_%')
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO PEDIDOS_SEMANAIS_SYNC (
          CHAVE_AGREGADA,
          CLIENTE_ID,
          VENDEDOR_ID,
          CODFILIAL,
          CODEPTO,
          ID_SECAO,
          SEGMENTO,
          VALOR,
          QT,
          SEMANA_NUMERO,
          MES,
          ANO,
          ATIVO,
          ULTIMA_EXECUCAO_ID,
          ATUALIZADO_EM
        )
        SELECT
          CONCAT(
            CAST(R.CLIENTE_ID AS CHAR), '|',
            R.CODFILIAL, '|',
            R.CODEPTO, '|',
            CAST(R.ID_SECAO AS CHAR), '|',
            CAST(R.ANO AS CHAR), '|',
            CAST(R.MES AS CHAR), '|',
            CAST(R.SEMANA_NUMERO AS CHAR)
          ) AS CHAVE_AGREGADA,
          R.CLIENTE_ID,
          0 AS VENDEDOR_ID,
          R.CODFILIAL,
          R.CODEPTO,
          R.ID_SECAO,
          MAX(R.SEGMENTO) AS SEGMENTO,
          ROUND(SUM(R.TOTAL), 2) AS VALOR,
          ROUND(SUM(R.QT), 6) AS QT,
          R.SEMANA_NUMERO,
          R.MES,
          R.ANO,
          TRUE,
          '${execSql}',
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE R.ATIVO = TRUE
          AND R.CLIENTE_ID IS NOT NULL
          AND R.CODFILIAL <> ''
          AND R.CODEPTO <> ''
          AND R.ID_SECAO IS NOT NULL
          AND R.ANO IS NOT NULL
          AND R.MES IS NOT NULL
          AND R.SEMANA_NUMERO BETWEEN 1 AND 5
        GROUP BY R.CLIENTE_ID, R.CODFILIAL, R.CODEPTO, R.ID_SECAO, R.ANO, R.MES, R.SEMANA_NUMERO
        ON DUPLICATE KEY UPDATE
          VENDEDOR_ID = VALUES(VENDEDOR_ID),
          SEGMENTO = VALUES(SEGMENTO),
          VALOR = VALUES(VALOR),
          QT = VALUES(QT),
          ATIVO = TRUE,
          ULTIMA_EXECUCAO_ID = VALUES(ULTIMA_EXECUCAO_ID),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE PEDIDOS_SEMANAIS_SYNC
        SET
          ATIVO = FALSE,
          ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE ULTIMA_EXECUCAO_ID <> '${execSql}'
          AND ATIVO = TRUE
      `,
    });

    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO PERFIL_COMPRA_CLIENTE (CLIENTE_ID, FREQUENCIA, SEMANA_PADRAO, TICKET_MEDIO_3M, ATUALIZADO_EM)
        SELECT
          BASE.CLIENTE_ID,
          BASE.FREQUENCIA,
          BASE.SEMANA_PADRAO,
          BASE.TICKET_MEDIO_3M,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        FROM (
          SELECT
            PS.CLIENTE_ID,
            CASE
              WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 9 THEN 'SEMANAL'
              WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 4 THEN 'QUINZENAL'
              ELSE 'MENSAL'
            END AS FREQUENCIA,
            (
              SELECT P2.SEMANA_NUMERO
              FROM PEDIDOS_SEMANAIS_SYNC P2
              WHERE P2.CLIENTE_ID = PS.CLIENTE_ID
                AND P2.ATIVO = TRUE
                AND STR_TO_DATE(CONCAT(P2.ANO, '-', LPAD(P2.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
              GROUP BY P2.SEMANA_NUMERO
              ORDER BY COUNT(*) DESC, P2.SEMANA_NUMERO
              LIMIT 1
            ) AS SEMANA_PADRAO,
            ROUND(AVG(PS.VALOR), 2) AS TICKET_MEDIO_3M
          FROM PEDIDOS_SEMANAIS_SYNC PS
          WHERE PS.ATIVO = TRUE
            AND STR_TO_DATE(CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
          GROUP BY PS.CLIENTE_ID
        ) BASE
        ON DUPLICATE KEY UPDATE
          FREQUENCIA = VALUES(FREQUENCIA),
          SEMANA_PADRAO = VALUES(SEMANA_PADRAO),
          TICKET_MEDIO_3M = VALUES(TICKET_MEDIO_3M),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
      `,
    });

    const metricsRows = await query(`
      SELECT
        (SELECT COUNT(*) FROM ${STAGING_TABLE}) AS TOTAL_FONTE,
        (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}') AS TOTAL_PROCESSADOS,
        (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND ATIVO = TRUE) AS TOTAL_VALIDOS,
        (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND STATUS_INGESTAO LIKE 'ERRO_%') AS TOTAL_ERROS,
        (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND ATIVO = TRUE) AS TOTAL_AGREGADOS_ATIVOS
    `);
    const metrics = metricsRows[0] || {};

    const countsByScope = await query(`
      SELECT
        CODFILIAL,
        CODEPTO,
        ID_SECAO,
        COUNT(*) AS LINHAS_AGREGADAS,
        ROUND(SUM(VALOR), 2) AS VALOR_TOTAL
      FROM PEDIDOS_SEMANAIS_SYNC
      WHERE ULTIMA_EXECUCAO_ID = '${execSql}'
        AND ATIVO = TRUE
      GROUP BY CODFILIAL, CODEPTO, ID_SECAO
      ORDER BY CODFILIAL, CODEPTO, ID_SECAO
    `);

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE ACOMP_SEMANAL_SYNC_LOG
        SET
          STATUS = 'SUCCESS',
          FIM_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          TOTAL_FONTE = ${Number(metrics.TOTAL_FONTE || 0)},
          TOTAL_PROCESSADOS = ${Number(metrics.TOTAL_PROCESSADOS || 0)},
          TOTAL_VALIDOS = ${Number(metrics.TOTAL_VALIDOS || 0)},
          TOTAL_ERROS = ${Number(metrics.TOTAL_ERROS || 0)},
          TOTAL_INATIVADOS_RAW = ${staleRawBefore},
          TOTAL_INATIVADOS_AGG = ${staleAggBefore},
          TOTAL_AGREGADOS_ATIVOS = ${Number(metrics.TOTAL_AGREGADOS_ATIVOS || 0)},
          MENSAGEM = 'Sincronizacao concluida com sucesso'
        WHERE EXECUCAO_ID = '${execSql}'
      `,
    });

    return {
      executionId,
      totalFonte: Number(metrics.TOTAL_FONTE || 0),
      totalProcessados: Number(metrics.TOTAL_PROCESSADOS || 0),
      totalValidos: Number(metrics.TOTAL_VALIDOS || 0),
      totalErros: Number(metrics.TOTAL_ERROS || 0),
      totalInativadosRaw: staleRawBefore,
      totalInativadosAgg: staleAggBefore,
      totalAgregadosAtivos: Number(metrics.TOTAL_AGREGADOS_ATIVOS || 0),
      countsByScope,
    };
  } catch (error) {
    const message = escapeSql(String(error?.message || error).slice(0, 460));
    await runDmlMitra({
      projectId,
      sql: `
        UPDATE ACOMP_SEMANAL_SYNC_LOG
        SET
          STATUS = 'FAILED',
          FIM_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          MENSAGEM = '${message}'
        WHERE EXECUCAO_ID = '${execSql}'
      `,
    });
    throw error;
  }
}

async function upsertServerFunction(name, description, code) {
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

async function upsertCoreSfs() {
  const sf103 = `
    INSERT INTO PERFIL_COMPRA_CLIENTE (CLIENTE_ID, FREQUENCIA, SEMANA_PADRAO, TICKET_MEDIO_3M, ATUALIZADO_EM)
    SELECT
      BASE.CLIENTE_ID,
      BASE.FREQUENCIA,
      BASE.SEMANA_PADRAO,
      BASE.TICKET_MEDIO_3M,
      SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
    FROM (
      SELECT
        PS.CLIENTE_ID,
        CASE
          WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 9 THEN 'SEMANAL'
          WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 4 THEN 'QUINZENAL'
          ELSE 'MENSAL'
        END AS FREQUENCIA,
        (
          SELECT P2.SEMANA_NUMERO
          FROM PEDIDOS_SEMANAIS_SYNC P2
          WHERE P2.CLIENTE_ID = PS.CLIENTE_ID
            AND P2.ATIVO = TRUE
            AND STR_TO_DATE(CONCAT(P2.ANO, '-', LPAD(P2.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
          GROUP BY P2.SEMANA_NUMERO
          ORDER BY COUNT(*) DESC, P2.SEMANA_NUMERO
          LIMIT 1
        ) AS SEMANA_PADRAO,
        ROUND(AVG(PS.VALOR), 2) AS TICKET_MEDIO_3M
      FROM PEDIDOS_SEMANAIS_SYNC PS
      WHERE PS.ATIVO = TRUE
        AND STR_TO_DATE(CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
        AND ('{{clienteId}}' = '' OR PS.CLIENTE_ID = CAST('{{clienteId}}' AS UNSIGNED))
      GROUP BY PS.CLIENTE_ID
    ) BASE
    ON DUPLICATE KEY UPDATE
      FREQUENCIA = VALUES(FREQUENCIA),
      SEMANA_PADRAO = VALUES(SEMANA_PADRAO),
      TICKET_MEDIO_3M = VALUES(TICKET_MEDIO_3M),
      ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `;

  const sf104 = `
    WITH PARAMS AS (
      SELECT
        CASE WHEN '{{mes}}' = '' THEN MONTH(CURRENT_DATE) ELSE CAST('{{mes}}' AS UNSIGNED) END AS MES_REF,
        CASE WHEN '{{ano}}' = '' THEN YEAR(CURRENT_DATE) ELSE CAST('{{ano}}' AS UNSIGNED) END AS ANO_REF,
        CASE WHEN '{{semanaNumero}}' = '' THEN CEIL(DAY(CURRENT_DATE) / 7) ELSE CAST('{{semanaNumero}}' AS UNSIGNED) END AS SEMANA_REF
    ),
    PERIODO_ANTERIOR AS (
      SELECT
        CASE WHEN P.MES_REF = 1 THEN 12 ELSE P.MES_REF - 1 END AS MES_ANT,
        CASE WHEN P.MES_REF = 1 THEN P.ANO_REF - 1 ELSE P.ANO_REF END AS ANO_ANT
      FROM PARAMS P
    ),
    ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    ),
    BASE_ATUAL AS (
      SELECT PS.*
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN PARAMS P ON 1 = 1
      JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
        AND E.CODFILIAL = PS.CODFILIAL
        AND E.CODEPTO = PS.CODEPTO
        AND E.ID_SECAO = PS.ID_SECAO
      WHERE PS.ATIVO = TRUE
        AND PS.ANO = P.ANO_REF
        AND PS.MES = P.MES_REF
        AND ('{{segmento}}' = '' OR UPPER(PS.SEGMENTO) = UPPER('{{segmento}}'))
        AND ('{{codFilial}}' = '' OR PS.CODFILIAL = '{{codFilial}}')
        AND ('{{idSecao}}' = '' OR PS.ID_SECAO = CAST('{{idSecao}}' AS SIGNED))
    ),
    BASE_CLIENTES AS (
      SELECT CLIENTE_ID, MAX(SEGMENTO) AS SEGMENTO
      FROM BASE_ATUAL
      GROUP BY CLIENTE_ID
    ),
    SEMANAS_MES AS (
      SELECT
        CLIENTE_ID,
        SUM(CASE WHEN SEMANA_NUMERO = 1 THEN VALOR ELSE 0 END) AS SEM_1,
        SUM(CASE WHEN SEMANA_NUMERO = 2 THEN VALOR ELSE 0 END) AS SEM_2,
        SUM(CASE WHEN SEMANA_NUMERO = 3 THEN VALOR ELSE 0 END) AS SEM_3,
        SUM(CASE WHEN SEMANA_NUMERO = 4 THEN VALOR ELSE 0 END) AS SEM_4,
        SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5,
        SUM(VALOR) AS FECHAMENTO_MES
      FROM BASE_ATUAL
      GROUP BY CLIENTE_ID
    ),
    SEMANA_ATUAL AS (
      SELECT CLIENTE_ID, SUM(VALOR) AS VALOR_ATUAL
      FROM BASE_ATUAL
      WHERE SEMANA_NUMERO = (SELECT SEMANA_REF FROM PARAMS)
      GROUP BY CLIENTE_ID
    ),
    SEMANA_ANTERIOR AS (
      SELECT
        PS.CLIENTE_ID,
        SUM(PS.VALOR) AS VALOR_ANTERIOR
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN PARAMS P ON 1 = 1
      JOIN PERIODO_ANTERIOR PA ON 1 = 1
      JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
        AND E.CODFILIAL = PS.CODFILIAL
        AND E.CODEPTO = PS.CODEPTO
        AND E.ID_SECAO = PS.ID_SECAO
      WHERE PS.ATIVO = TRUE
        AND PS.MES = PA.MES_ANT
        AND PS.ANO = PA.ANO_ANT
        AND PS.SEMANA_NUMERO = P.SEMANA_REF
      GROUP BY PS.CLIENTE_ID
    )
    SELECT
      BC.CLIENTE_ID,
      C.NOME_FANTASIA AS CLIENTE,
      BC.SEGMENTO,
      :VAR_USER AS VENDEDOR_ID,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', :VAR_USER)) AS VENDEDOR,
      COALESCE(SM.SEM_1, 0) AS SEM_1,
      COALESCE(SM.SEM_2, 0) AS SEM_2,
      COALESCE(SM.SEM_3, 0) AS SEM_3,
      COALESCE(SM.SEM_4, 0) AS SEM_4,
      COALESCE(SM.SEM_5, 0) AS SEM_5,
      COALESCE(SM.FECHAMENTO_MES, 0) AS FECHAMENTO_MES,
      COALESCE(SA.VALOR_ATUAL, 0) AS VALOR_SEMANA_ATUAL,
      SA2.VALOR_ANTERIOR AS VALOR_SEMANA_ANTERIOR,
      CASE
        WHEN SA2.VALOR_ANTERIOR IS NULL OR SA2.VALOR_ANTERIOR = 0 THEN -1
        ELSE ROUND((COALESCE(SA.VALOR_ATUAL, 0) - SA2.VALOR_ANTERIOR) / SA2.VALOR_ANTERIOR, 4)
      END AS DELTA_BW,
      PC.FREQUENCIA,
      PC.SEMANA_PADRAO,
      COALESCE(PC.TICKET_MEDIO_3M, 0) AS TICKET_MEDIO_3M,
      CASE
        WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 15000 THEN 'A'
        WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 7000 THEN 'B'
        ELSE 'C'
      END AS CURVA,
      CASE
        WHEN ((PC.FREQUENCIA = 'SEMANAL' OR PC.SEMANA_PADRAO = (SELECT SEMANA_REF FROM PARAMS)) AND COALESCE(SA.VALOR_ATUAL, 0) = 0) THEN 'Alerta'
        WHEN PC.SEMANA_PADRAO IS NOT NULL
          AND PC.FREQUENCIA <> 'SEMANAL'
          AND PC.SEMANA_PADRAO <> (SELECT SEMANA_REF FROM PARAMS)
          AND COALESCE(SA.VALOR_ATUAL, 0) > 0 THEN 'Fora do padrao'
        ELSE 'No padrao'
      END AS STATUS,
      'Exibindo apenas itens do seu departamento/seção' AS NOTA_ESCOPO
    FROM BASE_CLIENTES BC
    LEFT JOIN CLIENTES C ON C.ID = BC.CLIENTE_ID
    LEFT JOIN INT_USER U ON U.ID = :VAR_USER
    LEFT JOIN SEMANAS_MES SM ON SM.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ATUAL SA ON SA.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN SEMANA_ANTERIOR SA2 ON SA2.CLIENTE_ID = BC.CLIENTE_ID
    LEFT JOIN PERFIL_COMPRA_CLIENTE PC ON PC.CLIENTE_ID = BC.CLIENTE_ID
    ORDER BY CLIENTE
  `;

  const sf105 = `
    WITH PARAMS AS (
      SELECT
        CASE WHEN '{{mes}}' = '' THEN MONTH(CURRENT_DATE) ELSE CAST('{{mes}}' AS UNSIGNED) END AS MES_REF,
        CASE WHEN '{{ano}}' = '' THEN YEAR(CURRENT_DATE) ELSE CAST('{{ano}}' AS UNSIGNED) END AS ANO_REF,
        CASE WHEN '{{semanaNumero}}' = '' THEN CEIL(DAY(CURRENT_DATE) / 7) ELSE CAST('{{semanaNumero}}' AS UNSIGNED) END AS SEMANA_REF
    ),
    ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )
    SELECT
      PC.CLIENTE_ID,
      C.NOME_FANTASIA AS CLIENTE,
      COALESCE(C.SEGMENTO, 'Sem segmento') AS SEGMENTO,
      :VAR_USER AS VENDEDOR_ID,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', :VAR_USER)) AS VENDEDOR,
      PC.TICKET_MEDIO_3M,
      PC.FREQUENCIA,
      PC.SEMANA_PADRAO,
      E.CODFILIAL,
      E.CODEPTO,
      E.ID_SECAO
    FROM PERFIL_COMPRA_CLIENTE PC
    JOIN CLIENTES C ON C.ID = PC.CLIENTE_ID
    JOIN ESCOPO E ON E.ID_CLIENTE = PC.CLIENTE_ID
    LEFT JOIN INT_USER U ON U.ID = :VAR_USER
    JOIN PARAMS P ON 1 = 1
    WHERE (PC.FREQUENCIA = 'SEMANAL' OR PC.SEMANA_PADRAO = P.SEMANA_REF)
      AND ('{{segmento}}' = '' OR UPPER(C.SEGMENTO) = UPPER('{{segmento}}'))
      AND ('{{codFilial}}' = '' OR E.CODFILIAL = '{{codFilial}}')
      AND ('{{idSecao}}' = '' OR E.ID_SECAO = CAST('{{idSecao}}' AS SIGNED))
      AND NOT EXISTS (
        SELECT 1
        FROM PEDIDOS_SEMANAIS_SYNC PSW
        WHERE PSW.CLIENTE_ID = PC.CLIENTE_ID
          AND PSW.CODFILIAL = E.CODFILIAL
          AND PSW.CODEPTO = E.CODEPTO
          AND PSW.ID_SECAO = E.ID_SECAO
          AND PSW.ATIVO = TRUE
          AND PSW.MES = P.MES_REF
          AND PSW.ANO = P.ANO_REF
          AND PSW.SEMANA_NUMERO = P.SEMANA_REF
      )
    ORDER BY PC.TICKET_MEDIO_3M DESC, C.NOME_FANTASIA
  `;

  const sf106 = `
    SELECT
      EXECUCAO_ID,
      STATUS,
      INICIO_EM,
      FIM_EM,
      TOTAL_FONTE,
      TOTAL_PROCESSADOS,
      TOTAL_VALIDOS,
      TOTAL_ERROS,
      TOTAL_INATIVADOS_RAW,
      TOTAL_INATIVADOS_AGG,
      TOTAL_AGREGADOS_ATIVOS,
      MENSAGEM
    FROM ACOMP_SEMANAL_SYNC_LOG
    ORDER BY ID DESC
    LIMIT 1
  `;

  const ids = {};
  ids.calcularPerfilCliente = await upsertServerFunction(
    'calcular-perfil-cliente',
    'Recalcula o perfil de compra dos ultimos 3 meses usando base sincronizada do TOTVS por escopo filial/BU/seção.',
    sf103,
  );
  ids.calcularBwSemanal = await upsertServerFunction(
    'calcular-bw-semanal',
    'Calcula B/W semanal com filtro de escopo por filial + BU + seção do usuario logado.',
    sf104,
  );
  ids.alertasAusenciaPedido = await upsertServerFunction(
    'alertas-ausencia-pedido',
    'Lista clientes esperados sem pedido na semana atual, restritos ao escopo do usuario.',
    sf105,
  );
  ids.statusSync = await upsertServerFunction(
    'acompanhamento-semanal-status-sync',
    'Retorna status da ultima sincronizacao TOTVS do modulo de acompanhamento semanal.',
    sf106,
  );

  return ids;
}

async function upsertDerivedSfs() {
  const sf109 = `
    WITH ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )
    SELECT
      R.ANO,
      R.MES,
      R.SEMANA_NUMERO,
      DATE_FORMAT(MIN(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_INICIO_SEMANA,
      DATE_FORMAT(MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_FIM_SEMANA,
      COUNT(DISTINCT COALESCE(NULLIF(CAST(R.NUMPED AS CHAR), ''), CAST(R.NUMTRANSVENDA AS CHAR))) AS TOTAL_PEDIDOS,
      ROUND(SUM(R.TOTAL), 2) AS VALOR_TOTAL_SEMANA
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND E.CODFILIAL = R.CODFILIAL
      AND E.CODEPTO = R.CODEPTO
      AND E.ID_SECAO = R.ID_SECAO
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = {{ID_CLIENTE}}
      AND R.ANO = CASE WHEN '{{ANO}}' = '' THEN YEAR(CURRENT_DATE) ELSE CAST('{{ANO}}' AS UNSIGNED) END
      AND ('{{MES}}' = '' OR R.MES = CAST('{{MES}}' AS UNSIGNED))
    GROUP BY R.ANO, R.MES, R.SEMANA_NUMERO
    ORDER BY R.ANO DESC, R.MES DESC, R.SEMANA_NUMERO DESC
  `;

  const sf110 = `
    WITH ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )
    SELECT
      R.CODPROD,
      R.DESCRICAO AS DESCRICAO_PRODUTO,
      ROUND(SUM(COALESCE(R.QT, 0)), 6) AS QT_TOTAL_SEMANA,
      ROUND(
        CASE
          WHEN SUM(COALESCE(R.QT, 0)) = 0 THEN 0
          ELSE SUM(COALESCE(R.TOTAL, 0)) / SUM(COALESCE(R.QT, 0))
        END,
        6
      ) AS VALOR_UNITARIO,
      ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_PRODUTO_SEMANA,
      'Exibindo apenas itens do seu departamento/seção' AS NOTA_ESCOPO
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND E.CODFILIAL = R.CODFILIAL
      AND E.CODEPTO = R.CODEPTO
      AND E.ID_SECAO = R.ID_SECAO
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = {{ID_CLIENTE}}
      AND R.ANO = CAST('{{ANO}}' AS UNSIGNED)
      AND R.SEMANA_NUMERO = {{SEMANA_NUMERO}}
      AND ('{{MES}}' = '' OR R.MES = CAST('{{MES}}' AS UNSIGNED))
    GROUP BY R.CODPROD, R.DESCRICAO
    ORDER BY R.CODPROD
  `;

  const sf111 = `
    WITH ESCOPO AS (
      SELECT DISTINCT
        EC.ID_CLIENTE,
        EC.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        EC.ID_SECAO
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
        AND BV.CODFILIAL = EC.CODFILIAL
        AND BV.ID_SECAO = EC.ID_SECAO
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
      WHERE (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
    )
    SELECT
      CAST(R.NUMPED AS CHAR) AS NUMPEDIDO,
      ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_PEDIDO,
      DATE_FORMAT(MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')), '%Y-%m-%d') AS DATA_PEDIDO
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    JOIN ESCOPO E ON E.ID_CLIENTE = R.CLIENTE_ID
      AND E.CODFILIAL = R.CODFILIAL
      AND E.CODEPTO = R.CODEPTO
      AND E.ID_SECAO = R.ID_SECAO
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
      AND R.CLIENTE_ID = {{ID_CLIENTE}}
      AND R.ANO = CAST('{{ANO}}' AS UNSIGNED)
      AND R.SEMANA_NUMERO = {{SEMANA_NUMERO}}
      AND ('{{MES}}' = '' OR R.MES = CAST('{{MES}}' AS UNSIGNED))
    GROUP BY CAST(R.NUMPED AS CHAR)
    ORDER BY MAX(STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d')) ASC, CAST(R.NUMPED AS UNSIGNED)
  `;

  const ids = {};
  ids.clienteDetalheVendasSemanais = await upsertServerFunction(
    'clienteDetalheVendasSemanais',
    'Detalha vendas semanais do cliente respeitando escopo filial + BU + secao do usuario.',
    sf109,
  );
  ids.clienteDetalheItensSemana = await upsertServerFunction(
    'clienteDetalheItensSemana',
    'Detalha itens da semana por cliente com filtro de escopo do usuario.',
    sf110,
  );
  ids.clienteDetalheResumoPedidosSemana = await upsertServerFunction(
    'clienteDetalheResumoPedidosSemana',
    'Resumo de pedidos da semana por cliente com filtro de escopo do usuario.',
    sf111,
  );

  return ids;
}

async function runSourceComparisonSample() {
  const rows = await query(`
    SELECT
      CODFILIAL,
      CODEPTO,
      ID_SECAO,
      COUNT(*) AS LINHAS_AGREGADAS,
      ROUND(SUM(VALOR), 2) AS VALOR_TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC
    WHERE ATIVO = TRUE
      AND ANO = YEAR(CURRENT_DATE)
      AND MES = MONTH(CURRENT_DATE)
    GROUP BY CODFILIAL, CODEPTO, ID_SECAO
    ORDER BY CODFILIAL, CODEPTO, ID_SECAO
    LIMIT 20
  `);
  return rows;
}

async function main() {
  console.log('Iniciando ajuste do pipeline TOTVS -> Acompanhamento Semanal (escopo filial+BU+secao)...');

  await ensureTables();
  const dataLoaderId = await resolveDataLoaderId();

  const firstExecutionId = `ACOMP${nowToken()}A`;
  const firstMetrics = await runSyncExecution(firstExecutionId, dataLoaderId);

  const secondExecutionId = `ACOMP${nowToken()}B`;
  const secondMetrics = await runSyncExecution(secondExecutionId, dataLoaderId);

  const sfIds = await upsertCoreSfs();
  const derivedIds = await upsertDerivedSfs();
  const scopeSample = await runSourceComparisonSample();

  console.log('Pipeline TOTVS do Acompanhamento Semanal concluido.');
  console.log(JSON.stringify({
    dataLoaderId,
    firstExecution: firstMetrics,
    secondExecution: secondMetrics,
    sfIds,
    derivedIds,
    countsByScopeSample: scopeSample,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha no ajuste do pipeline TOTVS do acompanhamento semanal:');
  console.error(error?.message || error);
  process.exit(1);
});
