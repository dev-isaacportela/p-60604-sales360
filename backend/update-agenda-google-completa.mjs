/**
 * Amplia a sincronizacao com o Google Agenda:
 *  - SF 212 passa a cobrir VISITA, TAREFA, PROSPECCAO e INTERNA (inclui Deslocamento),
 *    criando o evento para o criador E para cada participante do compromisso interno;
 *  - seletor de calendario: SF que lista os calendarios da conta Google do usuario.
 *
 * O codigo das SFs JAVASCRIPT vive em sf-src/*.js (arquivo real, com syntax highlight
 * e checavel por `node --check`), e nao dentro de uma template string.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
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

function lerSf(arquivo) {
  return readFileSync(new URL(`./sf-src/${arquivo}`, import.meta.url), 'utf8')
    .replaceAll('__PROJECT_ID__', String(projectId));
}

function extractSfId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id || null;
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

const ABRIR_TICKET_SQL = `
  INSERT INTO GOOGLE_AGENDA_TICKET (TICKET, USER_ID, CRIADO_EM)
  VALUES ('{{ticket}}', :VAR_USER, SUBSTRING(CURRENT_TIMESTAMP, 1, 19))
  ON DUPLICATE KEY UPDATE USER_ID = VALUES(USER_ID), CRIADO_EM = VALUES(CRIADO_EM)
`;

async function main() {
  await runDdlSafe(`CREATE TABLE GOOGLE_AGENDA_TICKET (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    TICKET VARCHAR(160) NOT NULL,
    USER_ID INT NOT NULL,
    CRIADO_EM VARCHAR(19),
    UNIQUE KEY UX_GOOGLE_AGENDA_TICKET (TICKET)
  );`, 'GOOGLE_AGENDA_TICKET');

  const ids = {};
  ids.googleAgendaSincronizarItem = await upsertServerFunction('googleAgendaSincronizarItem', {
    type: 'JAVASCRIPT',
    code: lerSf('google-agenda-sincronizar.js'),
    description: 'Sincroniza visita, atividade, prospeccao ou compromisso interno (incl. deslocamento) para o Google Agenda de cada usuario envolvido.',
  });
  ids.googleAgendaAbrirTicket = await upsertServerFunction('googleAgendaAbrirTicket', {
    type: 'SQL',
    code: ABRIR_TICKET_SQL,
    description: 'Abre um ticket de uso unico ligando o usuario logado (:VAR_USER) a uma consulta de calendarios.',
  });
  ids.googleAgendaListarCalendarios = await upsertServerFunction('googleAgendaListarCalendarios', {
    type: 'JAVASCRIPT',
    code: lerSf('google-agenda-listar-calendarios.js'),
    description: 'Lista os calendarios com permissao de escrita da conta Google do usuario dono do ticket.',
  });

  ids.googleAgendaTrocarCalendario = await upsertServerFunction('googleAgendaTrocarCalendario', {
    type: 'JAVASCRIPT',
    code: lerSf('google-agenda-trocar-calendario.js'),
    description: 'Troca a agenda de destino: remove os eventos da agenda anterior e zera os vinculos para recriar no destino novo.',
  });

  console.log('IDs:');
  console.log(JSON.stringify(ids, null, 2));

  const smoke = await executeServerFunctionMitra({
    projectId,
    serverFunctionId: ids.googleAgendaSincronizarItem,
    input: { entidade: 'INTERNA', entidadeId: 0 },
  });
  console.log('smoke (input invalido, esperado skipped):',
    smoke?.result?.executionStatus, JSON.stringify(smoke?.result?.output));
}

main().catch((error) => {
  console.error('Erro ao ampliar a sincronizacao do Google Agenda:');
  console.error(error?.message || error);
  process.exit(1);
});
