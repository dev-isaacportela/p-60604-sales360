import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

function isAlreadyExistsError(error) {
  const text = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return text.includes('already exists') || text.includes('duplicate') || text.includes('exists');
}

async function runDdlSafe(sql, label) {
  try {
    await runDdlMitra({ projectId, sql });
    console.log(`${label}: criado`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`${label}: ja existe`);
      return;
    }
    throw error;
  }
}

async function ensureTables() {
  await runDdlSafe(`CREATE TABLE GOOGLE_AGENDA_CONFIG (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    USER_ID INT NOT NULL,
    CLIENT_ID VARCHAR(300) NOT NULL,
    CLIENT_SECRET TEXT NOT NULL,
    REFRESH_TOKEN TEXT NOT NULL,
    CALENDAR_ID VARCHAR(300) DEFAULT 'primary',
    INTEGRATION_SLUG VARCHAR(180),
    STATUS VARCHAR(30) DEFAULT 'CONFIGURADO',
    ULTIMO_ERRO TEXT,
    CONFIGURADO_EM VARCHAR(19),
    ATUALIZADO_EM VARCHAR(19),
    ULTIMA_SYNC VARCHAR(19),
    UNIQUE KEY UX_GOOGLE_AGENDA_USER (USER_ID)
  );`, 'GOOGLE_AGENDA_CONFIG');

  await runDdlSafe(`CREATE TABLE GOOGLE_AGENDA_EVENTOS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    USER_ID INT NOT NULL,
    ENTIDADE VARCHAR(20) NOT NULL,
    ENTIDADE_ID INT NOT NULL,
    GOOGLE_EVENT_ID VARCHAR(300),
    STATUS_SYNC VARCHAR(30) DEFAULT 'PENDENTE',
    ULTIMA_SYNC VARCHAR(19),
    ULTIMO_ERRO TEXT,
    ATUALIZADO_EM VARCHAR(19),
    UNIQUE KEY UX_GOOGLE_AGENDA_EVENTO (USER_ID, ENTIDADE, ENTIDADE_ID)
  );`, 'GOOGLE_AGENDA_EVENTOS');

  await runDdlSafe(`CREATE TABLE GOOGLE_AGENDA_LOGS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    USER_ID INT NOT NULL,
    ENTIDADE VARCHAR(20),
    ENTIDADE_ID INT,
    ACAO VARCHAR(30),
    STATUS VARCHAR(30) NOT NULL,
    MENSAGEM TEXT,
    EXECUTADO_EM VARCHAR(19)
  );`, 'GOOGLE_AGENDA_LOGS');
}

const GOOGLE_AGENDA_STATUS_SQL = `
  SELECT
    CASE WHEN C.ID IS NULL THEN 0 ELSE 1 END AS CONFIGURADO,
    C.CALENDAR_ID,
    C.INTEGRATION_SLUG,
    C.STATUS,
    C.ULTIMO_ERRO,
    C.CONFIGURADO_EM,
    C.ATUALIZADO_EM,
    C.ULTIMA_SYNC,
    CASE
      WHEN C.CLIENT_ID IS NULL THEN ''
      WHEN LENGTH(C.CLIENT_ID) <= 12 THEN C.CLIENT_ID
      ELSE CONCAT(SUBSTRING(C.CLIENT_ID, 1, 8), '...', SUBSTRING(C.CLIENT_ID, LENGTH(C.CLIENT_ID) - 3, 4))
    END AS CLIENT_ID_MASK
  FROM (SELECT :VAR_USER AS USER_ID) U
  LEFT JOIN GOOGLE_AGENDA_CONFIG C ON C.USER_ID = U.USER_ID
  LIMIT 1
`;

