import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
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

function ownerBuSql(ownerAlias) {
  return `COALESCE(
    (
      SELECT MIN(COALESCE(NULLIF(TRIM(BV2.BU_CODIGO), ''), 'PADRAO'))
      FROM BU_VENDEDOR BV2
      WHERE BV2.VENDEDOR_ID = ${ownerAlias}.ID_VENDEDOR
        AND COALESCE(BV2.ATIVO, TRUE) = TRUE
    ),
    'PADRAO'
  )`;
}

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

const SQL_MINHA_CARTEIRA = `
  SELECT
    C.ID,
    C.RAZAO_SOCIAL,
    C.NOME_FANTASIA,
    C.CNPJ,
    C.CIDADE,
    C.UF,
    C.SEGMENTO,
    C.STATUS,
    MIN(${BU_EFETIVA_SQL}) AS ID_BU,
    CASE
      WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN 0
      ELSE 1
    END AS IS_COBERTURA,
    CASE
      WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN ''
      ELSE 'COBERTURA'
    END AS TAG_COBERTURA,
    COALESCE(IA.DIAS_ULTIMA_COMPRA, 999) AS DIAS_ULTIMA_COMPRA,
    COALESCE(VIA.DIAS_SEM_VISITA, 999) AS DIAS_SEM_VISITA
  FROM CLIENTES C
  JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = C.ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  LEFT JOIN (
    SELECT
      ECD.ID_CLIENTE,
      COALESCE(
        MAX(CASE WHEN ECD.ID_VENDEDOR = :VAR_USER THEN ECD.ID_VENDEDOR ELSE NULL END),
        MIN(ECD.ID_VENDEDOR)
      ) AS OWNER_USER_ID
    FROM EQUIPE_CLIENTE ECD
    LEFT JOIN FUNCIONARIOS FD ON FD.ID = ECD.ID_VENDEDOR
    WHERE ECD.ID_VENDEDOR = :VAR_USER
      OR FD.ID_SUBSTITUTO = :VAR_USER
    GROUP BY ECD.ID_CLIENTE
  ) OWN ON OWN.ID_CLIENTE = C.ID
  LEFT JOIN (
    SELECT USER_ID, MIN(COD_RCA) AS COD_RCA
    FROM VENDEDOR_RCA
    GROUP BY USER_ID
  ) VR ON VR.USER_ID = OWN.OWNER_USER_ID
  LEFT JOIN (
    SELECT
      VT.CODCLI,
      VT.COD_RCA,
      DATEDIFF(CURRENT_DATE, MAX(SUBSTRING(VT.DTSAIDA, 1, 10))) AS DIAS_ULTIMA_COMPRA
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
    GROUP BY VT.CODCLI, VT.COD_RCA
  ) IA ON IA.CODCLI = C.ID AND IA.COD_RCA = VR.COD_RCA
  LEFT JOIN (
    SELECT
      V.CLIENTE_ID,
      DATEDIFF(
        CURRENT_DATE,
        MAX(CASE WHEN V.STATUS = 'CONCLUIDA' THEN SUBSTRING(V.DATA_AGENDADA, 1, 10) END)
      ) AS DIAS_SEM_VISITA
    FROM VISITAS V
    GROUP BY V.CLIENTE_ID
  ) VIA ON VIA.CLIENTE_ID = C.ID
  WHERE (
      EC.ID_VENDEDOR = :VAR_USER
      OR F.ID_SUBSTITUTO = :VAR_USER
    )
    AND ${ownerBuSql('EC')} = ${BU_EFETIVA_SQL}
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
      OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
    )
  GROUP BY
    C.ID,
    C.RAZAO_SOCIAL,
    C.NOME_FANTASIA,
    C.CNPJ,
    C.CIDADE,
    C.UF,
    C.SEGMENTO,
    C.STATUS,
    IA.DIAS_ULTIMA_COMPRA,
    VIA.DIAS_SEM_VISITA
  ORDER BY
    C.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_CARTEIRA = `
  SELECT COUNT(*) AS TOTAL
  FROM CLIENTES C
  WHERE EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = C.ID
        AND (EC.ID_VENDEDOR = :VAR_USER OR F.ID_SUBSTITUTO = :VAR_USER)
        AND ${ownerBuSql('EC')} = ${BU_EFETIVA_SQL}
    )
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
`;

const SQL_RANKING = `
  SELECT
    B.ID,
    B.RAZAO_SOCIAL,
    B.NOME_FANTASIA,
    B.CNPJ,
    B.CIDADE,
    B.UF,
    B.SEGMENTO,
    B.STATUS,
    B.ID_BU,
    B.IS_COBERTURA,
    B.TAG_COBERTURA,
    B.COMPRAS_90D,
    B.VISITAS_60D,
    B.DIAS_ULTIMA_COMPRA,
    B.DIAS_SEM_VISITA,
    ROUND(
      (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
      + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
      + ((CASE
          WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
          WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
          WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
          WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
          ELSE 15
        END) * 0.20)
      + ((CASE
          WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
          WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
          WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
          WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
          ELSE 10
        END) * 0.10),
      1
    ) AS SCORE_RANKING,
    CASE
      WHEN ROUND(
        (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
        + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
        + ((CASE
            WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
            WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
            WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
            WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
            ELSE 15
          END) * 0.20)
        + ((CASE
            WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
            WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
            WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
            WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
            ELSE 10
          END) * 0.10),
        1
      ) >= 80 THEN 'A'
      WHEN ROUND(
        (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
        + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
        + ((CASE
            WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
            WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
            WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
            WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
            ELSE 15
          END) * 0.20)
        + ((CASE
            WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
            WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
            WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
            WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
            ELSE 10
          END) * 0.10),
        1
      ) >= 55 THEN 'B'
      ELSE 'C'
    END AS RANKING
  FROM (
    SELECT
      C.ID,
      C.RAZAO_SOCIAL,
      C.NOME_FANTASIA,
      C.CNPJ,
      C.CIDADE,
      C.UF,
      C.SEGMENTO,
      C.STATUS,
      MIN(${BU_EFETIVA_SQL}) AS ID_BU,
      CASE
        WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN 0
        ELSE 1
      END AS IS_COBERTURA,
      CASE
        WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN ''
        ELSE 'COBERTURA'
      END AS TAG_COBERTURA,
      COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,
      COALESCE(VIA.VISITAS_60D, 0) AS VISITAS_60D,
      COALESCE(IA.DIAS_ULTIMA_COMPRA, 999) AS DIAS_ULTIMA_COMPRA,
      COALESCE(VIA.DIAS_SEM_VISITA, 999) AS DIAS_SEM_VISITA
    FROM CLIENTES C
    JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = C.ID
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    LEFT JOIN (
      SELECT
        ECD.ID_CLIENTE,
        COALESCE(
          MAX(CASE WHEN ECD.ID_VENDEDOR = :VAR_USER THEN ECD.ID_VENDEDOR ELSE NULL END),
          MIN(ECD.ID_VENDEDOR)
        ) AS OWNER_USER_ID
      FROM EQUIPE_CLIENTE ECD
      LEFT JOIN FUNCIONARIOS FD ON FD.ID = ECD.ID_VENDEDOR
      WHERE ECD.ID_VENDEDOR = :VAR_USER
        OR FD.ID_SUBSTITUTO = :VAR_USER
      GROUP BY ECD.ID_CLIENTE
    ) OWN ON OWN.ID_CLIENTE = C.ID
    LEFT JOIN (
      SELECT USER_ID, MIN(COD_RCA) AS COD_RCA
      FROM VENDEDOR_RCA
      GROUP BY USER_ID
    ) VR ON VR.USER_ID = OWN.OWNER_USER_ID
    LEFT JOIN (
      SELECT
        VT.CODCLI,
        VT.COD_RCA,
        ROUND(
          SUM(
            CASE
              WHEN SUBSTRING(VT.DTSAIDA, 1, 10) >= SUBSTRING(DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY), 1, 10)
                THEN COALESCE(VT.TOTAL, 0)
              ELSE 0
            END
          ),
          2
        ) AS COMPRAS_90D,
        DATEDIFF(
          CURRENT_DATE,
          MAX(SUBSTRING(VT.DTSAIDA, 1, 10))
        ) AS DIAS_ULTIMA_COMPRA
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
      GROUP BY VT.CODCLI, VT.COD_RCA
    ) IA ON IA.CODCLI = C.ID AND IA.COD_RCA = VR.COD_RCA
    LEFT JOIN (
      SELECT
        V.CLIENTE_ID,
        SUM(
          CASE
            WHEN V.STATUS = 'CONCLUIDA'
              AND SUBSTRING(V.DATA_AGENDADA, 1, 10) >= SUBSTRING(DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY), 1, 10)
              THEN 1
            ELSE 0
          END
        ) AS VISITAS_60D,
        DATEDIFF(
          CURRENT_DATE,
          MAX(CASE WHEN V.STATUS = 'CONCLUIDA' THEN SUBSTRING(V.DATA_AGENDADA, 1, 10) END)
        ) AS DIAS_SEM_VISITA
      FROM VISITAS V
      GROUP BY V.CLIENTE_ID
    ) VIA ON VIA.CLIENTE_ID = C.ID
    WHERE (
        EC.ID_VENDEDOR = :VAR_USER
        OR F.ID_SUBSTITUTO = :VAR_USER
      )
      AND ${ownerBuSql('EC')} = ${BU_EFETIVA_SQL}
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
    GROUP BY
      C.ID,
      C.RAZAO_SOCIAL,
      C.NOME_FANTASIA,
      C.CNPJ,
      C.CIDADE,
      C.UF,
      C.SEGMENTO,
      C.STATUS,
      IA.COMPRAS_90D,
      IA.DIAS_ULTIMA_COMPRA,
      VIA.VISITAS_60D,
      VIA.DIAS_SEM_VISITA
  ) B
  ORDER BY B.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_LISTAR_DISPONIVEIS = `
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
    )
  ORDER BY C.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const SQL_CONTAR_DISPONIVEIS = `
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
    )
