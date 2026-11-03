import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
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
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists') || text.includes('duplicate') || text.includes('exists');
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label} criado.`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label} já existe.`);
      return;
    }
    throw error;
  }
}

async function ensureTablesAndIndexes() {
  await runDdlSafe(
    `CREATE TABLE PEDIDOS_SEMANAIS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CLIENTE_ID INT NOT NULL,
      VENDEDOR_ID INT NOT NULL,
      SEGMENTO VARCHAR(100) NOT NULL,
      VALOR DECIMAL(14,2) NOT NULL,
      SEMANA_NUMERO INT NOT NULL,
      MES INT NOT NULL,
      ANO INT NOT NULL,
      CRIADO_EM VARCHAR(19),
      FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID)
    )`,
    'Tabela PEDIDOS_SEMANAIS',
  );

  await runDdlSafe(
    `CREATE TABLE PERFIL_COMPRA_CLIENTE (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CLIENTE_ID INT NOT NULL,
      FREQUENCIA VARCHAR(20) NOT NULL,
      SEMANA_PADRAO INT,
      TICKET_MEDIO_3M DECIMAL(14,2) DEFAULT 0,
      ATUALIZADO_EM VARCHAR(19),
      FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID)
    )`,
    'Tabela PERFIL_COMPRA_CLIENTE',
  );

  await runDdlSafe(
    'CREATE UNIQUE INDEX UX_PERFIL_COMPRA_CLIENTE_CLIENTE ON PERFIL_COMPRA_CLIENTE(CLIENTE_ID)',
    'Índice UX_PERFIL_COMPRA_CLIENTE_CLIENTE',
  );

  await runDdlSafe(
    'CREATE INDEX IX_PEDIDOS_SEMANAIS_CLIENTE_PERIODO ON PEDIDOS_SEMANAIS(CLIENTE_ID, ANO, MES, SEMANA_NUMERO)',
    'Índice IX_PEDIDOS_SEMANAIS_CLIENTE_PERIODO',
  );

  await runDdlSafe(
    'CREATE INDEX IX_PEDIDOS_SEMANAIS_VENDEDOR_PERIODO ON PEDIDOS_SEMANAIS(VENDEDOR_ID, ANO, MES)',
    'Índice IX_PEDIDOS_SEMANAIS_VENDEDOR_PERIODO',
  );
}

