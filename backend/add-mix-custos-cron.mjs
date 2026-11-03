import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
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

/*
 * A SF 251 (mixAtualizarCustosSeNecessario) e do tipo JAVASCRIPT e executa DDL/DML
 * internamente. SF JAVASCRIPT herda o userType de quem chama, e operacao de construcao
 * e negada para acesso BUSINESS -> chamada a partir da tela sempre falhou com
 * BUSINESS_ACCESS_DENIED para o vendedor. Nenhum ajuste no codigo dela resolve isso:
 * o gatilho e que estava no lugar errado.
 *
 * Solucao: o sync passa a rodar por CRON (execucao do servidor, sem userType de tela).
 * A tela apenas LE o cache e mostra ha quanto tempo ele foi atualizado.
 *
 * Cron do Mitra = Spring com 6 campos (segundo minuto hora dia mes diaDaSemana).
 * '0 0,30 * * * *' -> nos minutos 00 e 30 de cada hora.
 */
const CRON_SYNC_CUSTOS = '0 0,30 * * * *';

const MIX_STATUS_CUSTOS = `
SELECT
  MAX(CASE WHEN CHAVE = 'LAST_SUCCESS_AT' THEN VALOR END) AS ULTIMA_SINCRONIZACAO,
  MAX(CASE WHEN CHAVE = 'LAST_RESULT' THEN VALOR END) AS ULTIMO_RESULTADO,
  TIMESTAMPDIFF(
    MINUTE,
    STR_TO_DATE(MAX(CASE WHEN CHAVE = 'LAST_SUCCESS_AT' THEN REPLACE(VALOR, 'T', ' ') END), '%Y-%m-%d %H:%i:%s'),
    UTC_TIMESTAMP()
  ) AS MINUTOS_DESDE_SINCRONIZACAO
FROM MIX_CUSTOS_SYNC
`.trim();

async function upsertStatusSf() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || listed || [];
  const found = existing.find((item) => item.name === 'mixStatusCustos');

  const payload = {
    code: MIX_STATUS_CUSTOS,
    description: 'Idade do cache de custos do Mix Builder (leitura). Sem params.',
  };

  if (found?.id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, ...payload });
    console.log(`SF mixStatusCustos atualizada (id ${found.id}).`);
    return found.id;
  }

  const created = await createServerFunctionMitra({ projectId, name: 'mixStatusCustos', type: 'SQL', ...payload });
  const id = created?.result?.serverFunctionId || created?.result?.id;
  console.log(`SF mixStatusCustos criada (id ${id}).`);
  return id;
}

async function agendarSync() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 251,
    code: atual?.result?.code,
    description: 'Sincroniza o cache de custos do Mix Builder. Roda por CRON (a cada 30min) — NAO chamar da tela: e JAVASCRIPT e faz DDL/DML, negado para acesso BUSINESS.',
    cronExpression: CRON_SYNC_CUSTOS,
  });

  const conferencia = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
  console.log(`SF 251 agendada: cron = ${conferencia?.result?.cronExpression || '(nao aplicado)'}`);
  return conferencia?.result?.cronExpression;
}

async function main() {
  const statusId = await upsertStatusSf();
  const cron = await agendarSync();

  if (cron !== CRON_SYNC_CUSTOS) {
    throw new Error(`Cron nao foi aplicado na SF 251 (valor lido: ${cron}).`);
  }

  const r = await executeServerFunctionMitra({ projectId, serverFunctionId: statusId, input: {} });
  let out = r?.result?.output;
  if (typeof out === 'string') out = JSON.parse(out);
  console.log('smoke mixStatusCustos:', JSON.stringify(out?.rows));
  console.log(JSON.stringify({ mixStatusCustos: statusId }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao agendar o sync de custos:');
  console.error(error?.message || error);
  process.exit(1);
});
