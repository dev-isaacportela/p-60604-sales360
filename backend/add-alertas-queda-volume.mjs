import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
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

function isAlreadyExistsError(error) {
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists') || text.includes('duplicate') || text.includes('exists');
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

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: criado`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label}: ja existe`);
      return;
    }
    throw error;
  }
}

const SQL_ESCOPO_CTE = `
WITH CARTEIRA_LOGADA AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR,
    TRIM(COALESCE(EC.CODFILIAL, '')) AS CODFILIAL,
    EC.ID_SECAO
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE EC.ID_VENDEDOR = :VAR_USER
     OR F.ID_SUBSTITUTO = :VAR_USER
),
ESCOPO_EXPLICITO AS (
  SELECT DISTINCT
    CL.ID_CLIENTE,
    CL.CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    CL.ID_SECAO
  FROM CARTEIRA_LOGADA CL
  JOIN BU_VENDEDOR BV
    ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
   AND TRIM(COALESCE(BV.CODFILIAL, '')) = CL.CODFILIAL
   AND BV.ID_SECAO = CL.ID_SECAO
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND CL.CODFILIAL <> ''
    AND CL.ID_SECAO IS NOT NULL
),
ESCOPO_FALLBACK_BU AS (
  SELECT DISTINCT
    CL.ID_CLIENTE,
    NULL AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    NULL AS ID_SECAO
  FROM CARTEIRA_LOGADA CL
  JOIN BU_VENDEDOR BV
    ON BV.VENDEDOR_ID = CL.ID_VENDEDOR
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.CODFILIAL IS NULL OR TRIM(COALESCE(BV.CODFILIAL, '')) = '')
    AND BV.ID_SECAO IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM BU_VENDEDOR BV2
      WHERE BV2.VENDEDOR_ID = CL.ID_VENDEDOR
        AND COALESCE(BV2.ATIVO, TRUE) = TRUE
        AND BV2.CODFILIAL IS NOT NULL
        AND TRIM(COALESCE(BV2.CODFILIAL, '')) <> ''
        AND BV2.ID_SECAO IS NOT NULL
    )
),
ESCOPO_VENDEDOR AS (
  SELECT * FROM ESCOPO_EXPLICITO
  UNION
  SELECT * FROM ESCOPO_FALLBACK_BU
),
CONFIG AS (
  SELECT
    :VAR_USER AS USER_ID,
    COALESCE(C.PERCENTUAL_ALERTA, 30) AS PERCENTUAL_ALERTA,
    COALESCE(C.PERIODO_COMPARACAO, 'mes') AS PERIODO_COMPARACAO,
    COALESCE(C.ATIVO, TRUE) AS ATIVO
  FROM (SELECT 1 AS DUMMY) D
  LEFT JOIN CONFIG_ALERTAS_VENDEDOR C ON C.USER_ID = :VAR_USER
)
`;

