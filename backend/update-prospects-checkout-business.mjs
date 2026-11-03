import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const CHECKOUT_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'CONCLUIDA',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1;

UPDATE PROSPECTS
SET
  STATUS_PIPELINE = 'VISITADO',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{prospectId}}
  AND STATUS_PIPELINE <> 'CONVERTIDO'
LIMIT 1;

SELECT 'CONCLUIDA' AS STATUS;
`;

await updateServerFunctionMitra({
  projectId,
  serverFunctionId: 263,
  type: 'SQL',
  code: CHECKOUT_VISITA_SQL,
  description: 'Finaliza visita de prospeccao com relato por SQL para usuarios business.',
});

const updated = await readServerFunctionMitra({ projectId, serverFunctionId: 263 });
const result = updated?.result || {};
console.log(`SF 263: ${result.name || ''} atualizada para ${result.type || 'SQL'}`);
