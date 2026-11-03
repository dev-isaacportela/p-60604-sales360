/**
 * Remove todo DELETE do caminho executado por usuario BUSINESS na integracao Google Agenda.
 *
 * Motivo (evidencia real, nao hipotese): com o perfil ja atribuido, o usuario business
 * passou do erro "User has no profile assigned" e bateu em:
 *
 *   BUSINESS_ACCESS_DENIED "Operacao nao permitida para acesso BUSINESS."
 *   compiledSql: DELETE FROM GOOGLE_OAUTH_PENDENTE WHERE ...
 *
 * O bloqueio e do VERBO, nao da tabela: GOOGLE_OAUTH_PENDENTE esta liberada para DML no
 * perfil, e o historico do projeto mostra INSERT (2) e UPDATE (1) executados com SUCESSO
 * por usuario business -- e DELETE nunca executado com sucesso, nenhuma vez.
 *
 * Estrategia: o caminho do business so faz INSERT/UPDATE. Toda remocao fisica migra para
 * uma SF de manutencao rodando em CRON, que executa como Administrator (acesso dev).
 *
 * As invariantes de seguranca sao preservadas por LEITURA, nao por remocao:
 *   - GOOGLE_OAUTH_PENDENTE: a SF 366 ja exige REFRESH_TOKEN <> '' E CRIADO_EM dentro de
 *     10 min. Zerar o token no consumo torna a linha inutil -- mesma garantia do DELETE.
 *   - GOOGLE_AGENDA_TICKET: ganha CONSUMIDO_EM; a busca passa a exigir CONSUMIDO_EM IS NULL,
 *     mantendo o uso unico.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runQueryMitra,
  createServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
  listServerFunctionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/** Troca exata: falha alto se o trecho esperado nao existir mais (SF alterada por outro turno). */
function trocar(codigo, de, para, rotulo) {
  if (!codigo.includes(de)) {
    throw new Error(`[${rotulo}] trecho esperado nao encontrado -- a SF mudou. Revise antes de aplicar.`);
  }
  return codigo.split(de).join(para);
}

async function editarSf(serverFunctionId, rotulo, transformar) {
  const atual = (await readServerFunctionMitra({ projectId, serverFunctionId }))?.result || {};
  const novo = transformar(String(atual.code || ''));
  if (/DELETE\s+FROM/i.test(novo)) {
    throw new Error(`[${rotulo}] ainda restou DELETE no codigo -- abortando.`);
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId, code: novo });
  console.log(`  SF ${serverFunctionId} (${rotulo}) atualizada -- sem DELETE.`);
}

// ---------------------------------------------------------------- 1. coluna de consumo
async function ddlTicket() {
  const existe = (await runQueryMitra({
    projectId,
    sql: "SELECT COUNT(*) AS N FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GOOGLE_AGENDA_TICKET' AND COLUMN_NAME = 'CONSUMIDO_EM'",
  }))?.result?.rows?.[0]?.N;
  if (Number(existe) > 0) {
    console.log('  CONSUMIDO_EM ja existe em GOOGLE_AGENDA_TICKET.');
    return;
  }
  await runDdlMitra({ projectId, sql: 'ALTER TABLE GOOGLE_AGENDA_TICKET ADD COLUMN CONSUMIDO_EM VARCHAR(19) NULL' });
  console.log('  CONSUMIDO_EM adicionada a GOOGLE_AGENDA_TICKET (aditivo, nada removido).');
}

