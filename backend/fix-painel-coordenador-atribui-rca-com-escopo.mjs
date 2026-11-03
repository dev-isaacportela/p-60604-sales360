import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const PANEL_FUNCTIONS = [154, 155, 156, 190, 191, 192, 193, 194];

const territoryMatch = (alias) => `
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = ${alias}.CODFILIAL
    AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = TRIM(CAST(${alias}.CODEPTO AS CHAR))
    AND (
      (
        BV.ID_SECAO IS NOT NULL
        AND (
          TRIM(CAST(BV.ID_SECAO AS CHAR)) = TRIM(CAST(${alias}.CODSEC AS CHAR))
          OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(${alias}.CODSEC AS CHAR))
        )
      )
      OR (
        BV.ID_SECAO IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM BU_VENDEDOR BV2
          WHERE BV2.VENDEDOR_ID = BV.VENDEDOR_ID
            AND COALESCE(BV2.ATIVO, TRUE) = TRUE
            AND TRIM(COALESCE(CAST(BV2.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), ''))
            AND TRIM(CAST(BV2.BU_CODIGO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR))
            AND BV2.ID_SECAO IS NOT NULL
            AND (
              TRIM(CAST(BV2.ID_SECAO AS CHAR)) = TRIM(CAST(${alias}.CODSEC AS CHAR))
              OR LPAD(TRIM(CAST(BV2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(${alias}.CODSEC AS CHAR))
            )
        )
      )
    )
  `;

const vendasRcaCte = `
VENDAS_ATRIBUIDAS_RCA AS (
  SELECT
    V.*,
    VR.USER_ID AS VENDEDOR_ATRIBUIDO
  FROM VENDAS_PERIODO V
  JOIN VENDEDOR_RCA VR
    ON TRIM(CAST(VR.COD_RCA AS CHAR)) = TRIM(CAST(V.COD_RCA AS CHAR))
  JOIN VENDEDORES_COORDENADOR VC ON VC.VENDEDOR_ID = VR.USER_ID
  WHERE NOT EXISTS (
    SELECT 1
    FROM VENDAS_ATRIBUIDAS VA
    WHERE VA.AUTO_ID = V.AUTO_ID
  )
    AND EXISTS (
      SELECT 1
      FROM BU_VENDEDOR BV
      JOIN ESCOPO_BU E
        ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
       AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
      WHERE BV.VENDEDOR_ID = VR.USER_ID
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
        AND ${territoryMatch('V')}
    )
),`;

const devolucoesRcaCte = `
DEVOLUCOES_ATRIBUIDAS_RCA AS (
  SELECT
    D.*,
    VR.USER_ID AS VENDEDOR_ATRIBUIDO
  FROM DEVOLUCOES_PERIODO D
  JOIN VENDEDOR_RCA VR
    ON TRIM(CAST(VR.COD_RCA AS CHAR)) = TRIM(CAST(D.COD_RCA AS CHAR))
  JOIN VENDEDORES_COORDENADOR VC ON VC.VENDEDOR_ID = VR.USER_ID
  WHERE NOT EXISTS (
    SELECT 1
    FROM DEVOLUCOES_ATRIBUIDAS DA
    WHERE DA.AUTO_ID = D.AUTO_ID
  )
    AND EXISTS (
      SELECT 1
      FROM BU_VENDEDOR BV
      JOIN ESCOPO_BU E
        ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E.CODFILIAL AS CHAR)
       AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E.CODEPTO AS CHAR)
      WHERE BV.VENDEDOR_ID = VR.USER_ID
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
        AND ${territoryMatch('D')}
    )
),`;

const semCarteiraExclusion = (alias) => `
    AND NOT EXISTS (
      SELECT 1
      FROM VENDEDOR_RCA VR_SCOPE
      JOIN BU_VENDEDOR BV
        ON BV.VENDEDOR_ID = VR_SCOPE.USER_ID
       AND COALESCE(BV.ATIVO, TRUE) = TRUE
      JOIN ESCOPO_BU E_SCOPE
        ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(E_SCOPE.CODFILIAL AS CHAR)
       AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(E_SCOPE.CODEPTO AS CHAR)
      WHERE TRIM(CAST(VR_SCOPE.COD_RCA AS CHAR)) = TRIM(CAST(${alias}.COD_RCA AS CHAR))
        AND ${territoryMatch(alias)}
    )`;

