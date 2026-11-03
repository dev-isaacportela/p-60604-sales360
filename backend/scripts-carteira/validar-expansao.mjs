import 'dotenv/config';
import { configureSdkMitra, runQueryMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const q = async sql => { const r = await runQueryMitra({ projectId, sql }); return r?.result?.rows ?? r?.rows ?? []; };

console.log('### 1. Tela de carteira: filtro EC.CODFILIAL + EC.ID_SECAO em cada secao de Nutricao');
console.log('    (antes so a 101 devolvia linha; esperado agora: 49 Fernanda / 47 Amanda em todas)');
(await q(`SELECT U.DESCR EMAIL, EC.CODFILIAL, S.NOME_SECAO, COUNT(DISTINCT C.ID) CLIENTES
FROM EQUIPE_CLIENTE EC
JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
JOIN INT_USER U ON U.ID = EC.ID_VENDEDOR
JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
  AND BV.CODFILIAL = EC.CODFILIAL AND BV.ID_SECAO = EC.ID_SECAO
  AND COALESCE(BV.ATIVO,TRUE)=TRUE
LEFT JOIN SECAO S ON S.ID = EC.ID_SECAO
WHERE LOWER(U.DESCR) IN ('fernanda.borges@benenutri.com','amanda@benenutri.com')
GROUP BY 1,2,3,EC.ID_SECAO ORDER BY U.DESCR, EC.CODFILIAL, EC.ID_SECAO`))
  .forEach(r=>console.log('  ',JSON.stringify(r)));

console.log('\n### 2. Dupla contagem: CARTEIRA_SCOPE (com DISTINCT, igual as SFs) vs linhas cruas');
(await q(`SELECT U.DESCR EMAIL,
  (SELECT COUNT(*) FROM EQUIPE_CLIENTE E2 WHERE E2.ID_VENDEDOR=U.ID) AS LINHAS_CRUAS,
  (SELECT COUNT(DISTINCT C2.ID) FROM EQUIPE_CLIENTE E3 JOIN CLIENTES C2 ON C2.ID=E3.ID_CLIENTE
     WHERE E3.ID_VENDEDOR=U.ID AND C2.WINTHOR_CODCLI IS NOT NULL) AS CARTEIRA_SCOPE_DISTINCT
FROM INT_USER U WHERE LOWER(U.DESCR) IN ('fernanda.borges@benenutri.com','amanda@benenutri.com')`))
  .forEach(r=>console.log('  ',JSON.stringify(r)));

console.log('\n### 3. Vendas atribuidas: a mesma venda e contada mais de uma vez?');
console.log('    (join carteira por ID_VENDEDOR, como nas SFs — linhas de venda x linhas apos join)');
(await q(`WITH CARTEIRA_SCOPE AS (
  SELECT DISTINCT EC.ID_VENDEDOR, TRIM(CAST(C.WINTHOR_CODCLI AS CHAR)) CODCLI
  FROM EQUIPE_CLIENTE EC JOIN CLIENTES C ON C.ID=EC.ID_CLIENTE
  JOIN INT_USER U ON U.ID=EC.ID_VENDEDOR
  WHERE LOWER(U.DESCR) IN ('fernanda.borges@benenutri.com','amanda@benenutri.com')
    AND C.WINTHOR_CODCLI IS NOT NULL)
SELECT CS.ID_VENDEDOR,
  COUNT(*) LINHAS_APOS_JOIN,
  COUNT(DISTINCT R.ID) VENDAS_DISTINTAS
FROM PEDIDOS_SEMANAIS_SYNC_RAW R
JOIN CARTEIRA_SCOPE CS ON CS.CODCLI = TRIM(CAST(R.CODCLI AS CHAR))
GROUP BY CS.ID_VENDEDOR`)).forEach(r=>console.log('  ',JSON.stringify(r)));
