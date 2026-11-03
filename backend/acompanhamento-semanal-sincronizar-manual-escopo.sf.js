const { listDataLoadersMitra, executeDataLoaderMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const DATA_LOADER_NAME = 'VENDAS_DASHBOARD_TOTVS_RCA';
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';
const ERRO_RETENCAO_DIAS = 7;
const RUNNING_EXPIRA_MINUTOS = 30;

function escapeSql(value) {
  return String(value || '').replace(/'/g, "''");
}

// Erros da SDK costumam vir como objeto; String(obj) vira "[object Object]"
function errorMessage(error) {
  if (!error) return 'Erro desconhecido';
  if (typeof error === 'string') return error;
  const candidates = [
    error.message,
    error.response?.data?.message,
    error.response?.data?.error,
    error.data?.message,
    error.error?.message,
    error.error,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function scalar(projectId, sql, column) {
  const response = await runQueryMitra({ projectId, sql });
  const row = response?.result?.rows?.[0] || {};
  return Number(row[column] || 0);
}

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};

  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || 0);
  if (!projectId) {
    return { rows: [{ STATUS: 'FAILED', MENSAGEM: 'projectId nao identificado na execucao da sincronizacao manual.' }] };
  }

  const customExecutionId = String(evt.executionId || '').trim();
  const autoExecutionId = `MANUAL${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const executionId = customExecutionId || autoExecutionId;
  const execSql = escapeSql(executionId).slice(0, 32);

  const dataLoaders = await listDataLoadersMitra({ projectId });
  const found = (dataLoaders?.result || []).find((item) => {
    const name = item?.name || item?.NAME || '';
    return name === DATA_LOADER_NAME;
  });
  const dataLoaderId = Number(found?.id || found?.dataLoaderId || 0) || 0;

  if (!dataLoaderId) {
    return { rows: [{ EXECUCAO_ID: executionId, STATUS: 'FAILED', MENSAGEM: `Data Loader ${DATA_LOADER_NAME} nao encontrado.` }] };
  }

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO ACOMP_SEMANAL_SYNC_LOG (EXECUCAO_ID, STATUS, INICIO_EM, CRIADO_EM, MENSAGEM)
      VALUES ('${execSql}', 'RUNNING', SUBSTRING(CURRENT_TIMESTAMP, 1, 19), SUBSTRING(CURRENT_TIMESTAMP, 1, 19), 'Sincronizacao manual iniciada')
      ON DUPLICATE KEY UPDATE
        STATUS = VALUES(STATUS),
        INICIO_EM = VALUES(INICIO_EM),
        MENSAGEM = VALUES(MENSAGEM)
    `,
  });

  // Execucao que nao chegou ao fim (tempo limite ou queda do processo) fica RUNNING para sempre
  await runDmlMitra({
    projectId,
    sql: `
      UPDATE ACOMP_SEMANAL_SYNC_LOG
      SET STATUS = 'FAILED',
          FIM_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          MENSAGEM = 'Execucao interrompida sem finalizar (tempo limite ou queda do processo)'
      WHERE STATUS = 'RUNNING'
        AND EXECUCAO_ID <> '${execSql}'
        AND INICIO_EM < DATE_FORMAT(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${RUNNING_EXPIRA_MINUTOS} MINUTE), '%Y-%m-%d %H:%i:%s')
    `,
  });

  let staleRawBefore = 0;
  let staleAggBefore = 0;

  try {
    staleRawBefore = await scalar(projectId, `SELECT COUNT(*) AS TOTAL FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ATIVO = TRUE AND ULTIMA_EXECUCAO_ID <> '${execSql}'`, 'TOTAL');
    staleAggBefore = await scalar(projectId, `SELECT COUNT(*) AS TOTAL FROM PEDIDOS_SEMANAIS_SYNC WHERE ATIVO = TRUE AND ULTIMA_EXECUCAO_ID <> '${execSql}'`, 'TOTAL');

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
          CONCAT(COALESCE(CAST(I.NUMPED AS CHAR), ''), '|', COALESCE(CAST(I.CODPROD AS CHAR), ''), '|', LEFT(TRIM(COALESCE(CAST(I.CODFILIAL AS CHAR), '')), 10)) AS CHAVE_NATURAL,
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
          ROUND(
            CASE
              WHEN COALESCE(I.QT, 0) > 0 THEN COALESCE(I.QT, 0)
              WHEN COALESCE(I.VLUNIT, 0) > 0 AND COALESCE(I.TOTAL, 0) <> 0 THEN COALESCE(I.TOTAL, 0) / COALESCE(I.VLUNIT, 0)
              WHEN COALESCE(I.TOTAL, 0) > 0 THEN 1
              ELSE COALESCE(I.QT, 0)
            END,
            6
          ) AS QT,
          ROUND(COALESCE(I.VLUNIT, 0), 6) AS VLUNIT,
          ROUND(COALESCE(I.TOTAL, 0), 2) AS TOTAL,
          LEFT(TRIM(COALESCE(CAST(I.DTSAIDA AS CHAR), '')), 10) AS DATA_SAIDA,
          CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(DATE_FORMAT(GREATEST(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY), DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL ((WEEKDAY(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) + 3) % 7) DAY)), '%Y') AS UNSIGNED) ELSE NULL END AS ANO,
          CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN MONTH(GREATEST(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY), DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL ((WEEKDAY(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) + 3) % 7) DAY))) ELSE NULL END AS MES,
          CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CASE WHEN GREATEST(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY), DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL ((WEEKDAY(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) + 3) % 7) DAY)) = DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY) THEN 1 ELSE 2 + FLOOR(DATEDIFF(GREATEST(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY), DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL ((WEEKDAY(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) + 3) % 7) DAY)), DATE_ADD(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY), INTERVAL (CASE WHEN ((4 - WEEKDAY(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY)) + 7) % 7) = 0 THEN 7 ELSE ((4 - WEEKDAY(DATE_SUB(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d'), INTERVAL (DAYOFMONTH(STR_TO_DATE(LEFT(TRIM(CAST(I.DTSAIDA AS CHAR)), 10), '%Y-%m-%d')) - 1) DAY)) + 7) % 7) END) DAY)) / 7) END ELSE NULL END AS SEMANA_NUMERO,
          C.ID AS CLIENTE_ID,
          COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'WINTHOR') AS SEGMENTO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'ERRO_DATA'
            WHEN C.ID IS NULL THEN 'ERRO_CLIENTE'
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN 'ERRO_FILIAL'
            WHEN I.CODEPTO IS NULL OR TRIM(CAST(I.CODEPTO AS CHAR)) = '' THEN 'ERRO_BU'
            WHEN I.CODSEC IS NULL THEN 'ERRO_SECAO'
            WHEN S.ID IS NULL THEN 'ERRO_SECAO_NAO_MAPEADA'
            ELSE 'ATIVO'
          END AS STATUS_INGESTAO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'Data de saida invalida na fonte TOTVS'
            WHEN C.ID IS NULL THEN CONCAT('Cliente TOTVS sem mapeamento interno (CODCLI=', COALESCE(CAST(I.CODCLI AS CHAR), 'NULL'), ')')
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN 'Filial nao informada no item TOTVS'
            WHEN I.CODEPTO IS NULL OR TRIM(CAST(I.CODEPTO AS CHAR)) = '' THEN 'Departamento (BU) nao informado no item TOTVS'
            WHEN I.CODSEC IS NULL THEN 'Secao (CODSEC) nao informada no item TOTVS'
            WHEN S.ID IS NULL THEN CONCAT('Secao nao encontrada na tabela SECAO (CODSEC=', COALESCE(CAST(I.CODSEC AS CHAR), 'NULL'), ', CODEPTO=', COALESCE(CAST(I.CODEPTO AS CHAR), 'NULL'), ')')
            ELSE NULL
          END AS DETALHE_ERRO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN FALSE
            WHEN C.ID IS NULL THEN FALSE
            WHEN I.CODFILIAL IS NULL OR TRIM(CAST(I.CODFILIAL AS CHAR)) = '' THEN FALSE
            WHEN I.CODEPTO IS NULL OR TRIM(CAST(I.CODEPTO AS CHAR)) = '' THEN FALSE
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
        SET ATIVO = FALSE,
            STATUS_INGESTAO = 'INATIVO',
            DETALHE_ERRO = 'Registro ausente na ultima carga da fonte TOTVS',
            ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE ULTIMA_EXECUCAO_ID <> '${execSql}'
          AND ATIVO = TRUE
      `,
    });

    // Erros de ingestao: uma linha por (CHAVE_NATURAL, TIPO_ERRO), sem duplicar a cada execucao.
    // 1) erro presente nesta carga: cria ou reabre e soma a ocorrencia
    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO ACOMP_SEMANAL_SYNC_ERRO_ATUAL (
          CHAVE_NATURAL,
          TIPO_ERRO,
          CODCLI,
          COD_RCA,
          NUMPED,
          CODPROD,
          CODFILIAL,
          CODEPTO,
          CODSECAO,
          DETALHE,
          SITUACAO,
          QTD_OCORRENCIAS,
          PRIMEIRA_EXECUCAO_ID,
          ULTIMA_EXECUCAO_ID,
          PRIMEIRA_OCORRENCIA_EM,
          ULTIMA_OCORRENCIA_EM,
          RESOLVIDO_EM
        )
        SELECT
          R.CHAVE_NATURAL,
          R.STATUS_INGESTAO,
          R.CODCLI,
          R.COD_RCA,
          R.NUMPED,
          R.CODPROD,
          R.CODFILIAL,
          R.CODEPTO,
          R.CODSECAO,
          LEFT(COALESCE(R.DETALHE_ERRO, 'Falha de mapeamento nao especificada'), 500),
          'ABERTO',
          1,
          '${execSql}',
          '${execSql}',
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          NULL
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE R.ULTIMA_EXECUCAO_ID = '${execSql}'
          AND (R.STATUS_INGESTAO LIKE 'ERRO_%')
        ON DUPLICATE KEY UPDATE
          CODCLI = VALUES(CODCLI),
          COD_RCA = VALUES(COD_RCA),
          NUMPED = VALUES(NUMPED),
          CODPROD = VALUES(CODPROD),
          CODFILIAL = VALUES(CODFILIAL),
          CODEPTO = VALUES(CODEPTO),
          CODSECAO = VALUES(CODSECAO),
          DETALHE = VALUES(DETALHE),
          SITUACAO = 'ABERTO',
          QTD_OCORRENCIAS = QTD_OCORRENCIAS + 1,
          ULTIMA_EXECUCAO_ID = VALUES(ULTIMA_EXECUCAO_ID),
          ULTIMA_OCORRENCIA_EM = VALUES(ULTIMA_OCORRENCIA_EM),
          RESOLVIDO_EM = NULL
      `,
    });

    // 2) erro aberto que nao veio nesta carga: resolvido
    await runDmlMitra({
      projectId,
      sql: `
        UPDATE ACOMP_SEMANAL_SYNC_ERRO_ATUAL
        SET SITUACAO = 'RESOLVIDO',
            RESOLVIDO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        WHERE SITUACAO = 'ABERTO'
          AND ULTIMA_EXECUCAO_ID <> '${execSql}'
      `,
    });

    // 3) retencao: resolvidos ha mais de ERRO_RETENCAO_DIAS dias saem da tabela
    await runDmlMitra({
      projectId,
      sql: `
        DELETE FROM ACOMP_SEMANAL_SYNC_ERRO_ATUAL
        WHERE SITUACAO = 'RESOLVIDO'
          AND RESOLVIDO_EM < DATE_FORMAT(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${ERRO_RETENCAO_DIAS} DAY), '%Y-%m-%d %H:%i:%s')
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
          CONCAT(CAST(R.CLIENTE_ID AS CHAR), '|', R.CODFILIAL, '|', R.CODEPTO, '|', CAST(R.ID_SECAO AS CHAR), '|', CAST(R.ANO AS CHAR), '|', CAST(R.MES AS CHAR), '|', CAST(R.SEMANA_NUMERO AS CHAR)) AS CHAVE_AGREGADA,
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
          AND R.CODFILIAL IS NOT NULL
          AND R.CODFILIAL <> ''
          AND R.CODEPTO IS NOT NULL
          AND R.CODEPTO <> ''
          AND R.ID_SECAO IS NOT NULL
          AND R.ANO IS NOT NULL
          AND R.MES IS NOT NULL
          AND R.SEMANA_NUMERO BETWEEN 1 AND 6
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
        SET ATIVO = FALSE,
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

    const metricsResponse = await runQueryMitra({
      projectId,
      sql: `
        SELECT
          (SELECT COUNT(*) FROM ${STAGING_TABLE}) AS TOTAL_FONTE,
          (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}') AS TOTAL_PROCESSADOS,
          (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND ATIVO = TRUE) AS TOTAL_VALIDOS,
          (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND STATUS_INGESTAO LIKE 'ERRO_%') AS TOTAL_ERROS,
          (SELECT COUNT(*) FROM PEDIDOS_SEMANAIS_SYNC WHERE ULTIMA_EXECUCAO_ID = '${execSql}' AND ATIVO = TRUE) AS TOTAL_AGREGADOS_ATIVOS
      `,
    });

    const metrics = metricsResponse?.result?.rows?.[0] || {};

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
          MENSAGEM = 'Sincronizacao manual concluida com sucesso'
        WHERE EXECUCAO_ID = '${execSql}'
      `,
    });

    return {
      rows: [{
        EXECUCAO_ID: executionId,
        STATUS: 'SUCCESS',
        TOTAL_FONTE: Number(metrics.TOTAL_FONTE || 0),
        TOTAL_PROCESSADOS: Number(metrics.TOTAL_PROCESSADOS || 0),
        TOTAL_VALIDOS: Number(metrics.TOTAL_VALIDOS || 0),
        TOTAL_ERROS: Number(metrics.TOTAL_ERROS || 0),
        TOTAL_INATIVADOS_RAW: staleRawBefore,
        TOTAL_INATIVADOS_AGG: staleAggBefore,
        TOTAL_AGREGADOS_ATIVOS: Number(metrics.TOTAL_AGREGADOS_ATIVOS || 0),
      }],
    };
  } catch (error) {
    const message = errorMessage(error);
    const messageSql = escapeSql(message).slice(0, 460);

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE ACOMP_SEMANAL_SYNC_LOG
        SET STATUS = 'FAILED',
            FIM_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
            MENSAGEM = '${messageSql}'
        WHERE EXECUCAO_ID = '${execSql}'
      `,
    });

    return { rows: [{ EXECUCAO_ID: executionId, STATUS: 'FAILED', MENSAGEM: message }] };
  }
}

return run();