const serverFunctions = [
  {
    name: 'alertaConfigurar',
    description: 'Cria ou atualiza a configuração de alerta de queda de volume do vendedor logado.',
    code: `
      INSERT INTO CONFIG_ALERTAS_VENDEDOR (USER_ID, PERCENTUAL_ALERTA, PERIODO_COMPARACAO, ATIVO, ATUALIZADO_EM)
      VALUES (
        :VAR_USER,
        LEAST(95, GREATEST(5, CAST('{{PERCENTUAL_ALERTA}}' AS SIGNED))),
        CASE
          WHEN LOWER('{{PERIODO_COMPARACAO}}') = 'semana' THEN 'semana'
          ELSE 'mes'
        END,
        CASE
          WHEN LOWER('{{ATIVO}}') IN ('0', 'false') THEN FALSE
          ELSE TRUE
        END,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        PERCENTUAL_ALERTA = VALUES(PERCENTUAL_ALERTA),
        PERIODO_COMPARACAO = VALUES(PERIODO_COMPARACAO),
        ATIVO = VALUES(ATIVO),
        ATUALIZADO_EM = CURRENT_TIMESTAMP
    `,
  },
  {
    name: 'alertaObterConfig',
    description: 'Retorna a configuração atual de alerta do vendedor logado com valores padrão.',
    code: `
      SELECT
        :VAR_USER AS USER_ID,
        COALESCE(C.PERCENTUAL_ALERTA, 30) AS PERCENTUAL_ALERTA,
        COALESCE(C.PERIODO_COMPARACAO, 'mes') AS PERIODO_COMPARACAO,
        COALESCE(C.ATIVO, TRUE) AS ATIVO,
        C.ATUALIZADO_EM
      FROM (SELECT 1 AS DUMMY) D
      LEFT JOIN CONFIG_ALERTAS_VENDEDOR C ON C.USER_ID = :VAR_USER
    `,
  },
  {
    name: 'alertasQuedaVolume',
    description: 'Lista clientes da carteira com queda de volume acima do limite configurado para semana/mês.',
    code: `
      ${SQL_ESCOPO_CTE},
      CURVA_MANUAL AS (
        SELECT
          CL.ID_CLIENTE,
          MAX(UPPER(TRIM(COALESCE(EC.CURVA_CLASSIFICACAO, '')))) AS CURVA_MANUAL
        FROM CARTEIRA_LOGADA CL
        JOIN EQUIPE_CLIENTE EC
          ON EC.ID_CLIENTE = CL.ID_CLIENTE
         AND EC.ID_VENDEDOR = CL.ID_VENDEDOR
        WHERE COALESCE(NULLIF(TRIM(EC.CURVA_CLASSIFICACAO), ''), '') <> ''
        GROUP BY CL.ID_CLIENTE
      ),
      BASE_VENDAS AS (
        SELECT
          R.CLIENTE_ID,
          STR_TO_DATE(R.DATA_SAIDA, '%Y-%m-%d') AS DATA_REF,
          COALESCE(R.TOTAL, 0) AS VALOR
        FROM PEDIDOS_SEMANAIS_SYNC_RAW R
        WHERE R.ATIVO = TRUE
          AND R.STATUS_INGESTAO = 'ATIVO'
          AND R.CLIENTE_ID IS NOT NULL
          AND R.DATA_SAIDA IS NOT NULL
          AND R.DATA_SAIDA <> ''
          AND EXISTS (
            SELECT 1
            FROM ESCOPO_VENDEDOR E
            WHERE E.ID_CLIENTE = R.CLIENTE_ID
              AND (
                (
                  E.CODFILIAL IS NOT NULL
                  AND TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), '')) = E.CODFILIAL
                  AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
                  AND R.ID_SECAO = E.ID_SECAO
                )
                OR (
                  E.CODFILIAL IS NULL
                  AND E.ID_SECAO IS NULL
                  AND TRIM(CAST(R.CODEPTO AS CHAR)) = E.CODEPTO
                )
              )
          )
      ),
      AGREGADO AS (
        SELECT
          BV.CLIENTE_ID,
          ROUND(SUM(
            CASE
              WHEN CFG.PERIODO_COMPARACAO = 'semana'
                AND YEARWEEK(BV.DATA_REF, 3) = YEARWEEK(CURRENT_DATE, 3)
                THEN BV.VALOR
              WHEN CFG.PERIODO_COMPARACAO = 'mes'
                AND YEAR(BV.DATA_REF) = YEAR(CURRENT_DATE)
                AND MONTH(BV.DATA_REF) = MONTH(CURRENT_DATE)
                THEN BV.VALOR
              ELSE 0
            END
          ), 2) AS VALOR_ATUAL,
          ROUND(SUM(
            CASE
              WHEN CFG.PERIODO_COMPARACAO = 'semana'
                AND YEARWEEK(BV.DATA_REF, 3) = YEARWEEK(DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY), 3)
                THEN BV.VALOR
              WHEN CFG.PERIODO_COMPARACAO = 'mes'
                AND YEAR(BV.DATA_REF) = YEAR(DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH))
                AND MONTH(BV.DATA_REF) = MONTH(DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH))
                THEN BV.VALOR
              ELSE 0
            END
          ), 2) AS VALOR_ANTERIOR,
          MAX(BV.DATA_REF) AS ULTIMA_COMPRA
        FROM BASE_VENDAS BV
        CROSS JOIN CONFIG CFG
        GROUP BY BV.CLIENTE_ID
      )
      SELECT
        A.CLIENTE_ID AS ID_CLIENTE,
        COALESCE(C.NOME_FANTASIA, C.RAZAO_SOCIAL, CONCAT('Cliente ', A.CLIENTE_ID)) AS NOME_CLIENTE,
        COALESCE(
          CM.CURVA_MANUAL,
          CASE
            WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 15000 THEN 'A'
            WHEN COALESCE(PC.TICKET_MEDIO_3M, 0) >= 7000 THEN 'B'
            ELSE 'C'
          END
        ) AS CURVA,
        A.VALOR_ATUAL,
        A.VALOR_ANTERIOR,
        ROUND(((A.VALOR_ANTERIOR - A.VALOR_ATUAL) / A.VALOR_ANTERIOR) * 100, 2) AS PERCENTUAL_QUEDA,
        DATE_FORMAT(A.ULTIMA_COMPRA, '%Y-%m-%d') AS ULTIMA_COMPRA
      FROM AGREGADO A
      CROSS JOIN CONFIG CFG
      LEFT JOIN CLIENTES C ON C.ID = A.CLIENTE_ID
      LEFT JOIN PERFIL_COMPRA_CLIENTE PC ON PC.CLIENTE_ID = A.CLIENTE_ID
      LEFT JOIN CURVA_MANUAL CM ON CM.ID_CLIENTE = A.CLIENTE_ID
      WHERE CFG.ATIVO = TRUE
        AND A.VALOR_ANTERIOR > 0
        AND A.VALOR_ATUAL < A.VALOR_ANTERIOR
        AND ROUND(((A.VALOR_ANTERIOR - A.VALOR_ATUAL) / A.VALOR_ANTERIOR) * 100, 2) >= CFG.PERCENTUAL_ALERTA
      ORDER BY PERCENTUAL_QUEDA DESC, NOME_CLIENTE
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
      console.log(`SF ${sf.name}: atualizada (ID ${found.id})`);
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: 'SQL',
      code: sf.code,
      description: sf.description,
    });

    const sfId = created?.result?.serverFunctionId
      || created?.result?.id
      || created?.serverFunctionId
      || created?.id
      || null;

    ids[sf.name] = sfId;
    console.log(`SF ${sf.name}: criada (ID ${sfId})`);
  }

  return ids;
}

async function ensureSchema() {
  await runDdlSafe(
    `CREATE TABLE CONFIG_ALERTAS_VENDEDOR (
      USER_ID INT PRIMARY KEY,
      PERCENTUAL_ALERTA INT DEFAULT 30,
      PERIODO_COMPARACAO ENUM('semana', 'mes') DEFAULT 'mes',
      ATIVO BOOLEAN DEFAULT TRUE,
      ATUALIZADO_EM TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    'Tabela CONFIG_ALERTAS_VENDEDOR',
  );
}

async function main() {
  await ensureSchema();
  const ids = await upsertServerFunctions();
  console.log('Alertas de queda de volume configurados com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar alertas de queda de volume:');
  console.error(error?.message || error);
  process.exit(1);
});
