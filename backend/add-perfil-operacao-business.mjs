/**
 * Cria o perfil de acesso dos usuarios business.
 *
 * Motivo: SF do tipo JAVASCRIPT acessa o banco herdando o usuario que a chamou, e a
 * plataforma exige perfil para isso. Sem perfil, todo usuario business recebe
 * "User has no profile assigned" -- por isso a integracao com o Google Agenda nunca
 * funcionou para vendedor nenhum (log: 39 execucoes, 0 sucesso).
 *
 * O perfil e deliberadamente um SUPERCONJUNTO (todas as tabelas + todas as SFs):
 * o objetivo e destravar o acesso, NAO restringir. Restringir aqui significaria
 * quebrar telas que os 26 vendedores usam hoje.
 *
 * Uso:
 *   node add-perfil-operacao-business.mjs                 -> cria/atualiza o perfil (sem atribuir ninguem)
 *   node add-perfil-operacao-business.mjs email@x.com     -> tambem atribui esse(s) usuario(s)
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  createProfileMitra,
  getProfileDetailsMitra,
  listProfilesMitra,
  listProjectUsersMitra,
  listServerFunctionsMitra,
  listTablesMitra,
  setProfileSelectTablesMitra,
  setProfileServerFunctionsMitra,
  setProfileUsersMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const NOME_PERFIL = 'Operacao Comercial';

/**
 * A SDK nao expoe setter de tabelas DML (so SELECT), mas a rota existe na API e o
 * perfil precisa dela: as SFs JAVASCRIPT gravam no banco (vinculo de evento, logs,
 * configuracao). Sem isso o usuario business leria e nao escreveria.
 */
async function setProfileDmlTables(profileId, nomesTabelas) {
  const token = process.env.MITRA_TOKEN.startsWith('Bearer')
    ? process.env.MITRA_TOKEN
    : 'Bearer ' + process.env.MITRA_TOKEN;
  const resposta = await fetch(`${process.env.MITRA_BASE_URL}/agentAiShortcut/setProfileDmlTables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      projectId,
      profileId,
      jdbcConnectionConfigId: 1,
      tables: nomesTabelas.map((tableName) => ({ tableName })),
    }),
  });
  if (!resposta.ok) throw new Error(`setProfileDmlTables falhou (${resposta.status}): ${(await resposta.text()).slice(0, 200)}`);
  return resposta.json();
}

async function garantirPerfil() {
  const perfis = (await listProfilesMitra({ projectId }))?.result || [];
  const existente = perfis.find((p) => p.name === NOME_PERFIL);
  if (existente) {
    console.log(`Perfil "${NOME_PERFIL}" ja existe (id ${existente.id}).`);
    return existente.id;
  }
  const criado = await createProfileMitra({ projectId, name: NOME_PERFIL, color: '#3e5f47' });
  // O retorno do create varia de formato; confirmar relendo a lista e mais seguro
  // do que confiar numa chave especifica.
  let id = criado?.result?.id ?? criado?.id ?? criado?.result?.profileId;
  if (!id) {
    const relidos = (await listProfilesMitra({ projectId }))?.result || [];
    id = relidos.find((p) => p.name === NOME_PERFIL)?.id;
  }
  if (!id) throw new Error('Nao foi possivel obter o ID do perfil criado.');
  console.log(`Perfil "${NOME_PERFIL}" criado (id ${id}).`);
  return id;
}

async function main() {
  const emailsAlvo = process.argv.slice(2).filter(Boolean);
  const profileId = await garantirPerfil();

  const tabelas = (await listTablesMitra({ projectId }))?.result || [];
  const nomesTabelas = tabelas.map((t) => t.name).filter(Boolean);
  await setProfileSelectTablesMitra({
    projectId,
    profileId,
    jdbcConnectionConfigId: 1, // banco do proprio projeto
    tables: nomesTabelas.map((tableName) => ({ tableName })),
  });
  console.log(`Tabelas liberadas para SELECT: ${nomesTabelas.length}`);

  await setProfileDmlTables(profileId, nomesTabelas);
  console.log(`Tabelas liberadas para DML: ${nomesTabelas.length}`);

  const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const idsSf = sfs.map((s) => s.id).filter(Boolean);
  await setProfileServerFunctionsMitra({ projectId, profileId, serverFunctionIds: idsSf });
  console.log(`Server functions liberadas: ${idsSf.length}`);

  if (emailsAlvo.length) {
    const usuarios = (await listProjectUsersMitra({ projectId }))?.result || [];
    const alvo = usuarios.filter((u) => emailsAlvo.includes(String(u.email || '').toLowerCase()));
    const naoEncontrados = emailsAlvo.filter((e) => !alvo.some((u) => String(u.email).toLowerCase() === e));
    if (naoEncontrados.length) throw new Error('Usuario(s) nao encontrado(s): ' + naoEncontrados.join(', '));

    await setProfileUsersMitra({ projectId, profileId, emails: alvo.map((u) => u.email) });
    console.log('Usuarios atribuidos ao perfil: ' + alvo.map((u) => `${u.email} (${u.userType || u.type})`).join(', '));
  } else {
    console.log('Nenhum usuario atribuido nesta execucao.');
  }

  const detalhe = (await getProfileDetailsMitra({ projectId, profileId }))?.result || {};
  console.log('\nEstado final do perfil:');
  console.log(JSON.stringify({
    id: detalhe.id,
    nome: detalhe.name,
    selectTables: (detalhe.selectTables || []).length,
    dmlTables: (detalhe.dmlTables || []).length,
    serverFunctions: (detalhe.serverFunctions || []).length,
    usuarios: detalhe.users || detalhe.userIds || '(nao retornado)',
  }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar o perfil:');
  console.error(error?.message || error);
  process.exit(1);
});
