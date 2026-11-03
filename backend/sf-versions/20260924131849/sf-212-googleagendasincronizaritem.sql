/**
 * SF 212 - googleAgendaSincronizarItem
 *
 * Sincroniza um item da agenda para o Google Agenda de cada usuario envolvido.
 * Entidades suportadas:
 *   VISITA     -> VISITAS (dono: VENDEDOR_ID)
 *   TAREFA     -> TAREFAS (dono: VENDEDOR_ID)
 *   PROSPECCAO -> PROSPECT_VISITAS (dono: EXECUTIVO_ID)
 *   INTERNA    -> AGENDA_INTERNA (criador + participantes; cobre TIPO 'Deslocamento')
 *
 * Este arquivo e a fonte da SF. Aplicar com: node update-sf212-agenda-completa.mjs
 */
const {
  callIntegrationMitra,
  runQueryMitra,
} = require('mitra-sdk');

const projectId = 45654;
const TIMEZONE = 'America/Sao_Paulo';

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

function query(sql) {
  return runQueryMitra({ projectId, sql });
}

// ---------------------------------------------------------------- gravacoes pendentes
// Esta SF NAO grava: acesso BUSINESS nao escreve no banco de dentro de SF JAVASCRIPT.
// Tudo que precisaria ser gravado e acumulado aqui e devolvido em "gravacoes". Quem persiste
// e a TELA (SFs SQL, instantaneo) ou o worker em cron (Administrator, rede de seguranca).
const gravacoes = [];

