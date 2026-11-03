/**
 * Replica a carteira de Fernanda Borges e Amanda para TODAS as secoes do
 * departamento NUTRICAO (BU codigo '1' = SECAO.ID_BU 10), nas filiais do
 * escopo de venda delas (BU_VENDEDOR):
 *   secoes: 101 ENTERAL | 102 EQUIPAMENTO | 103 CORRELATOS | 104 PARENTERAL | 337 GRANOLA
 *
 * Uso:  node scripts-carteira/expandir-secoes-nutricao.mjs <filiais> [--aplicar]
 *   <filiais> = lista separada por virgula (ex: 5  ou  1,3,5)
 *   sem --aplicar: dry-run, nada e gravado.
 *
 * Origem: a carteira atual em filial 5 / secao 101 (a que bate com a planilha).
 * CURVA_CLASSIFICACAO e copiada da linha de origem.
 * Um unico INSERT (1 migration) e idempotente via NOT EXISTS: rodar de novo nao duplica.
 */
import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const q = async sql => { const r = await runQueryMitra({ projectId, sql }); return r?.result?.rows ?? r?.rows ?? []; };

const EMAILS = ['fernanda.borges@benenutri.com', 'amanda@benenutri.com'];
const SECOES_NUTRICAO = [101, 102, 103, 104, 337];
const ORIGEM_FILIAL = '5', ORIGEM_SECAO = 101;

const arg = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
if (!arg) { console.error('informe as filiais, ex: node ... 5  |  node ... 1,3,5'); process.exit(1); }
const FILIAIS = arg.split(',').map(s => s.trim()).filter(Boolean);

const emailList = EMAILS.map(e => `'${e}'`).join(',');
const destinos = [];
for (const f of FILIAIS) for (const s of SECOES_NUTRICAO) {
  if (f === ORIGEM_FILIAL && s === ORIGEM_SECAO) continue;   // a origem ja existe
  destinos.push([f, s]);
}
const paresSql = destinos
  .map(([f, s], i) => i === 0 ? `SELECT '${f}' AS CODFILIAL, ${s} AS ID_SECAO` : `SELECT '${f}', ${s}`)
  .join('\n    UNION ALL ');

const sql = `
INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CURVA_CLASSIFICACAO, CRIADO_EM)
SELECT O.ID_CLIENTE, O.ID_VENDEDOR, D.CODFILIAL, D.ID_SECAO, O.CURVA_CLASSIFICACAO,
       DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s')
FROM EQUIPE_CLIENTE O
CROSS JOIN (
    ${paresSql}
) D
WHERE O.CODFILIAL = '${ORIGEM_FILIAL}'
  AND O.ID_SECAO = ${ORIGEM_SECAO}
  AND O.ID_VENDEDOR IN (SELECT ID FROM INT_USER WHERE LOWER(DESCR) IN (${emailList}))
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO FROM EQUIPE_CLIENTE) X
    WHERE X.ID_CLIENTE = O.ID_CLIENTE
      AND X.ID_VENDEDOR = O.ID_VENDEDOR
      AND X.CODFILIAL = D.CODFILIAL
      AND X.ID_SECAO = D.ID_SECAO
  )`;

const nBase = Number((await q(`SELECT COUNT(*) N FROM EQUIPE_CLIENTE EC
WHERE EC.CODFILIAL='${ORIGEM_FILIAL}' AND EC.ID_SECAO=${ORIGEM_SECAO}
AND EC.ID_VENDEDOR IN (SELECT ID FROM INT_USER WHERE LOWER(DESCR) IN (${emailList}))`))[0].N);

console.log(`origem: filial ${ORIGEM_FILIAL} / secao ${ORIGEM_SECAO} -> ${nBase} linhas (Fernanda + Amanda)`);
console.log(`filiais destino: ${FILIAIS.join(', ')} | pares a criar: ${destinos.length}`);
console.log(`linhas novas previstas: ${nBase * destinos.length} | total apos: ${nBase * (destinos.length + 1)}\n`);

if (!APLICAR) { console.log('>>> DRY-RUN — nada gravado. Rode com --aplicar para efetivar.'); process.exit(0); }

const res = await runDmlMitra({ projectId, sql, generateMigration: true });
const out = res?.result ?? res;
console.log('inseridas:', out?.rowsAffected ?? out?.affectedRows ?? JSON.stringify(out));
console.log('migration:', out?.migration ?? res?.migration ?? '(nenhuma)');
console.log('migrationSkippedReason:', out?.migrationSkippedReason ?? res?.migrationSkippedReason ?? '-');

console.log('\n=== CONFERENCIA: carteira por (filial, secao) ===');
(await q(`SELECT U.DESCR AS EMAIL, EC.CODFILIAL, EC.ID_SECAO, S.NOME_SECAO, COUNT(*) N
FROM EQUIPE_CLIENTE EC JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR LEFT JOIN SECAO S ON S.ID=EC.ID_SECAO
WHERE LOWER(U.DESCR) IN (${emailList})
GROUP BY 1,2,3,4 ORDER BY U.DESCR, EC.CODFILIAL, EC.ID_SECAO`)).forEach(r=>console.log(' ',JSON.stringify(r)));

console.log('\n=== Clientes DISTINTOS por executiva (tem que seguir 49 e 47) ===');
(await q(`SELECT U.DESCR AS EMAIL, COUNT(DISTINCT EC.ID_CLIENTE) CLIENTES, COUNT(*) LINHAS
FROM EQUIPE_CLIENTE EC JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
WHERE LOWER(U.DESCR) IN (${emailList}) GROUP BY 1`)).forEach(r=>console.log(' ',JSON.stringify(r)));

console.log('\n=== Duplicata exata (cliente,vendedor,filial,secao) — tem que ser 0 ===');
(await q(`SELECT COUNT(*) N FROM (
  SELECT ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO FROM EQUIPE_CLIENTE
  GROUP BY 1,2,3,4 HAVING COUNT(*)>1) T`)).forEach(r=>console.log(' ',JSON.stringify(r)));
