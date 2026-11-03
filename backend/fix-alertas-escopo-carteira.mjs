import 'dotenv/config';
import {
  configureSdkMitra,
  listTablesMitra,
  readServerFunctionMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { readFileSync } from 'node:fs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function ensureCodeptoColumn() {
  const tables = normalizeArray(await listTablesMitra({ projectId }));
  const table = tables.find((item) => item.name === 'ALERTAS_INTELIGENTES');
  const exists = table?.columns?.some((column) => column.name === 'CODEPTO');
  if (exists) return;

  await runDdlMitra({
    projectId,
    sql: 'ALTER TABLE ALERTAS_INTELIGENTES ADD COLUMN CODEPTO VARCHAR(50)',
  });
  console.log('Coluna ALERTAS_INTELIGENTES.CODEPTO criada.');
}

async function readCode(serverFunctionId) {
  const response = await readServerFunctionMitra({ projectId, serverFunctionId });
  return String(response?.result?.code || response?.code || '');
}

async function updateCode(serverFunctionId, code, description) {
  await updateServerFunctionMitra({ projectId, serverFunctionId, code, description });
  console.log(`SF ${serverFunctionId} atualizada.`);
}

function addFeriasScope(sql) {
  if (sql.includes('FERIAS_VENDEDOR')) return sql;
  return sql.replace(
    `WHERE EC.ID_VENDEDOR = :VAR_USER
     OR F.ID_SUBSTITUTO = :VAR_USER`,
    `WHERE (
    EC.ID_VENDEDOR = :VAR_USER
    OR F.ID_SUBSTITUTO = :VAR_USER
    OR EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_DONO
      JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
      JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
      WHERE VR_DONO.USER_ID = EC.ID_VENDEDOR
        AND VR_SUB.USER_ID = :VAR_USER
        AND COALESCE(FV.ATIVO, TRUE) = TRUE
        AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
    )
  )`,
  );
}

function addBuScopeToProspeccao(sql) {
  let next = addFeriasScope(sql);
  if (!next.includes('BU_SCOPE AS (')) {
    next = next.replace(
      `),
CURVA_MANUAL AS`,
      `),
BU_SCOPE AS (
  SELECT DISTINCT
    CL.VENDEDOR_DONO_CLIENTE AS TARGET_USER_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV.ID_SECAO
  FROM CARTEIRA_LOGADA CL
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = CL.VENDEDOR_DONO_CLIENTE
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) <> ''
),
CURVA_MANUAL AS`,
    );
  }

  if (!next.includes('JOIN BU_SCOPE B ON B.TARGET_USER_ID = CL.VENDEDOR_DONO_CLIENTE')) {
    next = next.replace(
      `JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = R.CLIENTE_ID
  WHERE R.ATIVO = TRUE`,
      `JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = R.CLIENTE_ID
  JOIN BU_SCOPE B ON B.TARGET_USER_ID = CL.VENDEDOR_DONO_CLIENTE
    AND B.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
    AND B.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
    AND (
      (
        B.ID_SECAO IS NOT NULL
        AND (
          TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
          OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
        )
      )
      OR (
        B.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_SCOPE B2
          WHERE B2.TARGET_USER_ID = B.TARGET_USER_ID
            AND B2.CODFILIAL = B.CODFILIAL
            AND B2.CODEPTO = B.CODEPTO
            AND B2.ID_SECAO IS NOT NULL
            AND (
              TRIM(CAST(B2.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
              OR LPAD(TRIM(CAST(B2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
            )
        )
      )
    )
  WHERE R.ATIVO = TRUE`,
    );
  }
  return next;
}

