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

const AGENDA_LISTAR_SQL = `
  SELECT
    V.ID,
    V.CLIENTE_ID,
    C.NOME_FANTASIA AS CLIENTE,
    C.CIDADE,
    C.UF,
    V.VENDEDOR_ID,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    V.HORA_FIM,
    V.TIPO,
    V.STATUS,
    V.CHECKIN_HORA,
    V.CHECKOUT_HORA,
    V.RELATO,
    V.CRIADO_EM
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
    )
    AND V.VENDEDOR_ID = :VAR_USER
  ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
  LIMIT {{limit}} OFFSET {{offset}}
`;

const AGENDA_CONTAR_SQL = `
  SELECT COUNT(*) AS TOTAL
  FROM VISITAS V
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
    AND (
      '{{busca}}' = ''
      OR C.NOME_FANTASIA LIKE '%{{busca}}%'
      OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
      OR C.CNPJ LIKE '%{{busca}}%'
    )
    AND V.VENDEDOR_ID = :VAR_USER
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
  const listarId = await updateByName('agendaListarVisitasPaginado', {
    code: AGENDA_LISTAR_SQL,
    description: 'Lista visitas paginadas restritas ao vendedor criador logado.',
  });

  const contarId = await updateByName('agendaContarVisitasPaginado', {
    code: AGENDA_CONTAR_SQL,
    description: 'Conta visitas paginadas restritas ao vendedor criador logado.',
  });

  console.log('SFs de agenda atualizadas para restrição por vendedor criador.');
  console.log(JSON.stringify({
    agendaListarVisitasPaginado: listarId,
    agendaContarVisitasPaginado: contarId,
  }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao restringir agenda por vendedor criador:');
  console.error(error?.message || error);
  process.exit(1);
});