const GOOGLE_AGENDA_SALVAR_CONFIG_SQL = `
  INSERT INTO GOOGLE_AGENDA_CONFIG (
    USER_ID,
    CLIENT_ID,
    CLIENT_SECRET,
    REFRESH_TOKEN,
    CALENDAR_ID,
    INTEGRATION_SLUG,
    STATUS,
    ULTIMO_ERRO,
    CONFIGURADO_EM,
    ATUALIZADO_EM
  ) VALUES (
    :VAR_USER,
    '{{clientId}}',
    '{{clientSecret}}',
    '{{refreshToken}}',
    COALESCE(NULLIF('{{calendarId}}', ''), 'primary'),
    NULL,
    'CONFIGURADO',
    NULL,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  )
  ON DUPLICATE KEY UPDATE
    CLIENT_ID = VALUES(CLIENT_ID),
    CLIENT_SECRET = VALUES(CLIENT_SECRET),
    REFRESH_TOKEN = VALUES(REFRESH_TOKEN),
    CALENDAR_ID = VALUES(CALENDAR_ID),
    INTEGRATION_SLUG = NULL,
    STATUS = 'CONFIGURADO',
    ULTIMO_ERRO = NULL,
    ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
`;

const GOOGLE_AGENDA_DESCONECTAR_SQL = `
  UPDATE GOOGLE_AGENDA_CONFIG
  SET STATUS = 'DESCONECTADO',
      ULTIMO_ERRO = NULL,
      ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE USER_ID = :VAR_USER
  LIMIT 1
`;

