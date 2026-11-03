import 'dotenv/config';
import {
  configureSdkMitra,
  runQueryMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
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

async function q(sql) {
  const response = await runQueryMitra({ projectId, sql });
  return response?.result?.rows || [];
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findIsaacUser() {
  const direct = await q(`
    SELECT
      U.ID,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', U.ID)) AS NOME_EXIBICAO,
      U.DESCR AS EMAIL
    FROM INT_USER U
    WHERE UPPER(COALESCE(U.NOME, '')) LIKE '%ISAAC%'
       OR UPPER(COALESCE(U.DESCR, '')) LIKE '%ISAAC%'
    ORDER BY U.ID
    LIMIT 1
  `);

  if (direct.length > 0) return direct[0];

  const viaFuncionarios = await q(`
    SELECT
      F.ID,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, F.NOME, CONCAT('Usuario ', F.ID)) AS NOME_EXIBICAO,
      U.DESCR AS EMAIL
    FROM FUNCIONARIOS F
    LEFT JOIN INT_USER U ON U.ID = F.ID
    WHERE UPPER(COALESCE(F.NOME, '')) LIKE '%ISAAC%'
       OR UPPER(COALESCE(U.DESCR, '')) LIKE '%ISAAC%'
    ORDER BY F.ID
    LIMIT 1
  `);

  return firstRow(viaFuncionarios);
}

async function findViventiClient() {
  const rows = await q(`
    SELECT
      C.ID,
      C.NOME_FANTASIA,
      C.RAZAO_SOCIAL,
      (
        SELECT COUNT(*)
        FROM EQUIPE_CLIENTE EC
        WHERE EC.ID_CLIENTE = C.ID
      ) AS TOTAL_VINCULOS,
      (
        SELECT COUNT(*)
        FROM PEDIDOS_SEMANAIS_SYNC PS
        WHERE PS.CLIENTE_ID = C.ID
          AND PS.ATIVO = TRUE
      ) AS TOTAL_REGISTROS_SYNC
    FROM CLIENTES C
    WHERE UPPER(COALESCE(C.NOME_FANTASIA, '')) LIKE '%VIVENTI%'
       OR UPPER(COALESCE(C.RAZAO_SOCIAL, '')) LIKE '%VIVENTI%'
    ORDER BY TOTAL_VINCULOS DESC, TOTAL_REGISTROS_SYNC DESC, C.ID DESC
    LIMIT 5
  `);

  return {
    selected: firstRow(rows),
    candidates: rows,
  };
}

async function validateIsaacScope(userId) {
  const escopoRows = await q(`
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
    WHERE (EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId})
    ORDER BY EC.ID_CLIENTE, EC.CODFILIAL, BV.BU_CODIGO, EC.ID_SECAO
    LIMIT 200
  `);

  const counts = firstRow(await q(`
    WITH PARAMS AS (
      SELECT
        MONTH(CURRENT_DATE) AS MES_REF,
        YEAR(CURRENT_DATE) AS ANO_REF
    ),
    CARTEIRA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId}
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
      WHERE EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId}
    ),
    BASE_SEM_ESCOPO AS (
      SELECT PS.CLIENTE_ID, PS.CODFILIAL, PS.CODEPTO, PS.ID_SECAO
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN PARAMS P ON 1 = 1
      JOIN CARTEIRA C ON C.ID_CLIENTE = PS.CLIENTE_ID
      WHERE PS.ATIVO = TRUE
        AND PS.ANO = P.ANO_REF
        AND PS.MES = P.MES_REF
    ),
    BASE_COM_ESCOPO AS (
      SELECT PS.CLIENTE_ID, PS.CODFILIAL, PS.CODEPTO, PS.ID_SECAO
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN PARAMS P ON 1 = 1
      JOIN ESCOPO E ON E.ID_CLIENTE = PS.CLIENTE_ID
        AND E.CODFILIAL = PS.CODFILIAL
        AND E.CODEPTO = PS.CODEPTO
        AND E.ID_SECAO = PS.ID_SECAO
      WHERE PS.ATIVO = TRUE
        AND PS.ANO = P.ANO_REF
        AND PS.MES = P.MES_REF
    )
    SELECT
      (SELECT COUNT(*) FROM BASE_SEM_ESCOPO) AS TOTAL_LINHAS_SEM_ESCOPO,
      (SELECT COUNT(*) FROM BASE_COM_ESCOPO) AS TOTAL_LINHAS_COM_ESCOPO,
      (
        SELECT COUNT(*)
        FROM BASE_SEM_ESCOPO BS
        LEFT JOIN BASE_COM_ESCOPO BC
          ON BC.CLIENTE_ID = BS.CLIENTE_ID
         AND BC.CODFILIAL = BS.CODFILIAL
         AND BC.CODEPTO = BS.CODEPTO
         AND BC.ID_SECAO = BS.ID_SECAO
        WHERE BC.CLIENTE_ID IS NULL
      ) AS TOTAL_EXCLUIDOS_PELO_ESCOPO,
      (
        SELECT COUNT(*)
        FROM BASE_COM_ESCOPO BC
        LEFT JOIN ESCOPO E
          ON E.ID_CLIENTE = BC.CLIENTE_ID
         AND E.CODFILIAL = BC.CODFILIAL
         AND E.CODEPTO = BC.CODEPTO
         AND E.ID_SECAO = BC.ID_SECAO
        WHERE E.ID_CLIENTE IS NULL
      ) AS TOTAL_FORA_ESCOPO_NO_RESULTADO
  `));

  const excludedSample = await q(`
    WITH PARAMS AS (
      SELECT
        MONTH(CURRENT_DATE) AS MES_REF,
        YEAR(CURRENT_DATE) AS ANO_REF
    ),
    CARTEIRA AS (
      SELECT DISTINCT EC.ID_CLIENTE
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId}
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
      WHERE EC.ID_VENDEDOR = ${userId} OR F.ID_SUBSTITUTO = ${userId}
    ),
    BASE_SEM_ESCOPO AS (
      SELECT PS.CLIENTE_ID, PS.CODFILIAL, PS.CODEPTO, PS.ID_SECAO
      FROM PEDIDOS_SEMANAIS_SYNC PS
      JOIN PARAMS P ON 1 = 1
      JOIN CARTEIRA C ON C.ID_CLIENTE = PS.CLIENTE_ID
      WHERE PS.ATIVO = TRUE
        AND PS.ANO = P.ANO_REF
        AND PS.MES = P.MES_REF
    )
    SELECT
      BS.CODFILIAL,
      BS.CODEPTO,
      BS.ID_SECAO,
      COUNT(*) AS REGISTROS_EXCLUIDOS
    FROM BASE_SEM_ESCOPO BS
    LEFT JOIN ESCOPO E
      ON E.ID_CLIENTE = BS.CLIENTE_ID
     AND E.CODFILIAL = BS.CODFILIAL
     AND E.CODEPTO = BS.CODEPTO
     AND E.ID_SECAO = BS.ID_SECAO
    WHERE E.ID_CLIENTE IS NULL
    GROUP BY BS.CODFILIAL, BS.CODEPTO, BS.ID_SECAO
    ORDER BY REGISTROS_EXCLUIDOS DESC
    LIMIT 20
  `);

  return {
    totalEscoposMapeados: escopoRows.length,
    escopoSample: escopoRows.slice(0, 20),
    sf104Check: {
      totalLinhasSemEscopo: toInt(counts?.TOTAL_LINHAS_SEM_ESCOPO),
      totalLinhasComEscopo: toInt(counts?.TOTAL_LINHAS_COM_ESCOPO),
      totalExcluidosPeloEscopo: toInt(counts?.TOTAL_EXCLUIDOS_PELO_ESCOPO),
      totalForaEscopoNoResultado: toInt(counts?.TOTAL_FORA_ESCOPO_NO_RESULTADO),
    },
    excludedByScopeSample: excludedSample,
  };
}

async function validateViventi(clientId) {
  const vinculos = await q(`
    SELECT DISTINCT
      EC.ID_VENDEDOR,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', EC.ID_VENDEDOR)) AS VENDEDOR,
      EC.CODFILIAL,
      BV.BU_CODIGO AS CODEPTO,
      EC.ID_SECAO
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN INT_USER U ON U.ID = EC.ID_VENDEDOR
    JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
      AND BV.CODFILIAL = EC.CODFILIAL
      AND BV.ID_SECAO = EC.ID_SECAO
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
    WHERE EC.ID_CLIENTE = ${clientId}
    ORDER BY EC.ID_VENDEDOR, EC.CODFILIAL, BV.BU_CODIGO, EC.ID_SECAO
  `);

  const totaisPorEscopo = await q(`
    SELECT
      PS.CODFILIAL,
      PS.CODEPTO,
      PS.ID_SECAO,
      COUNT(*) AS REGISTROS,
      ROUND(SUM(PS.VALOR), 2) AS VALOR_TOTAL
    FROM PEDIDOS_SEMANAIS_SYNC PS
    WHERE PS.CLIENTE_ID = ${clientId}
      AND PS.ATIVO = TRUE
    GROUP BY PS.CODFILIAL, PS.CODEPTO, PS.ID_SECAO
    ORDER BY PS.CODFILIAL, PS.CODEPTO, PS.ID_SECAO
  `);

  const valorPorVendedorEscopo = await q(`
    SELECT
      EC.ID_VENDEDOR,
      COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Usuario ', EC.ID_VENDEDOR)) AS VENDEDOR,
      EC.CODFILIAL,
      BV.BU_CODIGO AS CODEPTO,
      EC.ID_SECAO,
      ROUND(COALESCE(SUM(PS.VALOR), 0), 2) AS VALOR_TOTAL_ESCOPO
    FROM EQUIPE_CLIENTE EC
    LEFT JOIN INT_USER U ON U.ID = EC.ID_VENDEDOR
    JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
      AND BV.CODFILIAL = EC.CODFILIAL
      AND BV.ID_SECAO = EC.ID_SECAO
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
    LEFT JOIN PEDIDOS_SEMANAIS_SYNC PS ON PS.CLIENTE_ID = EC.ID_CLIENTE
      AND PS.CODFILIAL = EC.CODFILIAL
      AND PS.CODEPTO = BV.BU_CODIGO
      AND PS.ID_SECAO = EC.ID_SECAO
      AND PS.ATIVO = TRUE
    WHERE EC.ID_CLIENTE = ${clientId}
    GROUP BY EC.ID_VENDEDOR, VENDEDOR, EC.CODFILIAL, BV.BU_CODIGO, EC.ID_SECAO
    ORDER BY EC.ID_VENDEDOR, EC.CODFILIAL, BV.BU_CODIGO, EC.ID_SECAO
  `);

  return {
    totalVinculosNoCliente: vinculos.length,
    vinculos,
    totaisPorEscopo,
    valorPorVendedorEscopo,
  };
}

async function collectCountsByScope() {
  const raw = await q(`
    SELECT
      R.CODFILIAL,
      R.CODEPTO,
      R.ID_SECAO,
      COUNT(*) AS REGISTROS_RAW,
      ROUND(SUM(COALESCE(R.TOTAL, 0)), 2) AS VALOR_TOTAL_RAW
    FROM PEDIDOS_SEMANAIS_SYNC_RAW R
    WHERE R.ATIVO = TRUE
      AND R.STATUS_INGESTAO = 'ATIVO'
    GROUP BY R.CODFILIAL, R.CODEPTO, R.ID_SECAO
    ORDER BY REGISTROS_RAW DESC
    LIMIT 30
  `);

  const agregada = await q(`
    SELECT
      P.CODFILIAL,
      P.CODEPTO,
      P.ID_SECAO,
      COUNT(*) AS REGISTROS_SYNC,
      ROUND(SUM(COALESCE(P.VALOR, 0)), 2) AS VALOR_TOTAL_SYNC
    FROM PEDIDOS_SEMANAIS_SYNC P
    WHERE P.ATIVO = TRUE
    GROUP BY P.CODFILIAL, P.CODEPTO, P.ID_SECAO
    ORDER BY REGISTROS_SYNC DESC
    LIMIT 30
  `);

  return { rawTop30: raw, syncTop30: agregada };
}

async function main() {
  const periodo = firstRow(await q(`
    SELECT
      YEAR(CURRENT_DATE) AS ANO_REF,
      MONTH(CURRENT_DATE) AS MES_REF,
      CEIL(DAY(CURRENT_DATE) / 7) AS SEMANA_REF
  `));

  const isaac = await findIsaacUser();
  const viventiLookup = await findViventiClient();
  const viventi = viventiLookup?.selected || null;

  const isaacValidation = isaac
    ? await validateIsaacScope(toInt(isaac.ID))
    : { warning: 'Usuario Isaac nao encontrado para validar escopo da SF 104.' };

  const viventiValidation = viventi
    ? await validateViventi(toInt(viventi.ID))
    : { warning: 'Cliente Viventi nao encontrado para validar segregacao por escopo.' };

  const countsByScope = await collectCountsByScope();

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        periodoAtual: {
          ano: toInt(periodo?.ANO_REF),
          mes: toInt(periodo?.MES_REF),
          semana: toInt(periodo?.SEMANA_REF),
        },
        isaac: isaac
          ? {
              id: toInt(isaac.ID),
              nome: isaac.NOME_EXIBICAO || null,
              email: isaac.EMAIL || null,
            }
          : null,
        validacaoIsaacSf104: isaacValidation,
        viventi: viventi
          ? {
              id: toInt(viventi.ID),
              nomeFantasia: viventi.NOME_FANTASIA || null,
              razaoSocial: viventi.RAZAO_SOCIAL || null,
              totalVinculos: toInt(viventi.TOTAL_VINCULOS),
              totalRegistrosSync: toInt(viventi.TOTAL_REGISTROS_SYNC),
            }
          : null,
        viventiCandidates: viventiLookup?.candidates || [],
        validacaoViventiEscopo: viventiValidation,
        countsByScope,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha na validacao operacional do escopo por filial + BU + secao:');
  console.error(error?.message || error);
  process.exit(1);
});
