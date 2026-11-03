// Massa de validacao DEV (distribuicao de metas): lucas.rabelo (59) = COORDENADOR,
// ti@benenutri (54) e comunicacao (61) = VENDEDOR no time dele.
// Sem generateMigration: nao sobe no promote.
// Reverter: DELETE FROM COORDENADORES_BU WHERE COD_SUPERVISOR = 933;
//           DELETE FROM COORDENADORES WHERE USER_ID = 59;
//           UPDATE USUARIO_CARGO SET CARGO='ADMIN' WHERE USER_ID IN (54,59);
import 'dotenv/config';
import { configureSdkMitra, runDmlMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const agora = new Date().toISOString().slice(0, 19);
const COD_SUP = 933; // supervisor ja ligado ao Lucas em VENDEDOR_RCA
const dml = (sql) => runDmlMitra({ projectId, sql });

await dml(`INSERT INTO USUARIO_CARGO (USER_ID, CARGO, ATUALIZADO_EM) VALUES
  (59,'COORDENADOR','${agora}'),(54,'VENDEDOR','${agora}'),(61,'VENDEDOR','${agora}')
  ON DUPLICATE KEY UPDATE CARGO=VALUES(CARGO), ATUALIZADO_EM=VALUES(ATUALIZADO_EM)`);
await dml(`DELETE FROM COORDENADORES WHERE USER_ID = 59`);
await dml(`INSERT INTO COORDENADORES (COD_SUPERVISOR, NOME, EMAIL, USER_ID, ATIVO, CREATED_AT)
  VALUES (${COD_SUP}, 'Lucas Rabelo', 'lucas.rabelo@benenutri.com', 59, TRUE, '${agora}')`);
// BUs dos dois vendedores: ti@ = filial 2/depto 2; comunicacao = filiais 1,2,6/depto 9
await dml(`DELETE FROM COORDENADORES_BU WHERE COD_SUPERVISOR = ${COD_SUP}`);
await dml(`INSERT INTO COORDENADORES_BU (COD_SUPERVISOR, CODFILIAL, CODEPTO)
  VALUES (${COD_SUP},2,2),(${COD_SUP},1,9),(${COD_SUP},2,9),(${COD_SUP},6,9)`);
console.log('ok');
