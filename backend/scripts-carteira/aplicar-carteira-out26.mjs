/**
 * Divisao Carteira de Clientes DF 10.26 — aplica a planilha enviada pelo usuario.
 *
 * Escopo: EQUIPE_CLIENTE, CODFILIAL='5' AND ID_SECAO=101 (escopo de venda das
 * executivas de DF). Nenhuma outra filial/secao e tocada.
 *
 * Origem permitida: Fernanda Borges, Amanda e Tathiana (carteira dissolvida).
 * Chaves de negocio (email do vendedor + WINTHOR_CODCLI do cliente) em vez de
 * IDs de linha, para a migration valer igual no PROD.
 */
import 'dotenv/config';
import fs from 'fs';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const DIR = '/home/user/w-18721/p-60604/backend/scripts-carteira';
const { fernanda, amanda } = JSON.parse(fs.readFileSync(`${DIR}/alvo.json`, 'utf8'));

const EMAIL_FERNANDA = 'fernanda.borges@benenutri.com';
const EMAIL_AMANDA   = 'amanda@benenutri.com';
const EMAIL_TATHIANA = 'tathiana@benenutri.com';
const ORIGENS = [EMAIL_FERNANDA, EMAIL_AMANDA, EMAIL_TATHIANA];

const q = async sql => {
  const r = await runQueryMitra({ projectId, sql });
  return r?.result?.rows ?? r?.rows ?? [];
};

const snapshotSql = `
SELECT EC.ID AS EC_ID, EC.ID_VENDEDOR, COALESCE(U.NOME, U.DESCR) AS VENDEDOR, U.DESCR AS EMAIL,
       C.WINTHOR_CODCLI AS CODCLI, C.RAZAO_SOCIAL, EC.CODFILIAL, EC.ID_SECAO
FROM EQUIPE_CLIENTE EC
JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
LEFT JOIN INT_USER U ON U.ID = EC.ID_VENDEDOR
WHERE EC.CODFILIAL = '5' AND EC.ID_SECAO = 101
ORDER BY EC.ID_VENDEDOR, C.WINTHOR_CODCLI`;

// --- 1. snapshot ANTES (rollback) ---
const antes = await q(snapshotSql);
fs.writeFileSync(`${DIR}/snapshot-antes.json`, JSON.stringify(antes, null, 1));
console.log(`snapshot ANTES: ${antes.length} linhas em f5/s101 -> snapshot-antes.json`);

const listaOrigens = ORIGENS.map(e => `'${e}'`).join(',');

function updateSql(emailDestino, codigos) {
  return `
UPDATE EQUIPE_CLIENTE EC
JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
SET EC.ID_VENDEDOR = (SELECT ID FROM INT_USER WHERE LOWER(DESCR) = '${emailDestino}')
WHERE EC.CODFILIAL = '5'
  AND EC.ID_SECAO = 101
  AND EC.ID_VENDEDOR IN (SELECT ID FROM INT_USER WHERE LOWER(DESCR) IN (${listaOrigens}))
  AND C.WINTHOR_CODCLI IN (${codigos.join(',')})
  AND EC.ID_VENDEDOR <> (SELECT ID FROM INT_USER WHERE LOWER(DESCR) = '${emailDestino}')`;
}

// --- 2. aplica (dado de produto: vai para o PROD no promote) ---
for (const [nome, email, lista] of [
  ['FERNANDA BORGES', EMAIL_FERNANDA, fernanda],
  ['AMANDA',          EMAIL_AMANDA,   amanda]
]) {
  const res = await runDmlMitra({
    projectId,
    sql: updateSql(email, lista.map(x => x.codcli)),
    generateMigration: true
  });
  const out = res?.result ?? res;
  console.log(`\n${nome}: ${lista.length} clientes na planilha`);
  console.log('  afetadas:', out?.rowsAffected ?? out?.affectedRows ?? JSON.stringify(out));
  console.log('  migration:', out?.migration ?? res?.migration ?? '(nenhuma)');
  console.log('  migrationSkippedReason:', out?.migrationSkippedReason ?? res?.migrationSkippedReason ?? '-');
}

// --- 3. snapshot DEPOIS + conferencia ---
const depois = await q(snapshotSql);
fs.writeFileSync(`${DIR}/snapshot-depois.json`, JSON.stringify(depois, null, 1));

const porEmail = {};
depois.forEach(d => { const k = d.EMAIL || 'sem-email'; porEmail[k] = (porEmail[k] || 0) + 1; });
console.log('\n=== CARTEIRA f5/s101 DEPOIS ===');
Object.entries(porEmail).sort((a,b)=>b[1]-a[1]).forEach(([e,n]) => console.log(`  ${e}: ${n}`));

function conferir(nome, email, lista) {
  const atual = new Set(depois.filter(d => d.EMAIL === email).map(d => Number(d.CODCLI)));
  const alvo  = new Set(lista.map(x => x.codcli));
  const falta = [...alvo].filter(c => !atual.has(c));
  const sobra = [...atual].filter(c => !alvo.has(c));
  console.log(`\n${nome}: alvo ${alvo.size} | atual ${atual.size} | faltando ${falta.length} ${JSON.stringify(falta)} | sobrando ${sobra.length} ${JSON.stringify(sobra)}`);
  return falta.length === 0 && sobra.length === 0;
}
const okF = conferir('FERNANDA', EMAIL_FERNANDA, fernanda);
const okA = conferir('AMANDA',   EMAIL_AMANDA,   amanda);

const restoTat = depois.filter(d => d.EMAIL === EMAIL_TATHIANA);
console.log(`\nTathiana — resto em f5/s101: ${restoTat.length}`);
restoTat.forEach(d => console.log(`  cod ${d.CODCLI} ${d.RAZAO_SOCIAL} (EC${d.EC_ID})`));

console.log(`\n>>> RESULTADO: ${okF && okA ? 'as duas carteiras batem com a planilha' : 'DIVERGENCIA — revisar'}`);
