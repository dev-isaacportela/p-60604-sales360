import 'dotenv/config';
import { configureSdkMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const CHECKIN_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'EM_ANDAMENTO',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
  AND STATUS = 'AGENDADA'
LIMIT 1
`;

await updateServerFunctionMitra({
  projectId,
  serverFunctionId: 262,
  type: 'SQL',
  code: CHECKIN_VISITA_SQL,
  description: 'Inicia visita de prospeccao por SQL para usuarios business.',
});

console.log('SF 262 convertida para SQL para permitir check-in de prospeccao por executivas business.');