/** Texto que vai virar literal em SQL do outro lado: sem aspas, barras ou quebras. */
function limpo(texto, limite) {
  return String(texto == null ? '' : texto)
    .replace(/['"\\\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite || 300);
}

function log(userId, entidade, entidadeId, acao, status, mensagem) {
  gravacoes.push({
    tipo: 'log',
    userId: Number(userId) || 0,
    entidade: limpo(entidade, 20),
    entidadeId: Number(entidadeId) || 0,
    acao: limpo(acao, 20),
    status: limpo(status, 20),
    mensagem: limpo(mensagem, 300),
  });
}

function saveMapping(userId, entidade, entidadeId, googleEventId, status, erro) {
  gravacoes.push({
    tipo: 'vinculo',
    userId: Number(userId) || 0,
    entidade: limpo(entidade, 20),
    entidadeId: Number(entidadeId) || 0,
    googleEventId: limpo(googleEventId, 200),
    statusSync: limpo(status, 20),
    erro: limpo(erro, 300),
  });
}

function marcarConfig(userId, erro) {
  gravacoes.push({ tipo: 'config', userId: Number(userId) || 0, erro: limpo(erro, 300) });
}
async function loadConfig(userId) {
  const result = await query(`SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = ${Number(userId)} AND STATUS = 'CONFIGURADO' LIMIT 1`);
  return rows(result)[0] || null;
}


function horaOuPadrao(valor, padrao) {
  const texto = String(valor || '').trim();
  return /^\d{2}:\d{2}$/.test(texto) ? texto : padrao;
}

function periodo(data, horaInicio, horaFim, padraoInicio, padraoFim) {
  const inicio = horaOuPadrao(horaInicio, padraoInicio);
  let fim = horaOuPadrao(horaFim, padraoFim);
  if (fim <= inicio) {
    // Evita evento de duracao zero ou negativa, que o Google recusa.
    const [h, m] = inicio.split(':').map(Number);
    const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
    fim = String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  return {
    start: { dateTime: data + 'T' + inicio + ':00', timeZone: TIMEZONE },
    end: { dateTime: data + 'T' + fim + ':00', timeZone: TIMEZONE },
  };
}

const RODAPE = 'Fonte: Comercial Externo 360';

function descricao(linhas) {
  return linhas.filter(Boolean).concat(['', RODAPE]).join('\n');
}

function buildVisitEvent(item) {
  return Object.assign({
    summary: 'Visita: ' + (item.CLIENTE || ('Cliente ' + item.CLIENTE_ID)),
    description: descricao([
      'Tipo: ' + (item.TIPO || '-'),
      item.CIDADE ? 'Cidade: ' + item.CIDADE : '',
      item.ENDERECO ? 'Endereço: ' + item.ENDERECO : '',
      item.RELATO ? 'Relato: ' + item.RELATO : '',
    ]),
    location: [item.ENDERECO, item.CIDADE].filter(Boolean).join(' - ') || undefined,
  }, periodo(item.DATA_AGENDADA, item.HORA_INICIO, item.HORA_FIM, '08:00', '09:00'));
}

function buildTaskEvent(item) {
  return Object.assign({
    summary: 'Lembrete: ' + (item.TITULO || ('Atividade ' + item.ID)),
    description: descricao([
      item.DESCRICAO || '',
      item.PRIORIDADE ? 'Prioridade: ' + item.PRIORIDADE : '',
      item.CLIENTE ? 'Cliente: ' + item.CLIENTE : '',
    ]),
  }, periodo(item.DATA_LIMITE, '09:00', '09:15', '09:00', '09:15'));
}

function buildProspectEvent(item) {
  const nome = item.PROSPECT || ('Prospect ' + item.PROSPECT_ID);
  const local = [item.ENDERECO, item.CIDADE, item.UF].filter(Boolean).join(' - ');
  return Object.assign({
    summary: 'Prospecção: ' + nome,
    description: descricao([
      'Objetivo: ' + (item.OBJETIVO || '-'),
      local ? 'Local: ' + local : '',
      item.RESUMO ? 'Resumo: ' + item.RESUMO : '',
      item.PROXIMO_PASSO ? 'Próximo passo: ' + item.PROXIMO_PASSO : '',
    ]),
    location: local || undefined,
  }, periodo(item.DATA_VISITA, item.HORA_INICIO, item.HORA_FIM, '09:00', '10:00'));
}

function buildInternaEvent(item, participantes) {
  const ehDeslocamento = String(item.TIPO || '').toUpperCase().indexOf('DESLOCAMENTO') >= 0;
  const trajeto = [item.ORIGEM_DESLOCAMENTO, item.DESTINO_DESLOCAMENTO].filter(Boolean).join(' -> ');
  const titulo = ehDeslocamento
    ? 'Deslocamento: ' + (trajeto || item.TITULO || 'sem trajeto')
    : (item.TITULO || 'Compromisso interno');

  return Object.assign({
    summary: titulo,
    description: descricao([
      'Tipo: ' + (item.TIPO || '-'),
      item.DESCRICAO ? item.DESCRICAO : '',
      ehDeslocamento && trajeto ? 'Trajeto: ' + trajeto : '',
      participantes && participantes.length ? 'Participantes: ' + participantes.join(', ') : '',
    ]),
    location: ehDeslocamento ? (item.DESTINO_DESLOCAMENTO || undefined) : undefined,
  }, periodo(item.DATA_AGENDADA, item.HORA_INICIO, item.HORA_FIM, '08:00', '09:00'));
}

/**
 * Carrega o item e devolve, junto, quem deve receber o evento.
 * Compromisso interno vai para o criador E para cada participante convidado.
 */
async function loadItem(entidade, entidadeId) {
  const id = Number(entidadeId);

  if (entidade === 'VISITA') {
    const item = rows(await query(`SELECT V.ID, V.CLIENTE_ID, V.VENDEDOR_ID, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM,
        V.TIPO, V.STATUS, V.RELATO, C.NOME_FANTASIA AS CLIENTE, C.CIDADE, C.ENDERECO
      FROM VISITAS V JOIN CLIENTES C ON C.ID = V.CLIENTE_ID WHERE V.ID = ${id} LIMIT 1`))[0];
    if (!item) return null;
    return { item, usuarios: [Number(item.VENDEDOR_ID)], cancelado: String(item.STATUS || '').toUpperCase() === 'CANCELADA', build: () => buildVisitEvent(item) };
  }

  if (entidade === 'TAREFA') {
    const item = rows(await query(`SELECT T.ID, T.VENDEDOR_ID, T.TITULO, T.DESCRICAO, T.STATUS, T.PRIORIDADE, T.DATA_LIMITE,
        C.NOME_FANTASIA AS CLIENTE
      FROM TAREFAS T LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID WHERE T.ID = ${id} LIMIT 1`))[0];
    if (!item) return null;
    if (!item.DATA_LIMITE) return { semPrazo: true };
    return { item, usuarios: [Number(item.VENDEDOR_ID)], cancelado: false, build: () => buildTaskEvent(item) };
  }

  if (entidade === 'PROSPECCAO') {
    const item = rows(await query(`SELECT PV.ID, PV.PROSPECT_ID, PV.EXECUTIVO_ID, PV.DATA_VISITA, PV.HORA_INICIO, PV.HORA_FIM,
        PV.OBJETIVO, PV.STATUS, PV.RESUMO, PV.PROXIMO_PASSO,
        COALESCE(NULLIF(P.NOME_FANTASIA, ''), P.RAZAO_SOCIAL) AS PROSPECT, P.CIDADE, P.UF, P.ENDERECO
      FROM PROSPECT_VISITAS PV LEFT JOIN PROSPECTS P ON P.ID = PV.PROSPECT_ID WHERE PV.ID = ${id} LIMIT 1`))[0];
    if (!item) return null;
    return { item, usuarios: [Number(item.EXECUTIVO_ID)], cancelado: String(item.STATUS || '').toUpperCase() === 'CANCELADA', build: () => buildProspectEvent(item) };
  }

  if (entidade === 'INTERNA') {
    const item = rows(await query(`SELECT ID, TITULO, DESCRICAO, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, STATUS,
        CRIADOR_ID, ORIGEM_DESLOCAMENTO, DESTINO_DESLOCAMENTO
      FROM AGENDA_INTERNA WHERE ID = ${id} LIMIT 1`))[0];
    if (!item) return null;

    const convidados = rows(await query(`SELECT AP.VENDEDOR_ID, U.DESCR AS EMAIL
      FROM AGENDA_INTERNA_PARTICIPANTES AP LEFT JOIN INT_USER U ON U.ID = AP.VENDEDOR_ID
      WHERE AP.AGENDA_ID = ${id}`));

    const usuarios = [Number(item.CRIADOR_ID)];
    convidados.forEach((linha) => {
      const uid = Number(linha.VENDEDOR_ID);
      if (uid && usuarios.indexOf(uid) === -1) usuarios.push(uid);
    });
    const nomes = convidados.map((linha) => String(linha.EMAIL || '').split('@')[0]).filter(Boolean);

    return { item, usuarios, cancelado: String(item.STATUS || '').toUpperCase() === 'CANCELADA', build: () => buildInternaEvent(item, nomes) };
  }

  return null;
}

async function loadMapping(userId, entidade, entidadeId) {
  const result = await query(`SELECT * FROM GOOGLE_AGENDA_EVENTOS WHERE USER_ID = ${Number(userId)} AND ENTIDADE = '${escapeSql(entidade)}' AND ENTIDADE_ID = ${Number(entidadeId)} LIMIT 1`);
  return rows(result)[0] || null;
}


function extrairEventId(resposta, idAtual) {
  const bruta = resposta?.result?.output ?? resposta?.result ?? resposta;
  let corpo = bruta?.body ?? bruta;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (erroParse) { /* mantem como string */ }
  }
  const eventId = corpo?.id || bruta?.id || resposta?.body?.id || idAtual;
  if (eventId) return eventId;

  const statusCode = bruta?.statusCode ?? bruta?.status ?? resposta?.statusCode ?? 0;
  const detalhe = corpo?.error?.message || corpo?.error_description || corpo?.error || '';
  const amostra = JSON.stringify(bruta || {}).slice(0, 400);
  throw new Error('Google nao criou o evento (HTTP ' + statusCode + '). '
    + (detalhe ? String(detalhe) + ' | ' : '') + 'Resposta: ' + amostra);
}

async function removerEvento(token, calendarId, eventId) {
  await googleCalendar('DELETE', '/calendars/' + calendarId + '/events/' + encodeURIComponent(eventId), token);
}

/** Sincroniza o item para UM usuario. */
async function sincronizarParaUsuario(userId, entidade, entidadeId, cancelado, montarEvento) {
  const config = await loadConfig(userId);
  if (!config) {
    return { userId, skipped: true, reason: 'google_nao_configurado' };
  }

  const token = await acessoGoogle(config);
  const calendarId = encodeURIComponent(config.CALENDAR_ID || 'primary');
  const mapping = await loadMapping(userId, entidade, entidadeId);

  try {
    if (cancelado) {
      if (!mapping?.GOOGLE_EVENT_ID) {
        return { userId, skipped: true, reason: 'cancelado_sem_evento' };
      }
      await removerEvento(token, calendarId, mapping.GOOGLE_EVENT_ID);
      await saveMapping(userId, entidade, entidadeId, '', 'CANCELADO', '');
      await log(userId, entidade, entidadeId, 'DELETE', 'SUCESSO', 'Evento removido do Google Agenda.');
      return { userId, synced: true, action: 'delete' };
    }

    const body = montarEvento();
    const existingId = mapping?.GOOGLE_EVENT_ID || '';
    const resposta = existingId
      // PUT, nao PATCH: PATCH nao funciona no motor de integracao (devolve na hora um
      // 'Read timed out after 300s' enlatado). PUT substitui o evento inteiro, o que serve
      // porque o sistema e dono do evento e sempre monta o corpo completo.
      ? await googleCalendar('PUT', '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), token, null, body)
      : await googleCalendar('POST', '/calendars/' + calendarId + '/events', token, null, body);

    const googleEventId = extrairEventId(resposta, existingId);
    await saveMapping(userId, entidade, entidadeId, googleEventId, 'SINCRONIZADO', '');
    marcarConfig(userId, '');
    await log(userId, entidade, entidadeId, existingId ? 'PUT' : 'POST', 'SUCESSO', 'Evento sincronizado no Google Agenda.');
    return { userId, synced: true, action: existingId ? 'put' : 'post', googleEventId };
  } catch (erro) {
    const mensagem = String(erro?.message || erro || 'Falha ao sincronizar Google Agenda.');
    await saveMapping(userId, entidade, entidadeId, mapping?.GOOGLE_EVENT_ID || '', 'ERRO', mensagem);
    marcarConfig(userId, mensagem);
    await log(userId, entidade, entidadeId, 'SYNC', 'ERRO', mensagem);
    return { userId, erro: mensagem };
  }
}

/**
 * Quem ja tem evento deste item mas nao esta mais na lista de envolvidos
 * (ex.: participante removido da reuniao) tem o evento apagado da agenda dele.
 */
async function removerDesvinculados(entidade, entidadeId, usuariosAtuais) {
  const anteriores = rows(await query(`SELECT USER_ID, GOOGLE_EVENT_ID FROM GOOGLE_AGENDA_EVENTOS
    WHERE ENTIDADE = '${escapeSql(entidade)}' AND ENTIDADE_ID = ${Number(entidadeId)}
      AND GOOGLE_EVENT_ID IS NOT NULL AND GOOGLE_EVENT_ID <> ''`));

  const removidos = [];
  for (const linha of anteriores) {
    const uid = Number(linha.USER_ID);
    if (usuariosAtuais.indexOf(uid) !== -1) continue;
    const config = await loadConfig(uid);
    if (!config) continue;
    try {
      const token = await acessoGoogle(config);
      await removerEvento(token, encodeURIComponent(config.CALENDAR_ID || 'primary'), linha.GOOGLE_EVENT_ID);
      await saveMapping(uid, entidade, entidadeId, '', 'CANCELADO', '');
      await log(uid, entidade, entidadeId, 'DELETE', 'SUCESSO', 'Usuario deixou de participar; evento removido.');
      removidos.push(uid);
    } catch (erro) {
      await log(uid, entidade, entidadeId, 'DELETE', 'ERRO', String(erro?.message || erro));
    }
  }
  return removidos;
}

async function sync() {
  const entidade = String(event.entidade || '').toUpperCase();
  const entidadeId = Number(event.entidadeId || 0);
  const suportadas = ['VISITA', 'TAREFA', 'PROSPECCAO', 'INTERNA'];
  if (suportadas.indexOf(entidade) === -1 || !entidadeId) {
    return { rows: [{ skipped: true, reason: 'input_invalido', gravacoes: [] }] };
  }

  const carga = await loadItem(entidade, entidadeId);
  if (!carga) return { rows: [{ skipped: true, reason: 'item_nao_encontrado', gravacoes: [] }] };
  if (carga.semPrazo) return { rows: [{ skipped: true, reason: 'tarefa_sem_prazo', gravacoes: [] }] };

  const usuarios = carga.usuarios.filter((uid) => Number(uid) > 0);
  if (!usuarios.length) return { rows: [{ skipped: true, reason: 'sem_usuario_responsavel', gravacoes: [] }] };

  const resultados = [];
  for (const userId of usuarios) {
    resultados.push(await sincronizarParaUsuario(userId, entidade, entidadeId, carga.cancelado, carga.build));
  }

  const removidos = carga.cancelado ? [] : await removerDesvinculados(entidade, entidadeId, usuarios);

  const comErro = resultados.filter((r) => r.erro);
  if (comErro.length && comErro.length === resultados.length) {
    throw new Error(comErro[0].erro);
  }

  // Em "rows": e o unico formato que a camada de dados da tela (extractRowsFromOutput)
  // reconhece. O worker em cron le do mesmo lugar.
  return {
    rows: [{
      gravacoes,
      entidade,
      entidadeId,
      sincronizados: resultados.filter((r) => r.synced).length,
      ignorados: resultados.filter((r) => r.skipped).length,
      falhas: comErro.length,
      removidos: removidos.length,
      detalhes: resultados,
    }],
  };
}

return await sync();