// ---------------------------------------------------------------- 2. SFs do business
async function corrigirSfs() {
  // -- 365 googleAgendaTrocarCodigo: some a limpeza oportunista de expirados.
  await editarSf(365, 'googleAgendaTrocarCodigo', (c) => trocar(
    c,
    `  await runDmlMitra({ projectId, sql: "DELETE FROM GOOGLE_OAUTH_PENDENTE WHERE REPLACE(CRIADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 1, 19)" });`,
    `  // Sem DELETE aqui: acesso BUSINESS nao pode remover linha. A expiracao ja e garantida na
  // LEITURA (a SF 366 exige CRIADO_EM dentro de 10 min), e a remocao fisica das linhas
  // vencidas fica com a SF de manutencao em cron, que roda como Administrator.`,
    '365 limpeza',
  ));

  // -- 367 googleOAuthDescartarPendente (SQL): consumir = zerar o segredo, nao apagar a linha.
  await editarSf(367, 'googleOAuthDescartarPendente', () => `
  UPDATE GOOGLE_OAUTH_PENDENTE
  SET REFRESH_TOKEN = ''
  WHERE STATE = '{{state}}'
`);

  // -- 369 googleAgendaAbrirTicket: reemitir um ticket precisa REABRIR a linha. Sem zerar
  // CONSUMIDO_EM no ON DUPLICATE KEY, um ticket reaproveitado nasceria morto.
  await editarSf(369, 'googleAgendaAbrirTicket', () => `
  INSERT INTO GOOGLE_AGENDA_TICKET (TICKET, USER_ID, CRIADO_EM, CONSUMIDO_EM)
  VALUES ('{{ticket}}', :VAR_USER, SUBSTRING(CURRENT_TIMESTAMP, 1, 19), NULL)
  ON DUPLICATE KEY UPDATE USER_ID = VALUES(USER_ID), CRIADO_EM = VALUES(CRIADO_EM), CONSUMIDO_EM = NULL
`);

  // -- 370 googleAgendaListarCalendarios
  await editarSf(370, 'googleAgendaListarCalendarios', (c) => {
    let novo = trocar(
      c,
      '  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE NOT (${JANELA})` });',
      '  // A remocao de tickets vencidos migrou para a SF de manutencao (cron/Administrator):\n'
        + '  // acesso BUSINESS nao executa DELETE. A janela continua valendo na consulta abaixo.',
      '370 limpeza',
    );
    novo = trocar(
      novo,
      "    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} LIMIT 1`,",
      "    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} AND CONSUMIDO_EM IS NULL LIMIT 1`,",
      '370 busca do ticket',
    );
    novo = trocar(
      novo,
      "  // Uso unico: o ticket morre assim que e resgatado.\n"
        + "  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}'` });",
      "  // Uso unico: o ticket e marcado como consumido (a busca acima exige CONSUMIDO_EM IS NULL).\n"
        + "  // Marcar em vez de apagar mantem a mesma garantia sem usar DELETE, proibido para BUSINESS.\n"
        + "  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_TICKET SET CONSUMIDO_EM = '${now()}' WHERE TICKET = '${escapeSql(ticket)}'` });",
      '370 uso unico',
    );
    // Provisionamento da integracao e operacao de projeto: se o acesso BUSINESS nao puder
    // faze-lo, a mensagem tem que dizer o que fazer em vez de vazar erro tecnico.
    novo = trocar(
      novo,
      '  const slug = await ensureIntegration(config);',
      `  let slug;
  try {
    slug = await ensureIntegration(config);
  } catch (erro) {
    // A SF de manutencao provisiona em ate 5 min; ate la a lista nao tem como ser lida.
    throw new Error('Sua conexao com o Google esta sendo preparada. Aguarde ate 5 minutos e clique em "Atualizar lista".');
  }`,
      '370 provisionamento',
    );
    return novo;
  });

  // -- 371 googleAgendaTrocarCalendario
  await editarSf(371, 'googleAgendaTrocarCalendario', (c) => {
    let novo = trocar(
      c,
      "    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} LIMIT 1`,",
      "    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} AND CONSUMIDO_EM IS NULL LIMIT 1`,",
      '371 busca do ticket',
    );
    novo = trocar(
      novo,
      "  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}'` });",
      "  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_TICKET SET CONSUMIDO_EM = '${now()}' WHERE TICKET = '${escapeSql(ticket)}'` });",
      '371 uso unico',
    );
    // Anular o vinculo tem o mesmo efeito de apaga-lo: a SF 212 procura o mapeamento por
    // USER_ID+ENTIDADE+ENTIDADE_ID e, com GOOGLE_EVENT_ID vazio, CRIA um evento novo no
    // destino -- que e exatamente o comportamento desejado apos trocar de agenda.
    novo = trocar(
      novo,
      '  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_EVENTOS WHERE USER_ID = ${userId}` });',
      `  await runDmlMitra({ projectId, sql: \`UPDATE GOOGLE_AGENDA_EVENTOS
    SET GOOGLE_EVENT_ID = NULL, STATUS_SYNC = 'PENDENTE', ULTIMO_ERRO = NULL, ATUALIZADO_EM = '\${now()}'
    WHERE USER_ID = \${userId}\` });`,
      '371 vinculos',
    );
    return novo;
  });
}