`;

const SQL_ADICIONAR_CARTEIRA = `
  INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM)
  SELECT
    {{clienteId}},
    :VAR_USER,
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
    )
`;

const SF_UPDATES = [
  { name: 'minhaCarteiraClientes', code: SQL_MINHA_CARTEIRA, description: 'Lista clientes da carteira com BU derivada do vendedor responsável.' },
  { name: 'contarMinhaCarteiraClientes', code: SQL_CONTAR_CARTEIRA, description: 'Conta clientes da carteira com BU derivada do vendedor responsável.' },
  { name: 'minhaCarteiraClientesRanking', code: SQL_RANKING, description: 'Ranking da carteira com BU derivada do vendedor responsável.' },
  { name: 'listarClientesDisponiveisMinhaBu', code: SQL_LISTAR_DISPONIVEIS, description: 'Lista clientes disponíveis para carteira sem depender de ID_BU em EQUIPE_CLIENTE.' },
  { name: 'contarClientesDisponiveisMinhaBu', code: SQL_CONTAR_DISPONIVEIS, description: 'Conta clientes disponíveis para carteira sem depender de ID_BU em EQUIPE_CLIENTE.' },
  { name: 'adicionarClienteMinhaCarteira', code: SQL_ADICIONAR_CARTEIRA, description: 'Adiciona cliente na carteira sem coluna ID_BU em EQUIPE_CLIENTE.' },
];

async function updateServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const updated = [];

  for (const item of SF_UPDATES) {
    const sf = existing.find((row) => row.name === item.name);
    if (!sf) {
      throw new Error(`SF não encontrada: ${item.name}`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: sf.id,
      code: item.code,
      description: item.description,
    });

    updated.push({ id: sf.id, name: item.name });
  }

  return updated;
}

async function migrateTable() {
  await runDmlMitra({
    projectId,
    sql: `
      DELETE EC_DUP
      FROM EQUIPE_CLIENTE EC_DUP
      JOIN EQUIPE_CLIENTE EC_KEEP
        ON EC_DUP.ID_CLIENTE = EC_KEEP.ID_CLIENTE
       AND EC_DUP.ID > EC_KEEP.ID
    `,
  });

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE INDEX IX_EQUIPE_CLIENTE_CLIENTE_TMP ON EQUIPE_CLIENTE(ID_CLIENTE)',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('duplicate key name') && !text.includes('already exists')) {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'DROP INDEX UX_EQUIPE_CLIENTE_BU ON EQUIPE_CLIENTE',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('check that column/key exists') && !text.includes('unknown')) {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'ALTER TABLE EQUIPE_CLIENTE DROP COLUMN ID_BU',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('unknown column') && !text.includes('check that column/key exists')) {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_EQUIPE_CLIENTE_CLIENTE ON EQUIPE_CLIENTE(ID_CLIENTE)',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('duplicate key name') && !text.includes('already exists')) {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'DROP INDEX IX_EQUIPE_CLIENTE_CLIENTE_TMP ON EQUIPE_CLIENTE',
    });
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('check that column/key exists') && !text.includes('unknown')) {
      throw error;
    }
  }
}

async function main() {
  const updated = await updateServerFunctions();
  await migrateTable();

  console.log('Migração concluída: EQUIPE_CLIENTE sem ID_BU e SFs ajustadas.');
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Erro na migração de EQUIPE_CLIENTE sem ID_BU:');
  console.error(error?.message || error);
  process.exit(1);
});
