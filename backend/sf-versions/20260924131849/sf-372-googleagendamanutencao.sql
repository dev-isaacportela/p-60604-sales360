/**
 * SF - googleAgendaManutencao (CRON, executa como Administrator)
 *
 * Existe porque o acesso BUSINESS nao pode executar DELETE nem criar integracao. Tudo que
 * o caminho do usuario final deixa de fazer fisicamente e feito aqui, fora da sessao dele:
 *
 *   1. remove linhas vencidas/consumidas das tabelas-ponte (GOOGLE_OAUTH_PENDENTE e
 *      GOOGLE_AGENDA_TICKET) -- nenhuma delas guarda dado de negocio;
 *   2. provisiona a integracao por usuario de quem conectou e ainda esta sem INTEGRATION_SLUG.
 */
const { runDmlMitra } = require('mitra-sdk');

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

async function manutencao() {
  const relatorio = { pendentesRemovidos: 0, ticketsRemovidos: 0 };

  // 1. Tabelas-ponte. CRIADO_EM e VARCHAR e o projeto grava em dois formatos
  // ('YYYY-MM-DD HH:MM:SS' pelo SQL e com 'T' pelo JS); sem normalizar, a comparacao erra.
  const venceu = (minutos) => "REPLACE(CRIADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL " + minutos + " MINUTE), 1, 19)";

  const p = await runDmlMitra({
    projectId,
    sql: "DELETE FROM GOOGLE_OAUTH_PENDENTE WHERE " + venceu(10) + " OR REFRESH_TOKEN = '' OR REFRESH_TOKEN IS NULL",
  });
  relatorio.pendentesRemovidos = p?.result?.rowsAffected ?? p?.rowsAffected ?? 0;

  const t = await runDmlMitra({
    projectId,
    sql: 'DELETE FROM GOOGLE_AGENDA_TICKET WHERE ' + venceu(5) + ' OR CONSUMIDO_EM IS NOT NULL',
  });
  relatorio.ticketsRemovidos = t?.result?.rowsAffected ?? t?.rowsAffected ?? 0;

  // O provisionamento por usuario deixou de existir: as integracoes do Google agora sao
  // compartilhadas pelo projeto, entao nao ha nada a criar quando alguem conecta.

  return relatorio;
}

return await manutencao();
