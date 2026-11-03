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
const CRON = '0 0,30 * * * *';

/*
 * Ultimo elo do sync de custos do Mix Builder.
 *
 * A SF 251 lia o projeto de custos (46967) com runQueryMitra({ projectId: 46967 }):
 * chamada cross-project autenticada pela IDENTIDADE DE QUEM DISPARA. Isso so funciona
 * quando um dev executa. Pela tela o vendedor e BUSINESS e, por cron, nao existe usuario
 * nenhum -> HTTP 403 nas duas situacoes.
 *
 * A rota correta e a integracao 'gestao-de-custos' (blueprint mitra_project) que ja
 * existe no projeto: a credencial mora na integracao, entao a leitura remota passa a
 * independer de quem dispara a SF.
 */
const IMPORT_ANTIGO = `const {
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');`;

const IMPORT_NOVO = `const {
  callIntegrationMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');`;

const HELPER = `// Leitura do projeto de custos SEMPRE pela integracao: a credencial vive nela, entao
// funciona por cron (sem usuario) e nao depende do userType de quem dispara.
async function queryRemoto(sql) {
  const resposta = await callIntegrationMitra({
    projectId,
    connection: 'gestao-de-custos',
    method: 'POST',
    endpoint: 'runQuery',
    body: { sql },
  });
  const rows = resposta?.body?.result?.rows || resposta?.result?.rows || [];
  return { result: { rows } };
}

async function ensureColumnType(`;

// Converte `runQueryMitra({ projectId: remoteCostProjectId, sql: <expr> })` em
// `queryRemoto(<expr>)`, equilibrando chaves em vez de confiar em regex guloso.
function converterLeiturasRemotas(code) {
  const ABERTURA = 'runQueryMitra({';
  let total = 0;

  for (;;) {
    const inicio = code.indexOf(ABERTURA);
    if (inicio === -1) break;

    let profundidade = 0;
    let fim = -1;
    for (let i = inicio + ABERTURA.length - 1; i < code.length; i += 1) {
      if (code[i] === '{') profundidade += 1;
      else if (code[i] === '}') {
        profundidade -= 1;
        if (profundidade === 0) { fim = i; break; }
      }
    }
    if (fim === -1) throw new Error('chamada runQueryMitra sem fechamento — abortando.');

    const fimChamada = code.indexOf(')', fim);
    const bloco = code.slice(inicio, fimChamada + 1);

    if (!bloco.includes('projectId: remoteCostProjectId')) {
      // leitura local legitima: preserva e segue adiante
      code = code.slice(0, inicio) + bloco.replace(ABERTURA, 'runQueryMitraLocal({') + code.slice(fimChamada + 1);
      continue;
    }

    const sqlInicio = bloco.indexOf('sql:');
    if (sqlInicio === -1) throw new Error('chamada remota sem campo sql — abortando.');
    let expressaoSql = bloco.slice(sqlInicio + 'sql:'.length, bloco.lastIndexOf('}')).trim();
    if (expressaoSql.endsWith(',')) expressaoSql = expressaoSql.slice(0, -1);

    code = code.slice(0, inicio) + `queryRemoto(\n${expressaoSql}\n    )` + code.slice(fimChamada + 1);
    total += 1;
  }

  // restaura o nome das leituras locais
  code = code.split('runQueryMitraLocal({').join('runQueryMitra({');
  return { code, total };
}

async function main() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
  let code = atual?.result?.code || '';

  if (code.includes('async function queryRemoto')) {
    console.log('SF 251 ja le pela integracao — nada a fazer.');
  } else {
    if (!code.includes(IMPORT_ANTIGO)) throw new Error('bloco de import nao encontrado — abortando.');
    code = code.replace(IMPORT_ANTIGO, IMPORT_NOVO);

    if (!code.includes('async function ensureColumnType(')) throw new Error('ensureColumnType nao encontrada — abortando.');
    code = code.replace('async function ensureColumnType(', HELPER);

    const convertido = converterLeiturasRemotas(code);
    code = convertido.code;
    console.log(`leituras remotas convertidas: ${convertido.total}`);
    if (convertido.total !== 3) throw new Error(`esperava 3 leituras remotas, converti ${convertido.total} — abortando.`);
    if (code.includes('projectId: remoteCostProjectId')) throw new Error('ainda restam chamadas cross-project — abortando.');

    await updateServerFunctionMitra({ projectId, serverFunctionId: 251, code, description: atual?.result?.description, cronExpression: CRON });
    console.log('SF 251 atualizada para ler via integracao.');
  }

  const r = await executeServerFunctionMitra({ projectId, serverFunctionId: 251, input: { ttlSeconds: '0' } });
  let out = r?.result?.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* mantem */ } }
  if (r?.result?.executionStatus !== 'COMPLETED' || out?.fallback) {
    throw new Error(`sync nao concluiu: ${JSON.stringify(out)}`);
  }
  console.log('smoke sync ->', JSON.stringify(out));

  const status = await runQueryMitra({ projectId, sql: 'SELECT CHAVE, LEFT(VALOR, 90) AS VALOR FROM MIX_CUSTOS_SYNC ORDER BY CHAVE' });
  for (const row of status?.result?.rows || []) console.log(`  ${row.CHAVE} = ${row.VALOR}`);
}

main().catch((error) => {
  console.error('Falha ao converter o sync para integracao:');
  console.error(error?.message || error);
  process.exit(1);
});
