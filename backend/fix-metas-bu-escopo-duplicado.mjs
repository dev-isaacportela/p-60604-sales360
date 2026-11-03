/**
 * Corrige a duplicacao de BU no painel Analytics > Metas.
 *
 * A SF painelCoordenadorMetasBuRecebidas montava o escopo de BUs com
 * COD_SUPERVISOR dentro do SELECT DISTINCT. Quando a mesma BU (filial +
 * departamento) tem dois coordenadores — o caso de MEDICAMENTO nas 8 filiais —
 * a BU saia duas vezes no resultado:
 *   - a "Meta geral" contava a meta da diretoria dessa BU em dobro;
 *   - o ESCOPO_BU_COUNT dobrava e a meta integrada do planejamento estrategico
 *     era dividida por 16 filiais em vez de 8, cortando pela metade a meta de
 *     cada filial;
 *   - o filtro de Filial/BU da tela listava a mesma BU duas vezes.
 *
 * COD_SUPERVISOR nunca e usado depois do CTE (o vinculo com o coordenador ja
 * acontece no JOIN com COORD), entao remove-lo do DISTINCT resolve sem mudar
 * nenhum outro comportamento.
 */
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra, executeServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SERVER_FUNCTION_ID = 195;

const ALVO = `ESCOPO_BU AS (
  SELECT DISTINCT
    CB.COD_SUPERVISOR,
    CB.CODFILIAL,`;

const NOVO = `ESCOPO_BU AS (
  -- Sem COD_SUPERVISOR no DISTINCT: BU com mais de um coordenador vinha
  -- duplicada e dobrava a meta da diretoria no escopo global.
  SELECT DISTINCT
    CB.CODFILIAL,`;

function extractRows(res) {
  let output = res?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { /* keep */ }
  }
  return output?.rows || [];
}

async function main() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: SERVER_FUNCTION_ID });
  const code = atual.result.code;

  if (!code.includes(ALVO)) {
    if (code.includes(NOVO)) {
      console.log('SF 195 ja corrigida. Nada a fazer.');
      return;
    }
    throw new Error('Trecho ESCOPO_BU nao encontrado na SF 195 — o codigo mudou, revisar antes de aplicar.');
  }

  const novoCode = code.replace(ALVO, NOVO);
  const resp = await updateServerFunctionMitra({ projectId, serverFunctionId: SERVER_FUNCTION_ID, code: novoCode });
  console.log('SF 195 atualizada.', resp?.result?.migration ? `migration: ${resp.result.migration}` : (resp?.result?.migrationSkippedReason || ''));

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: SERVER_FUNCTION_ID,
    input: { mes: '5', ano: '2026', scopeMode: 'GLOBAL' },
  });
  if (smoke.result.executionStatus !== 'COMPLETED') {
    throw new Error(`Smoke falhou: ${smoke.result.error || smoke.result.executionStatus}`);
  }
  const rows = extractRows(smoke);
  const chaves = rows.map((row) => `${row.CODFILIAL}::${row.CODEPTO}`);
  const duplicadas = chaves.filter((chave, index) => chaves.indexOf(chave) !== index);
  console.log(`Smoke OK: ${rows.length} BU(s), ${new Set(chaves).size} distinta(s), ${duplicadas.length} duplicada(s).`);
  if (duplicadas.length > 0) throw new Error(`Ainda ha BU duplicada: ${[...new Set(duplicadas)].join(', ')}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
