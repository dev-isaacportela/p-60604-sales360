import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

const SCOPE_CTES = `
COORD AS (
  SELECT C.COD_SUPERVISOR
  FROM COORDENADORES C
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
  LIMIT 1
),
ESCOPO_BU AS (
  SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
  FROM COORDENADORES_BU CB
  JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
),
VENDEDORES_SCOPE_RAW AS (
  SELECT DISTINCT
    VR.USER_ID,
    VR.COD_RCA,
    COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA
  FROM BU_VENDEDOR BV
  JOIN ESCOPO_BU E
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
  LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
),
VENDEDORES_SCOPE AS (
  SELECT
    MIN(USER_ID) AS USER_ID,
    COD_RCA,
    MAX(RCA) AS RCA
  FROM VENDEDORES_SCOPE_RAW
  GROUP BY COD_RCA
)
`;

const CARTEIRA_CTES = `
INPUTS AS (
  SELECT
    CASE WHEN '{{codRca}}' REGEXP '^[0-9]+$' THEN CAST('{{codRca}}' AS UNSIGNED) ELSE NULL END AS COD_RCA_PARAM,
    CASE WHEN '{{ramo}}' = '' OR LOCATE('{', '{{ramo}}') > 0 THEN NULL ELSE UPPER(TRIM('{{ramo}}')) END AS RAMO_PARAM,
    CASE WHEN '{{busca}}' = '' OR LOCATE('{', '{{busca}}') > 0 THEN NULL ELSE UPPER(TRIM('{{busca}}')) END AS BUSCA_PARAM
),
${SCOPE_CTES},
CARTEIRA_BASE AS (
  SELECT
    EC.ID AS CARTEIRA_ID,
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR AS VENDEDOR_USER_ID,
    VS.COD_RCA,
    VS.RCA,
    COALESCE(C.WINTHOR_CODCLI, EC.ID_CLIENTE) AS CODCLI,
    COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), NULLIF(TRIM(C.RAZAO_SOCIAL), ''), ICT.CLIENTE, CONCAT('Cliente ', EC.ID_CLIENTE)) AS CLIENTE,
    COALESCE(NULLIF(TRIM(ICT.RAMO), ''), NULLIF(TRIM(C.SEGMENTO), ''), 'Sem ramo') AS RAMO_ATIVIDADE,
    C.CIDADE,
    C.UF,
    C.STATUS,
    EC.CODFILIAL,
    EC.ID_SECAO
  FROM EQUIPE_CLIENTE EC
  JOIN VENDEDORES_SCOPE VS ON VS.USER_ID = EC.ID_VENDEDOR
  LEFT JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
  LEFT JOIN IMP_CLIENTES_TOTVS ICT ON ICT.CODCLI = COALESCE(C.WINTHOR_CODCLI, EC.ID_CLIENTE)
  JOIN INPUTS I ON 1 = 1
  WHERE (I.COD_RCA_PARAM IS NULL OR VS.COD_RCA = I.COD_RCA_PARAM)
    AND (I.RAMO_PARAM IS NULL OR UPPER(COALESCE(NULLIF(TRIM(ICT.RAMO), ''), NULLIF(TRIM(C.SEGMENTO), ''), 'Sem ramo')) = I.RAMO_PARAM)
    AND (
      I.BUSCA_PARAM IS NULL
      OR UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR UPPER(COALESCE(ICT.CLIENTE, '')) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(COALESCE(C.WINTHOR_CODCLI, EC.ID_CLIENTE) AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
      OR CAST(EC.ID_CLIENTE AS CHAR) LIKE CONCAT('%', I.BUSCA_PARAM, '%')
    )
)
`;

const TRANSFER_SCOPE_EXISTS = `
EXISTS (
  SELECT 1
  FROM COORDENADORES C
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
    AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  WHERE C.USER_ID = :VAR_USER
    AND COALESCE(C.ATIVO, TRUE) = TRUE
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND BV.VENDEDOR_ID = __USER_ID__
)`;