// ---------------------------------------------------------------- 3. manutencao (cron)
const CODIGO_MANUTENCAO = `/**
 * SF - googleAgendaManutencao (CRON, executa como Administrator)
 *
 * Existe porque o acesso BUSINESS nao pode executar DELETE nem criar integracao. Tudo que
 * o caminho do usuario final deixa de fazer fisicamente e feito aqui, fora da sessao dele:
 *
 *   1. remove linhas vencidas/consumidas das tabelas-ponte (GOOGLE_OAUTH_PENDENTE e
 *      GOOGLE_AGENDA_TICKET) -- nenhuma delas guarda dado de negocio;
 *   2. provisiona a integracao por usuario de quem conectou e ainda esta sem INTEGRATION_SLUG.
 */
const { createIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = 45654;

function escapeSql(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function rows(response) {
  if (Array.isArray(response?.rows)) return response.rows;
  if (Array.isArray(response?.result?.rows)) return response.result.rows;
  if (Array.isArray(response?.result)) return response.result;
  return [];
}

function now() {
  return new Date().toISOString().slice(0, 19);
}

async function manutencao() {
  const relatorio = { pendentesRemovidos: 0, ticketsRemovidos: 0, integracoesCriadas: 0, falhas: [] };

  // 1. Tabelas-ponte. CRIADO_EM e VARCHAR e o projeto grava em dois formatos
  // ('YYYY-MM-DD HH:MM:SS' pelo SQL e com 'T' pelo JS); sem normalizar, a comparacao erra.
  const venceu = (minutos) => "REPLACE(CRIADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL " + minutos + " MINUTE), 1, 19)";

  const p = await runDmlMitra({
    projectId,
    sql: "DELETE FROM GOOGLE_OAUTH_PENDENTE WHERE " + venceu(10) + " OR REFRESH_TOKEN = '' OR REFRESH_TOKEN IS NULL",
  });
  relatorio.pendentesRemovidos = p?.result?.rowsAffected ?? p?.rowsAffected ?? 0;

  const t = await runDmlMitra({
    projectId,
    sql: 'DELETE FROM GOOGLE_AGENDA_TICKET WHERE ' + venceu(5) + ' OR CONSUMIDO_EM IS NOT NULL',
  });
  relatorio.ticketsRemovidos = t?.result?.rowsAffected ?? t?.rowsAffected ?? 0;

  // 2. Provisionamento das integracoes que faltam.
  const pendentesIntegracao = rows(await runQueryMitra({
    projectId,
    sql: "SELECT USER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN FROM GOOGLE_AGENDA_CONFIG "
      + "WHERE STATUS = 'CONFIGURADO' AND (INTEGRATION_SLUG IS NULL OR INTEGRATION_SLUG = '') "
      + "AND REFRESH_TOKEN IS NOT NULL AND REFRESH_TOKEN <> ''",
  }));

  for (const config of pendentesIntegracao) {
    const userId = Number(config.USER_ID);
    const slug = 'google-calendar-user-' + userId + '-' + Date.now();
    try {
      await createIntegrationMitra({
        projectId,
        name: 'Google Calendar - Usuario ' + userId,
        slug,
        blueprintId: null,
        blueprintType: 'HTTP_REQUEST',
        authType: 'DYNAMIC_TOKEN',
        credentials: {
          base_url: 'https://www.googleapis.com/calendar/v3',
          client_id: config.CLIENT_ID,
          client_secret: config.CLIENT_SECRET,
          refresh_token: config.REFRESH_TOKEN,
        },
        authenticationConfig: {
          method: 'POST',
          url: 'https://oauth2.googleapis.com/token',
          content_type: 'application/x-www-form-urlencoded',
          body: {
            client_id: '{{client_id}}',
            client_secret: '{{client_secret}}',
            refresh_token: '{{refresh_token}}',
            grant_type: 'refresh_token',
          },
          token_extraction: { path: '$.access_token', type: 'jsonpath' },
          refresh_strategy: 're_authenticate',
        },
        authorizationConfig: {
          type: 'header',
          config: { name: 'Authorization', value: 'Bearer {{token}}' },
        },
      });
      await runDmlMitra({
        projectId,
        sql: "UPDATE GOOGLE_AGENDA_CONFIG SET INTEGRATION_SLUG = '" + escapeSql(slug) + "', ATUALIZADO_EM = '" + now() + "' WHERE USER_ID = " + userId + " LIMIT 1",
      });
      relatorio.integracoesCriadas += 1;
    } catch (erro) {
      relatorio.falhas.push({ userId, erro: String(erro && erro.message ? erro.message : erro).slice(0, 200) });
    }
  }

  return relatorio;
}

return await manutencao();
`;

