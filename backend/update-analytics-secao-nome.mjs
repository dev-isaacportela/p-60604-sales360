import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
  executeServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const SF_FILTROS = 181;
const SF_MIX_PRODUTOS = 184;

async function readCode(serverFunctionId) {
  const response = await readServerFunctionMitra({ projectId, serverFunctionId });
  const fn = response.result || response;
  return {
    code: String(fn.code || ''),
    description: fn.description || '',
  };
}

function replaceRequired(code, from, to, label) {
  if (!code.includes(from)) {
    throw new Error(`Trecho não encontrado: ${label}`);
  }
  return code.replace(from, to);
}

function updateFiltrosCode(code) {
  let next = code;

  next = replaceRequired(
    next,
    "    TRIM(CAST(V.CODSEC AS CHAR)) AS VALUE,\n    COALESCE(NULLIF(TRIM(CAST(MAX(V.SECAO) AS CHAR)), ''), CONCAT('Seção ', V.CODSEC)) AS LABEL",
    "    TRIM(CAST(V.CODSEC AS CHAR)) AS VALUE,\n    COALESCE(NULLIF(TRIM(CAST(MAX(S.NOME_SECAO) AS CHAR)), ''), NULLIF(TRIM(CAST(MAX(V.SECAO) AS CHAR)), ''), CONCAT('Seção ', V.CODSEC)) AS LABEL",
    'label de seção por vendas',
  );

  next = replaceRequired(
    next,
    "     AND CS.USER_ID = BS.USER_ID\n  \n  WHERE V.CODSEC IS NOT NULL",
    "     AND CS.USER_ID = BS.USER_ID\n  \n  LEFT JOIN SECAO S\n    ON TRIM(CAST(S.ID AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))\n   AND (S.ID_BU IS NULL OR TRIM(CAST(S.ID_BU AS CHAR)) = TRIM(CAST(V.CODEPTO AS CHAR)))\n  WHERE V.CODSEC IS NOT NULL",
    'join SECAO em filtros',
  );

  next = replaceRequired(
    next,
    "  SELECT\n    CAST(B.ID_SECAO AS CHAR) AS VALUE,\n    CONCAT('Seção ', B.ID_SECAO) AS LABEL\n  FROM BU_SCOPE B\n  WHERE B.ID_SECAO IS NOT NULL",
    "  SELECT\n    CAST(B.ID_SECAO AS CHAR) AS VALUE,\n    COALESCE(NULLIF(TRIM(CAST(MAX(SB.NOME_SECAO) AS CHAR)), ''), CONCAT('Seção ', B.ID_SECAO)) AS LABEL\n  FROM BU_SCOPE B\n  LEFT JOIN SECAO SB\n    ON TRIM(CAST(SB.ID AS CHAR)) = TRIM(CAST(B.ID_SECAO AS CHAR))\n   AND (SB.ID_BU IS NULL OR TRIM(CAST(SB.ID_BU AS CHAR)) = TRIM(CAST(B.ID_BU AS CHAR)))\n  WHERE B.ID_SECAO IS NOT NULL\n  GROUP BY CAST(B.ID_SECAO AS CHAR), B.ID_SECAO",
    'label de seção por escopo',
  );

  return next;
}

