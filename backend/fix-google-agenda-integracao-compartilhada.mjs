/**
 * Google Agenda -- fim da integracao por usuario (e da espera de 5 minutos).
 *
 * PROBLEMA
 * Cada usuario tinha a PROPRIA integracao no projeto, com o refresh_token nas credentials
 * e o Bearer montado pelo motor. Mas criar integracao e operacao de projeto, NEGADA para
 * acesso BUSINESS: quem criava era um cron (SF 372). Resultado: apos conectar, o vendedor
 * ficava ate 5 minutos vendo "Sua conexao com o Google esta sendo preparada" -- e caia nessa
 * espera DE NOVO a cada reconexao, porque a SF 366 zera INTEGRATION_SLUG toda vez que o
 * usuario reconecta. Nao era configuracao errada: era o desenho.
 *
 * SOLUCAO
 * Duas integracoes COMPARTILHADAS, criadas uma vez, iguais para todo mundo:
 *   google-oauth-token  -> troca o refresh_token do usuario por um access_token (validade 1h)
 *   google-calendar-api -> chama a API do Calendar levando esse access_token
 * Nada e provisionado por usuario, entao nao ha o que esperar: conecta e ja lista as agendas.
 *
 * O PRECO, explicito
 * callIntegrationMitra nao aceita header por chamada -- o header so existe na configuracao
 * da integracao, que agora e compartilhada. Entao o access_token viaja como PARAMETRO DE URL
 * (forma legada, mas suportada pela API do Google; verificada com HTTP 200 e dados reais).
 * Token em query string aparece em log de servidor e de proxy. E um token de 1 hora, nao o
 * refresh_token -- este continua so no banco e nas credentials da integracao de token.
 * A alternativa era manter o header e a espera de 5 minutos a cada reconexao.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  createIntegrationMitra,
  listIntegrationsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// ------------------------------------------------------------------ helper injetado nas SFs
const HELPER = `
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
`;

const ANCORA_NOW = "function now() {\n  return new Date().toISOString().slice(0, 19);\n}\n";

function injetarHelper(codigo, nomeSf) {
  if (!codigo.includes(ANCORA_NOW)) throw new Error(`${nomeSf}: ancora now() nao encontrada.`);
  return codigo.replace(ANCORA_NOW, ANCORA_NOW + HELPER);
}

function aplicar(codigo, nomeSf, pares) {
  for (const [de, para] of pares) {
    if (!codigo.includes(de)) {
      throw new Error(`${nomeSf}: trecho esperado nao encontrado -->\n${de.slice(0, 160)}`);
    }
    codigo = codigo.split(de).join(para);
  }
  return codigo;
}

async function ler(id) {
  return String((await readServerFunctionMitra({ projectId, serverFunctionId: id }))?.result?.code || '');
}

async function garantirIntegracoes() {
  const bruta = await listIntegrationsMitra({ projectId });
  const existentes = (Array.isArray(bruta) ? bruta : (bruta?.result || [])).map((i) => i.slug);

  if (!existentes.includes('google-oauth-token')) {
    await createIntegrationMitra({
      projectId,
      name: 'Google OAuth - Troca de codigo',
      slug: 'google-oauth-token',
      blueprintId: null,
      blueprintType: 'HTTP_REQUEST',
      authType: 'STATIC_KEY',
      credentials: { base_url: 'https://oauth2.googleapis.com', api_key: 'mitra' },
      // A API do Google nao usa este header; ele existe so porque a integracao exige uma
      // forma de autorizacao. A credencial real vai no body de cada chamada.
      authorizationConfig: { type: 'header', config: { name: 'X-Mitra-Origin', value: '{{api_key}}' } },
    });
    console.log('  integracao google-oauth-token criada.');
  } else {
    console.log('  integracao google-oauth-token ja existia.');
  }

  if (!existentes.includes('google-calendar-api')) {
    await createIntegrationMitra({
      projectId,
      name: 'Google Calendar API (compartilhada)',
      slug: 'google-calendar-api',
      blueprintId: null,
      blueprintType: 'HTTP_REQUEST',
      authType: 'STATIC_KEY',
      credentials: { base_url: 'https://www.googleapis.com/calendar/v3', api_key: 'mitra' },
      authorizationConfig: { type: 'header', config: { name: 'X-Mitra-Origin', value: '{{api_key}}' } },
    });
    console.log('  integracao google-calendar-api criada.');
  } else {
    console.log('  integracao google-calendar-api ja existia.');
  }
}

async function main() {
  console.log('1. Integracoes compartilhadas');
  await garantirIntegracoes();

  // ---------------------------------------------------------------- SF 370 listar agendas
  console.log('\n2. SF 370 (listar agendas) -- era aqui que o usuario batia');
  let c370 = injetarHelper(await ler(370), 'SF 370');
  c370 = aplicar(c370, 'SF 370', [
    [
      `  // O provisionamento da integracao grava (INTEGRATION_SLUG) e cria recurso de projeto:
  // as duas coisas sao negadas para acesso BUSINESS aqui dentro. Quem faz e a SF de
  // manutencao em cron (googleAgendaManutencao), que roda como Administrator.
  const slug = config.INTEGRATION_SLUG;
  if (!slug) {
    throw new Error('Sua conexao com o Google esta sendo preparada. Aguarde ate 5 minutos e clique em "Atualizar lista".');
  }
  const resposta = await callIntegrationMitra({
    projectId,
    connection: slug,
    integrationSlug: slug,
    method: 'GET',
    endpoint: '/users/me/calendarList',
    params: { minAccessRole: 'writer', maxResults: '250', showHidden: 'false' },
  });`,
      `  // Sem nada para provisionar: o access_token sai do refresh_token do proprio usuario,
  // pelas integracoes compartilhadas. Por isso a lista responde ja na primeira conexao.
  const token = await acessoGoogle(config);
  const resposta = await googleCalendar('GET', '/users/me/calendarList', token, {
    minAccessRole: 'writer', maxResults: '250', showHidden: 'false',
  });`,
    ],
  ]);
  if (c370.includes('esta sendo preparada')) throw new Error('SF 370: mensagem de espera ainda presente.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 370, code: c370 });
  console.log('   OK: nao depende mais de INTEGRATION_SLUG.');

  // ---------------------------------------------------------------- SF 371 trocar agenda
  console.log('\n3. SF 371 (trocar de agenda)');
  let c371 = injetarHelper(await ler(371), 'SF 371');
  c371 = aplicar(c371, 'SF 371', [
    [
      `  let removidos = 0;
  let restantes = 0;
  if (config.INTEGRATION_SLUG) {`,
      `  let removidos = 0;
  let restantes = 0;
  {
    const token = await acessoGoogle(config);`,
    ],
    [
      `        await callIntegrationMitra({
          projectId,
          connection: config.INTEGRATION_SLUG,
          integrationSlug: config.INTEGRATION_SLUG,
          method: 'DELETE',
          endpoint: '/calendars/' + encodeURIComponent(calendarIdAntigo) + '/events/' + encodeURIComponent(vinculo.GOOGLE_EVENT_ID),
        });`,
      `        await googleCalendar('DELETE',
          '/calendars/' + encodeURIComponent(calendarIdAntigo) + '/events/' + encodeURIComponent(vinculo.GOOGLE_EVENT_ID),
          token);`,
    ],
  ]);
  if (c371.includes('INTEGRATION_SLUG')) throw new Error('SF 371: ainda referencia INTEGRATION_SLUG.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 371, code: c371 });
  console.log('   OK.');

  // ---------------------------------------------------------------- SF 212 sincronizar
  console.log('\n4. SF 212 (sincronizar item)');
  let c212 = injetarHelper(await ler(212), 'SF 212');
  // ensureIntegration fica orfa: remover evita que alguem a reative sem perceber.
  const inicio = c212.indexOf('/** Cria a integracao individual do usuario na primeira sincronizacao e guarda o slug. */');
  if (inicio === -1) throw new Error('SF 212: ensureIntegration nao localizada.');
  const fim = c212.indexOf('\n}\n', c212.indexOf('async function ensureIntegration'));
  if (fim === -1) throw new Error('SF 212: nao consegui delimitar ensureIntegration.');
  c212 = c212.slice(0, inicio) + c212.slice(fim + 3);

  c212 = aplicar(c212, 'SF 212', [
    [
      "async function removerEvento(slug, calendarId, eventId) {\n"
        + "  await callIntegrationMitra({\n"
        + "    projectId,\n"
        + "    connection: slug,\n"
        + "    integrationSlug: slug,\n"
        + "    method: 'DELETE',\n"
        + "    endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(eventId),\n"
        + "  });\n"
        + "}",
      "async function removerEvento(token, calendarId, eventId) {\n"
        + "  await googleCalendar('DELETE', '/calendars/' + calendarId + '/events/' + encodeURIComponent(eventId), token);\n"
        + "}",
    ],
    [
      '  const slug = await ensureIntegration(config);',
      '  const token = await acessoGoogle(config);',
    ],
    [
      '      await removerEvento(slug, calendarId, mapping.GOOGLE_EVENT_ID);',
      '      await removerEvento(token, calendarId, mapping.GOOGLE_EVENT_ID);',
    ],
    [
      "      ? await callIntegrationMitra({ projectId, connection: slug, integrationSlug: slug, method: 'PUT', endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), body })\n"
        + "      : await callIntegrationMitra({ projectId, connection: slug, integrationSlug: slug, method: 'POST', endpoint: '/calendars/' + calendarId + '/events', body });",
      "      // PUT, nao PATCH: PATCH nao funciona no motor de integracao (devolve na hora um\n"
        + "      // 'Read timed out after 300s' enlatado). PUT substitui o evento inteiro, o que serve\n"
        + "      // porque o sistema e dono do evento e sempre monta o corpo completo.\n"
        + "      ? await googleCalendar('PUT', '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), token, null, body)\n"
        + "      : await googleCalendar('POST', '/calendars/' + calendarId + '/events', token, null, body);",
    ],
    [
      "    const config = await loadConfig(uid);\n"
        + "    if (!config || !config.INTEGRATION_SLUG) continue;\n"
        + "    try {\n"
        + "      await removerEvento(config.INTEGRATION_SLUG, encodeURIComponent(config.CALENDAR_ID || 'primary'), linha.GOOGLE_EVENT_ID);",
      "    const config = await loadConfig(uid);\n"
        + "    if (!config) continue;\n"
        + "    try {\n"
        + "      const token = await acessoGoogle(config);\n"
        + "      await removerEvento(token, encodeURIComponent(config.CALENDAR_ID || 'primary'), linha.GOOGLE_EVENT_ID);",
    ],
    [
      "const {\n  callIntegrationMitra,\n  createIntegrationMitra,\n  runDmlMitra,\n  runQueryMitra,\n} = require('mitra-sdk');",
      "const {\n  callIntegrationMitra,\n  runDmlMitra,\n  runQueryMitra,\n} = require('mitra-sdk');",
    ],
  ]);
  if (c212.includes('INTEGRATION_SLUG') || /createIntegrationMitra/.test(c212)) {
    throw new Error('SF 212: ainda referencia INTEGRATION_SLUG ou cria integracao.');
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: 212, code: c212 });
  console.log('   OK.');

  // ---------------------------------------------------------------- SF 372 manutencao
  console.log('\n5. SF 372 (manutencao) para de provisionar integracao');
  let c372 = await ler(372);
  const iProv = c372.indexOf('  // 2. Provisionamento das integracoes que faltam.');
  const iRet = c372.indexOf('  return relatorio;');
  if (iProv === -1 || iRet === -1 || iRet < iProv) throw new Error('SF 372: bloco de provisionamento nao delimitado.');
  c372 = c372.slice(0, iProv)
    + '  // O provisionamento por usuario deixou de existir: as integracoes do Google agora sao\n'
    + '  // compartilhadas pelo projeto, entao nao ha nada a criar quando alguem conecta.\n\n'
    + c372.slice(iRet);
  c372 = c372
    .replace("const { createIntegrationMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');", "const { runDmlMitra } = require('mitra-sdk');")
    .replace('  const relatorio = { pendentesRemovidos: 0, ticketsRemovidos: 0, integracoesCriadas: 0, falhas: [] };', '  const relatorio = { pendentesRemovidos: 0, ticketsRemovidos: 0 };');
  if (/createIntegrationMitra/.test(c372)) throw new Error('SF 372: ainda cria integracao.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 372, code: c372 });
  console.log('   OK.');

  // ---------------------------------------------------------------- SF 366
  console.log('\n6. SF 366 para de zerar INTEGRATION_SLUG (coluna virou vestigial)');
  let c366 = await ler(366);
  c366 = aplicar(c366, 'SF 366', [['    INTEGRATION_SLUG = NULL,\n', '']]);
  await updateServerFunctionMitra({ projectId, serverFunctionId: 366, code: c366 });
  console.log('   OK.');

  console.log('\nA espera de 5 minutos deixou de existir em todo o fluxo.');
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