function transformPanelCode(code) {
  let next = code;

  if (!next.includes('VENDAS_ATRIBUIDAS_RCA AS')) {
    next = next.replace(/\n\),\nVENDAS_SEM_CARTEIRA AS \(/, `\n),${vendasRcaCte}\nVENDAS_SEM_CARTEIRA AS (`);
    next = next.replace('  WHERE CCG.ID_CLIENTE IS NULL\n),\nVENDAS_BASE AS (', '  WHERE CCG.ID_CLIENTE IS NULL\n    AND NOT EXISTS (SELECT 1 FROM VENDAS_ATRIBUIDAS_RCA VAR WHERE VAR.AUTO_ID = V.AUTO_ID)\n),\nVENDAS_BASE AS (');
    next = next.replace('VENDAS_BASE AS (\n  SELECT * FROM VENDAS_ATRIBUIDAS\n  UNION ALL\n  SELECT * FROM VENDAS_SEM_CARTEIRA', 'VENDAS_BASE AS (\n  SELECT * FROM VENDAS_ATRIBUIDAS\n  UNION ALL\n  SELECT * FROM VENDAS_ATRIBUIDAS_RCA\n  UNION ALL\n  SELECT * FROM VENDAS_SEM_CARTEIRA');
  }

  if (!next.includes('DEVOLUCOES_ATRIBUIDAS_RCA AS')) {
    next = next.replace(/\n\),\nDEVOLUCOES_SEM_CARTEIRA AS \(/, `\n),${devolucoesRcaCte}\nDEVOLUCOES_SEM_CARTEIRA AS (`);
    next = next.replace('  WHERE CCG.ID_CLIENTE IS NULL\n),\nDEVOLUCOES_BASE AS (', '  WHERE CCG.ID_CLIENTE IS NULL\n    AND NOT EXISTS (SELECT 1 FROM DEVOLUCOES_ATRIBUIDAS_RCA DAR WHERE DAR.AUTO_ID = D.AUTO_ID)\n),\nDEVOLUCOES_BASE AS (');
    next = next.replace('DEVOLUCOES_BASE AS (\n  SELECT * FROM DEVOLUCOES_ATRIBUIDAS\n  UNION ALL\n  SELECT * FROM DEVOLUCOES_SEM_CARTEIRA', 'DEVOLUCOES_BASE AS (\n  SELECT * FROM DEVOLUCOES_ATRIBUIDAS\n  UNION ALL\n  SELECT * FROM DEVOLUCOES_ATRIBUIDAS_RCA\n  UNION ALL\n  SELECT * FROM DEVOLUCOES_SEM_CARTEIRA');
  }

  return next;
}

function transformSemCarteiraDetail(code) {
  if (code.includes('VR_SCOPE.USER_ID')) return code;
  return code.replace('    AND CCG.ID_CLIENTE IS NULL\n)', `    AND CCG.ID_CLIENTE IS NULL${semCarteiraExclusion('V')}\n)`);
}

async function updateSf(serverFunctionId, transform, descriptionSuffix) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = current.result.code;
  const nextCode = transform(code);
  if (nextCode === code) {
    console.log(`SF ${serverFunctionId}: sem alterações`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: nextCode,
    description: `${current.result.description || ''} ${descriptionSuffix}`.trim(),
  });
  console.log(`SF ${serverFunctionId}: atualizada`);
}

async function validateUser15Scope() {
  const response = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS TOTAL
          FROM BU_VENDEDOR
          WHERE VENDEDOR_ID = 15
            AND COALESCE(ATIVO, TRUE) = TRUE`,
  });
  const total = Number(response.result?.rows?.[0]?.TOTAL || 0);
  if (total <= 0) throw new Error('Usuário 15 não retornou escopo ativo na validação.');
  console.log(`Usuário 15 possui ${total} escopo(s) ativo(s).`);
}

async function smoke() {
  const response = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 190,
    input: { mes: '5', ano: '2026' },
  });
  if (response.result?.executionStatus === 'FAILED') {
    throw new Error(response.result?.error || 'Smoke da SF 190 falhou.');
  }
  console.log('Smoke SF 190 OK.');
}

async function main() {
  await validateUser15Scope();
  for (const serverFunctionId of PANEL_FUNCTIONS) {
    await updateSf(serverFunctionId, transformPanelCode, 'Atribui vendas por RCA com escopo ativo antes de classificar como sem carteira.');
  }
  await updateSf(213, transformSemCarteiraDetail, 'Exclui pedidos cujo RCA possui escopo ativo antes da auditoria sem carteira.');
  await smoke();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