const GOOGLE_AGENDA_SINCRONIZAR_CODE = `
const {
  callIntegrationMitra,
  createIntegrationMitra,
  runDmlMitra,
  runQueryMitra,
} = require('mitra-sdk');

const projectId = ${projectId};

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

async function log(userId, entidade, entidadeId, acao, status, mensagem) {
  await runDmlMitra({ projectId, sql: \
    \`INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM)
      VALUES (\${Number(userId)}, '\${escapeSql(entidade)}', \${Number(entidadeId || 0)}, '\${escapeSql(acao)}', '\${escapeSql(status)}', '\${escapeSql(mensagem || '')}', '\${now()}')\` });
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

  await runDmlMitra({ projectId, sql: \
    \`UPDATE GOOGLE_AGENDA_CONFIG SET INTEGRATION_SLUG = '\${escapeSql(slug)}', ATUALIZADO_EM = '\${now()}' WHERE USER_ID = \${Number(config.USER_ID)} LIMIT 1\` });
  return slug;
}

function buildVisitEvent(item) {
  const title = 'Visita: ' + (item.CLIENTE || ('Cliente ' + item.CLIENTE_ID));
  const description = [
    'Tipo: ' + (item.TIPO || '-'),
    item.CIDADE ? ('Cidade: ' + item.CIDADE) : '',
    item.ENDERECO ? ('Endereco: ' + item.ENDERECO) : '',
    item.RELATO ? ('Relato: ' + item.RELATO) : '',
    '',
    'Fonte: Comercial Externo 360',
  ].filter(Boolean).join('\\n');
  return {
    summary: title,
    description,
    start: { dateTime: item.DATA_AGENDADA + 'T' + (item.HORA_INICIO || '08:00') + ':00', timeZone: 'America/Sao_Paulo' },
    end: { dateTime: item.DATA_AGENDADA + 'T' + (item.HORA_FIM || item.HORA_INICIO || '09:00') + ':00', timeZone: 'America/Sao_Paulo' },
  };
}

function buildTaskEvent(item) {
  return {
    summary: 'Lembrete: ' + (item.TITULO || ('Atividade ' + item.ID)),
    description: [
      item.DESCRICAO || '',
      item.PRIORIDADE ? ('Prioridade: ' + item.PRIORIDADE) : '',
      item.CLIENTE ? ('Cliente: ' + item.CLIENTE) : '',
      '',
      'Fonte: Comercial Externo 360',
    ].filter(Boolean).join('\\n'),
    start: { dateTime: item.DATA_LIMITE + 'T09:00:00', timeZone: 'America/Sao_Paulo' },
    end: { dateTime: item.DATA_LIMITE + 'T09:15:00', timeZone: 'America/Sao_Paulo' },
  };
}

async function loadItem(entidade, entidadeId) {
  if (entidade === 'VISITA') {
    const result = await runQueryMitra({ projectId, sql: \
      \`SELECT V.ID, V.CLIENTE_ID, V.VENDEDOR_ID AS USER_ID, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM, V.TIPO, V.STATUS, V.RELATO, C.NOME_FANTASIA AS CLIENTE, C.CIDADE, C.ENDERECO
        FROM VISITAS V JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
        WHERE V.ID = \${Number(entidadeId)} LIMIT 1\` });
    return rows(result)[0] || null;
  }

  const result = await runQueryMitra({ projectId, sql: \
    \`SELECT T.ID, T.VENDEDOR_ID AS USER_ID, T.TITULO, T.DESCRICAO, T.STATUS, T.PRIORIDADE, T.DATA_LIMITE, C.NOME_FANTASIA AS CLIENTE
      FROM TAREFAS T LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
      WHERE T.ID = \${Number(entidadeId)} LIMIT 1\` });
  return rows(result)[0] || null;
}

async function loadConfig(userId) {
  const result = await runQueryMitra({ projectId, sql: \
    \`SELECT * FROM GOOGLE_AGENDA_CONFIG WHERE USER_ID = \${Number(userId)} AND STATUS = 'CONFIGURADO' LIMIT 1\` });
  return rows(result)[0] || null;
}

async function loadMapping(userId, entidade, entidadeId) {
  const result = await runQueryMitra({ projectId, sql: \
    \`SELECT * FROM GOOGLE_AGENDA_EVENTOS WHERE USER_ID = \${Number(userId)} AND ENTIDADE = '\${escapeSql(entidade)}' AND ENTIDADE_ID = \${Number(entidadeId)} LIMIT 1\` });
  return rows(result)[0] || null;
}

async function saveMapping(userId, entidade, entidadeId, googleEventId, status, error) {
  await runDmlMitra({ projectId, sql: \
    \`INSERT INTO GOOGLE_AGENDA_EVENTOS (USER_ID, ENTIDADE, ENTIDADE_ID, GOOGLE_EVENT_ID, STATUS_SYNC, ULTIMA_SYNC, ULTIMO_ERRO, ATUALIZADO_EM)
      VALUES (\${Number(userId)}, '\${escapeSql(entidade)}', \${Number(entidadeId)}, '\${escapeSql(googleEventId || '')}', '\${escapeSql(status)}', '\${now()}', '\${escapeSql(error || '')}', '\${now()}')
      ON DUPLICATE KEY UPDATE GOOGLE_EVENT_ID = VALUES(GOOGLE_EVENT_ID), STATUS_SYNC = VALUES(STATUS_SYNC), ULTIMA_SYNC = VALUES(ULTIMA_SYNC), ULTIMO_ERRO = VALUES(ULTIMO_ERRO), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)\` });
}

async function sync() {
  const entidade = String(event.entidade || '').toUpperCase();
  const entidadeId = Number(event.entidadeId || 0);
  if (!['VISITA', 'TAREFA'].includes(entidade) || !entidadeId) return { skipped: true, reason: 'input_invalido' };

  const item = await loadItem(entidade, entidadeId);
  if (!item) return { skipped: true, reason: 'item_nao_encontrado' };
  if (entidade === 'TAREFA' && !item.DATA_LIMITE) return { skipped: true, reason: 'tarefa_sem_prazo' };

  const userId = Number(item.USER_ID);
  const config = await loadConfig(userId);
  if (!config) {
    await log(userId, entidade, entidadeId, 'SYNC', 'IGNORADO', 'Google Agenda nao configurado para o usuario.');
    return { skipped: true, reason: 'google_nao_configurado' };
  }

  const slug = await ensureIntegration(config);
  const calendarId = encodeURIComponent(config.CALENDAR_ID || 'primary');
  const mapping = await loadMapping(userId, entidade, entidadeId);
  const isCancelled = entidade === 'VISITA' && String(item.STATUS || '').toUpperCase() === 'CANCELADA';

  try {
    if (isCancelled && mapping?.GOOGLE_EVENT_ID) {
      await callIntegrationMitra({ projectId, connection: slug, method: 'DELETE', endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(mapping.GOOGLE_EVENT_ID) });
      await saveMapping(userId, entidade, entidadeId, mapping.GOOGLE_EVENT_ID, 'CANCELADO', '');
      await log(userId, entidade, entidadeId, 'DELETE', 'SUCESSO', 'Evento cancelado no Google Agenda.');
      return { synced: true, action: 'delete', googleEventId: mapping.GOOGLE_EVENT_ID };
    }

    if (isCancelled) {
      await log(userId, entidade, entidadeId, 'DELETE', 'IGNORADO', 'Visita cancelada sem evento Google vinculado.');
      return { skipped: true, reason: 'cancelada_sem_evento' };
    }

    const body = entidade === 'VISITA' ? buildVisitEvent(item) : buildTaskEvent(item);
    const existingId = mapping?.GOOGLE_EVENT_ID || '';
    const response = existingId
      ? await callIntegrationMitra({ projectId, connection: slug, method: 'PATCH', endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), body })
      : await callIntegrationMitra({ projectId, connection: slug, method: 'POST', endpoint: '/calendars/' + calendarId + '/events', body });

    const googleEventId = response?.body?.id || response?.result?.body?.id || response?.id || existingId;
    if (!googleEventId) throw new Error('Google nao retornou ID do evento.');

    await saveMapping(userId, entidade, entidadeId, googleEventId, 'SINCRONIZADO', '');
    await runDmlMitra({ projectId, sql: \`UPDATE GOOGLE_AGENDA_CONFIG SET ULTIMA_SYNC = '\${now()}', ULTIMO_ERRO = NULL WHERE USER_ID = \${userId} LIMIT 1\` });
    await log(userId, entidade, entidadeId, existingId ? 'PATCH' : 'POST', 'SUCESSO', 'Evento sincronizado no Google Agenda.');
    return { synced: true, action: existingId ? 'patch' : 'post', googleEventId };
  } catch (error) {
    const message = String(error?.message || error || 'Falha ao sincronizar Google Agenda.');
    await saveMapping(userId, entidade, entidadeId, mapping?.GOOGLE_EVENT_ID || '', 'ERRO', message);
    await runDmlMitra({ projectId, sql: \`UPDATE GOOGLE_AGENDA_CONFIG SET ULTIMO_ERRO = '\${escapeSql(message)}' WHERE USER_ID = \${userId} LIMIT 1\` });
    await log(userId, entidade, entidadeId, 'SYNC', 'ERRO', message);
    throw error;
  }
}

return await sync();
`;

