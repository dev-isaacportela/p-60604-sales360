import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const ALCADA_SQL = `
  EXISTS (
    SELECT 1
    FROM USUARIO_CARGO UC
    WHERE UC.USER_ID = :VAR_USER
      AND UC.CARGO IN ('GESTOR', 'ADMIN')
  )
`;

const AGENDA_ATUALIZAR_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.CLIENTE_ID = {{clienteId}},
    V.DATA_AGENDADA = '{{dataAgendada}}',
    V.HORA_INICIO = '{{horaInicio}}',
    V.HORA_FIM = '{{horaFim}}',
    V.TIPO = '{{tipo}}',
    V.RELATO = NULLIF('{{relato}}', '')
  WHERE V.ID = {{visitaId}}
    AND (
      ${ALCADA_SQL}
      OR V.VENDEDOR_ID = :VAR_USER
    )
    AND (
      (
        V.DATA_AGENDADA = '{{dataAgendada}}'
        AND V.HORA_INICIO = '{{horaInicio}}'
        AND V.HORA_FIM = '{{horaFim}}'
      )
      OR NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
    )
  LIMIT 1
`;

const AGENDA_CANCELAR_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.STATUS = 'CANCELADA',
    V.RELATO = '{{relato}}'
  WHERE V.ID = {{visitaId}}
    AND (
      ${ALCADA_SQL}
      OR V.VENDEDOR_ID = :VAR_USER
    )
    AND NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
  LIMIT 1
`;

async function updateByName(name, payload) {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === name);

  if (!existing) {
    throw new Error(`Server Function '${name}' não encontrada no projeto.`);
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: existing.id,
    ...payload,
  });

  return existing.id;
}

async function main() {
  const agendaAtualizarVisitaId = await updateByName('agendaAtualizarVisita', {
    code: AGENDA_ATUALIZAR_VISITA_SQL,
    description: 'Atualiza visita existente e exige relato quando houver reagendamento.',
  });

  const agendaCancelarVisitaSeguroId = await updateByName('agendaCancelarVisitaSeguro', {
    code: AGENDA_CANCELAR_VISITA_SQL,
    description: 'Cancela visita respeitando alçada e exige relato obrigatório do motivo.',
  });

  console.log('SFs de agenda atualizadas com obrigatoriedade de relato.');
  console.log(
    JSON.stringify(
      {
        agendaAtualizarVisita: agendaAtualizarVisitaId,
        agendaCancelarVisitaSeguro: agendaCancelarVisitaSeguroId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Erro ao atualizar obrigatoriedade de relato em visitas:');
  console.error(error?.message || error);
  process.exit(1);
});
