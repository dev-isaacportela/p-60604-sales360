import 'dotenv/config';
import { configureSdkMitra, runQueryMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const q = async sql => { const r = await runQueryMitra({ projectId, sql }); return r?.result?.rows ?? r?.rows ?? []; };

console.log('### FKs que apontam para EQUIPE_CLIENTE');
const fks = await q(`SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='EQUIPE_CLIENTE'`);
console.log(fks.length ? JSON.stringify(fks,null,1) : '  nenhuma');

console.log('\n### As duas linhas a remover (estado exato)');
(await q(`SELECT EC.ID AS EC_ID, EC.ID_CLIENTE, EC.ID_VENDEDOR, U.DESCR AS EMAIL,
  C.WINTHOR_CODCLI AS CODCLI, C.RAZAO_SOCIAL, EC.CODFILIAL, EC.ID_SECAO, EC.CURVA_CLASSIFICACAO, EC.CRIADO_EM
FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID=EC.ID_CLIENTE LEFT JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
WHERE (EC.CODFILIAL='5' AND EC.ID_SECAO=101 AND C.WINTHOR_CODCLI=531)
   OR (EC.CODFILIAL='1' AND EC.ID_SECAO=104 AND C.WINTHOR_CODCLI=101175)`)).forEach(r=>console.log(' ',JSON.stringify(r)));

console.log('\n### Esses dois clientes ficam com quem depois (outras BUs)');
(await q(`SELECT C.WINTHOR_CODCLI AS CODCLI, COALESCE(U.NOME,U.DESCR) AS V, EC.CODFILIAL, EC.ID_SECAO, EC.ID AS EC_ID
FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID=EC.ID_CLIENTE LEFT JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
WHERE C.WINTHOR_CODCLI IN (531,101175) ORDER BY C.WINTHOR_CODCLI, EC.ID`)).forEach(r=>console.log(' ',JSON.stringify(r)));

console.log('\n### Visitas/atividades ligadas a esses clientes com a Thatiana');
(await q(`SELECT 'VISITAS' T, COUNT(*) N FROM VISITAS V JOIN CLIENTES C ON C.ID=V.CLIENTE_ID
WHERE C.WINTHOR_CODCLI IN (531,101175) AND V.VENDEDOR_ID=45`)).forEach(r=>console.log(' ',JSON.stringify(r)));
