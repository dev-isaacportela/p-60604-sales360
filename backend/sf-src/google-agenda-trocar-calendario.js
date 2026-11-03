/**
 * SF - googleAgendaTrocarCalendario
 *
 * Troca a agenda de destino do usuario. Nao basta mudar CALENDAR_ID: os eventos ja
 * criados vivem na agenda ANTIGA, e um PATCH futuro apontando para a agenda nova com
 * um ID de evento da antiga devolve 404. Entao aqui os eventos antigos sao removidos
 * e os vinculos zerados -- na proxima sincronizacao cada item e recriado no destino novo.
 *
 * Identidade pelo mesmo ticket de uso unico usado na listagem (SFs JS nao veem :VAR_USER).
 */
const { callIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = __PROJECT_ID__;
const LIMITE_REMOCAO = 200;

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

async function trocar() {
  const ticket = String(event.ticket || '').trim();
  const calendarIdNovo = String(event.calendarId || '').trim() || 'primary';
  if (ticket.length < 20) throw new Error('Ticket invalido.');

  const JANELA = "REPLACE(CRIADO_EM, 'T', ' ') >= SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), 1, 19)";
  const dono = rows(await runQueryMitra({
    projectId,
    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} LIMIT 1`,
  }))[0];
  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}'` });
  if (!dono) throw new Error('Ticket expirado. Atualize a pagina e tente de novo.');

  const userId = Number(dono.USER_ID);
  const config = rows(await runQueryMitra({
    projectId,
    sql: `SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = ${userId} AND STATUS = 'CONFIGURADO' LIMIT 1`,
  }))[0];
  if (!config) throw new Error('Google Agenda nao esta conectado.');

  const calendarIdAntigo = config.CALENDAR_ID || 'primary';
  if (calendarIdAntigo === calendarIdNovo) {
    return { trocado: false, motivo: 'mesma_agenda', calendarId: calendarIdNovo };
  }

  let removidos = 0;
  let restantes = 0;
  if (config.INTEGRATION_SLUG) {
    const vinculos = rows(await runQueryMitra({
      projectId,
      sql: `SELECT ID, GOOGLE_EVENT_ID FROM GOOGLE_AGENDA_EVENTOS
            WHERE USER_ID = ${userId} AND GOOGLE_EVENT_ID IS NOT NULL AND GOOGLE_EVENT_ID <> ''
            ORDER BY ID DESC`,
    }));
    restantes = Math.max(vinculos.length - LIMITE_REMOCAO, 0);

    for (const vinculo of vinculos.slice(0, LIMITE_REMOCAO)) {
      try {
        await callIntegrationMitra({
          projectId,
          connection: config.INTEGRATION_SLUG,
          integrationSlug: config.INTEGRATION_SLUG,
          method: 'DELETE',
          endpoint: '/calendars/' + encodeURIComponent(calendarIdAntigo) + '/events/' + encodeURIComponent(vinculo.GOOGLE_EVENT_ID),
        });
        removidos += 1;
      } catch (erro) {
        // Evento ja apagado a mao pelo usuario, por exemplo: nao impede a troca.
      }
    }
  }

  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_EVENTOS WHERE USER_ID = ${userId}` });
  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_CONFIG
    SET CALENDAR_ID = '${escapeSql(calendarIdNovo)}', ATUALIZADO_EM = '${now()}'
    WHERE USER_ID = ${userId} LIMIT 1` });
  await runDmlMitra({ projectId, sql: `INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM)
    VALUES (${userId}, 'CONFIG', 0, 'TROCA_AGENDA', 'SUCESSO',
    '${escapeSql('Agenda alterada de ' + calendarIdAntigo + ' para ' + calendarIdNovo + '. Eventos removidos: ' + removidos + '.')}', '${now()}')` });

  return { trocado: true, calendarId: calendarIdNovo, anterior: calendarIdAntigo, removidos, restantes };
}

return await trocar();
