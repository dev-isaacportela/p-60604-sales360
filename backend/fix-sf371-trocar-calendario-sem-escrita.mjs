/**
 * SF 371 (googleAgendaTrocarCalendario) e a proxima parede do caminho business, logo depois
 * de escolher a agenda: ela e JAVASCRIPT e grava no banco (runDmlMitra), o que acesso BUSINESS
 * nao pode fazer. Mesma correcao ja aplicada as SFs 365/366/370: a SF JS passa a so LER e
 * limpar os eventos no Google; quem grava e uma SF SQL, resolvendo :VAR_USER no servidor --
 * assim a troca continua amarrada a quem esta logado, e nao a um id vindo do navegador.
 *
 * Todas as tres escritas sao em linhas do PROPRIO usuario, entao :VAR_USER cobre o caso inteiro
 * (diferente da SF 212, que grava para participantes de reuniao e por isso virou fila + worker).
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  readServerFunctionMitra,
  listServerFunctionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// Uma SF SQL so executa UM statement, entao as tres escritas viram tres SFs pequenas,
// chamadas em sequencia pela tela. A ordem importa: zerar os vinculos ANTES de mudar o
// CALENDAR_ID -- se parar no meio, sobra vinculo apontando para evento da agenda antiga
// com o destino ja trocado, e a sincronizacao seguinte quebraria com 404.
const SF_ZERAR_VINCULOS = `
UPDATE GOOGLE_AGENDA_EVENTOS
SET GOOGLE_EVENT_ID = NULL, STATUS_SYNC = 'PENDENTE', ULTIMO_ERRO = NULL,
    ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE USER_ID = :VAR_USER
`;

const SF_GRAVAR_AGENDA = `
UPDATE GOOGLE_AGENDA_CONFIG
SET CALENDAR_ID = '{{calendarId}}', ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE USER_ID = :VAR_USER
`;

const SF_LOG_TROCA = `
INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM)
VALUES (:VAR_USER, 'CONFIG', 0, 'TROCA_AGENDA', 'SUCESSO',
  CONCAT('Agenda alterada de ', '{{anterior}}', ' para ', '{{calendarId}}', '. Eventos removidos: ', '{{removidos}}', '.'),
  SUBSTRING(CURRENT_TIMESTAMP, 1, 19))
`;

async function upsertSf(nome, tipo, code, description) {
  const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const existente = sfs.find((s) => s.name === nome);
  if (existente) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code, description });
    console.log(`  ${nome} (${existente.id}) atualizada.`);
    return existente.id;
  }
  await createServerFunctionMitra({ projectId, name: nome, type: tipo, code, description });
  const relidas = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const id = relidas.find((s) => s.name === nome)?.id;
  console.log(`  ${nome} criada (id ${id}).`);
  return id;
}

async function main() {
  console.log('1. SFs SQL que passam a fazer a escrita da troca de agenda');
  const idZerar = await upsertSf('googleAgendaZerarVinculos', 'SQL', SF_ZERAR_VINCULOS,
    'Zera os vinculos de evento do usuario logado apos trocar de agenda. SQL porque acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.');
  const idGravar = await upsertSf('googleAgendaGravarAgendaEscolhida', 'SQL', SF_GRAVAR_AGENDA,
    'Grava a agenda de destino escolhida pelo usuario logado.');
  const idLog = await upsertSf('googleAgendaLogTroca', 'SQL', SF_LOG_TROCA,
    'Registra no historico a troca de agenda do usuario logado.');

  console.log('\n2. SF 371 deixa de escrever (so le e limpa os eventos no Google)');
  let c = String((await readServerFunctionMitra({ projectId, serverFunctionId: 371 }))?.result?.code || '');

  const trocas = [
    // O ticket passa a ser consumido pela tela (SF SQL 373), como ja acontece na listagem.
    [
      "  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_TICKET SET CONSUMIDO_EM = '${now()}' WHERE TICKET = '${escapeSql(ticket)}'` });\n",
      "  // O ticket e consumido pela TELA (SF SQL googleAgendaConsumirTicket), como na listagem:\n"
        + "  // acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.\n",
    ],
    // As tres gravacoes finais saem daqui e passam a ser feitas pela tela, via SFs SQL.
    [
      `  await runDmlMitra({ projectId, sql: \`UPDATE GOOGLE_AGENDA_EVENTOS
    SET GOOGLE_EVENT_ID = NULL, STATUS_SYNC = 'PENDENTE', ULTIMO_ERRO = NULL, ATUALIZADO_EM = '\${now()}'
    WHERE USER_ID = \${userId}\` });
  await runDmlMitra({ projectId, sql: \`UPDATE GOOGLE_AGENDA_CONFIG
    SET CALENDAR_ID = '\${escapeSql(calendarIdNovo)}', ATUALIZADO_EM = '\${now()}'
    WHERE USER_ID = \${userId} LIMIT 1\` });
  await runDmlMitra({ projectId, sql: \`INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM)
    VALUES (\${userId}, 'CONFIG', 0, 'TROCA_AGENDA', 'SUCESSO',
    '\${escapeSql('Agenda alterada de ' + calendarIdAntigo + ' para ' + calendarIdNovo + '. Eventos removidos: ' + removidos + '.')}', '\${now()}')\` });

  return { trocado: true, calendarId: calendarIdNovo, anterior: calendarIdAntigo, removidos, restantes };`,
      `  // A gravacao (zerar vinculos, mudar CALENDAR_ID e registrar no historico) e feita pela TELA
  // atraves de SFs SQL com :VAR_USER. Aqui so devolvemos o que ela precisa passar adiante.
  return { trocado: true, calendarId: calendarIdNovo, anterior: calendarIdAntigo, removidos, restantes };`,
    ],
  ];
  for (const [de, para] of trocas) {
    if (!c.includes(de)) throw new Error('SF 371: trecho esperado nao encontrado -- revise.');
    c = c.split(de).join(para);
  }
  c = c.replace(
    "const { callIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');",
    "const { callIntegrationMitra, runQueryMitra } = require('mitra-sdk');",
  );
  if (/runDmlMitra\s*\(/.test(c)) throw new Error('SF 371 ainda escreve -- abortando.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 371, code: c });
  console.log('   OK: nenhum runDmlMitra na 371.');

  console.log(`\nIDs para a tela: zerarVinculos=${idZerar} gravarAgenda=${idGravar} logTroca=${idLog}`);
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
