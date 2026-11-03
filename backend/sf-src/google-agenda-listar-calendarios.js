/**
 * SF - googleAgendaListarCalendarios
 *
 * Lista os calendarios da conta Google do usuario logado.
 *
 * Identidade: SFs JAVASCRIPT nao tem acesso a :VAR_USER, e receber o ID do usuario
 * por parametro deixaria qualquer um ler a lista de calendarios de outra pessoa.
 * Por isso o frontend abre antes um ticket (SF SQL, que resolve :VAR_USER no servidor)
 * e passa aqui so o ticket, de uso unico e valido por 5 minutos.
 */
const { callIntegrationMitra, createIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = __PROJECT_ID__;

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

async function ensureIntegration(config) {
  if (config.INTEGRATION_SLUG) return config.INTEGRATION_SLUG;
  const slug = 'google-calendar-user-' + Number(config.USER_ID) + '-' + Date.now();
  await createIntegrationMitra({
    projectId,
    name: 'Google Calendar - Usuario ' + Number(config.USER_ID),
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
  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_CONFIG SET INTEGRATION_SLUG = '${escapeSql(slug)}', ATUALIZADO_EM = '${now()}' WHERE USER_ID = ${Number(config.USER_ID)} LIMIT 1` });
  return slug;
}

async function listar() {
  const ticket = String(event.ticket || '').trim();
  if (ticket.length < 20) throw new Error('Ticket invalido.');

  // CRIADO_EM e VARCHAR e o projeto grava em dois formatos ('YYYY-MM-DD HH:MM:SS' pelo SQL,
  // 'YYYY-MM-DDTHH:MM:SS' pelo JS). Sem normalizar o 'T', a comparacao textual erra.
  const JANELA = "REPLACE(CRIADO_EM, 'T', ' ') >= SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), 1, 19)";
  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE NOT (${JANELA})` });

  const dono = rows(await runQueryMitra({
    projectId,
    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} LIMIT 1`,
  }))[0];
  // Uso unico: o ticket morre assim que e resgatado.
  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}'` });
  if (!dono) throw new Error('Ticket expirado. Atualize a pagina e tente de novo.');

  const userId = Number(dono.USER_ID);
  const config = rows(await runQueryMitra({
    projectId,
    sql: `SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = ${userId} AND STATUS = 'CONFIGURADO' LIMIT 1`,
  }))[0];
  if (!config) return { rows: [], motivo: 'google_nao_configurado' };

  const slug = await ensureIntegration(config);
  const resposta = await callIntegrationMitra({
    projectId,
    connection: slug,
    integrationSlug: slug,
    method: 'GET',
    endpoint: '/users/me/calendarList',
    params: { minAccessRole: 'writer', maxResults: '250', showHidden: 'false' },
  });

  const bruta = resposta?.result?.output ?? resposta?.result ?? resposta;
  let corpo = bruta?.body ?? bruta;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (erroParse) { /* mantem como string */ }
  }

  const itens = Array.isArray(corpo?.items) ? corpo.items : null;
  if (!itens) {
    const statusCode = bruta?.statusCode ?? bruta?.status ?? 0;
    const detalhe = corpo?.error?.message || corpo?.error || '';
    throw new Error('Nao foi possivel listar os calendarios (HTTP ' + statusCode + '). '
      + (detalhe ? String(detalhe) + ' | ' : '') + 'Resposta: ' + JSON.stringify(bruta || {}).slice(0, 300));
  }

  const calendarios = itens.map((cal) => ({
    id: cal.id,
    nome: cal.summaryOverride || cal.summary || cal.id,
    principal: cal.primary === true,
    acesso: cal.accessRole,
  }));
  // Calendario principal primeiro, resto em ordem alfabetica.
  calendarios.sort((a, b) => {
    if (a.principal !== b.principal) return a.principal ? -1 : 1;
    return String(a.nome).localeCompare(String(b.nome));
  });

  // Devolve em "rows": e o formato que a camada de dados do frontend (extractRowsFromOutput)
  // reconhece. Qualquer outra chave volta como lista vazia na tela.
  return { rows: calendarios, atual: config.CALENDAR_ID || 'primary' };
}

return await listar();
