// Duplica a carteira de clientes do vendedor 21 (gabriela.vieira@benenutri.com)
// para o vendedor 46 (marcela@benenutri.com). E COPIA, nao transferencia: a
// carteira do 21 permanece intacta. A tabela permite o mesmo cliente em mais de
// um vendedor (unique key e ID_CLIENTE + ID_VENDEDOR + CODFILIAL + ID_SECAO).
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ORIGEM = 21;
const DESTINO = 46;

const query = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];
const contar = () => query(
  `SELECT ID_VENDEDOR, COUNT(*) N FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR IN (${ORIGEM}, ${DESTINO}) GROUP BY ID_VENDEDOR`
);

const usuarios = await query(`SELECT ID, DESCR FROM INT_USER WHERE ID IN (${ORIGEM}, ${DESTINO}) ORDER BY ID`);
if (usuarios.length !== 2) {
  throw new Error(`Esperava os usuarios ${ORIGEM} e ${DESTINO} em INT_USER, achei: ${JSON.stringify(usuarios)}`);
}
console.log('Usuarios envolvidos:');
for (const u of usuarios) console.log(`  ${u.ID} = ${u.DESCR}`);

// Backup do estado das duas carteiras antes da copia (para desfazer se preciso).
const backup = {
  [`EQUIPE_CLIENTE.ID_VENDEDOR=${ORIGEM}`]: await query(`SELECT * FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${ORIGEM}`),
  [`EQUIPE_CLIENTE.ID_VENDEDOR=${DESTINO}`]: await query(`SELECT * FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${DESTINO}`),
};
const arquivo = `backups/carteira-${ORIGEM}-para-${DESTINO}-antes-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.json`;
writeFileSync(arquivo, JSON.stringify(backup, null, 2));
console.log(`\nBackup salvo em ${arquivo}`);

const antes = await contar();
console.log('\nANTES:', JSON.stringify(antes));

const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
console.log('\nCopiando...');
await runDmlMitra({
  projectId,
  sql: `
    INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM, CODFILIAL, ID_SECAO, CURVA_CLASSIFICACAO)
    SELECT O.ID_CLIENTE, ${DESTINO}, '${agora}', O.CODFILIAL, O.ID_SECAO, O.CURVA_CLASSIFICACAO
    FROM (SELECT * FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${ORIGEM}) O
    WHERE NOT EXISTS (
      SELECT 1 FROM (SELECT * FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${DESTINO}) D
      WHERE D.ID_CLIENTE = O.ID_CLIENTE
        AND COALESCE(D.CODFILIAL, '') = COALESCE(O.CODFILIAL, '')
        AND COALESCE(D.ID_SECAO, -1) = COALESCE(O.ID_SECAO, -1)
    )
  `,
});

const depois = await contar();
console.log('DEPOIS:', JSON.stringify(depois));

// Conferencia: todo cliente do 21 tem que existir no 46.
const faltando = await query(`
  SELECT O.ID_CLIENTE FROM EQUIPE_CLIENTE O
  WHERE O.ID_VENDEDOR = ${ORIGEM}
    AND NOT EXISTS (SELECT 1 FROM EQUIPE_CLIENTE D WHERE D.ID_VENDEDOR = ${DESTINO} AND D.ID_CLIENTE = O.ID_CLIENTE)
`);
const nOrigemAntes = Number(antes.find((r) => r.ID_VENDEDOR === ORIGEM)?.N || 0);
const nOrigemDepois = Number(depois.find((r) => r.ID_VENDEDOR === ORIGEM)?.N || 0);
const nDestinoDepois = Number(depois.find((r) => r.ID_VENDEDOR === DESTINO)?.N || 0);

console.log(`\nCarteira ${ORIGEM}: ${nOrigemAntes} -> ${nOrigemDepois} (tem que ficar igual)`);
console.log(`Carteira ${DESTINO}: ${Number(antes.find((r) => r.ID_VENDEDOR === DESTINO)?.N || 0)} -> ${nDestinoDepois}`);

if (faltando.length) {
  console.log('ATENCAO: clientes do origem que nao chegaram no destino:', JSON.stringify(faltando));
  process.exit(1);
}
if (nOrigemDepois !== nOrigemAntes) {
  console.log('ATENCAO: a carteira de origem mudou de tamanho — nao deveria.');
  process.exit(1);
}
console.log('\nDuplicacao concluida e conferida.');
