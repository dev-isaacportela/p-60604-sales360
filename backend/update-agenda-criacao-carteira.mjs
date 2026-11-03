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

const AGENDA_CRIAR_VISITA_SQL = `
  INSERT INTO VISITAS (
    CLIENTE_ID,
    VENDEDOR_ID,
    DATA_AGENDADA,
    HORA_INICIO,
    HORA_FIM,
    TIPO,
    STATUS,
    RELATO,
    CRIADO_EM
  )
  SELECT
    C.ID,
    :VAR_USER,
    '{{dataAgendada}}',
    '{{horaInicio}}',
    '{{horaFim}}',
    '{{tipo}}',
    'AGENDADA',
    NULLIF('{{relato}}', ''),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM CLIENTES C
  WHERE C.ID = {{clienteId}}
    AND EXISTS (
      SELECT 1
      FROM EQUIPE_CLIENTE EC
      LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
      WHERE EC.ID_CLIENTE = C.ID
        AND (
          EC.ID_VENDEDOR = :VAR_USER
          OR F.ID_SUBSTITUTO = :VAR_USER
        )
    )
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
  const agendaCriarVisitaId = await updateByName('agendaCriarVisita', {
    code: AGENDA_CRIAR_VISITA_SQL,
    description: 'Cria visita apenas para clientes da carteira do usuário logado (ou cobertura por substituição).',
  });

  console.log('SF agendaCriarVisita atualizada com validação de carteira.');
  console.log(JSON.stringify({ agendaCriarVisita: agendaCriarVisitaId }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao atualizar regra de criação de visitas por carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
