// Relato avulso: quem escreveu sempre vê o próprio relato, e o relato de um coordenador vale
// para os departamentos que ele coordena (não só para o departamento do cadastro dele).
import 'dotenv/config';
import fs from 'node:fs';
import { configureSdkMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);

const arquivos = fs.readdirSync('migrations').filter((f) => f.startsWith('update-sf-historicovisitascliente-')).sort();
const ultimo = fs.readFileSync(`migrations/${arquivos[arquivos.length - 1]}`, 'utf8');
const codigo = ultimo.match(/CODE = COALESCE\('([\s\S]*?)', CODE\)/)[1].replace(/''/g, "'");

const antes = `        WHERE AD.AUTOR_ID = R.VENDEDOR_ID
      )`;
const depois = `        WHERE AD.AUTOR_ID = R.VENDEDOR_ID
      )
      OR R.VENDEDOR_ID = :VAR_USER
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C_AUT
        JOIN COORDENADORES_BU CB_AUT ON CB_AUT.COD_SUPERVISOR = C_AUT.COD_SUPERVISOR
        JOIN BU_SCOPE BS_C ON BS_C.ID_CLIENTE = R.CLIENTE_ID AND BS_C.CODEPTO = CAST(CB_AUT.CODEPTO AS CHAR)
        WHERE C_AUT.USER_ID = R.VENDEDOR_ID
          AND COALESCE(C_AUT.ATIVO, TRUE) = TRUE
      )`;
if (codigo.includes('C_AUT')) { console.log('já aplicado'); process.exit(0); }
const i = codigo.indexOf('FROM RELATOS_CLIENTE R');
const j = codigo.indexOf(antes, i);
if (i < 0 || j < 0) throw new Error('trecho do relato não encontrado');
const novo = codigo.slice(0, j) + depois + codigo.slice(j + antes.length);
await updateServerFunctionMitra({ projectId, serverFunctionId: 22, code: novo });
console.log('SF 22 atualizada');
