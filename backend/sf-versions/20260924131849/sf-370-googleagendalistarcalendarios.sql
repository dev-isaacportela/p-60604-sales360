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
const { callIntegrationMitra, runQueryMitra } = require('mitra-sdk');

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


async function listar() {
  const ticket = String(event.ticket || '').trim();
  if (ticket.length < 20) throw new Error('Ticket invalido.');

  // CRIADO_EM e VARCHAR e o projeto grava em dois formatos ('YYYY-MM-DD HH:MM:SS' pelo SQL,
  // 'YYYY-MM-DDTHH:MM:SS' pelo JS). Sem normalizar o 'T', a comparacao textual erra.
  const JANELA = "REPLACE(CRIADO_EM, 'T', ' ') >= SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), 1, 19)";
  // A remocao de tickets vencidos migrou para a SF de manutencao (cron/Administrator):
  // acesso BUSINESS nao executa DELETE. A janela continua valendo na consulta abaixo.

  const dono = rows(await runQueryMitra({
    projectId,
    sql: `SELECT USER_ID FROM GOOGLE_AGENDA_TICKET WHERE TICKET = '${escapeSql(ticket)}' AND ${JANELA} AND CONSUMIDO_EM IS NULL LIMIT 1`,
  }))[0];
  // O ticket e consumido pela TELA, chamando a SF SQL googleAgendaConsumirTicket logo
  // apos esta chamada: acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.
  if (!dono) throw new Error('Ticket expirado. Atualize a pagina e tente de novo.');

  const userId = Number(dono.USER_ID);
  const config = rows(await runQueryMitra({
    projectId,
    sql: `SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = ${userId} AND STATUS = 'CONFIGURADO' LIMIT 1`,
  }))[0];
  if (!config) return { rows: [], motivo: 'google_nao_configurado' };

  // Sem nada para provisionar: o access_token sai do refresh_token do proprio usuario,
  // pelas integracoes compartilhadas. Por isso a lista responde ja na primeira conexao.
  const token = await acessoGoogle(config);
  const resposta = await googleCalendar('GET', '/users/me/calendarList', token, {
    minAccessRole: 'writer', maxResults: '250', showHidden: 'false',
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
