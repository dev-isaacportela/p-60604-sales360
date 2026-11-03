import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, readServerFunctionMitra } from 'mitra-sdk';

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

const now = new Date();
const mesArg = Number(process.argv[2]);
const anoArg = Number(process.argv[3]);
const userFocusArg = Number(process.argv[4]);
const mes = Number.isFinite(mesArg) && mesArg >= 1 && mesArg <= 12 ? mesArg : now.getMonth() + 1;
const ano = Number.isFinite(anoArg) && anoArg >= 2020 && anoArg <= 2100 ? anoArg : now.getFullYear();

async function runSql(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const CTE_BASE = `
WITH
REF AS (
  SELECT ${mes} AS MES_REF, ${ano} AS ANO_REF
),
CARTEIRA_RAW AS (
  SELECT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR,
    EC.ID_VENDEDOR AS USER_ID
  FROM EQUIPE_CLIENTE EC
  WHERE 1 = 1

  UNION ALL

  SELECT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR,
    F.ID_SUBSTITUTO AS USER_ID
  FROM EQUIPE_CLIENTE EC
  JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE F.ID_SUBSTITUTO IS NOT NULL
),
CARTEIRA_ESCOLHIDA AS (
  SELECT
    BASE.USER_ID,
    BASE.ID_CLIENTE,
    BASE.ID_VENDEDOR AS VENDEDOR_CARTEIRA
  FROM (
    SELECT
      CR.USER_ID,
      CR.ID_CLIENTE,
      CR.ID_VENDEDOR,
      ROW_NUMBER() OVER (
        PARTITION BY CR.USER_ID, CR.ID_CLIENTE
        ORDER BY CASE WHEN CR.ID_VENDEDOR = CR.USER_ID THEN 0 ELSE 1 END, CR.ID_VENDEDOR
      ) AS RN
    FROM CARTEIRA_RAW CR
  ) BASE
  WHERE BASE.RN = 1
),
RCA_USUARIO AS (
  SELECT
    VR.USER_ID,
    VR.COD_RCA
  FROM VENDEDOR_RCA VR

  UNION

  SELECT
    F.ID_SUBSTITUTO AS USER_ID,
    VR.COD_RCA
  FROM FUNCIONARIOS F
  JOIN VENDEDOR_RCA VR ON VR.USER_ID = F.ID
  WHERE F.ID_SUBSTITUTO IS NOT NULL
),
ESCOPO_DEPTO_USUARIO AS (
  SELECT DISTINCT
    RU.USER_ID,
    RD.COD_RCA,
    TRIM(CAST(RD.COD_DEPARTAMENTO AS CHAR)) AS CODEPTO
  FROM RCA_USUARIO RU
  JOIN RCA_DEPARTAMENTO RD ON RD.COD_RCA = RU.COD_RCA
  WHERE COALESCE(RD.ATIVO, TRUE) = TRUE
),
VENDAS_VALIDAS_SF2 AS (
  SELECT
    CE.USER_ID,
    V.CODCLI AS CLIENTE_ID,
    V.DTSAIDA,
    V.TOTAL,
    V.COD_RCA,
    V.CODEPTO
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN CARTEIRA_ESCOLHIDA CE ON CE.ID_CLIENTE = V.CODCLI
  JOIN ESCOPO_DEPTO_USUARIO E
    ON E.USER_ID = CE.USER_ID
    AND E.COD_RCA = V.COD_RCA
    AND E.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
),
TOTAL_SF2 AS (
  SELECT
    V.USER_ID,
    ROUND(SUM(V.TOTAL), 2) AS TOTAL_MENSAL_SF2
  FROM VENDAS_VALIDAS_SF2 V
  JOIN REF R ON 1 = 1
  WHERE SUBSTRING(V.DTSAIDA, 1, 4) = CAST(R.ANO_REF AS CHAR)
    AND SUBSTRING(V.DTSAIDA, 6, 2) = LPAD(CAST(R.MES_REF AS CHAR), 2, '0')
  GROUP BY V.USER_ID
),
BASE_ATUAL_SF104 AS (
  SELECT
    CE.USER_ID,
    RAW.CLIENTE_ID,
    NULL AS CODFILIAL,
    TRIM(CAST(RAW.CODEPTO AS CHAR)) AS CODEPTO,
    NULL AS ID_SECAO,
    RAW.SEMANA_NUMERO,
    ROUND(SUM(COALESCE(RAW.TOTAL, 0)), 2) AS VALOR
  FROM PEDIDOS_SEMANAIS_SYNC_RAW RAW
  JOIN REF RF ON 1 = 1
  JOIN CARTEIRA_ESCOLHIDA CE ON CE.ID_CLIENTE = RAW.CLIENTE_ID
  JOIN ESCOPO_DEPTO_USUARIO E ON E.USER_ID = CE.USER_ID
    AND E.COD_RCA = RAW.COD_RCA
    AND E.CODEPTO = TRIM(CAST(RAW.CODEPTO AS CHAR))
  WHERE RAW.ATIVO = TRUE
    AND RAW.STATUS_INGESTAO = 'ATIVO'
    AND RAW.ANO = RF.ANO_REF
    AND RAW.MES = RF.MES_REF
  GROUP BY CE.USER_ID, RAW.CLIENTE_ID, TRIM(CAST(RAW.CODEPTO AS CHAR)), RAW.SEMANA_NUMERO
),
TOTAL_SF104 AS (
  SELECT
    B.USER_ID,
    ROUND(SUM(B.VALOR), 2) AS TOTAL_MENSAL_SF104,
    COUNT(*) AS LINHAS_BASE,
    COUNT(
      DISTINCT CONCAT_WS(
        '|',
        B.CLIENTE_ID,
        COALESCE(CAST(B.CODFILIAL AS CHAR), 'NULL'),
        COALESCE(CAST(B.CODEPTO AS CHAR), 'NULL'),
        COALESCE(CAST(B.ID_SECAO AS CHAR), 'NULL'),
        B.SEMANA_NUMERO
      )
    ) AS LINHAS_UNICAS
  FROM BASE_ATUAL_SF104 B
  GROUP BY B.USER_ID
),
USERS_COMPARE AS (
  SELECT USER_ID FROM TOTAL_SF2
  UNION
  SELECT USER_ID FROM TOTAL_SF104
)
`;

const SQL_RESUMO = `
${CTE_BASE}
SELECT
  UC.USER_ID,
  COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', UC.USER_ID)) AS USUARIO,
  COALESCE(T2.TOTAL_MENSAL_SF2, 0) AS TOTAL_MENSAL_SF2,
  COALESCE(T104.TOTAL_MENSAL_SF104, 0) AS TOTAL_MENSAL_SF104,
  ROUND(COALESCE(T104.TOTAL_MENSAL_SF104, 0) - COALESCE(T2.TOTAL_MENSAL_SF2, 0), 2) AS DIFERENCA,
  T104.LINHAS_BASE,
  T104.LINHAS_UNICAS,
  (COALESCE(T104.LINHAS_BASE, 0) - COALESCE(T104.LINHAS_UNICAS, 0)) AS POSSIVEIS_DUPLICIDADES
FROM USERS_COMPARE UC
LEFT JOIN TOTAL_SF2 T2 ON T2.USER_ID = UC.USER_ID
LEFT JOIN TOTAL_SF104 T104 ON T104.USER_ID = UC.USER_ID
LEFT JOIN INT_USER U ON U.ID = UC.USER_ID
ORDER BY ABS(DIFERENCA) DESC, UC.USER_ID
`;

const SQL_COBERTURA = `
${CTE_BASE}
, SF2_CLIENT_SET AS (
  SELECT DISTINCT
    V.USER_ID,
    V.CLIENTE_ID
  FROM VENDAS_VALIDAS_SF2 V
  JOIN REF R ON 1 = 1
  WHERE SUBSTRING(V.DTSAIDA, 1, 4) = CAST(R.ANO_REF AS CHAR)
    AND SUBSTRING(V.DTSAIDA, 6, 2) = LPAD(CAST(R.MES_REF AS CHAR), 2, '0')
),
SF104_CLIENT_SET AS (
  SELECT DISTINCT
    B.USER_ID,
    B.CLIENTE_ID
  FROM BASE_ATUAL_SF104 B
),
COMBINED_KEYS AS (
  SELECT USER_ID, CLIENTE_ID FROM SF2_CLIENT_SET
  UNION
  SELECT USER_ID, CLIENTE_ID FROM SF104_CLIENT_SET
)
SELECT
  CK.USER_ID,
  COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', CK.USER_ID)) AS USUARIO,
  SUM(CASE WHEN S2.CLIENTE_ID IS NOT NULL AND S104.CLIENTE_ID IS NOT NULL THEN 1 ELSE 0 END) AS CLIENTES_EM_COMUM,
  SUM(CASE WHEN S2.CLIENTE_ID IS NOT NULL AND S104.CLIENTE_ID IS NULL THEN 1 ELSE 0 END) AS CLIENTES_SOMENTE_SF2,
  SUM(CASE WHEN S2.CLIENTE_ID IS NULL AND S104.CLIENTE_ID IS NOT NULL THEN 1 ELSE 0 END) AS CLIENTES_SOMENTE_SF104,
  COUNT(*) AS CLIENTES_UNICOS_TOTAL
FROM COMBINED_KEYS CK
LEFT JOIN SF2_CLIENT_SET S2 ON S2.USER_ID = CK.USER_ID AND S2.CLIENTE_ID = CK.CLIENTE_ID
LEFT JOIN SF104_CLIENT_SET S104 ON S104.USER_ID = CK.USER_ID AND S104.CLIENTE_ID = CK.CLIENTE_ID
LEFT JOIN INT_USER U ON U.ID = CK.USER_ID
GROUP BY CK.USER_ID, COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', CK.USER_ID))
ORDER BY CLIENTES_SOMENTE_SF2 DESC, CK.USER_ID
`;

function buildSqlDetalheCliente(userId) {
  return `
${CTE_BASE}
, SF2_CLIENTE AS (
  SELECT
    V.USER_ID,
    V.CLIENTE_ID,
    ROUND(SUM(V.TOTAL), 2) AS TOTAL_SF2
  FROM VENDAS_VALIDAS_SF2 V
  JOIN REF R ON 1 = 1
  WHERE V.USER_ID = ${userId}
    AND SUBSTRING(V.DTSAIDA, 1, 4) = CAST(R.ANO_REF AS CHAR)
    AND SUBSTRING(V.DTSAIDA, 6, 2) = LPAD(CAST(R.MES_REF AS CHAR), 2, '0')
  GROUP BY V.USER_ID, V.CLIENTE_ID
),
SF104_CLIENTE AS (
  SELECT
    B.USER_ID,
    B.CLIENTE_ID,
    ROUND(SUM(B.VALOR), 2) AS TOTAL_SF104
  FROM BASE_ATUAL_SF104 B
  WHERE B.USER_ID = ${userId}
  GROUP BY B.USER_ID, B.CLIENTE_ID
),
CLIENTE_KEYS AS (
  SELECT CLIENTE_ID FROM SF2_CLIENTE
  UNION
  SELECT CLIENTE_ID FROM SF104_CLIENTE
)
SELECT
  CK.CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE,
  COALESCE(S2.TOTAL_SF2, 0) AS TOTAL_SF2,
  COALESCE(S104.TOTAL_SF104, 0) AS TOTAL_SF104,
  ROUND(COALESCE(S104.TOTAL_SF104, 0) - COALESCE(S2.TOTAL_SF2, 0), 2) AS DIFERENCA
FROM CLIENTE_KEYS CK
LEFT JOIN SF2_CLIENTE S2 ON S2.CLIENTE_ID = CK.CLIENTE_ID
LEFT JOIN SF104_CLIENTE S104 ON S104.CLIENTE_ID = CK.CLIENTE_ID
LEFT JOIN CLIENTES C ON C.ID = CK.CLIENTE_ID
ORDER BY ABS(DIFERENCA) DESC, CK.CLIENTE_ID
LIMIT 50
`;
}

function buildSqlEscopo(userId) {
  return `
${CTE_BASE}
, SF2_DEPTO AS (
  SELECT
    V.USER_ID,
    TRIM(CAST(V.CODEPTO AS CHAR)) AS CODEPTO,
    ROUND(SUM(V.TOTAL), 2) AS TOTAL_SF2
  FROM VENDAS_VALIDAS_SF2 V
  JOIN REF R ON 1 = 1
  WHERE V.USER_ID = ${userId}
    AND SUBSTRING(V.DTSAIDA, 1, 4) = CAST(R.ANO_REF AS CHAR)
    AND SUBSTRING(V.DTSAIDA, 6, 2) = LPAD(CAST(R.MES_REF AS CHAR), 2, '0')
  GROUP BY V.USER_ID, TRIM(CAST(V.CODEPTO AS CHAR))
),
SF104_DEPTO AS (
  SELECT
    B.USER_ID,
    TRIM(CAST(B.CODEPTO AS CHAR)) AS CODEPTO,
    ROUND(SUM(B.VALOR), 2) AS TOTAL_SF104
  FROM BASE_ATUAL_SF104 B
  WHERE B.USER_ID = ${userId}
  GROUP BY B.USER_ID, TRIM(CAST(B.CODEPTO AS CHAR))
),
DEPTO_KEYS AS (
  SELECT CODEPTO FROM SF2_DEPTO
  UNION
  SELECT CODEPTO FROM SF104_DEPTO
)
SELECT
  DK.CODEPTO,
  COALESCE(S2.TOTAL_SF2, 0) AS TOTAL_SF2,
  COALESCE(S104.TOTAL_SF104, 0) AS TOTAL_SF104,
  ROUND(COALESCE(S104.TOTAL_SF104, 0) - COALESCE(S2.TOTAL_SF2, 0), 2) AS DIFERENCA
FROM DEPTO_KEYS DK
LEFT JOIN SF2_DEPTO S2 ON S2.CODEPTO = DK.CODEPTO
LEFT JOIN SF104_DEPTO S104 ON S104.CODEPTO = DK.CODEPTO
ORDER BY ABS(DIFERENCA) DESC, DK.CODEPTO
`;
}

function buildSqlOnlySf2Reasons(userId) {
  return `
${CTE_BASE}
, SF2_CLIENTE AS (
  SELECT
    V.USER_ID,
    V.CLIENTE_ID,
    ROUND(SUM(V.TOTAL), 2) AS TOTAL_SF2
  FROM VENDAS_VALIDAS_SF2 V
  JOIN REF R ON 1 = 1
  WHERE V.USER_ID = ${userId}
    AND SUBSTRING(V.DTSAIDA, 1, 4) = CAST(R.ANO_REF AS CHAR)
    AND SUBSTRING(V.DTSAIDA, 6, 2) = LPAD(CAST(R.MES_REF AS CHAR), 2, '0')
  GROUP BY V.USER_ID, V.CLIENTE_ID
),
SF104_CLIENTE AS (
  SELECT
    B.USER_ID,
    B.CLIENTE_ID,
    ROUND(SUM(B.VALOR), 2) AS TOTAL_SF104
  FROM BASE_ATUAL_SF104 B
  WHERE B.USER_ID = ${userId}
  GROUP BY B.USER_ID, B.CLIENTE_ID
),
ONLY_SF2 AS (
  SELECT
    S2.CLIENTE_ID,
    S2.TOTAL_SF2
  FROM SF2_CLIENTE S2
  LEFT JOIN SF104_CLIENTE S104 ON S104.CLIENTE_ID = S2.CLIENTE_ID
  WHERE S104.CLIENTE_ID IS NULL
)
SELECT
  O.CLIENTE_ID,
  C.NOME_FANTASIA AS CLIENTE,
  O.TOTAL_SF2,
  CASE WHEN EXISTS (
    SELECT 1
    FROM PEDIDOS_SEMANAIS_SYNC PS
    JOIN REF R ON 1 = 1
    WHERE PS.ATIVO = TRUE
      AND PS.ANO = R.ANO_REF
      AND PS.MES = R.MES_REF
      AND PS.CLIENTE_ID = O.CLIENTE_ID
  ) THEN 1 ELSE 0 END AS TEM_NO_SYNC_MES,
  CASE WHEN EXISTS (
    SELECT 1
    FROM PEDIDOS_SEMANAIS_SYNC_RAW PR
    JOIN REF R ON 1 = 1
    WHERE PR.ATIVO = TRUE
      AND PR.STATUS_INGESTAO = 'ATIVO'
      AND PR.ANO = R.ANO_REF
      AND PR.MES = R.MES_REF
      AND PR.CLIENTE_ID = O.CLIENTE_ID
  ) THEN 1 ELSE 0 END AS TEM_NO_RAW_MES,
  CASE WHEN EXISTS (
    SELECT 1
    FROM BASE_ATUAL_SF104 B
    WHERE B.USER_ID = ${userId}
      AND B.CLIENTE_ID = O.CLIENTE_ID
  ) THEN 1 ELSE 0 END AS TEM_NO_ESCOPO_SF104,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN REF R ON 1 = 1
      WHERE PS.ATIVO = TRUE
        AND PS.ANO = R.ANO_REF
        AND PS.MES = R.MES_REF
        AND PS.CLIENTE_ID = O.CLIENTE_ID
    ) THEN 'Cliente tem venda no SF2, mas nao entrou na tabela sincronizada mensal.'
    WHEN NOT EXISTS (
      SELECT 1
      FROM BASE_ATUAL_SF104 B
      WHERE B.USER_ID = ${userId}
        AND B.CLIENTE_ID = O.CLIENTE_ID
    ) THEN 'Cliente nao passa pelo escopo da SF104 (carteira + departamento).'
    ELSE 'Cliente esta no sync, mas sem match final de escopo no join da SF104.'
  END AS DIAGNOSTICO
FROM ONLY_SF2 O
LEFT JOIN CLIENTES C ON C.ID = O.CLIENTE_ID
ORDER BY O.TOTAL_SF2 DESC, O.CLIENTE_ID
LIMIT 30
`;
}

function clipSql(sql) {
  const maxLen = 1400;
  if (!sql) return '';
  if (sql.length <= maxLen) return sql;
  return `${sql.slice(0, maxLen)}\n...`;
}

async function main() {
  const [sf2, sf104] = await Promise.all([
    readServerFunctionMitra({ projectId, serverFunctionId: 2 }),
    readServerFunctionMitra({ projectId, serverFunctionId: 104 }),
  ]);

  const resumo = await runSql(SQL_RESUMO);
  const coberturaClientes = await runSql(SQL_COBERTURA);

  const principal = (Number.isFinite(userFocusArg) && userFocusArg > 0)
    ? (resumo.find((row) => Number(row.USER_ID) === userFocusArg) || resumo[0] || null)
    : (resumo[0] || null);
  const userIdFoco = principal ? Number(principal.USER_ID) : 0;

  let detalheClientes = [];
  let detalheEscopo = [];
  let causasSomenteSf2 = [];
  if (userIdFoco > 0) {
    detalheClientes = await runSql(buildSqlDetalheCliente(userIdFoco));
    detalheEscopo = await runSql(buildSqlEscopo(userIdFoco));
    causasSomenteSf2 = await runSql(buildSqlOnlySf2Reasons(userIdFoco));
  }

  const totalSf2 = resumo.reduce((acc, row) => acc + toNumber(row.TOTAL_MENSAL_SF2), 0);
  const totalSf104 = resumo.reduce((acc, row) => acc + toNumber(row.TOTAL_MENSAL_SF104), 0);

  console.log(
    JSON.stringify(
      {
        referencia: {
          mes,
          ano,
          periodo: `${ano}-${String(mes).padStart(2, '0')}`,
        },
        visaoGeral: {
          totalSf2,
          totalSf104,
          diferencaTotal: Number((totalSf104 - totalSf2).toFixed(2)),
          usuariosComparados: resumo.length,
        },
        resumoPorUsuario: resumo,
        coberturaClientes,
        usuarioFoco: userIdFoco > 0 ? {
          userId: userIdFoco,
          nome: principal.USUARIO,
          diferenca: toNumber(principal.DIFERENCA),
          possiveisDuplicidades: Number(principal.POSSIVEIS_DUPLICIDADES || 0),
          totalSf2: toNumber(principal.TOTAL_MENSAL_SF2),
          totalSf104: toNumber(principal.TOTAL_MENSAL_SF104),
        } : null,
        topDiferencasCliente: detalheClientes,
        diferencasPorDepartamento: detalheEscopo,
        causasClientesSomenteSf2: causasSomenteSf2,
        sfInfo: {
          sf2: {
            id: 2,
            name: sf2?.result?.name,
            description: sf2?.result?.description,
            codePreview: clipSql(sf2?.result?.code || ''),
          },
          sf104: {
            id: 104,
            name: sf104?.result?.name,
            description: sf104?.result?.description,
            codePreview: clipSql(sf104?.result?.code || ''),
          },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha no diagnostico semanal vs mensal:');
  console.error(error?.message || error);
  process.exit(1);
});
