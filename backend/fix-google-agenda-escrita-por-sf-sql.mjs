/**
 * Tira a ESCRITA de dentro das SFs JAVASCRIPT do Google Agenda.
 *
 * Modelo real da plataforma, apurado em producao (nao e hipotese -- cada linha abaixo
 * veio de um erro ou de uma execucao observada):
 *
 *   SF JAVASCRIPT chamada por usuario BUSINESS
 *     runQueryMitra (SELECT) ............ PERMITIDO   (a SF 365 passou por ele)
 *     callIntegrationMitra .............. PERMITIDO   (o Google devolveu o token)
 *     runDmlMitra (INSERT/UPDATE/DELETE)  NEGADO      BUSINESS_ACCESS_DENIED
 *
 *   SF SQL chamada por usuario BUSINESS
 *     SELECT / INSERT / UPDATE .......... PERMITIDO   (9.125 execucoes, 0 falhas)
 *
 * Ou seja: quem escreve e a SF do tipo SQL. As SFs JAVASCRIPT viram funcoes "puras" --
 * leem, falam com o Google e DEVOLVEM o resultado; a persistencia acontece numa SF SQL
 * chamada pela tela, que resolve :VAR_USER no servidor e amarra o dado ao usuario logado.
 *
 * Com isso a tabela-ponte GOOGLE_OAUTH_PENDENTE deixa de ser necessaria no fluxo: ela
 * existia para o token nao passar pelo navegador. Agora ele passa -- pelo navegador do
 * PROPRIO dono, que segundos antes tinha em maos o "code", equivalente em poder. O
 * client_secret continua sem sair do servidor.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

// ------------------------------------------------------------------ 365 (JS, sem escrita)
const SF_365 = `/**
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
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$/.test(limpo) ? limpo : '';
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
`;

// ------------------------------------------------------------------ 366 (SQL, quem grava)
const SF_366 = `
  INSERT INTO GOOGLE_AGENDA_CONFIG (
    USER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, CALENDAR_ID,
    INTEGRATION_SLUG, STATUS, ULTIMO_ERRO, EMAIL_GOOGLE, CONFIGURADO_EM, ATUALIZADO_EM
  )
  SELECT
    :VAR_USER,
    A.CLIENT_ID,
    A.CLIENT_SECRET,
    '{{refreshToken}}',
    COALESCE(NULLIF('{{calendarId}}', ''), 'primary'),
    NULL,
    'CONFIGURADO',
    NULL,
    '{{emailGoogle}}',
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
    SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  FROM (SELECT CLIENT_ID, CLIENT_SECRET FROM GOOGLE_OAUTH_APP ORDER BY ID DESC LIMIT 1) A
  WHERE LENGTH('{{refreshToken}}') > 20
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

// ------------------------------------------------------------------ consumir ticket (SQL)
const SF_CONSUMIR = `
  UPDATE GOOGLE_AGENDA_TICKET
  SET CONSUMIDO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
  WHERE TICKET = '{{ticket}}' AND USER_ID = :VAR_USER
`;

async function upsertSf(nome, tipo, code, description) {
  const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const existente = sfs.find((s) => s.name === nome);
  if (existente) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code });
    console.log(`  ${nome} (${existente.id}) atualizada.`);
    return existente.id;
  }
  const criada = await createServerFunctionMitra({ projectId, name: nome, type: tipo, code, description });
  let id = criada?.result?.serverFunctionId ?? criada?.result?.id;
  if (!id) {
    const relidas = (await listServerFunctionsMitra({ projectId }))?.result || [];
    id = relidas.find((s) => s.name === nome)?.id;
  }
  console.log(`  ${nome} criada (id ${id}).`);
  return id;
}

async function main() {
  console.log('1. SF 365 vira somente leitura (devolve o token em vez de gravar)');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 365, code: SF_365 });
  const c365 = String((await readServerFunctionMitra({ projectId, serverFunctionId: 365 }))?.result?.code || '');
  if (/runDmlMitra\s*\(/.test(c365)) throw new Error('SF 365 ainda escreve -- abortando.');
  console.log('  OK: nenhum runDmlMitra na 365.');

  console.log('\n2. SF 366 (SQL) passa a receber o token e gravar com :VAR_USER');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 366, code: SF_366 });
  console.log('  OK.');

  console.log('\n3. SF SQL para consumir o ticket (a 370 nao pode mais escrever)');
  const idConsumir = await upsertSf(
    'googleAgendaConsumirTicket',
    'SQL',
    SF_CONSUMIR,
    'Marca o ticket do usuario logado como consumido. Existe porque a SF JAVASCRIPT que lista os calendarios nao pode escrever com acesso BUSINESS.',
  );

  console.log('\n4. SF 370 deixa de escrever');
  let c370 = String((await readServerFunctionMitra({ projectId, serverFunctionId: 370 }))?.result?.code || '');
  const trocas = [
    [
      "  // Uso unico: o ticket e marcado como consumido (a busca acima exige CONSUMIDO_EM IS NULL).\n"
        + "  // Marcar em vez de apagar mantem a mesma garantia sem usar DELETE, proibido para BUSINESS.\n"
        + "  await runDmlMitra({ projectId, sql: `UPDATE GOOGLE_AGENDA_TICKET SET CONSUMIDO_EM = '${now()}' WHERE TICKET = '${escapeSql(ticket)}'` });",
      "  // O ticket e consumido pela TELA, chamando a SF SQL googleAgendaConsumirTicket logo\n"
        + "  // apos esta chamada: acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.",
    ],
    [
      `  let slug;
  try {
    slug = await ensureIntegration(config);
  } catch (erro) {
    // A SF de manutencao provisiona em ate 5 min; ate la a lista nao tem como ser lida.
    throw new Error('Sua conexao com o Google esta sendo preparada. Aguarde ate 5 minutos e clique em "Atualizar lista".');
  }`,
      `  // O provisionamento da integracao grava (INTEGRATION_SLUG) e cria recurso de projeto:
  // as duas coisas sao negadas para acesso BUSINESS aqui dentro. Quem faz e a SF de
  // manutencao em cron (googleAgendaManutencao), que roda como Administrator.
  const slug = config.INTEGRATION_SLUG;
  if (!slug) {
    throw new Error('Sua conexao com o Google esta sendo preparada. Aguarde ate 5 minutos e clique em "Atualizar lista".');
  }`,
    ],
  ];
  for (const [de, para] of trocas) {
    if (!c370.includes(de)) throw new Error('SF 370: trecho esperado nao encontrado -- revise.');
    c370 = c370.split(de).join(para);
  }
  // ensureIntegration ficou orfa: remover evita que alguem a reative sem perceber.
  const inicio = c370.indexOf('async function ensureIntegration(config) {');
  if (inicio !== -1) {
    const fim = c370.indexOf('\n}\n', inicio);
    if (fim === -1) throw new Error('SF 370: nao consegui delimitar ensureIntegration.');
    c370 = c370.slice(0, inicio) + c370.slice(fim + 3);
  }
  c370 = c370.replace(
    "const { callIntegrationMitra, createIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');",
    "const { callIntegrationMitra, runQueryMitra } = require('mitra-sdk');",
  );
  if (/runDmlMitra\s*\(/.test(c370) || /createIntegrationMitra\s*\(/.test(c370)) {
    throw new Error('SF 370 ainda escreve ou cria integracao -- abortando.');
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: 370, code: c370 });
  console.log('  OK: 370 sem escrita e sem criacao de integracao.');

  console.log(`\nIDs para a tela: googleAgendaConsumirTicket = ${idConsumir}`);
}

main().catch((e) => {
  console.error('FALHOU:', e?.message || e);
  process.exit(1);
});
