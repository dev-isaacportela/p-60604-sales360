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

/*
 * Custos do Mix Builder parados desde 24/09 (PROD) e 22/09 (DEV).
 *
 * As duas rotinas agendadas do Mix ainda declaravam `const remoteCostProjectId = 46967`.
 * Com o par dev/prod, SF agendada que cita outro projeto entra no plano como
 * SF_FOREIGN_PROJECT_REF e fica FORA do agendamento do PROD — o cron simplesmente parou.
 * No DEV o agendamento nunca foi registrado (o DEV nasceu de copia e a SF nao foi salva depois).
 *
 * - 251 mixAtualizarCustosSeNecessario: ja lia pela integracao 'gestao-de-custos'; a constante
 *   era resto morto. Sai tambem o ensureTables: as tabelas existem nos dois lados e cada
 *   execucao com DDL virava migration nova no DEV (4 por rodada, a cada 30 min).
 * - 268 mixSincronizarProdutosCustosSemanal: ainda lia cross-project com runQueryMitra
 *   (403 por cron) — passa a ler pela mesma integracao, e sai o DDL de garantia.
 *
 * Salvar com cronExpression registra o agendamento de novo no DEV; no PROD ele volta no promote.
 */

const HELPER_INTEGRACAO = `// Leitura do projeto de custos SEMPRE pela integracao: a credencial vive nela, entao
// funciona por cron (sem usuario) e nao cita o id de outro projeto no codigo.
async function queryRemoto(sql) {
  const resposta = await callIntegrationMitra({
    projectId,
    connection: 'gestao-de-custos',
    method: 'POST',
    endpoint: 'runQuery',
    body: { sql },
  });
  return resposta?.body?.result?.rows || resposta?.result?.rows || [];
}
`;

// Remove do codigo a funcao `async function <nome>(` inteira, equilibrando chaves.
function removerFuncao(code, nome) {
  const inicio = code.indexOf(`async function ${nome}(`);
  if (inicio === -1) throw new Error(`funcao ${nome} nao encontrada — abortando.`);
  const abre = code.indexOf('{', code.indexOf(')', inicio));
  let profundidade = 0;
  for (let i = abre; i < code.length; i += 1) {
    if (code[i] === '{') profundidade += 1;
    else if (code[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return code.slice(0, inicio) + code.slice(i + 1).replace(/^\n+/, '\n');
    }
  }
  throw new Error(`funcao ${nome} sem fechamento — abortando.`);
}

function trocar(code, antigo, novo) {
  if (!code.includes(antigo)) throw new Error(`trecho nao encontrado: ${antigo.slice(0, 60)} — abortando.`);
  return code.replace(antigo, novo);
}

function corrigir251(code) {
  code = trocar(code, 'const remoteCostProjectId = 46967;\n', '');
  code = trocar(code, '// ALTER TABLE ... MODIFY e statement destrutivo e a plataforma bloqueia por default.\n', '');
  code = removerFuncao(code, 'ensureColumnType');
  code = removerFuncao(code, 'ensureTables');
  code = trocar(code, 'await ensureTables();\n\n', '');
  code = trocar(code, '  runDdlMitra,\n', '');
  return code;
}

function corrigir268(code) {
  code = trocar(code, 'const {\n  runDdlMitra,\n  runDmlMitra,\n  runQueryMitra,\n}', 'const {\n  callIntegrationMitra,\n  runDmlMitra,\n}');
  code = trocar(code, 'const remoteCostProjectId = 46967;\n', '');
  code = removerFuncao(code, 'remoteQuery');
  code = removerFuncao(code, 'ensureMirrorTable');
  code = trocar(code, 'async function importProducts()', `${HELPER_INTEGRACAO}\nasync function importProducts()`);
  code = code.split('await remoteQuery(').join('await queryRemoto(');
  code = trocar(code, 'await ensureMirrorTable();\n', '');
  return code;
}

async function aplicar(serverFunctionId, corrigir) {
  const atual = (await readServerFunctionMitra({ projectId, serverFunctionId }))?.result;
  if (!atual?.code) throw new Error(`SF ${serverFunctionId} sem codigo — abortando.`);
  if (!/\b46967\b/.test(atual.code)) {
    console.log(`SF ${serverFunctionId} ja nao cita o projeto de custos — so reagendando.`);
  }
  const code = /\b46967\b/.test(atual.code) ? corrigir(atual.code) : atual.code;
  if (/\b46967\b/.test(code)) throw new Error(`SF ${serverFunctionId} ainda cita o projeto de custos — abortando.`);
  if (/runDdlMitra/.test(code)) throw new Error(`SF ${serverFunctionId} ainda roda DDL — abortando.`);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code,
    description: atual.description,
    cronExpression: atual.cronExpression,
  });
  console.log(`SF ${serverFunctionId} ${atual.name} salva (cron ${atual.cronExpression}).`);
}

async function rodar(serverFunctionId, input) {
  const r = (await executeServerFunctionMitra({ projectId, serverFunctionId, input }))?.result;
  let out = r?.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* mantem */ } }
  if (r?.executionStatus !== 'COMPLETED' || out?.fallback || r?.error) {
    throw new Error(`SF ${serverFunctionId} falhou: ${JSON.stringify(out || r?.error).slice(0, 400)}`);
  }
  console.log(`SF ${serverFunctionId} ->`, JSON.stringify(out));
}

async function main() {
  await aplicar(251, corrigir251);
  await aplicar(268, corrigir268);
  await rodar(268, {});
  await rodar(251, { ttlSeconds: '0' });
}

main().catch((error) => {
  console.error('Falha ao corrigir o sync de custos do Mix:');
  console.error(error?.message || error);
  process.exit(1);
});
