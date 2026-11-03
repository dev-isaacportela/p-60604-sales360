import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const TARGETS = [
  { id: 182, name: 'analyticsRcaMetaResumo' },
  { id: 214, name: 'dashboardVendasDiarias' },
];

function replaceOnce(code, from, to, label) {
  if (!code.includes(from)) {
    if (code.includes(to)) return code;
    throw new Error(`Trecho nao encontrado para ${label}.`);
  }
  return code.replace(from, to);
}

function patchAnalyticsMetaResumo(code) {
  let next = code;
  next = replaceOnce(
    next,
    `    JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID`,
    `    LEFT JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID`,
    'analytics vendas carteira left join',
  );
  next = replaceOnce(
    next,
    `    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(V.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )`,
    `    AND (
      CS.USER_ID IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.USER_ID = BS.USER_ID)
    )
    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(V.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )`,
    'analytics vendas fallback sem carteira',
  );
  next = replaceOnce(
    next,
    `    JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID`,
    `    LEFT JOIN CARTEIRA_SCOPE CS
      ON TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))
     AND CS.USER_ID = BS.USER_ID`,
    'analytics devolucoes carteira left join',
  );
  next = replaceOnce(
    next,
    `    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(D.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )`,
    `    AND (
      CS.USER_ID IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.USER_ID = BS.USER_ID)
    )
    AND (
      P.CLIENTE_PARAM IS NULL
      OR FIND_IN_SET(TRIM(CAST(D.CODCLI AS CHAR)), P.CLIENTE_PARAM) > 0
    )`,
    'analytics devolucoes fallback sem carteira',
  );
  return next;
}

function patchDashboardVendasDiarias(code) {
  let next = code;
  next = replaceOnce(
    next,
    `  JOIN CARTEIRA_SCOPE CS ON 
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND (
    (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
    OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
  )`,
    `  LEFT JOIN CARTEIRA_SCOPE CS ON 
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND (
    (R.CLIENTE_ID IS NOT NULL AND CS.CLIENTE_ID = R.CLIENTE_ID)
    OR TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(R.CODCLI AS CHAR))
  )`,
    'diarias vendas carteira left join',
  );
  next = replaceOnce(
    next,
    `  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'`,
    `  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND (
      CS.TARGET_USER_ID IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.TARGET_USER_ID = B.TARGET_USER_ID)
    )`,
    'diarias vendas fallback sem carteira',
  );
  next = replaceOnce(
    next,
    `  JOIN CARTEIRA_SCOPE CS ON 
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))`,
    `  LEFT JOIN CARTEIRA_SCOPE CS ON 
  CS.TARGET_USER_ID = B.TARGET_USER_ID
  AND TRIM(CAST(CS.CODCLI AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR))`,
    'diarias devolucoes carteira left join',
  );
  next = replaceOnce(
    next,
    `),
DIAS_BASE AS (`,
    `  WHERE (
    CS.TARGET_USER_ID IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM CARTEIRA_SCOPE CS_ANY WHERE CS_ANY.TARGET_USER_ID = B.TARGET_USER_ID)
  )
),
DIAS_BASE AS (`,
    'diarias devolucoes fallback sem carteira',
  );
  return next;
}

function rows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function updateTarget(target) {
  const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  if (current?.result?.name !== target.name) {
    throw new Error(`SF ${target.id} esperada ${target.name}, encontrada ${current?.result?.name || 'sem nome'}.`);
  }

  const original = current?.result?.code || '';
  const next = target.id === 182 ? patchAnalyticsMetaResumo(original) : patchDashboardVendasDiarias(original);
  if (next !== original) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: target.id,
      code: next,
      description: current?.result?.description || target.name,
    });
  }
}

async function validate() {
  const scope = {
    scopeMode: 'GLOBAL',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodSupervisor: '',
    scopeCodFilial: '',
    scopeCodepto: '9',
    scopeIdSecao: '',
  };
  const resumo = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: 182,
    input: { dataInicio: '2026-07-01', dataFim: '2026-07-31', departamentos: '', ramos: '', limit: '100', offset: '0', ...scope },
  });
  const resumoRow = rows(resumo)[0] || {};
  const diario = await executeServerFunctionMitra({ projectId, serverFunctionId: 214, input: scope });
  const diarioRows = rows(diario);

  console.log(JSON.stringify({
    faturamentoJulhoDepto9: Number(resumoRow.FATURAMENTO_LIQUIDO || 0),
    diasComValor: diarioRows.filter((row) => Number(row.VALOR_ATUAL || 0) !== 0).length,
    diario: diarioRows,
  }, null, 2));

  if (Number(resumoRow.FATURAMENTO_LIQUIDO || 0) <= 0) {
    throw new Error('Validacao falhou: faturamento de julho do depto 9 continuou zerado.');
  }
  if (!diarioRows.some((row) => Number(row.VALOR_ATUAL || 0) > 0)) {
    throw new Error('Validacao falhou: serie diaria do depto 9 continuou zerada.');
  }
}

async function main() {
  for (const target of TARGETS) await updateTarget(target);
  await validate();
}

main().catch((error) => {
  console.error('Falha ao corrigir dashboard para BU sem carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