function updateMixProdutosCode(code) {
  let next = code;

  next = replaceRequired(
    next,
    "    COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)) AS DEPARTAMENTO,\n    COALESCE(NULLIF(TRIM(CAST(V.SECAO AS CHAR)), ''), CONCAT('Seção ', V.CODSEC)) AS SECAO,",
    "    COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)) AS DEPARTAMENTO,\n    COALESCE(NULLIF(TRIM(CAST(MAX(SV.NOME_SECAO) AS CHAR)), ''), NULLIF(TRIM(CAST(MAX(V.SECAO) AS CHAR)), ''), CONCAT('Seção ', V.CODSEC)) AS SECAO,",
    'label de seção em vendas',
  );

  next = replaceRequired(
    next,
    "     AND CS.USER_ID = BS.USER_ID\n  \n  JOIN PERIODO P ON 1 = 1\n  WHERE 1 = 1",
    "     AND CS.USER_ID = BS.USER_ID\n  \n  LEFT JOIN SECAO SV\n    ON TRIM(CAST(SV.ID AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))\n   AND (SV.ID_BU IS NULL OR TRIM(CAST(SV.ID_BU AS CHAR)) = TRIM(CAST(V.CODEPTO AS CHAR)))\n  JOIN PERIODO P ON 1 = 1\n  WHERE 1 = 1",
    'join SECAO em vendas',
  );

  next = replaceRequired(
    next,
    "  GROUP BY COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)),\n           COALESCE(NULLIF(TRIM(CAST(V.SECAO AS CHAR)), ''), CONCAT('Seção ', V.CODSEC))",
    "  GROUP BY COALESCE(NULLIF(TRIM(CAST(V.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', V.CODEPTO)),\n           TRIM(CAST(V.CODSEC AS CHAR)), V.CODSEC",
    'group by seção em vendas',
  );

  next = replaceRequired(
    next,
    "    COALESCE(NULLIF(TRIM(CAST(D.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', D.CODEPTO)) AS DEPARTAMENTO,\n    COALESCE(NULLIF(TRIM(CAST(D.SECAO AS CHAR)), ''), CONCAT('Seção ', D.CODSEC)) AS SECAO,",
    "    COALESCE(NULLIF(TRIM(CAST(D.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', D.CODEPTO)) AS DEPARTAMENTO,\n    COALESCE(NULLIF(TRIM(CAST(MAX(SD.NOME_SECAO) AS CHAR)), ''), NULLIF(TRIM(CAST(MAX(D.SECAO) AS CHAR)), ''), CONCAT('Seção ', D.CODSEC)) AS SECAO,",
    'label de seção em devoluções',
  );

  next = replaceRequired(
    next,
    "     AND CS.USER_ID = BS.USER_ID\n  \n  JOIN PERIODO P ON 1 = 1\n  WHERE 1 = 1",
    "     AND CS.USER_ID = BS.USER_ID\n  \n  LEFT JOIN SECAO SD\n    ON TRIM(CAST(SD.ID AS CHAR)) = TRIM(CAST(D.CODSEC AS CHAR))\n   AND (SD.ID_BU IS NULL OR TRIM(CAST(SD.ID_BU AS CHAR)) = TRIM(CAST(D.CODEPTO AS CHAR)))\n  JOIN PERIODO P ON 1 = 1\n  WHERE 1 = 1",
    'join SECAO em devoluções',
  );

  next = replaceRequired(
    next,
    "  GROUP BY COALESCE(NULLIF(TRIM(CAST(D.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', D.CODEPTO)),\n           COALESCE(NULLIF(TRIM(CAST(D.SECAO AS CHAR)), ''), CONCAT('Seção ', D.CODSEC))",
    "  GROUP BY COALESCE(NULLIF(TRIM(CAST(D.DEPARTAMENTO AS CHAR)), ''), CONCAT('Departamento ', D.CODEPTO)),\n           TRIM(CAST(D.CODSEC AS CHAR)), D.CODSEC",
    'group by seção em devoluções',
  );

  return next;
}

async function updateSf(serverFunctionId, transform, descriptionSuffix) {
  const current = await readCode(serverFunctionId);
  const code = transform(current.code);
  if (code === current.code) {
    console.log(`SF ${serverFunctionId}: sem alterações.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code,
    description: current.description.includes(descriptionSuffix)
      ? current.description
      : `${current.description} ${descriptionSuffix}`.trim(),
  });
  console.log(`SF ${serverFunctionId}: atualizada.`);
}

async function smoke() {
  const input = {
    dataInicio: '2026-05-01',
    dataFim: '2026-05-28',
    filiais: '',
    departamentos: '',
    secoes: '',
    ramos: '',
    limit: '50',
    offset: '0',
    scopeMode: 'ME',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };

  for (const serverFunctionId of [SF_FILTROS, SF_MIX_PRODUTOS]) {
    const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
    const result = response.result || response;
    if (result.executionStatus === 'FAILED') {
      throw new Error(`Smoke SF ${serverFunctionId} falhou: ${result.error || 'erro desconhecido'}`);
    }
    console.log(`Smoke SF ${serverFunctionId}: ${result.executionStatus || 'OK'}.`);
  }
}

await updateSf(SF_FILTROS, updateFiltrosCode, 'Seções nomeadas por SECAO.NOME_SECAO.');
await updateSf(SF_MIX_PRODUTOS, updateMixProdutosCode, 'Seções nomeadas por SECAO.NOME_SECAO.');
await smoke();