async function upsertServerFunction(name, payload) {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === name);
  if (found) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, ...payload });
    console.log(`SF atualizada: ${name} (${found.id})`);
    return found.id;
  }
  const created = await createServerFunctionMitra({ projectId, name, ...payload });
  const id = extractSfId(created);
  if (!id) throw new Error(`Nao foi possivel obter ID da SF ${name}`);
  console.log(`SF criada: ${name} (${id})`);
  return id;
}

async function smoke(ids) {
  const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids.googleAgendaStatus, input: {} });
  const status = String(result?.result?.executionStatus || '');
  const error = String(result?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Smoke falhou: ${status}`);
  console.log(`googleAgendaStatus: smoke OK (${extractRows(result).length} linha(s))`);
}

async function main() {
  await ensureTables();
  const ids = {};
  ids.googleAgendaStatus = await upsertServerFunction('googleAgendaStatus', {
    type: 'SQL',
    code: GOOGLE_AGENDA_STATUS_SQL,
    description: 'Retorna status da configuracao individual do Google Agenda para o usuario logado.',
  });
  ids.googleAgendaSalvarConfig = await upsertServerFunction('googleAgendaSalvarConfig', {
    type: 'SQL',
    code: GOOGLE_AGENDA_SALVAR_CONFIG_SQL,
    description: 'Salva credenciais OAuth individuais do Google Agenda para o usuario logado.',
  });
  ids.googleAgendaDesconectar = await upsertServerFunction('googleAgendaDesconectar', {
    type: 'SQL',
    code: GOOGLE_AGENDA_DESCONECTAR_SQL,
    description: 'Marca a configuracao individual do Google Agenda como desconectada.',
  });
  ids.googleAgendaSincronizarItem = await upsertServerFunction('googleAgendaSincronizarItem', {
    type: 'JAVASCRIPT',
    code: GOOGLE_AGENDA_SINCRONIZAR_CODE,
    description: 'Sincroniza uma visita ou tarefa da Mitra para o Google Agenda individual do usuario dono.',
  });
  await smoke(ids);
  console.log('Google Agenda por usuario configurado. IDs:');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Google Agenda por usuario:');
  console.error(error?.message || error);
  process.exit(1);
});
