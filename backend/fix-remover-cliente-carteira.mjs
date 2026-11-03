import 'dotenv/config';
import { configureSdkMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const code = `
  DELETE EC
  FROM EQUIPE_CLIENTE EC
  LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
  WHERE EC.ID_CLIENTE = {{clienteId}}
    AND (
      EXISTS (
        SELECT 1
        FROM USUARIO_CARGO UC
        WHERE UC.USER_ID = :VAR_USER
          AND UC.CARGO IN ('GESTOR', 'ADMIN')
      )
      OR EC.ID_VENDEDOR = :VAR_USER
      OR F.ID_SUBSTITUTO = :VAR_USER
    )
`;

const response = await updateServerFunctionMitra({
  projectId,
  serverFunctionId: 50,
  code,
  description: 'Remove vínculo de carteira do cliente para o vendedor atual (ou para gestão).',
});

console.log('SF 50 atualizada com sucesso.');
console.log(JSON.stringify(response, null, 2));
