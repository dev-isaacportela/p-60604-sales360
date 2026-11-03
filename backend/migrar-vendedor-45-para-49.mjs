// Migra todos os registros do vendedor 45 (tathiana@benenutri.com)
// para o vendedor 49 (tathiana.moura@benenutri.com) — mesma pessoa, conta nova.
// A conta 45 continua existindo, apenas sem vinculos.
import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL;
configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DE = 45;
const PARA = 49;

// Toda coluna onde o vendedor 45 tem registros (levantado por varredura
// de INFORMATION_SCHEMA em todas as colunas de vendedor/usuario do projeto).
const ALVOS = [
  ['ALERTAS_INTELIGENTES', 'ID_VENDEDOR'],
  ['EQUIPE_CLIENTE', 'ID_VENDEDOR'],
  ['BU_VENDEDOR', 'VENDEDOR_ID'],
  ['ALERTAS_PROCESSAMENTO', 'VENDEDOR_ID'],
  ['ALERTAS_EMAIL_SEMANAL', 'ID_VENDEDOR'],
  ['VENDEDOR_RCA', 'USER_ID'],
];

const query = async (sql) => {
  const r = await runQueryMitra({ projectId, sql });
  return r?.result?.rows || r?.rows || [];
};

const contar = async () => {
  const sql = ALVOS.map(([t, c]) =>
    `SELECT '${t}' T, '${c}' C, SUM(\`${c}\`=${DE}) DE_45, SUM(\`${c}\`=${PARA}) PARA_49 FROM \`${t}\``
  ).join('\nUNION ALL\n');
  return query(sql);
};

const imprimir = (titulo, rows) => {
  console.log(`\n${titulo}`);
  for (const r of rows) {
    console.log(`  ${r.T}.${r.C}`.padEnd(46) + `45: ${String(r.DE_45).padStart(4)}   49: ${String(r.PARA_49).padStart(4)}`);
  }
};

const usuarios = await query(`SELECT ID, DESCR FROM INT_USER WHERE ID IN (${DE}, ${PARA}) ORDER BY ID`);
if (usuarios.length !== 2) {
  throw new Error(`Esperava encontrar os usuarios ${DE} e ${PARA} em INT_USER, achei: ${JSON.stringify(usuarios)}`);
}
console.log('Usuarios envolvidos:');
for (const u of usuarios) console.log(`  ${u.ID} = ${u.DESCR}`);

const antes = await contar();
imprimir('ANTES:', antes);

console.log('\nMigrando...');
for (const [tabela, coluna] of ALVOS) {
  await runDmlMitra({
    projectId,
    sql: `UPDATE \`${tabela}\` SET \`${coluna}\` = ${PARA} WHERE \`${coluna}\` = ${DE}`,
  });
  console.log(`  OK ${tabela}.${coluna}`);
}

const depois = await contar();
imprimir('DEPOIS:', depois);

const sobrou = depois.filter((r) => Number(r.DE_45) > 0);
const totalAntes = antes.reduce((s, r) => s + Number(r.DE_45), 0);
const totalDepois = depois.reduce((s, r) => s + Number(r.PARA_49), 0);
console.log(`\nTotal movido: ${totalDepois} de ${totalAntes} registros.`);
if (sobrou.length) {
  console.log('ATENCAO: ainda restam registros no 45:', JSON.stringify(sobrou));
  process.exit(1);
}
if (totalDepois !== totalAntes) {
  console.log('ATENCAO: total do 49 nao confere com o total original do 45.');
  process.exit(1);
}
console.log('Migracao concluida e conferida.');
