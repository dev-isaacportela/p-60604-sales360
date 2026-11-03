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
const { callIntegrationMitra, runQueryMitra } = require('mitra-sdk');

const projectId = 45654;
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

// ---------------------------------------------------------------- acesso ao Google
// Integracoes COMPARTILHADAS do projeto -- nenhuma por usuario. Ver
// fix-google-agenda-integracao-compartilhada.mjs para o porque.
const INT_TOKEN = 'google-oauth-token';
const INT_CALENDAR = 'google-calendar-api';

function respostaCrua(resposta) {
  const bruta = (resposta && resposta.result && resposta.result.output !== undefined)
    ? resposta.result.output
    : ((resposta && resposta.result !== undefined) ? resposta.result : resposta);
  let corpo = (bruta && bruta.body !== undefined) ? bruta.body : bruta;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (e) { /* mantem como string */ }
  }
  return { bruta: bruta, corpo: corpo, statusCode: (bruta && (bruta.statusCode || bruta.status)) || 0 };
}

/** Troca o refresh_token do usuario por um access_token de 1 hora. */
async function acessoGoogle(config) {
  const r = respostaCrua(await callIntegrationMitra({
    projectId,
    connection: INT_TOKEN,
    integrationSlug: INT_TOKEN,
    method: 'POST',
    endpoint: '/token',
    body: {
      client_id: config.CLIENT_ID,
      client_secret: config.CLIENT_SECRET,
      refresh_token: config.REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  }));
  const token = r.corpo && r.corpo.access_token;
  if (!token) {
    // Erro legivel: o caso comum aqui e o usuario ter revogado o acesso no painel do Google.
    const detalhe = (r.corpo && (r.corpo.error_description || r.corpo.error)) || '';
    throw new Error('O Google recusou a renovacao do acesso (HTTP ' + r.statusCode + '). '
      + (detalhe ? String(detalhe) + ' | ' : '')
      + 'Reconecte a conta em Configuracoes.');
  }
  return token;
}

/** O access_token vai na URL porque callIntegrationMitra nao aceita header por chamada. */
function googleCalendar(method, endpoint, token, params, body) {
  const query = { access_token: token };
  if (params) {
    for (const chave in params) {
      if (params[chave] !== undefined) query[chave] = params[chave];
    }
  }
  const opcoes = {
    projectId,
    connection: INT_CALENDAR,
    integrationSlug: INT_CALENDAR,
    method: method,
    endpoint: endpoint,
    params: query,
  };
  if (body) opcoes.body = body;
  return callIntegrationMitra(opcoes);
}

async function trocar() {
  const ticket = String(event.ticket || '').trim();
  const calendarIdNovo = String(event.calendarId || '').trim() || 'primary';
  if (ticket.length < 20) throw new Error('Ticket invalido.');

  const JANELA = "REPLACE(CRIADO_EM, 'T', ' ') >= SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), 1, 19)";
  const dono = rows(await runQueryMitra({
    projectId,
    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} AND CONSUMIDO_EM IS NULL LIMIT 1`,
  }))[0];
  // O ticket e consumido pela TELA (SF SQL googleAgendaConsumirTicket), como na listagem:
  // acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.
  if (!dono) throw new Error('Ticket expirado. Atualize a pagina e tente de novo.');

  const userId = Number(dono.USER_ID);
  const config = rows(await runQueryMitra({
    projectId,
    sql: `SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = ${userId} AND STATUS = 'CONFIGURADO' LIMIT 1`,
  }))[0];
  if (!config) throw new Error('Google Agenda nao esta conectado.');

  const calendarIdAntigo = config.CALENDAR_ID || 'primary';
  if (calendarIdAntigo === calendarIdNovo) {
      // Em "rows": e o unico formato que a camada de dados da tela (extractRowsFromOutput)
    // reconhece. Qualquer outra chave chega na tela como lista vazia.
    return { rows: [{ trocado: false, motivo: 'mesma_agenda', calendarId: calendarIdNovo }] };
  }

  let removidos = 0;
  let restantes = 0;
  {
    const token = await acessoGoogle(config);
    const vinculos = rows(await runQueryMitra({
      projectId,
      sql: `SELECT ID, GOOGLE_EVENT_ID FROM GOOGLE_AGENDA_EVENTOS
            WHERE USER_ID = ${userId} AND GOOGLE_EVENT_ID IS NOT NULL AND GOOGLE_EVENT_ID <> ''
            ORDER BY ID DESC`,
    }));
    restantes = Math.max(vinculos.length - LIMITE_REMOCAO, 0);

    for (const vinculo of vinculos.slice(0, LIMITE_REMOCAO)) {
      try {
        await googleCalendar('DELETE',
          '/calendars/' + encodeURIComponent(calendarIdAntigo) + '/events/' + encodeURIComponent(vinculo.GOOGLE_EVENT_ID),
          token);
        removidos += 1;
      } catch (erro) {
        // Evento ja apagado a mao pelo usuario, por exemplo: nao impede a troca.
      }
    }
  }

  // A gravacao (zerar vinculos, mudar CALENDAR_ID e registrar no historico) e feita pela TELA
  // atraves de SFs SQL com :VAR_USER. Aqui so devolvemos o que ela precisa passar adiante.
  return { rows: [{ trocado: true, calendarId: calendarIdNovo, anterior: calendarIdAntigo, removidos, restantes }] };
}

return await trocar();
