// Libera as SFs `s360*` e as tabelas novas no perfil dos usuarios business.
//
// NAO EXECUTE DA MAQUINA LOCAL: so no sandbox, DEPOIS do add-NNN que criou as
// SFs e tabelas (o perfil guarda ids, que so existem apos publicar).
// Uso (no sandbox): cd novo/backend && node add-000-perfil-acesso.mjs
//
// Sem perfil, o usuario business recebe "User has no profile assigned". O
// perfil `Operacao Comercial` ja existe e ja tem todos os usuarios business.
// Os setters da plataforma SUBSTITUEM a lista inteira, entao este script le o
// que existe e grava a uniao: nunca tira permissao de ninguem. Usuarios nao
// sao tocados. Rodar de novo e inofensivo; cada spec nova roda outra vez.

import 'dotenv/config';
import {
  configureSdkMitra,
  getProfileDetailsMitra,
  listProfilesMitra,
  listServerFunctionsMitra,
  setProfileSelectTablesMitra,
  setProfileServerFunctionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const NOME_PERFIL = 'Operacao Comercial';
const PREFIXO_SF = 's360';

// Tabelas criadas pelo sistema novo. As de producao ja estao no perfil.
const TABELAS_NOVAS = ['USUARIO_PAPEL'];

// A SDK nao expoe o setter de tabelas DML; a rota existe (mesmo uso do
// backend/add-perfil-operacao-business.mjs do sistema antigo).
async function setProfileDmlTables(profileId, nomes) {
  const token = process.env.MITRA_TOKEN.startsWith('Bearer') ? process.env.MITRA_TOKEN : `Bearer ${process.env.MITRA_TOKEN}`;
  const resposta = await fetch(`${process.env.MITRA_BASE_URL}/agentAiShortcut/setProfileDmlTables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ projectId, profileId, jdbcConnectionConfigId: 1, tables: nomes.map((tableName) => ({ tableName })) }),
  });
  if (!resposta.ok) throw new Error(`setProfileDmlTables falhou (${resposta.status}): ${(await resposta.text()).slice(0, 200)}`);
}

// O formato das listas do detalhe varia (numero, nome ou objeto).
const idDe = (item) => Number(typeof item === 'object' ? item?.id ?? item?.serverFunctionId : item);
const tabelaDe = (item) => String(typeof item === 'object' ? item?.tableName ?? item?.name ?? '' : item);

if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');

const perfis = (await listProfilesMitra({ projectId }))?.result || [];
const profileId = perfis.find((p) => p.name === NOME_PERFIL)?.id;
if (!profileId) throw new Error(`Perfil "${NOME_PERFIL}" nao existe; ele e criado pelo sistema antigo.`);

const detalhe = (await getProfileDetailsMitra({ projectId, profileId }))?.result || {};
// Sem as listas atuais, a "uniao" viraria substituicao e tiraria acesso de todos.
for (const chave of ['serverFunctions', 'selectTables', 'dmlTables']) {
  if (!Array.isArray(detalhe[chave]) || !detalhe[chave].length) throw new Error(`Detalhe do perfil sem ${chave}; nada foi alterado.`);
}
const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
const novasSf = sfs.filter((s) => String(s.name).startsWith(PREFIXO_SF)).map((s) => Number(s.id));
const idsSf = [...new Set([...(detalhe.serverFunctions || []).map(idDe), ...novasSf].filter(Boolean))];
await setProfileServerFunctionsMitra({ projectId, profileId, serverFunctionIds: idsSf });
console.log(`Server functions no perfil: ${idsSf.length} (${novasSf.length} ${PREFIXO_SF}*)`);

const select = [...new Set([...(detalhe.selectTables || []).map(tabelaDe), ...TABELAS_NOVAS].filter(Boolean))];
await setProfileSelectTablesMitra({ projectId, profileId, jdbcConnectionConfigId: 1, tables: select.map((tableName) => ({ tableName })) });
const dml = [...new Set([...(detalhe.dmlTables || []).map(tabelaDe), ...TABELAS_NOVAS].filter(Boolean))];
await setProfileDmlTables(profileId, dml);
console.log(`Tabelas no perfil: ${select.length} SELECT, ${dml.length} DML`);

// Conferencia: nada pode ter diminuido.
const depois = (await getProfileDetailsMitra({ projectId, profileId }))?.result || {};
for (const chave of ['serverFunctions', 'selectTables', 'dmlTables']) {
  const antes = (detalhe[chave] || []).length;
  const agora = (depois[chave] || []).length;
  console.log(`  ${chave}: ${antes} -> ${agora}${agora < antes ? '  ATENCAO: diminuiu' : ''}`);
}
