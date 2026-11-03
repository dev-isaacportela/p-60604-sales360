// Manutenção dos titulares (CLIENTE_TITULAR_DEPTO):
//  titularesSincronizarLimpar  — remove AUTO que deixou de ser candidato único e MANUAL inválido
//  titularesSincronizarInserir — cria AUTO onde há um único candidato
// Agendadas todo dia (03:00 / 03:05) e chamadas pelo frontend após mudanças de carteira/BU.
import 'dotenv/config';
import { configureSdkMitra, createServerFunctionMitra, updateServerFunctionMitra, listServerFunctionsMitra } from 'mitra-sdk';
import { SYNC_LIMPAR_SQL, SYNC_INSERIR_SQL } from './titulares-config.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);

const SFS = [
  { name: 'titularesSincronizarLimpar', cron: '0 0 3 * * *', code: SYNC_LIMPAR_SQL,
    description: 'Titulares: remove titular AUTO que deixou de ser candidato único e MANUAL cujo vendedor saiu da carteira/BU ou foi bloqueado' },
  { name: 'titularesSincronizarInserir', cron: '0 5 3 * * *', code: SYNC_INSERIR_SQL,
    description: 'Titulares: cria titular AUTO nas combinações cliente x filial x depto x seção com um único candidato' },
];

const list = await listServerFunctionsMitra({ projectId });
const existentes = new Map((list.result || []).map((f) => [f.name, f.id]));
for (const sf of SFS) {
  let id = existentes.get(sf.name);
  if (id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: sf.code, description: sf.description });
  } else {
    const r = await createServerFunctionMitra({ projectId, name: sf.name, type: 'SQL', code: sf.code, description: sf.description });
    id = r.result.serverFunctionId;
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, cronExpression: sf.cron });
  console.log(`${sf.name}: ${id} (cron ${sf.cron})`);
}
