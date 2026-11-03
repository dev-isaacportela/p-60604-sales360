import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const comprasProjectId = 45547;
const comprasJdbcId = 3;

const remoteDefinitions = [
  {
    name: 'sgc_analise_solicitacao_meses_geral',
    type: 'SQL',
    jdbcId: comprasJdbcId,
    code: `SELECT TO_CHAR(M.DTMOV, 'YYYY-MM') AS MES,
                  SUM(CASE WHEN M.QT > 0 THEN M.QT ELSE 0 END) AS QT_VENDIDA
           FROM PCMOV M
           WHERE M.CODOPER = 'S'
             AND M.CODPROD = {{codprod}}
             AND M.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -5)
           GROUP BY TO_CHAR(M.DTMOV, 'YYYY-MM')
           ORDER BY MES`,
    description: 'Vendas mensais gerais do produto para apoio a solicitacao, sem filtro de filial.',
  },
  {
    name: 'sgc_analise_solicitacao_clientes_geral',
    type: 'SQL',
    jdbcId: comprasJdbcId,
    code: `SELECT * FROM (
             SELECT M.CODCLI,
                    NVL(C.CLIENTE, 'Cliente ' || M.CODCLI) AS CLIENTE,
                    SUM(CASE WHEN M.QT > 0 THEN M.QT ELSE 0 END) AS QT_VENDIDA
             FROM PCMOV M
             LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
             WHERE M.CODOPER = 'S'
               AND M.CODPROD = {{codprod}}
               AND M.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE), -6)
             GROUP BY M.CODCLI, C.CLIENTE
             ORDER BY QT_VENDIDA DESC
           ) WHERE ROWNUM <= 5`,
    description: 'Top clientes compradores gerais do produto para apoio a solicitacao, sem filtro de filial.',
  },
];

function wrapperCode(remoteSfId) {
  return `
const sdk = require('mitra-sdk');
const comprasProjectId = ${comprasProjectId};

function rowsFrom(response) {
  let output = response && response.result && response.result.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch (error) { output = {}; }
  }
  return (output && (output.rows || output.result)) || [];
}

const codprod = String(event.codprod || '').trim();
if (!codprod) return [];

const response = await sdk.executeServerFunctionMitra({
  projectId: comprasProjectId,
  serverFunctionId: ${remoteSfId},
  input: { codprod },
});

const status = String(response && response.result && response.result.executionStatus || '');
const error = String(response && response.result && response.result.error || '').trim();
if ((status && status !== 'COMPLETED') || error) throw new Error(error || status || 'Falha na consulta remota.');
return { rows: rowsFrom(response) };
`;
}

async function upsert(project, definition) {
  const listed = (await listServerFunctionsMitra({ projectId: project }))?.result || [];
  const existing = listed.find((item) => item.name === definition.name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId: project,
      serverFunctionId: Number(existing.id),
      ...definition,
    });
    return Number(existing.id);
  }

  const created = await createServerFunctionMitra({ projectId: project, ...definition });
  return Number(created?.result?.serverFunctionId || created?.result?.id || created?.id || created?.serverFunctionId);
}

async function main() {
  const remoteIds = {};
  for (const definition of remoteDefinitions) {
    remoteIds[definition.name] = await upsert(comprasProjectId, definition);
  }

  const localDefinitions = [
    {
      name: 'solicitacoesComprasProdutoSaidaGeral',
      type: 'JAVASCRIPT',
      code: wrapperCode(remoteIds.sgc_analise_solicitacao_meses_geral),
      description: 'Consulta no projeto de compras a saida mensal geral do produto, sem filtro de filial.',
    },
    {
      name: 'solicitacoesComprasProdutoClientesGeral',
      type: 'JAVASCRIPT',
      code: wrapperCode(remoteIds.sgc_analise_solicitacao_clientes_geral),
      description: 'Consulta no projeto de compras os principais clientes compradores gerais do produto, sem filtro de filial.',
    },
  ];

  const localIds = {};
  for (const definition of localDefinitions) {
    localIds[definition.name] = await upsert(projectId, definition);
  }

  console.log(JSON.stringify({ remoteIds, localIds }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