const serverFunctions = [
  {
    name: 'gestaoCarteiraCoordenadorVendedores',
    description: 'Lista vendedores/RCA dentro do escopo do coordenador logado.',
    code: `
      WITH
      COORD AS (
        SELECT C.COD_SUPERVISOR
        FROM COORDENADORES C
        WHERE C.USER_ID = :VAR_USER
          AND COALESCE(C.ATIVO, TRUE) = TRUE
        LIMIT 1
      ),
      ESCOPO_BU AS (
        SELECT DISTINCT CB.CODFILIAL, CB.CODEPTO
        FROM COORDENADORES_BU CB
        JOIN COORD C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
      )
      SELECT DISTINCT
        VR.USER_ID,
        VR.COD_RCA,
        COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA,
        BV.CODFILIAL,
        BV.BU_CODIGO AS CODEPTO,
        BV.ID_SECAO
      FROM BU_VENDEDOR BV
      JOIN ESCOPO_BU E
        ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
       AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
      JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
      LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
      WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
      ORDER BY RCA, BV.CODFILIAL, BV.BU_CODIGO, BV.ID_SECAO
    `,
  },
  {
    name: 'gestaoCarteiraCoordenadorRamos',
    description: 'Lista ramos de atividade dos clientes da carteira sob gestao do coordenador.',
    code: `
      WITH
      ${CARTEIRA_CTES}
      SELECT DISTINCT RAMO_ATIVIDADE AS RAMO
      FROM CARTEIRA_BASE
      ORDER BY RAMO_ATIVIDADE
    `,
  },
  {
    name: 'gestaoCarteiraCoordenadorListar',
    description: 'Lista clientes da carteira dos vendedores sob gestao do coordenador com filtros e paginacao.',
    code: `
      WITH
      ${CARTEIRA_CTES}
      SELECT *
      FROM CARTEIRA_BASE
      ORDER BY RCA, CLIENTE
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
  {
    name: 'gestaoCarteiraCoordenadorContar',
    description: 'Conta clientes da carteira dos vendedores sob gestao do coordenador com filtros.',
    code: `
      WITH
      ${CARTEIRA_CTES}
      SELECT COUNT(*) AS TOTAL
      FROM CARTEIRA_BASE
    `,
  },
  {
    name: 'gestaoCarteiraCoordenadorTransferirCliente',
    description: 'Transfere um cliente da carteira para outro RCA dentro do escopo do coordenador.',
    code: `
      UPDATE EQUIPE_CLIENTE EC
      JOIN (
        SELECT MIN(USER_ID) AS USER_ID, COD_RCA
        FROM VENDEDOR_RCA
        WHERE COD_RCA = {{codRcaDestino}}
        GROUP BY COD_RCA
      ) DEST ON 1 = 1
      LEFT JOIN EQUIPE_CLIENTE DUP
        ON DUP.ID_CLIENTE = EC.ID_CLIENTE
       AND DUP.ID_VENDEDOR = DEST.USER_ID
       AND COALESCE(DUP.CODFILIAL, '') = COALESCE(EC.CODFILIAL, '')
       AND COALESCE(DUP.ID_SECAO, -1) = COALESCE(EC.ID_SECAO, -1)
      SET EC.ID_VENDEDOR = DEST.USER_ID
      WHERE EC.ID = {{carteiraId}}
        AND ${TRANSFER_SCOPE_EXISTS.replaceAll('__USER_ID__', 'EC.ID_VENDEDOR')}
        AND ${TRANSFER_SCOPE_EXISTS.replaceAll('__USER_ID__', 'DEST.USER_ID')}
        AND DUP.ID IS NULL
    `,
  },
  {
    name: 'gestaoCarteiraCoordenadorTransferirToda',
    description: 'Transfere toda a carteira de um RCA para outro dentro do escopo do coordenador.',
    code: `
      UPDATE EQUIPE_CLIENTE EC
      JOIN VENDEDOR_RCA SRC ON SRC.USER_ID = EC.ID_VENDEDOR AND SRC.COD_RCA = {{codRcaOrigem}}
      JOIN (
        SELECT MIN(USER_ID) AS USER_ID, COD_RCA
        FROM VENDEDOR_RCA
        WHERE COD_RCA = {{codRcaDestino}}
        GROUP BY COD_RCA
      ) DEST ON 1 = 1
      LEFT JOIN EQUIPE_CLIENTE DUP
        ON DUP.ID_CLIENTE = EC.ID_CLIENTE
       AND DUP.ID_VENDEDOR = DEST.USER_ID
       AND COALESCE(DUP.CODFILIAL, '') = COALESCE(EC.CODFILIAL, '')
       AND COALESCE(DUP.ID_SECAO, -1) = COALESCE(EC.ID_SECAO, -1)
      SET EC.ID_VENDEDOR = DEST.USER_ID
      WHERE ${TRANSFER_SCOPE_EXISTS.replaceAll('__USER_ID__', 'EC.ID_VENDEDOR')}
        AND ${TRANSFER_SCOPE_EXISTS.replaceAll('__USER_ID__', 'DEST.USER_ID')}
        AND DUP.ID IS NULL
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const definition of serverFunctions) {
    const found = existing.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: definition.code, description: definition.description });
      ids[definition.name] = found.id;
      continue;
    }
    const created = await createServerFunctionMitra({ projectId, name: definition.name, type: 'SQL', code: definition.code, description: definition.description });
    ids[definition.name] = extractSfId(created);
  }

  return ids;
}

async function smoke(ids) {
  const checks = [
    ['gestaoCarteiraCoordenadorVendedores', {}],
    ['gestaoCarteiraCoordenadorRamos', { codRca: '', ramo: '', busca: '' }],
    ['gestaoCarteiraCoordenadorListar', { codRca: '', ramo: '', busca: '', limit: 5, offset: 0 }],
    ['gestaoCarteiraCoordenadorContar', { codRca: '', ramo: '', busca: '' }],
  ];

  for (const [name, input] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Gestao de Carteira do Coordenador configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Gestao de Carteira do Coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
