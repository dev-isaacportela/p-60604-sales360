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

const SQL_LISTAR_VISITAS_PERIODO = `
  SELECT
    V.ID,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    V.HORA_FIM,
    V.TIPO,
    V.STATUS,
    V.CHECKIN_HORA,
    V.CHECKOUT_HORA,
    V.RELATO,
    C.ID AS CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND V.VENDEDOR_ID = :VAR_USER
  ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
`;

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || []).find((sf) => sf.name === 'listarVisitasPeriodo');

  if (!existing) {
    throw new Error("Server Function 'listarVisitasPeriodo' não encontrada.");
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: existing.id,
    code: SQL_LISTAR_VISITAS_PERIODO,
    description: 'Lista visitas no período restritas ao vendedor criador logado.',
  });

  console.log('SF listarVisitasPeriodo atualizada com restrição por vendedor criador.');
  console.log(JSON.stringify({ listarVisitasPeriodo: existing.id }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao restringir listarVisitasPeriodo por vendedor criador:');
  console.error(error?.message || error);
  process.exit(1);
});
