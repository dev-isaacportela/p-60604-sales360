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

const CHECKOUT_VISITA_SQL = `
  UPDATE VISITAS V
  SET
    V.STATUS = 'CONCLUIDA',
    V.CHECKOUT_HORA = '{{checkoutHora}}',
    V.RELATO = '{{relato}}'
  WHERE V.ID = {{visitaId}}
    AND V.VENDEDOR_ID = :VAR_USER
    AND NULLIF(TRIM('{{relato}}'), '') IS NOT NULL
    AND V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
  LIMIT 1
`;

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === 'checkoutVisita');

  if (!existing) {
    throw new Error("Server Function 'checkoutVisita' não encontrada no projeto.");
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: existing.id,
    code: CHECKOUT_VISITA_SQL,
    description: 'Finaliza visita somente com relato obrigatório e apenas para o vendedor criador.',
  });

  console.log('SF checkoutVisita atualizada com relato obrigatório.');
  console.log(JSON.stringify({ checkoutVisita: existing.id }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao atualizar checkoutVisita com relato obrigatório:');
  console.error(error?.message || error);
  process.exit(1);
});
