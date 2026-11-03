/**
 * SF - googleAgendaTrocarCodigo  (JAVASCRIPT, somente leitura)
 *
 * Troca o "code" do Google pelo refresh token e DEVOLVE o resultado. Nao grava nada:
 * acesso BUSINESS nao executa runDmlMitra de dentro de SF JAVASCRIPT. Quem persiste e a
 * SF SQL googleAgendaConfirmarConexao (366), chamada pela tela logo em seguida.
 */
const { callIntegrationMitra, runQueryMitra } = require('mitra-sdk');

const projectId = 45654;

function rows(response) {
  if (Array.isArray(response?.rows)) return response.rows;
  if (Array.isArray(response?.result?.rows)) return response.result.rows;
  if (Array.isArray(response?.result)) return response.result;
  return [];
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

/**
 * O valor vai voltar para a tela e de la para um parametro de SF SQL, que e substituido
 * no texto da query. Entao ele sai daqui restrito ao alfabeto real de um token do Google:
 * nenhuma aspa, nenhum caractere capaz de fechar a string no SQL.
 */
function apenasTokenValido(valor) {
  const limpo = String(valor || '').trim();
  return /^[A-Za-z0-9._~+/=-]+$/.test(limpo) ? limpo : '';
}

function apenasEmail(valor) {
  const limpo = String(valor || '').trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(limpo) ? limpo : '';
}

async function trocarCodigo() {
  const code = String(event.code || '').trim();
  if (!code) throw new Error('Codigo de autorizacao ausente.');

  const app = rows(await runQueryMitra({
    projectId,
    sql: 'SELECT CLIENT_ID, CLIENT_SECRET, REDIRECT_URI FROM GOOGLE_OAUTH_APP ORDER BY ID DESC LIMIT 1',
  }))[0];
  if (!app || !app.CLIENT_ID) {
    throw new Error('Credencial OAuth do aplicativo nao cadastrada. Fale com o TI.');
  }

  const resposta = await callIntegrationMitra({
    projectId,
    connection: 'google-oauth-token',
    integrationSlug: 'google-oauth-token',
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

  const refreshToken = apenasTokenValido(body.refresh_token);
  if (!refreshToken) {
    throw new Error('O Google nao devolveu um refresh token valido. Remova o acesso em myaccount.google.com/permissions e conecte novamente.');
  }

  // "rows" e o formato que a camada de dados da tela (extractRowsFromOutput) reconhece.
  return { rows: [{ refreshToken, emailGoogle: apenasEmail(emailDoIdToken(body.id_token)) }] };
}

return await trocarCodigo();
