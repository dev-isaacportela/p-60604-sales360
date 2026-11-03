import 'dotenv/config';
import {
  configureSdkMitra,
  createIntegrationMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listIntegrationsMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runDmlMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TOKEN_INTEGRATION_SLUG = 'google-oauth-token';

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
  // Credencial OAuth do aplicativo (uma unica linha, nivel empresa). Nunca vai para o frontend.
  await runDdlSafe(`CREATE TABLE GOOGLE_OAUTH_APP (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CLIENT_ID VARCHAR(300) NOT NULL,
    CLIENT_SECRET TEXT NOT NULL,
    REDIRECT_URI VARCHAR(400) NOT NULL,
    ATUALIZADO_EM VARCHAR(19)
  );`, 'GOOGLE_OAUTH_APP');

  // Ponte temporaria entre a troca do codigo (SF JS, sem identidade) e o vinculo ao usuario (SF SQL, com :VAR_USER).
  await runDdlSafe(`CREATE TABLE GOOGLE_OAUTH_PENDENTE (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    STATE VARCHAR(160) NOT NULL,
    REFRESH_TOKEN TEXT,
    EMAIL_GOOGLE VARCHAR(300),
    CRIADO_EM VARCHAR(19),
    UNIQUE KEY UX_GOOGLE_OAUTH_PENDENTE (STATE)
  );`, 'GOOGLE_OAUTH_PENDENTE');

  // Aditivo: mostra na tela qual conta Google foi conectada.
  await runDdlSafe(
    'ALTER TABLE GOOGLE_AGENDA_CONFIG ADD COLUMN EMAIL_GOOGLE VARCHAR(300);',
    'GOOGLE_AGENDA_CONFIG.EMAIL_GOOGLE'
  );
}

const GOOGLE_OAUTH_APP_CONFIG_SQL = `
  SELECT CLIENT_ID, REDIRECT_URI
  FROM GOOGLE_OAUTH_APP
  ORDER BY ID DESC
  LIMIT 1
`;

const GOOGLE_AGENDA_STATUS_SQL = `
  SELECT
    CASE WHEN C.ID IS NULL THEN 0 ELSE 1 END AS CONFIGURADO,
    C.CALENDAR_ID,
    C.INTEGRATION_SLUG,
    C.STATUS,
    C.EMAIL_GOOGLE,
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

const GOOGLE_AGENDA_CONFIRMAR_SQL = `
  INSERT INTO GOOGLE_AGENDA_CONFIG (
    USER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, CALENDAR_ID,
    INTEGRATION_SLUG, STATUS, ULTIMO_ERRO, EMAIL_GOOGLE, CONFIGURADO_EM, ATUALIZADO_EM
  )
  SELECT
    :VAR_USER,
    A.CLIENT_ID,
    A.CLIENT_SECRET,
    P.REFRESH_TOKEN,
    COALESCE(NULLIF('{{calendarId}}', ''), 'primary'),
    NULL,
    'CONFIGURADO',
    NULL,
    P.EMAIL_GOOGLE,
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM GOOGLE_OAUTH_PENDENTE P
  CROSS JOIN (SELECT CLIENT_ID, CLIENT_SECRET FROM GOOGLE_OAUTH_APP ORDER BY ID DESC LIMIT 1) A
  WHERE P.STATE = '{{state}}'
    AND P.REFRESH_TOKEN IS NOT NULL
    AND P.REFRESH_TOKEN <> ''
    AND REPLACE(P.CRIADO_EM, 'T', ' ') >= SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 1, 19)
  ON DUPLICATE KEY UPDATE
    CLIENT_ID = VALUES(CLIENT_ID),
    CLIENT_SECRET = VALUES(CLIENT_SECRET),
    REFRESH_TOKEN = VALUES(REFRESH_TOKEN),
    CALENDAR_ID = VALUES(CALENDAR_ID),
    INTEGRATION_SLUG = NULL,
    STATUS = 'CONFIGURADO',
    ULTIMO_ERRO = NULL,
    EMAIL_GOOGLE = VALUES(EMAIL_GOOGLE),
    ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
