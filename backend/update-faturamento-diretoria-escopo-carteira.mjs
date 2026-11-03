import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_NAMES = [
  'faturamentoDiretoriaFiltros',
  'faturamentoDiretoriaResumo',
  'faturamentoDiretoriaFiliais',
  'faturamentoDiretoriaCoordenadores',
  'faturamentoDiretoriaVendedores',
  'faturamentoDiretoriaProdutos',
  'faturamentoDiretoriaClientes',
  'faturamentoDiretoriaDetalhe',
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

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const all = listed?.result || listed || [];
  const updated = [];

  for (const name of TARGET_NAMES) {
    const fn = all.find((item) => item.name === name);
    if (!fn?.id) throw new Error(`Server function nao encontrada: ${name}`);
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: fn.id });
    const original = current?.result?.code || '';
    const next = patchCode(original);
    if (next !== original) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: fn.id,
        code: next,
        description: current?.result?.description || name,
      });
      updated.push({ name, id: fn.id });
    }
  }

  const smokeIds = all
    .filter((item) => ['faturamentoDiretoriaResumo', 'faturamentoDiretoriaVendedores', 'faturamentoDiretoriaDetalhe'].includes(item.name))
    .map((item) => item.id);
  for (const id of smokeIds) {
    const response = await executeServerFunctionMitra({
      projectId,
      serverFunctionId: id,
      input: { mes: '7', ano: '2026', codSupervisor: '', codfilial: '', codRca: '', codCli: '', codProd: '' },
    });
    const status = String(response?.result?.executionStatus || '');
    const error = String(response?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`SF ${id} falhou: ${error || status}`);
    console.log(`SF ${id}: OK (${extractRows(response).length} linha(s)).`);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir escopo de carteira no faturamento da diretoria:');
  console.error(error?.message || error);
  process.exit(1);
});
