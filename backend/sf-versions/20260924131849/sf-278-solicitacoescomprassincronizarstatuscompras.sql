
const sdk = require('mitra-sdk');

const localProjectId = 45654;
const comprasProjectId = 45547;

function esc(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function rows(response) {
  return (response && response.result && response.result.rows) || response.rows || [];
}

async function runLocal(sql) {
  return rows(await sdk.runQueryMitra({ projectId: localProjectId, sql }));
}

async function runLocalDml(sql) {
  await sdk.runDmlMitra({ projectId: localProjectId, sql });
}

async function runCompras(sql) {
  return rows(await sdk.runQueryMitra({ projectId: comprasProjectId, sql }));
}

function localStatus(remoteStatuses) {
  const statuses = remoteStatuses.map((status) => String(status || '').toUpperCase()).filter(Boolean);
  if (!statuses.length) return null;
  if (statuses.every((status) => ['REJEITADA', 'REJEITADO', 'RECUSADA', 'RECUSADO'].includes(status))) return 'RECUSADA';
  if (statuses.every((status) => ['ATENDIDA', 'CONCLUIDA', 'CONCLUIDO', 'FINALIZADA', 'FINALIZADO'].includes(status))) return 'CONCLUIDA';
  if (statuses.some((status) => ['APROVADA', 'APROVADO', 'VINCULADA', 'VINCULADO'].includes(status))) return 'APROVADA';
  return 'EM_ANALISE';
}

const solicitacaoIdFilter = Number(event.solicitacaoId || 0);
const localItems = await runLocal(`
  SELECT ID, SOLICITACAO_ID, COMPRAS_SOLICITACAO_ID
  FROM SOLICITACAO_ITENS
  WHERE COMPRAS_SOLICITACAO_ID IS NOT NULL
    AND COMPRAS_SOLICITACAO_ID > 0
    ${solicitacaoIdFilter ? 'AND SOLICITACAO_ID = ' + solicitacaoIdFilter : ''}
  ORDER BY ID DESC
  LIMIT 200
`);

if (!localItems.length) return { success: true, synced: 0 };

const ids = localItems.map((item) => Number(item.COMPRAS_SOLICITACAO_ID)).filter(Boolean);
const remoteRows = await runCompras(`
  SELECT ID, STATUS, AVALIADO_EM, OBS_AVALIACAO, ID_CARD_VINCULADO
  FROM SGC_SOLICITACOES
  WHERE ID IN (${ids.join(',')})
`);

const remoteById = new Map(remoteRows.map((row) => [Number(row.ID), row]));
const touched = new Map();
const now = new Date().toISOString().slice(0, 19);

for (const item of localItems) {
  const remote = remoteById.get(Number(item.COMPRAS_SOLICITACAO_ID));
  if (!remote) continue;
  await runLocalDml(`
    UPDATE SOLICITACAO_ITENS
    SET COMPRAS_STATUS = '${esc(remote.STATUS || '')}',
        COMPRAS_AVALIADO_EM = '${esc(remote.AVALIADO_EM || '')}',
        COMPRAS_OBS_AVALIACAO = '${esc(remote.OBS_AVALIACAO || '')}',
        COMPRAS_CARD_ID = ${Number(remote.ID_CARD_VINCULADO || 0) || 'NULL'},
        COMPRAS_SYNC_EM = '${esc(now)}',
        COMPRAS_SYNC_ERRO = NULL
    WHERE ID = ${Number(item.ID)}
  `);
  const arr = touched.get(Number(item.SOLICITACAO_ID)) || [];
  arr.push(remote.STATUS || '');
  touched.set(Number(item.SOLICITACAO_ID), arr);
}

for (const [solicitacaoId, statuses] of touched.entries()) {
  const nextStatus = localStatus(statuses);
  if (!nextStatus) continue;
  await runLocalDml(`
    UPDATE SOLICITACOES
    SET STATUS = '${esc(nextStatus)}', ATUALIZADO_EM = '${esc(now)}'
    WHERE ID = ${solicitacaoId}
  `);
}

return { success: true, synced: touched.size };
