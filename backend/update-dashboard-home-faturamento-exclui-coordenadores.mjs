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
  { id: 181, name: 'analyticsRcaFiltros' },
  { id: 182, name: 'analyticsRcaMetaResumo' },
  { id: 183, name: 'analyticsRcaEvolucao24m' },
  { id: 184, name: 'analyticsRcaMixProdutos' },
  { id: 185, name: 'analyticsRcaCarteira' },
  { id: 186, name: 'analyticsRcaTopClientes' },
  { id: 187, name: 'analyticsRcaVisitas' },
  { id: 188, name: 'analyticsRcaDevolucoes' },
  { id: 287, name: 'analyticsRcaEvolucaoCliente' },
  { id: 214, name: 'dashboardVendasDiarias' },
];

function patchCode(code) {
  return code;
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

async function executeRows(serverFunctionId, input, label) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`${label} falhou: ${error || status}`);
  }
  const rows = extractRows(response);
  console.log(`${label}:`, JSON.stringify(rows.slice(0, 10)));
  return rows;
}

async function main() {
  const updated = [];

  for (const target of TARGETS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
    if (current?.result?.name !== target.name) {
      throw new Error(`SF ${target.id} esperada ${target.name}, encontrada ${current?.result?.name || 'sem nome'}.`);
    }

    const original = current?.result?.code || '';
    const next = patchCode(original);
    if (next !== original) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: target.id,
        code: next,
        description: current?.result?.description || target.name,
      });
      updated.push(target.name);
    }
  }

  const scope = {
    scopeMode: 'GLOBAL',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodSupervisor: '913',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };

  const resumoRows = await executeRows(182, {
    dataInicio: '2026-07-01',
    dataFim: '2026-07-31',
    departamentos: '',
    ramos: '',
    limit: '100',
    offset: '0',
    ...scope,
  }, 'Resumo liquido Joao diretoria');
  const resumo = resumoRows[0] || {};
  console.log(`Resumo liquido final Joao: ${Number(resumo.FATURAMENTO_LIQUIDO || 0)}`);

  const topClientesRows = await executeRows(186, {
    dataInicio: '2026-07-01',
    dataFim: '2026-07-31',
    departamentos: '',
    ramos: '',
    limit: '100',
    offset: '0',
    ...scope,
  }, 'Top clientes Joao diretoria');
  const clientesGlauber = new Set(['106057', '106200']);
  const clientesIndevidos = topClientesRows.filter((row) => clientesGlauber.has(String(row.CODCLI || '').trim()));
  if (clientesIndevidos.length) {
    throw new Error(`Clientes do Glauber ainda aparecem no top clientes: ${clientesIndevidos.map((row) => row.CODCLI).join(', ')}.`);
  }

  const diarioRows = await executeRows(214, scope, 'Vendas diarias Joao diretoria');
  const picoIndevido = diarioRows.some((row) => Number(row.VALOR_ATUAL || 0) >= 1800000);
  if (picoIndevido) {
    throw new Error('Serie diaria do Joao ainda contem o pico da venda do Glauber.');
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir faturamento da home:');
  console.error(error?.message || error);
  process.exit(1);
});
