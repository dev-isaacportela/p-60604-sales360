const { listDataLoadersMitra, executeDataLoaderMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const DATA_LOADER_NAME = 'VENDAS_DASHBOARD_TOTVS_RCA';
const STAGING_TABLE = 'IMP_VENDAS_DASHBOARD_TOTVS_RCA';

function escapeSql(value) {
  return String(value || '').replace(/'/g, "''");
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
    return {
      rows: [{
        STATUS: 'FAILED',
        MENSAGEM: 'projectId nao identificado na execucao da sincronizacao manual.',
      }],
    };
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
    return {
      rows: [{
        EXECUCAO_ID: executionId,
        STATUS: 'FAILED',
        MENSAGEM: `Data Loader ${DATA_LOADER_NAME} nao encontrado.`,
      }],
    };
  }

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
        'Sincronizacao manual iniciada'
      )
      ON DUPLICATE KEY UPDATE
        STATUS = VALUES(STATUS),
        INICIO_EM = VALUES(INICIO_EM),
        MENSAGEM = VALUES(MENSAGEM)
    `,
  });

  const staleRawBefore = await scalar(
    projectId,
    `SELECT COUNT(*) AS TOTAL FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE ATIVO = TRUE AND ULTIMA_EXECUCAO_ID <> '${execSql}'`,
    'TOTAL',
  );
  const staleAggBefore = await scalar(
    projectId,
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
          NUMTRANSVENDA,
          NUMNOTA,
          NUMPED,
          CODCLI,
          COD_RCA,
          CODPROD,
          DATA_SAIDA,
          ANO,
          MES,
          SEMANA_NUMERO,
          VALOR,
          CLIENTE_ID,
          VENDEDOR_ID,
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
            COALESCE(CAST(I.NUMTRANSVENDA AS CHAR), ''), '|',
            COALESCE(CAST(I.CODCLI AS CHAR), ''), '|',
            COALESCE(CAST(I.CODPROD AS CHAR), ''), '|',
            COALESCE(CAST(I.COD_RCA AS CHAR), ''), '|',
            COALESCE(I.DTSAIDA, '')
          ) AS CHAVE_NATURAL,
          CAST(I.NUMTRANSVENDA AS CHAR) AS NUMTRANSVENDA,
          CAST(I.NUMNOTA AS CHAR) AS NUMNOTA,
          CAST(I.NUMPED AS CHAR) AS NUMPED,
          I.CODCLI,
          I.COD_RCA,
          I.CODPROD,
          I.DTSAIDA,
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
          ROUND(COALESCE(I.TOTAL, 0), 2) AS VALOR,
          C.ID AS CLIENTE_ID,
          VR.USER_ID AS VENDEDOR_ID,
          COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'WINTHOR') AS SEGMENTO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'ERRO_DATA'
            WHEN C.ID IS NULL THEN 'ERRO_CLIENTE'
            WHEN VR.USER_ID IS NULL THEN 'ERRO_RCA'
            WHEN NOT EXISTS (
              SELECT 1
              FROM RCA_DEPARTAMENTO RD
              WHERE RD.ATIVO = TRUE
                AND RD.COD_RCA = I.COD_RCA
                AND RD.COD_DEPARTAMENTO = CAST(I.CODEPTO AS CHAR)
            ) THEN 'ERRO_DEPARTAMENTO_RCA'
            ELSE 'ATIVO'
          END AS STATUS_INGESTAO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'Data de saida invalida na fonte TOTVS'
            WHEN C.ID IS NULL THEN CONCAT('Cliente TOTVS sem mapeamento interno (CODCLI=', COALESCE(CAST(I.CODCLI AS CHAR), 'NULL'), ')')
            WHEN VR.USER_ID IS NULL THEN CONCAT('RCA TOTVS sem vinculo de vendedor interno (COD_RCA=', COALESCE(CAST(I.COD_RCA AS CHAR), 'NULL'), ')')
            WHEN NOT EXISTS (
              SELECT 1
              FROM RCA_DEPARTAMENTO RD
              WHERE RD.ATIVO = TRUE
                AND RD.COD_RCA = I.COD_RCA
                AND RD.COD_DEPARTAMENTO = CAST(I.CODEPTO AS CHAR)
            ) THEN CONCAT('Produto fora do departamento vinculado ao RCA (RCA=', COALESCE(CAST(I.COD_RCA AS CHAR), 'NULL'), ', CODEPTO=', COALESCE(CAST(I.CODEPTO AS CHAR), 'NULL'), ')')
            ELSE NULL
          END AS DETALHE_ERRO,
          CASE
            WHEN I.DTSAIDA IS NULL OR I.DTSAIDA = '' OR I.DTSAIDA NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN FALSE
            WHEN C.ID IS NULL THEN FALSE
            WHEN VR.USER_ID IS NULL THEN FALSE
            WHEN NOT EXISTS (
              SELECT 1
              FROM RCA_DEPARTAMENTO RD
              WHERE RD.ATIVO = TRUE
                AND RD.COD_RCA = I.COD_RCA
                AND RD.COD_DEPARTAMENTO = CAST(I.CODEPTO AS CHAR)
            ) THEN FALSE
            ELSE TRUE
          END AS ATIVO,
          '${execSql}' AS ULTIMA_EXECUCAO_ID,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS CRIADO_EM,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS ATUALIZADO_EM
        FROM ${STAGING_TABLE} I
        LEFT JOIN CLIENTES C ON C.WINTHOR_CODCLI = I.CODCLI
        LEFT JOIN VENDEDOR_RCA VR ON VR.COD_RCA = I.COD_RCA
        WHERE I.CODCLI IS NOT NULL
        ON DUPLICATE KEY UPDATE
          NUMTRANSVENDA = VALUES(NUMTRANSVENDA),
          NUMNOTA = VALUES(NUMNOTA),
          NUMPED = VALUES(NUMPED),
          CODCLI = VALUES(CODCLI),
          COD_RCA = VALUES(COD_RCA),
          CODPROD = VALUES(CODPROD),
          DATA_SAIDA = VALUES(DATA_SAIDA),
          ANO = VALUES(ANO),
          MES = VALUES(MES),
          SEMANA_NUMERO = VALUES(SEMANA_NUMERO),
          VALOR = VALUES(VALOR),
          CLIENTE_ID = VALUES(CLIENTE_ID),
          VENDEDOR_ID = VALUES(VENDEDOR_ID),
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
          NUMTRANSVENDA,
          CODPROD,
          DETALHE,
          OCORRIDO_EM
        )
        SELECT
          '${execSql}',
          R.STATUS_INGESTAO,
          R.CHAVE_NATURAL,
          R.CODCLI,
          R.COD_RCA,
          R.NUMTRANSVENDA,
          R.CODPROD,
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
          SEGMENTO,
          VALOR,
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
            CAST(R.VENDEDOR_ID AS CHAR), '|',
            CAST(R.ANO AS CHAR), '|',
            CAST(R.MES AS CHAR), '|',
            CAST(R.SEMANA_NUMERO AS CHAR)
          ) AS CHAVE_AGREGADA,
          R.CLIENTE_ID,
          R.VENDEDOR_ID,
          MAX(R.SEGMENTO) AS SEGMENTO,
          ROUND(SUM(R.VALOR), 2) AS VALOR,
          R.SEMANA_NUMERO,
          R.MES,
          R.ANO,
          TRUE AS ATIVO,
          '${execSql}' AS ULTIMA_EXECUCAO_ID,
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19) AS ATUALIZADO_EM
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE R.ATIVO = TRUE
          AND R.CLIENTE_ID IS NOT NULL
          AND R.VENDEDOR_ID IS NOT NULL
          AND R.ANO IS NOT NULL
          AND R.MES IS NOT NULL
          AND R.SEMANA_NUMERO BETWEEN 1 AND 5
        GROUP BY R.CLIENTE_ID, R.VENDEDOR_ID, R.ANO, R.MES, R.SEMANA_NUMERO
        ON DUPLICATE KEY UPDATE
          SEGMENTO = VALUES(SEGMENTO),
          VALOR = VALUES(VALOR),
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
    const message = String(error?.message || error);
    const messageSql = escapeSql(message).slice(0, 460);

    await runDmlMitra({
      projectId,
      sql: `
        UPDATE ACOMP_SEMANAL_SYNC_LOG
        SET
          STATUS = 'FAILED',
          FIM_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
          MENSAGEM = '${messageSql}'
        WHERE EXECUCAO_ID = '${execSql}'
      `,
    });

    return {
      rows: [{
        EXECUCAO_ID: executionId,
        STATUS: 'FAILED',
        MENSAGEM: message,
      }],
    };
  }
}

return run();
