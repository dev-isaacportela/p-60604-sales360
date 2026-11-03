// Remove o acesso ao projeto das contas duplicadas da Tathiana, criadas por
// erro de grafia durante as tentativas de login. A conta oficial dela e
// tathiana@benenutri.com (ID 45), que NAO e tocada aqui.
//
// Tambem nao tocamos em tatiana@benenutri.com (ID 15) — e a Tatiana Araujo,
// outra pessoa, com acesso ativo.
import 'dotenv/config';
import { configureSdkMitra, listProjectUsersMitra, manageUserAccessMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const DUPLICADAS = [
  'thatiana@benenutri.com',        // 47 — grafia errada, nunca ativada
  'thatiana.moura@benenutri.com',  // 48 — grafia errada, nunca ativada
  'tathiana.moura@benenutri.com',  // 49 — conta nova, nunca ativada, ja sem dados
];

const PRESERVAR = ['tathiana@benenutri.com', 'tatiana@benenutri.com'];

const listar = async () => (await listProjectUsersMitra({ projectId })).result || [];

const antes = await listar();
const emailsAntes = new Set(antes.map((u) => (u.email || '').toLowerCase()));

console.log('Contas preservadas (conferencia):');
for (const email of PRESERVAR) {
  const u = antes.find((x) => (x.email || '').toLowerCase() === email);
  console.log(`  ${email.padEnd(32)} ${u ? `ACESSO OK (id ${u.userId}, ${u.userType})` : 'sem acesso'}`);
}

console.log('\nRemovendo acesso das duplicadas:');
for (const email of DUPLICADAS) {
  if (!emailsAntes.has(email)) {
    console.log(`  ${email.padEnd(32)} ja estava sem acesso ao projeto — nada a fazer`);
    continue;
  }
  try {
    await manageUserAccessMitra({ projectId, email, action: 'REMOVE' });
    console.log(`  ${email.padEnd(32)} acesso removido`);
  } catch (err) {
    console.log(`  ${email.padEnd(32)} FALHOU: ${err?.message || err}`);
  }
}

const depois = await listar();
const emailsDepois = new Set(depois.map((u) => (u.email || '').toLowerCase()));

console.log('\nConferencia final:');
for (const email of DUPLICADAS) {
  console.log(`  ${email.padEnd(32)} ${emailsDepois.has(email) ? 'AINDA TEM ACESSO' : 'sem acesso'}`);
}
for (const email of PRESERVAR) {
  console.log(`  ${email.padEnd(32)} ${emailsDepois.has(email) ? 'ACESSO PRESERVADO' : 'ATENCAO: PERDEU O ACESSO'}`);
}
console.log(`\nUsuarios com acesso ao projeto: ${antes.length} -> ${depois.length}`);
