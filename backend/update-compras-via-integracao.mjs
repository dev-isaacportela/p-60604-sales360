// Troca o projeto de Compras fixo (45547 = PROD) nas SFs de solicitacoes pela
// integracao "compras" do proprio projeto: o DEV aponta para o Compras DEV e o
// PROD para o Compras PROD, cada um pela sua integracao.
// A integracao so faz leitura (runQuery) hoje — executar SF remota por ela da 404 —,
// entao ela e usada para descobrir o projectId configurado, e a gravacao segue
// pela SF remota (sgc_inserir_solicitacao), que tem o mesmo id nos dois ambientes.
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const sfIds = [277, 278, 279, 280, 281, 282];
const hardcoded = 'const comprasProjectId = 45547;';

const resolver = `async function resolveComprasProjectId() {
  const response = await sdk.callIntegrationMitra({
    projectId: Number(process.env.MITRA_PROJECT_ID),
    connection: 'compras',
    method: 'POST',
    endpoint: 'runQuery',
    body: { sql: 'SELECT 1 AS OK' },
  });
  const remoteId = Number(response && response.body && response.body.projectId);
  if (!remoteId) throw new Error('Integracao "compras" sem projeto de compras configurado ou sem acesso.');
  return remoteId;
}
const comprasProjectId = await resolveComprasProjectId();`;

for (const serverFunctionId of sfIds) {
  const fn = (await readServerFunctionMitra({ projectId, serverFunctionId })).result;
  const code = String(fn.code || '');
  if (!code.includes(hardcoded)) {
    console.log(`${serverFunctionId} ${fn.name}: sem projeto fixo, ignorada`);
    continue;
  }
  const res = await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: code.replace(hardcoded, resolver),
  });
  console.log(`${serverFunctionId} ${fn.name}: atualizada`, JSON.stringify(res?.result?.migration ?? res?.migration ?? ''));
}