`;

const GOOGLE_AGENDA_ATUALIZAR_CALENDARIO_SQL = `
  UPDATE GOOGLE_AGENDA_CONFIG
  SET CALENDAR_ID = COALESCE(NULLIF('{{calendarId}}', ''), 'primary'),
      ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE USER_ID = :VAR_USER
  LIMIT 1
`;

const GOOGLE_OAUTH_DESCARTAR_PENDENTE_SQL = `
  DELETE FROM GOOGLE_OAUTH_PENDENTE
  WHERE STATE = '{{state}}'
     OR REPLACE(CRIADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 1, 19)
`;

const GOOGLE_AGENDA_TROCAR_CODIGO_CODE = `
const { callIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

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

function emailDoIdToken(idToken) {
  try {
    const payload = String(idToken || '').split('.')[1];
    if (!payload) return '';
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return String(JSON.parse(json).email || '');
  } catch (erro) {
    return '';
  }
}

async function trocarCodigo() {
  const code = String(event.code || '').trim();
  const state = String(event.state || '').trim();
  if (!code) throw new Error('Codigo de autorizacao ausente.');
  if (state.length < 20) throw new Error('State de seguranca invalido.');

  await runDmlMitra({ projectId, sql: "DELETE FROM GOOGLE_OAUTH_PENDENTE WHERE REPLACE(CRIADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 1, 19)" });

  const app = rows(await runQueryMitra({
    projectId,
    sql: 'SELECT CLIENT_ID, CLIENT_SECRET, REDIRECT_URI FROM GOOGLE_OAUTH_APP ORDER BY ID DESC LIMIT 1',
  }))[0];
  if (!app || !app.CLIENT_ID) {
    throw new Error('Credencial OAuth do aplicativo nao cadastrada. Fale com o TI.');
  }

  const resposta = await callIntegrationMitra({
    projectId,
    connection: '${TOKEN_INTEGRATION_SLUG}',
    integrationSlug: '${TOKEN_INTEGRATION_SLUG}',
    method: 'POST',
    endpoint: '/token',
    body: {
      code,
      client_id: app.CLIENT_ID,
      client_secret: app.CLIENT_SECRET,
      redirect_uri: app.REDIRECT_URI,
      grant_type: 'authorization_code',
    },
  });

  const body = resposta?.body || resposta?.result?.body || resposta || {};
  if (body.error) {
    throw new Error('O Google recusou a autorizacao: ' + (body.error_description || body.error));
  }

  const refreshToken = body.refresh_token || '';
  if (!refreshToken) {
    throw new Error('O Google nao devolveu o refresh token. Remova o acesso em myaccount.google.com/permissions e conecte novamente.');
  }

  const emailGoogle = emailDoIdToken(body.id_token);

  await runDmlMitra({ projectId, sql: \`INSERT INTO GOOGLE_OAUTH_PENDENTE (STATE, REFRESH_TOKEN, EMAIL_GOOGLE, CRIADO_EM)
    VALUES ('\${escapeSql(state)}', '\${escapeSql(refreshToken)}', '\${escapeSql(emailGoogle)}', '\${now()}')
    ON DUPLICATE KEY UPDATE REFRESH_TOKEN = VALUES(REFRESH_TOKEN), EMAIL_GOOGLE = VALUES(EMAIL_GOOGLE), CRIADO_EM = VALUES(CRIADO_EM)\` });

  return { ok: true, emailGoogle };
}

return await trocarCodigo();
`;

async function ensureTokenIntegration() {
  const existentes = await listIntegrationsMitra({ projectId });
  const lista = existentes?.result || existentes || [];
  const jaExiste = Array.isArray(lista) && lista.some((item) => item?.slug === TOKEN_INTEGRATION_SLUG);
  if (jaExiste) {
    console.log(`Integracao ${TOKEN_INTEGRATION_SLUG}: ja existe`);
    return;
  }

  await createIntegrationMitra({
    projectId,
    name: 'Google OAuth - Troca de codigo',
    slug: TOKEN_INTEGRATION_SLUG,
    blueprintId: null,
    blueprintType: 'HTTP_REQUEST',
    authType: 'STATIC_KEY',
    // O endpoint /token do Google autentica pelo proprio corpo da requisicao
    // (client_id + client_secret), entao nao ha credencial no header.
    credentials: { base_url: 'https://oauth2.googleapis.com', api_key: 'nao-utilizado' },
    authorizationConfig: {
      type: 'header',
      config: { name: 'X-Mitra-Origin', value: '{{api_key}}' },
    },
  });
  console.log(`Integracao ${TOKEN_INTEGRATION_SLUG}: criada`);
}

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

async function gravarCredencialApp() {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();

  if (!clientId || !clientSecret || !redirectUri) {
    console.log('Credencial do aplicativo nao informada (GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI). Tabela criada vazia.');
    return;
  }

  const esc = (valor) => String(valor).replace(/'/g, "''");
  await runDmlMitra({ projectId, sql: `DELETE FROM GOOGLE_OAUTH_APP` });
  await runDmlMitra({
    projectId,
    sql: `INSERT INTO GOOGLE_OAUTH_APP (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, ATUALIZADO_EM)
          VALUES ('${esc(clientId)}', '${esc(clientSecret)}', '${esc(redirectUri)}', SUBSTRING(CURRENT_TIMESTAMP, 1, 19))`,
  });
  console.log('Credencial OAuth do aplicativo gravada.');
}

async function smoke(ids) {
  for (const [nome, serverFunctionId] of [
    ['googleOAuthAppConfig', ids.googleOAuthAppConfig],
    ['googleAgendaStatus', ids.googleAgendaStatus],
  ]) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId, input: {} });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${nome}: ${error || status}`);
    console.log(`${nome}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  await ensureTables();
  await ensureTokenIntegration();

  const ids = {};
  ids.googleOAuthAppConfig = await upsertServerFunction('googleOAuthAppConfig', {
    type: 'SQL',
    code: GOOGLE_OAUTH_APP_CONFIG_SQL,
    description: 'Retorna Client ID publico e redirect URI do OAuth do aplicativo para montar a URL de consentimento. Nunca retorna o secret.',
  });
  ids.googleAgendaTrocarCodigo = await upsertServerFunction('googleAgendaTrocarCodigo', {
    type: 'JAVASCRIPT',
    code: GOOGLE_AGENDA_TROCAR_CODIGO_CODE,
    description: 'Troca o codigo de autorizacao do Google pelo refresh token e guarda na ponte temporaria indexada pelo state.',
  });
  ids.googleAgendaConfirmarConexao = await upsertServerFunction('googleAgendaConfirmarConexao', {
    type: 'SQL',
    code: GOOGLE_AGENDA_CONFIRMAR_SQL,
    description: 'Vincula o refresh token pendente ao usuario logado (:VAR_USER) em GOOGLE_AGENDA_CONFIG.',
  });
  ids.googleOAuthDescartarPendente = await upsertServerFunction('googleOAuthDescartarPendente', {
    type: 'SQL',
    code: GOOGLE_OAUTH_DESCARTAR_PENDENTE_SQL,
    description: 'Remove a ponte temporaria do state usado e as pendencias expiradas.',
  });
  ids.googleAgendaAtualizarCalendario = await upsertServerFunction('googleAgendaAtualizarCalendario', {
    type: 'SQL',
    code: GOOGLE_AGENDA_ATUALIZAR_CALENDARIO_SQL,
    description: 'Troca o calendario de destino do usuario logado sem exigir nova autorizacao no Google.',
  });
  ids.googleAgendaStatus = await upsertServerFunction('googleAgendaStatus', {
    type: 'SQL',
    code: GOOGLE_AGENDA_STATUS_SQL,
    description: 'Retorna status da configuracao individual do Google Agenda para o usuario logado.',
  });

  await gravarCredencialApp();
  await smoke(ids);

  console.log('Fluxo OAuth do Google Agenda configurado. IDs:');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar o fluxo OAuth do Google Agenda:');
  console.error(error?.message || error);
  process.exit(1);
});