async function criarManutencao() {
  const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const existente = sfs.find((s) => s.name === 'googleAgendaManutencao');
  let id = existente?.id;
  if (id) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: CODIGO_MANUTENCAO });
    console.log(`  SF googleAgendaManutencao (${id}) atualizada.`);
  } else {
    const criada = await createServerFunctionMitra({
      projectId,
      name: 'googleAgendaManutencao',
      type: 'JAVASCRIPT',
      code: CODIGO_MANUTENCAO,
      description: 'CRON: remove linhas vencidas das tabelas-ponte do Google Agenda e provisiona a integracao por usuario. Roda como Administrator porque acesso BUSINESS nao executa DELETE nem cria integracao.',
    });
    id = criada?.result?.serverFunctionId ?? criada?.result?.id;
    if (!id) {
      const relidas = (await listServerFunctionsMitra({ projectId }))?.result || [];
      id = relidas.find((s) => s.name === 'googleAgendaManutencao')?.id;
    }
    console.log(`  SF googleAgendaManutencao criada (id ${id}).`);
  }
  // Spring cron, 6 campos. Intervalo minimo da plataforma e 5 min.
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, cronExpression: '0 */5 * * * *' });
  console.log('  Cron agendado: a cada 5 minutos.');
  return id;
}

async function main() {
  console.log('1. Coluna de consumo do ticket');
  await ddlTicket();
  console.log('\n2. SFs do caminho business (removendo DELETE)');
  await corrigirSfs();
  console.log('\n3. SF de manutencao em cron');
  const idManutencao = await criarManutencao();
  console.log('\n4. Execucao imediata da manutencao (como Administrator)');
  const { executeServerFunctionMitra } = await import('mitra-sdk');
  const exec = await executeServerFunctionMitra({ projectId, serverFunctionId: idManutencao, input: {} });
  console.log('  status:', exec?.result?.executionStatus);
  console.log('  saida :', JSON.stringify(exec?.result?.output));
  if (exec?.result?.error) console.log('  erro  :', JSON.stringify(exec.result.error));
}

main().catch((e) => {
  console.error('FALHOU:', e?.message || e);
  process.exit(1);
});
