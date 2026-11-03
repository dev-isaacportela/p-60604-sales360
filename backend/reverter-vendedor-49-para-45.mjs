// Reverte a migracao do commit 532271d: devolve todos os registros do vendedor 49
// (tathiana.moura@benenutri.com) para o vendedor 45 (tathiana@benenutri.com).
// Decisao do usuario: a conta oficial da Tathiana e tathiana@benenutri.com, que e
// a unica com acesso ao projeto e senha ativa. A conta 49 nunca foi ativada.
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DE = 49;
const PARA = 45;

// Mesmas colunas da migracao de ida, reconfirmadas por varredura completa
// de INFORMATION_SCHEMA (varredura-49.mjs): sao as unicas com registros do 49.
const ALVOS = [
  ['ALERTAS_INTELIGENTES', 'ID_VENDEDOR'],
  ['EQUIPE_CLIENTE', 'ID_VENDEDOR'],
  ['BU_VENDEDOR', 'VENDEDOR_ID'],
  ['ALERTAS_PROCESSAMENTO', 'VENDEDOR_ID'],
  ['ALERTAS_EMAIL_SEMANAL', 'ID_VENDEDOR'],
  ['VENDEDOR_RCA', 'USER_ID'],
];

const query = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];

const contar = () => query(
  ALVOS.map(([t, c]) =>
    `SELECT '${t}' T, '${c}' C, SUM(\`${c}\`=${DE}) DE_49, SUM(\`${c}\`=${PARA}) PARA_45 FROM \`${t}\``
  ).join('\nUNION ALL\n')
);

const imprimir = (titulo, rows) => {
  console.log(`\n${titulo}`);
  for (const r of rows) {
    console.log(`  ${r.T}.${r.C}`.padEnd(46) + `49: ${String(r.DE_49).padStart(4)}   45: ${String(r.PARA_45).padStart(4)}`);
  }
};

const usuarios = await query(`SELECT ID, DESCR FROM INT_USER WHERE ID IN (${DE}, ${PARA}) ORDER BY ID`);
if (usuarios.length !== 2) {
  throw new Error(`Esperava encontrar os usuarios ${DE} e ${PARA} em INT_USER, achei: ${JSON.stringify(usuarios)}`);
}
console.log('Usuarios envolvidos:');
for (const u of usuarios) console.log(`  ${u.ID} = ${u.DESCR}`);

// Backup das chaves primarias afetadas, para reverter a reversao se preciso.
const backup = {};
for (const [tabela, coluna] of ALVOS) {
  backup[`${tabela}.${coluna}`] = await query(`SELECT * FROM \`${tabela}\` WHERE \`${coluna}\` = ${DE}`);
}
const arquivo = `backups/vendedor-49-para-45-antes-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.json`;
writeFileSync(arquivo, JSON.stringify(backup, null, 2));
console.log(`\nBackup salvo em ${arquivo}`);

const antes = await contar();
imprimir('ANTES:', antes);

console.log('\nRevertendo...');
for (const [tabela, coluna] of ALVOS) {
  await runDmlMitra({
    projectId,
    sql: `UPDATE \`${tabela}\` SET \`${coluna}\` = ${PARA} WHERE \`${coluna}\` = ${DE}`,
  });
  console.log(`  OK ${tabela}.${coluna}`);
}

const depois = await contar();
imprimir('DEPOIS:', depois);

const sobrou = depois.filter((r) => Number(r.DE_49) > 0);
const totalAntes = antes.reduce((s, r) => s + Number(r.DE_49), 0);
const totalDepois = depois.reduce((s, r) => s + Number(r.PARA_45), 0);
console.log(`\nTotal devolvido: ${totalDepois} de ${totalAntes} registros.`);
if (sobrou.length) {
  console.log('ATENCAO: ainda restam registros no 49:', JSON.stringify(sobrou));
  process.exit(1);
}
if (totalDepois !== totalAntes) {
  console.log('ATENCAO: total do 45 nao confere com o total original do 49.');
  process.exit(1);
}
console.log('Reversao concluida e conferida.');
