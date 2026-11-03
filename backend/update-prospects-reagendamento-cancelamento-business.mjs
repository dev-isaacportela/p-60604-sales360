import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const ATUALIZAR_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  DATA_VISITA = '{{dataVisita}}',
  HORA_INICIO = '{{horaInicio}}',
  HORA_FIM = '{{horaFim}}',
  OBJETIVO = '{{objetivo}}',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1
`;

const CANCELAR_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'CANCELADA',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1
`;

const UPDATES = [
  {
    id: 260,
    code: ATUALIZAR_VISITA_SQL,
    description: 'Atualiza ou reagenda visita de prospeccao por SQL para usuarios business.',
  },
  {
    id: 261,
    code: CANCELAR_VISITA_SQL,
    description: 'Cancela visita de prospeccao com motivo por SQL para usuarios business.',
  },
];

for (const item of UPDATES) {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: item.id,
    type: 'SQL',
    code: item.code,
    description: item.description,
  });

  const updated = await readServerFunctionMitra({ projectId, serverFunctionId: item.id });
  const result = updated?.result || {};
  console.log(`SF ${item.id}: ${result.name || ''} atualizada para ${result.type || 'SQL'}`);
}