function modifyPopulateSql(sql) {
  let next = sql;
  if (!next.includes('\n  CODEPTO,\n  ID_CLIENTE')) {
    next = next.replace('\n  ID_SECAO,\n  ID_CLIENTE,', '\n  ID_SECAO,\n  CODEPTO,\n  ID_CLIENTE,');
    next = next.replace('\n  G.ID_SECAO,\n  G.ID_CLIENTE,', '\n  G.ID_SECAO,\n  G.CODEPTO,\n  G.ID_CLIENTE,');
    next = next.replace(
      'AND ((AI.ID_SECAO IS NULL AND G.ID_SECAO IS NULL) OR AI.ID_SECAO = G.ID_SECAO)\n    AND AI.ID_CLIENTE = G.ID_CLIENTE',
      "AND ((AI.ID_SECAO IS NULL AND G.ID_SECAO IS NULL) OR AI.ID_SECAO = G.ID_SECAO)\n    AND COALESCE(AI.CODEPTO, '') = COALESCE(G.CODEPTO, '')\n    AND AI.ID_CLIENTE = G.ID_CLIENTE",
    );
  }

  const replacements = [
    ['BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'PARTITION BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE', 'GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE'],
    ['SELECT DISTINCT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'SELECT DISTINCT ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['PARTITION BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'PARTITION BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['GROUP BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.ID_CLIENTE', 'GROUP BY IP.ID_VENDEDOR, IP.CODFILIAL, IP.ID_SECAO, IP.CODEPTO, IP.ID_CLIENTE'],
    ['C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE', 'C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.CODEPTO, C.ID_CLIENTE'],
    ['PARTITION BY C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.ID_CLIENTE', 'PARTITION BY C.ID_VENDEDOR, C.CODFILIAL, C.ID_SECAO, C.CODEPTO, C.ID_CLIENTE'],
    ['BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE', 'BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE'],
    ['GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE', 'GROUP BY BV.ID_VENDEDOR, BV.CODFILIAL, BV.ID_SECAO, BV.CODEPTO, BV.ID_CLIENTE, BV.NOME_CLIENTE, BV.PEDIDO_CHAVE'],
    ['SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'SELECT ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE', 'GROUP BY ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE'],
    ['P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE', 'P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.CODEPTO, P.ID_CLIENTE'],
    ['PARTITION BY P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.ID_CLIENTE', 'PARTITION BY P.ID_VENDEDOR, P.CODFILIAL, P.ID_SECAO, P.CODEPTO, P.ID_CLIENTE'],
    ['ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE', 'ID_VENDEDOR, CODFILIAL, ID_SECAO, CODEPTO, ID_CLIENTE, NOME_CLIENTE'],
  ];

  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

function updatePopulateBaseSource(code) {
  const match = code.match(/const populateBase = ("[\s\S]*?");\n  const processados/);
  if (!match) throw new Error('populateBase nao encontrado na SF de popular alertas.');
  let sql;
  try {
    sql = JSON.parse(match[1]);
  } catch {
    const source = readFileSync(new URL('./add-alertas-inteligentes.mjs', import.meta.url), 'utf8');
    const sourceMatch = source.match(/const POPULATE_SQL = `([\s\S]*?)`;\n\nfunction buildPopularCode/);
    if (!sourceMatch) throw new Error('POPULATE_SQL base nao encontrado no script de referencia.');
    sql = sourceMatch[1];
  }
  const nextSql = modifyPopulateSql(sql);
  return code.replace(match[1], () => JSON.stringify(nextSql));
}

function addCodeptoFilter(sql) {
  if (sql.includes('COALESCE(AI.CODEPTO')) return sql;
  return sql.replace(
    'AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)',
    `AND AI.ID_VENDEDOR IN (SELECT USER_ID FROM TARGET_USERS)
    AND EXISTS (
      SELECT 1
      FROM INPUT_SCOPE I
      WHERE I.SCOPE_CODEPTO IS NULL
        OR COALESCE(AI.CODEPTO, '') = I.SCOPE_CODEPTO
    )`,
  );
}

function updateDetalheGraficoScope(sql) {
  let next = sql;
  next = next.replace(
    'JOIN CLIENTES C ON C.WINTHOR_CODCLI = V.CODCLI',
    `JOIN CLIENTES C ON (
          CAST(C.ID AS CHAR) = CAST(V.CODCLI AS CHAR)
          OR CAST(C.WINTHOR_CODCLI AS CHAR) = CAST(V.CODCLI AS CHAR)
        )`,
  );
  if (!next.includes('FS.ID_SUBSTITUTO = P.ID_VENDEDOR_REF')) {
    next = next.replace(
      'AND EC.ID_VENDEDOR = P.ID_VENDEDOR_REF',
      `AND (
                EC.ID_VENDEDOR = P.ID_VENDEDOR_REF
                OR EXISTS (
                  SELECT 1
                  FROM FUNCIONARIOS FS
                  WHERE FS.ID = EC.ID_VENDEDOR
                    AND FS.ID_SUBSTITUTO = P.ID_VENDEDOR_REF
                )
                OR EXISTS (
                  SELECT 1
                  FROM VENDEDOR_RCA VR_DONO
                  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA = VR_DONO.COD_RCA
                  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.COD_RCA = FV.COD_RCA_SUBSTITUTO
                  WHERE VR_DONO.USER_ID = EC.ID_VENDEDOR
                    AND VR_SUB.USER_ID = P.ID_VENDEDOR_REF
                    AND COALESCE(FV.ATIVO, TRUE) = TRUE
                    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
                )
              )`,
    );
  }
  return next;
}

async function main() {
  await ensureCodeptoColumn();

  const prospeccao = addBuScopeToProspeccao(await readCode(115));
  await updateCode(115, prospeccao, 'Lista clientes da carteira do vendedor logado por tendencia de recompra semanal respeitando BU e substituicao.');

  const popular = updatePopulateBaseSource(await readCode(130));
  await updateCode(130, popular, 'Limpa alertas antigos e gera alertas inteligentes da carteira comercial com escopo de BU.');

  const listar = addCodeptoFilter(await readCode(131));
  await updateCode(131, listar, 'Lista alertas respeitando escopo do coordenador, time, vendedor, filial, departamento e secao.');

  const contar = addCodeptoFilter(await readCode(134));
  await updateCode(134, contar, 'Conta alertas nao lidos respeitando escopo do coordenador, filial, departamento e secao.');

  const detalhe = updateDetalheGraficoScope(await readCode(135));
  await updateCode(135, detalhe, 'Retorna ciclo anual do produto respeitando cliente por codigo interno/externo e escopo comercial.');

  console.log('Escopo de alertas ajustado com sucesso.');
}

main().catch((error) => {
  console.error('Falha ao ajustar escopo de alertas:');
  console.error(error?.message || error);
  process.exit(1);
});
