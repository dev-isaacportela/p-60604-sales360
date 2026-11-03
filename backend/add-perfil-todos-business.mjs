/**
 * Coloca TODOS os usuarios business no perfil "Operacao Comercial" (id 1).
 *
 * Por que: SF JAVASCRIPT so acessa o banco se quem chamou tiver perfil. Conectar a conta
 * Google (SF 365) e listar as agendas (SF 370) sao SFs JAVASCRIPT chamadas pela tela --
 * sem perfil o vendedor recebe "User has no profile assigned". Estavam nessa situacao 24
 * dos 26 vendedores (so Amanda e Glauber tinham sido atribuidos).
 *
 * ATENCAO: setProfileUsersMitra SUBSTITUI a lista inteira, nao adiciona. Por isso este
 * script sempre monta a lista COMPLETA de business antes de chamar -- rodar com um subconjunto
 * remove silenciosamente quem ficou de fora.
 *
 * Isto nao amplia o que o vendedor consegue fazer pelas telas: o SQL das SFs e escrito por
 * nos e ele so passa parametros. O que muda e a plataforma parar de bloquear o acesso ao
 * banco a partir de SF JAVASCRIPT.
 */
import 'dotenv/config';
import { configureSdkMitra, listProjectUsersMitra, setProfileUsersMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const PROFILE_ID = 1;

async function main() {
  const usuarios = (await listProjectUsersMitra({ projectId }))?.result || [];
  const business = usuarios.filter((u) => u.userType === 'business');
  const userIds = business.map((u) => Number(u.userId)).filter(Boolean);
  console.log(`business encontrados: ${userIds.length}`);

  await setProfileUsersMitra({ projectId, profileId: PROFILE_ID, userIds });

  // Conferir pela tabela da plataforma, nao pelo retorno da chamada.
  const gravados = (await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS N FROM INT_PROFILEUSER WHERE PROFILEID = ${PROFILE_ID}`,
  }))?.result?.rows?.[0]?.N;
  console.log(`no perfil ${PROFILE_ID} apos a gravacao: ${gravados}`);
  if (Number(gravados) !== userIds.length) {
    throw new Error(`esperado ${userIds.length}, gravado ${gravados}`);
  }
  console.log('OK.');
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
