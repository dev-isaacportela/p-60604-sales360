/**
 * Remocao autorizada pelo usuario, fechando a dissolucao da carteira da Thatiana:
 *  - 531  VOGUE ALIMENTACAO E NUTRICAO   (filial 5 / secao 101) -> sai da carteira
 *  - 101175 HOSPITAL LUCIANO CHAVES      (filial 1 / secao 104) -> sai da carteira
 * Chaves de negocio (email + WINTHOR_CODCLI) para a migration valer igual no PROD.
 */
import 'dotenv/config';
import fs from 'fs';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const DIR = '/home/user/w-18721/p-60604/backend/scripts-carteira';
const EMAIL_TATHIANA = 'tathiana@benenutri.com';
const q = async sql => { const r = await runQueryMitra({ projectId, sql }); return r?.result?.rows ?? r?.rows ?? []; };

const alvoSql = `
SELECT EC.ID AS EC_ID, EC.ID_CLIENTE, EC.ID_VENDEDOR, U.DESCR AS EMAIL,
       C.WINTHOR_CODCLI AS CODCLI, C.RAZAO_SOCIAL, EC.CODFILIAL, EC.ID_SECAO, EC.CURVA_CLASSIFICACAO, EC.CRIADO_EM
FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
LEFT JOIN INT_USER U ON U.ID = EC.ID_VENDEDOR
WHERE EC.ID_VENDEDOR = (SELECT ID FROM INT_USER WHERE LOWER(DESCR) = '${EMAIL_TATHIANA}')
  AND ((EC.CODFILIAL = '5' AND EC.ID_SECAO = 101 AND C.WINTHOR_CODCLI = 531)
    OR (EC.CODFILIAL = '1' AND EC.ID_SECAO = 104 AND C.WINTHOR_CODCLI = 101175))`;

// backup das linhas antes de apagar
const removidas = await q(alvoSql);
fs.writeFileSync(`${DIR}/snapshot-linhas-removidas.json`, JSON.stringify(removidas, null, 1));
console.log(`linhas a remover: ${removidas.length} -> snapshot-linhas-removidas.json`);
removidas.forEach(r => console.log(`  EC${r.EC_ID} cod ${r.CODCLI} ${r.RAZAO_SOCIAL} f${r.CODFILIAL}/s${r.ID_SECAO}`));

for (const [rotulo, filial, secao, codcli] of [
  ['VOGUE ALIMENTACAO E NUTRICAO', '5', 101, 531],
  ['HOSPITAL LUCIANO CHAVES',      '1', 104, 101175]
]) {
  const res = await runDmlMitra({
    projectId,
    generateMigration: true,
    sql: `
DELETE EC FROM EQUIPE_CLIENTE EC
JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
WHERE EC.CODFILIAL = '${filial}'
  AND EC.ID_SECAO = ${secao}
  AND C.WINTHOR_CODCLI = ${codcli}
  AND EC.ID_VENDEDOR = (SELECT ID FROM INT_USER WHERE LOWER(DESCR) = '${EMAIL_TATHIANA}')`
  });
  const out = res?.result ?? res;
  console.log(`\n${rotulo} (cod ${codcli}, f${filial}/s${secao})`);
  console.log('  afetadas:', out?.rowsAffected ?? out?.affectedRows ?? JSON.stringify(out));
  console.log('  migration:', out?.migration ?? res?.migration ?? '(nenhuma)');
  console.log('  migrationSkippedReason:', out?.migrationSkippedReason ?? res?.migrationSkippedReason ?? '-');
}

console.log('\n=== CONFERENCIA ===');
console.log('linhas alvo restantes (esperado 0):', (await q(alvoSql)).length);
console.log('\nTathiana ainda tem alguma linha em EQUIPE_CLIENTE?');
(await q(`SELECT EC.ID AS EC_ID, C.WINTHOR_CODCLI AS CODCLI, C.RAZAO_SOCIAL, EC.CODFILIAL, EC.ID_SECAO
FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID=EC.ID_CLIENTE
WHERE EC.ID_VENDEDOR = (SELECT ID FROM INT_USER WHERE LOWER(DESCR)='${EMAIL_TATHIANA}')`))
  .forEach(r => console.log('  ', JSON.stringify(r)));

console.log('\nOnde os dois clientes ficaram:');
(await q(`SELECT C.WINTHOR_CODCLI AS CODCLI, C.RAZAO_SOCIAL, COALESCE(U.NOME,U.DESCR) AS V, EC.CODFILIAL, EC.ID_SECAO
FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID=EC.ID_CLIENTE LEFT JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
WHERE C.WINTHOR_CODCLI IN (531,101175) ORDER BY C.WINTHOR_CODCLI`))
  .forEach(r => console.log('  ', JSON.stringify(r)));

console.log('\nCarteira f5/s101 final:');
(await q(`SELECT COALESCE(U.NOME,U.DESCR) AS V, COUNT(*) N
FROM EQUIPE_CLIENTE EC LEFT JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
WHERE EC.CODFILIAL='5' AND EC.ID_SECAO=101 GROUP BY 1 ORDER BY N DESC`))
  .forEach(r => console.log('  ', JSON.stringify(r)));
