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
const SF_NAME = 'minhaCarteiraClientes';

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
    MIN(COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO')) AS ID_BU,
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
    AND (
      '{{idBu}}' = ''
      OR COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = '{{idBu}}'
    )
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

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

function extractSfId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function garantirEstruturaCarteira() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE FUNCIONARIOS (
        ID INT PRIMARY KEY,
        NOME VARCHAR(200),
        STATUS VARCHAR(20) DEFAULT 'ATIVO',
        ID_SUBSTITUTO INT,
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela FUNCIONARIOS criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists')) {
      console.log('Tabela FUNCIONARIOS já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE EQUIPE_CLIENTE (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        ID_CLIENTE INT NOT NULL,
        ID_VENDEDOR INT NOT NULL,
        ID_BU VARCHAR(50) DEFAULT 'PADRAO',
        CRIADO_EM VARCHAR(19),
        FOREIGN KEY (ID_CLIENTE) REFERENCES CLIENTES(ID)
      )`,
    });
    console.log('Tabela EQUIPE_CLIENTE criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists')) {
      console.log('Tabela EQUIPE_CLIENTE já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE UNIQUE INDEX UX_EQUIPE_CLIENTE_BU ON EQUIPE_CLIENTE(ID_CLIENTE, ID_BU)',
    });
    console.log('Índice UX_EQUIPE_CLIENTE_BU criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists') || text.includes('duplicate key name')) {
      console.log('Índice UX_EQUIPE_CLIENTE_BU já existe.');
    } else {
      throw error;
    }
  }

  try {
    await runDdlMitra({
      projectId,
      sql: 'CREATE INDEX IX_EQUIPE_CLIENTE_VENDEDOR ON EQUIPE_CLIENTE(ID_VENDEDOR)',
    });
    console.log('Índice IX_EQUIPE_CLIENTE_VENDEDOR criado.');
  } catch (error) {
    const text = getErrorText(error);
    if (text.includes('already exists') || text.includes('duplicate key name')) {
      console.log('Índice IX_EQUIPE_CLIENTE_VENDEDOR já existe.');
    } else {
      throw error;
    }
  }

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO FUNCIONARIOS (ID, NOME, STATUS, ID_SUBSTITUTO, ATUALIZADO_EM)
      SELECT U.ID, U.DESCR, 'ATIVO', NULL, SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM INT_USER U
      ON DUPLICATE KEY UPDATE
        NOME = VALUES(NOME),
        ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
    `,
  });
  console.log('FUNCIONARIOS sincronizada com INT_USER.');

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, ID_BU, CRIADO_EM)
      SELECT
        CBV.CLIENTE_ID,
        COALESCE(CBV.VENDEDOR_ID, VR.USER_ID),
        COALESCE(NULLIF(TRIM(CBV.BU), ''), 'PADRAO'),
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM CLIENTE_BU_VENDEDOR CBV
      LEFT JOIN VENDEDOR_RCA VR
        ON VR.COD_RCA = CBV.WINTHOR_COD_RCA
      WHERE COALESCE(CBV.VENDEDOR_ID, VR.USER_ID) IS NOT NULL
      ON DUPLICATE KEY UPDATE
        ID_VENDEDOR = VALUES(ID_VENDEDOR),
        CRIADO_EM = VALUES(CRIADO_EM)
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, ID_BU, CRIADO_EM)
      SELECT
        C.ID,
        C.VENDEDOR_ID,
        'PADRAO',
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM CLIENTES C
      WHERE C.VENDEDOR_ID IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = C.ID
            AND EC.ID_BU = 'PADRAO'
        )
    `,
  });

  console.log('EQUIPE_CLIENTE atualizada com vínculos legados (quando disponíveis).');
}

async function upsertSfMinhaCarteira() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((sf) => sf.name === SF_NAME);

  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: SQL_MINHA_CARTEIRA,
      description: 'Lista clientes da minha carteira com regra de cobertura por férias e filtro por B.U.',
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: SF_NAME,
    type: 'SQL',
    code: SQL_MINHA_CARTEIRA,
    description: 'Lista clientes da minha carteira com regra de cobertura por férias e filtro por B.U.',
  });

  const sfId = extractSfId(created);
  if (!sfId) {
    throw new Error('Não foi possível identificar o ID da SF minhaCarteiraClientes.');
  }

  return sfId;
}

async function main() {
  await garantirEstruturaCarteira();
  const sfId = await upsertSfMinhaCarteira();
  console.log('Regra de ownership da carteira configurada com sucesso.');
  console.log(JSON.stringify({ minhaCarteiraClientes: sfId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar regra de ownership da carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
