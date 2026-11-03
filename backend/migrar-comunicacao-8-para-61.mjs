// Migra todos os registros da conta 8 (comunicacao@benenutri.com, antiga)
// para a conta 61 (comunicacao@benenutri.com, conta que faz login hoje).
// Executado no DEV. Grava cada troca em MIGRACAO_USUARIO_LOG para permitir desfazer.
// Fora: tabelas *_BKP, VENDEDOR_RCA_AUDITORIA (historico) e VW_META_VENDEDOR_MES (view).
import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, runDmlMitra, runDdlMitra } from 'mitra-sdk';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);
const DE = 8;
const PARA = 61;

const ALVOS = [
  ['ALERTAS_EMAIL_SEMANAL', 'ID_VENDEDOR'],
  ['ALERTAS_INTELIGENTES', 'ID_VENDEDOR'],
  ['ALERTAS_PROCESSAMENTO', 'VENDEDOR_ID'],
  ['BU_VENDEDOR', 'VENDEDOR_ID'],
  ['CLIENTES', 'VENDEDOR_ID'],
  ['COORDENADORES', 'USER_ID'],
  ['EQUIPE_CLIENTE', 'ID_VENDEDOR'],
  ['METAS_VENDEDOR', 'USER_ID'],
  ['PEDIDOS_SEMANAIS_SYNC', 'VENDEDOR_ID'],
  ['PEDIDOS_SEMANAIS_SYNC_RAW', 'VENDEDOR_ID'],
  ['USUARIO_BLOQUEIO', 'USER_ID'],
  ['USUARIO_CARGO', 'USER_ID'],
  ['USUARIO_PREFERENCIAS', 'USER_ID'],
  ['VENDEDOR_RCA', 'USER_ID'],
  ['VISITAS', 'VENDEDOR_ID'],
];

const query = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];
const contar = async (t, c, id) => Number((await query(`SELECT COUNT(*) N FROM \`${t}\` WHERE \`${c}\` = ${id}`))[0].N);

const users = await query(`SELECT ID, DESCR FROM INT_USER WHERE ID IN (${DE}, ${PARA})`);
if (users.length !== 2 || users.some((u) => String(u.DESCR).toLowerCase() !== 'comunicacao@benenutri.com')) {
  throw new Error('Contas 8/61 nao conferem: ' + JSON.stringify(users));
}

try {
  await runDdlMitra({ projectId, sql: `CREATE TABLE MIGRACAO_USUARIO_LOG (
    ID INT AUTO_INCREMENT PRIMARY KEY, TABELA VARCHAR(100), COLUNA VARCHAR(100),
    DE_USER INT, PARA_USER INT, QTD INT, EXECUTADO_EM VARCHAR(19))` });
} catch { /* ja existe */ }

let erro = false;
for (const [t, c] of ALVOS) {
  const antesDe = await contar(t, c, DE);
  const antesPara = await contar(t, c, PARA);
  if (!antesDe) continue;
  await runDmlMitra({ projectId, sql: `UPDATE \`${t}\` SET \`${c}\` = ${PARA} WHERE \`${c}\` = ${DE}`, generateMigration: false });
  const depoisPara = await contar(t, c, PARA);
  const moved = depoisPara - antesPara;
  await runDmlMitra({ projectId, generateMigration: false, sql: `INSERT INTO MIGRACAO_USUARIO_LOG (TABELA, COLUNA, DE_USER, PARA_USER, QTD, EXECUTADO_EM)
    VALUES ('${t}', '${c}', ${DE}, ${PARA}, ${moved}, DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s'))` });
  const ok = moved === antesDe && (await contar(t, c, DE)) === 0;
  if (!ok) erro = true;
  console.log(`${ok ? 'OK  ' : 'ERRO'} ${t}.${c}: ${moved}/${antesDe}`);
}
if (erro) process.exit(1);
console.log('Migracao 8 -> 61 concluida e conferida.');