async function ensureAutoProfileTrigger() {
  await runDdlSafe(
    `CREATE TRIGGER TG_PEDIDOS_SEMANAIS_AI
      AFTER INSERT ON PEDIDOS_SEMANAIS
      FOR EACH ROW
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
            FROM PEDIDOS_SEMANAIS P2
            WHERE P2.CLIENTE_ID = PS.CLIENTE_ID
              AND STR_TO_DATE(CONCAT(P2.ANO, '-', LPAD(P2.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
            GROUP BY P2.SEMANA_NUMERO
            ORDER BY COUNT(*) DESC, P2.SEMANA_NUMERO
            LIMIT 1
          ) AS SEMANA_PADRAO,
          ROUND(AVG(PS.VALOR), 2) AS TICKET_MEDIO_3M
        FROM PEDIDOS_SEMANAIS PS
        WHERE PS.CLIENTE_ID = NEW.CLIENTE_ID
          AND STR_TO_DATE(CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
        GROUP BY PS.CLIENTE_ID
      ) BASE
      ON DUPLICATE KEY UPDATE
        FREQUENCIA = VALUES(FREQUENCIA),
        SEMANA_PADRAO = VALUES(SEMANA_PADRAO),
        TICKET_MEDIO_3M = VALUES(TICKET_MEDIO_3M),
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
    'Trigger TG_PEDIDOS_SEMANAIS_AI',
  );
}

const serverFunctions = [
  {
    name: 'calcular-perfil-cliente',
    description: 'Recalcula o perfil de compra dos últimos 3 meses por cliente.',
    code: `
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
            FROM PEDIDOS_SEMANAIS P2
            WHERE P2.CLIENTE_ID = PS.CLIENTE_ID
              AND STR_TO_DATE(CONCAT(P2.ANO, '-', LPAD(P2.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
            GROUP BY P2.SEMANA_NUMERO
            ORDER BY COUNT(*) DESC, P2.SEMANA_NUMERO
            LIMIT 1
          ) AS SEMANA_PADRAO,
          ROUND(AVG(PS.VALOR), 2) AS TICKET_MEDIO_3M
        FROM PEDIDOS_SEMANAIS PS
        WHERE STR_TO_DATE(CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 2 MONTH)
          AND ('{{clienteId}}' = '' OR PS.CLIENTE_ID = CAST('{{clienteId}}' AS UNSIGNED))
        GROUP BY PS.CLIENTE_ID
      ) BASE
      ON DUPLICATE KEY UPDATE
        FREQUENCIA = VALUES(FREQUENCIA),
        SEMANA_PADRAO = VALUES(SEMANA_PADRAO),
        TICKET_MEDIO_3M = VALUES(TICKET_MEDIO_3M),
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  },
  {
    name: 'calcular-bw-semanal',
    description: 'Calcula B/W semanal por cliente comparando com a mesma semana do mês anterior.',
    code: `
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
      BASE_CLIENTES AS (
        SELECT
          PS.CLIENTE_ID,
          MAX(PS.VENDEDOR_ID) AS VENDEDOR_ID,
          MAX(PS.SEGMENTO) AS SEGMENTO
        FROM PEDIDOS_SEMANAIS PS
        JOIN PARAMS P ON 1 = 1
        WHERE PS.MES = P.MES_REF
          AND PS.ANO = P.ANO_REF
          AND ('{{vendedorId}}' = '' OR PS.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
          AND ('{{segmento}}' = '' OR UPPER(PS.SEGMENTO) = UPPER('{{segmento}}'))
        GROUP BY PS.CLIENTE_ID
      ),
      SEMANAS_MES AS (
        SELECT
          PS.CLIENTE_ID,
          SUM(CASE WHEN PS.SEMANA_NUMERO = 1 THEN PS.VALOR ELSE 0 END) AS SEM_1,
          SUM(CASE WHEN PS.SEMANA_NUMERO = 2 THEN PS.VALOR ELSE 0 END) AS SEM_2,
          SUM(CASE WHEN PS.SEMANA_NUMERO = 3 THEN PS.VALOR ELSE 0 END) AS SEM_3,
          SUM(CASE WHEN PS.SEMANA_NUMERO = 4 THEN PS.VALOR ELSE 0 END) AS SEM_4,
          SUM(CASE WHEN PS.SEMANA_NUMERO = 5 THEN PS.VALOR ELSE 0 END) AS SEM_5,
          SUM(PS.VALOR) AS FECHAMENTO_MES
        FROM PEDIDOS_SEMANAIS PS
        JOIN PARAMS P ON 1 = 1
        WHERE PS.MES = P.MES_REF
          AND PS.ANO = P.ANO_REF
        GROUP BY PS.CLIENTE_ID
      ),
      SEMANA_ATUAL AS (
        SELECT
          PS.CLIENTE_ID,
          SUM(PS.VALOR) AS VALOR_ATUAL
        FROM PEDIDOS_SEMANAIS PS
        JOIN PARAMS P ON 1 = 1
        WHERE PS.MES = P.MES_REF
          AND PS.ANO = P.ANO_REF
          AND PS.SEMANA_NUMERO = P.SEMANA_REF
        GROUP BY PS.CLIENTE_ID
      ),
      SEMANA_ANTERIOR AS (
        SELECT
          PS.CLIENTE_ID,
          SUM(PS.VALOR) AS VALOR_ANTERIOR
        FROM PEDIDOS_SEMANAIS PS
        JOIN PARAMS P ON 1 = 1
        JOIN PERIODO_ANTERIOR PA ON 1 = 1
        WHERE PS.MES = PA.MES_ANT
          AND PS.ANO = PA.ANO_ANT
          AND PS.SEMANA_NUMERO = P.SEMANA_REF
        GROUP BY PS.CLIENTE_ID
      )
      SELECT
        BC.CLIENTE_ID,
        C.NOME_FANTASIA AS CLIENTE,
        BC.SEGMENTO,
        BC.VENDEDOR_ID,
        COALESCE(F.NOME, U.DESCR, CONCAT('Usuário ', BC.VENDEDOR_ID)) AS VENDEDOR,
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
          WHEN (
            (PC.FREQUENCIA = 'SEMANAL' OR PC.SEMANA_PADRAO = (SELECT SEMANA_REF FROM PARAMS))
            AND COALESCE(SA.VALOR_ATUAL, 0) = 0
          ) THEN 'Alerta'
          WHEN PC.SEMANA_PADRAO IS NOT NULL
            AND PC.FREQUENCIA <> 'SEMANAL'
            AND PC.SEMANA_PADRAO <> (SELECT SEMANA_REF FROM PARAMS)
            AND COALESCE(SA.VALOR_ATUAL, 0) > 0 THEN 'Fora do padrão'
          ELSE 'No padrão'
        END AS STATUS
      FROM BASE_CLIENTES BC
      LEFT JOIN CLIENTES C ON C.ID = BC.CLIENTE_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = BC.VENDEDOR_ID
      LEFT JOIN INT_USER U ON U.ID = BC.VENDEDOR_ID
      LEFT JOIN SEMANAS_MES SM ON SM.CLIENTE_ID = BC.CLIENTE_ID
      LEFT JOIN SEMANA_ATUAL SA ON SA.CLIENTE_ID = BC.CLIENTE_ID
      LEFT JOIN SEMANA_ANTERIOR SA2 ON SA2.CLIENTE_ID = BC.CLIENTE_ID
      LEFT JOIN PERFIL_COMPRA_CLIENTE PC ON PC.CLIENTE_ID = BC.CLIENTE_ID
      ORDER BY VENDEDOR, CLIENTE
    `,
  },
  {
    name: 'alertas-ausencia-pedido',
    description: 'Lista clientes esperados para a semana atual sem pedido registrado.',
    code: `
      WITH PARAMS AS (
        SELECT
          CASE WHEN '{{mes}}' = '' THEN MONTH(CURRENT_DATE) ELSE CAST('{{mes}}' AS UNSIGNED) END AS MES_REF,
          CASE WHEN '{{ano}}' = '' THEN YEAR(CURRENT_DATE) ELSE CAST('{{ano}}' AS UNSIGNED) END AS ANO_REF,
          CASE WHEN '{{semanaNumero}}' = '' THEN CEIL(DAY(CURRENT_DATE) / 7) ELSE CAST('{{semanaNumero}}' AS UNSIGNED) END AS SEMANA_REF
      )
      SELECT
        PC.CLIENTE_ID,
        C.NOME_FANTASIA AS CLIENTE,
        COALESCE(C.SEGMENTO, 'Sem segmento') AS SEGMENTO,
        COALESCE(
          (
            SELECT PS.VENDEDOR_ID
            FROM PEDIDOS_SEMANAIS PS
            WHERE PS.CLIENTE_ID = PC.CLIENTE_ID
            ORDER BY PS.ANO DESC, PS.MES DESC, PS.SEMANA_NUMERO DESC, PS.ID DESC
            LIMIT 1
          ),
          C.VENDEDOR_ID,
          0
        ) AS VENDEDOR_ID,
        COALESCE(
          F.NOME,
          U.DESCR,
          CONCAT('Usuário ', COALESCE(C.VENDEDOR_ID, 0))
        ) AS VENDEDOR,
        PC.TICKET_MEDIO_3M,
        PC.FREQUENCIA,
        PC.SEMANA_PADRAO
      FROM PERFIL_COMPRA_CLIENTE PC
      JOIN CLIENTES C ON C.ID = PC.CLIENTE_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = C.VENDEDOR_ID
      LEFT JOIN INT_USER U ON U.ID = C.VENDEDOR_ID
      JOIN PARAMS P ON 1 = 1
      WHERE (
        PC.FREQUENCIA = 'SEMANAL'
        OR PC.SEMANA_PADRAO = P.SEMANA_REF
      )
      AND ('{{segmento}}' = '' OR UPPER(C.SEGMENTO) = UPPER('{{segmento}}'))
      AND ('{{vendedorId}}' = '' OR C.VENDEDOR_ID = CAST('{{vendedorId}}' AS UNSIGNED))
      AND NOT EXISTS (
        SELECT 1
        FROM PEDIDOS_SEMANAIS PSW
        WHERE PSW.CLIENTE_ID = PC.CLIENTE_ID
          AND PSW.MES = P.MES_REF
          AND PSW.ANO = P.ANO_REF
          AND PSW.SEMANA_NUMERO = P.SEMANA_REF
      )
      ORDER BY PC.TICKET_MEDIO_3M DESC, C.NOME_FANTASIA
    `,
  },
];

async function upsertServerFunctions() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = list?.result || [];
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
      console.log(`SF ${sf.name} atualizada (ID ${found.id}).`);
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: 'SQL',
      code: sf.code,
      description: sf.description,
    });

    const sfId = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
    ids[sf.name] = sfId;
    console.log(`SF ${sf.name} criada (ID ${sfId}).`);
  }

  return ids;
}

async function main() {
  await ensureTablesAndIndexes();
  await ensureAutoProfileTrigger();
  const ids = await upsertServerFunctions();

  console.log('Acompanhamento semanal configurado com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar acompanhamento semanal de clientes.');
  console.error(error?.message || error);
  process.exit(1);
});
