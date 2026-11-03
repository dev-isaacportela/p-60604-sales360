/**
 * Observa, em producao, se usuario business consegue executar SF do tipo JAVASCRIPT
 * depois da atribuicao de perfil. Emite uma linha por execucao nova.
 *
 * Uso: node monitor-perfil-business.mjs [segundos_entre_checagens]
 */
import 'dotenv/config';
import { configureSdkMitra, listProjectUsersMitra, listServerFunctionsMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const intervalo = (Number(process.argv[2]) || 60) * 1000;

const q = async (sql) => {
  const x = await runQueryMitra({ projectId, sql });
  return x?.rows || x?.result?.rows || x?.result || [];
};

const users = (await listProjectUsersMitra({ projectId }))?.result || [];
const business = new Map(users.filter((u) => (u.userType || u.type) === 'business')
  .map((u) => [String(u.userId ?? u.id), u.email]));
const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
const jsSfs = new Map(sfs.filter((s) => s.type === 'JAVASCRIPT').map((s) => [String(s.id), s.name]));
const tipoSf = new Map(sfs.map((s) => [String(s.id), s.type]));

let ultimoId = Number((await q('SELECT COALESCE(MAX(ID), 0) AS M FROM INT_SERVERFUNCTIONEXECUTION'))[0]?.M || 0);
console.log(`monitor ativo (a partir da execucao ${ultimoId}); ${business.size} usuarios business, ${jsSfs.size} SFs JavaScript`);

while (true) {
  await new Promise((r) => setTimeout(r, intervalo));
  try {
    const novas = await q(`SELECT ID, FUNCTION_ID, TRIGGERED_BY, STATUS, SUBSTRING(ERROR, 1, 180) AS ERRO
      FROM INT_SERVERFUNCTIONEXECUTION WHERE ID > ${ultimoId} ORDER BY ID`);
    for (const linha of novas) {
      ultimoId = Math.max(ultimoId, Number(linha.ID));
      const email = business.get(String(linha.TRIGGERED_BY));
      if (!email) continue;
      const fid = String(linha.FUNCTION_ID);
      const ehJs = jsSfs.has(fid);
      const ok = String(linha.STATUS).toUpperCase() === 'COMPLETED';
      if (ehJs) {
        console.log(`${ok ? 'SUCESSO' : 'FALHA'} | business ${email} executou SF JS "${jsSfs.get(fid)}" -> ${linha.STATUS}${linha.ERRO ? ' | ' + linha.ERRO : ''}`);
      } else if (!ok) {
        console.log(`REGRESSAO | business ${email} falhou em SF ${tipoSf.get(fid) || '?'} ${fid} -> ${linha.STATUS}${linha.ERRO ? ' | ' + linha.ERRO : ''}`);
      }
    }
  } catch (erro) {
    // Falha transitoria de rede nao derruba o monitor.
  }
}
