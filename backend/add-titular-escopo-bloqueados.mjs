// Listas de clientes (27, 38, 84, 128): titular bloqueado/institucional não tira o cliente de ninguém.
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';
import { USUARIOS_EXCLUIDOS_SQL } from './titulares-config.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const DE = 'AND T_TIT.VENDEDOR_ID NOT IN (SELECT TU_TIT.USER_ID FROM TARGET_USERS TU_TIT)';
const PARA = `${DE}
        AND T_TIT.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}`;

for (const id of [27, 38, 84, 128]) {
  const sf = await readServerFunctionMitra({ projectId, serverFunctionId: id });
  let code = sf.result.code;
  if (code.includes('UB_EXC')) { console.log(`${id}: já aplicado`); continue; }
  const n = code.split(DE).length - 1;
  if (n < 1) throw new Error(`${id}: âncora não encontrada — abortando`);
  code = code.split(DE).join(PARA);
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, code });
  console.log(`${id} ${sf.result.name}: atualizado (${n} ponto(s))`);
}
