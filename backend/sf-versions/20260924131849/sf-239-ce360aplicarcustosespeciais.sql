
const sdk = require('mitra-sdk');
const projectId = 45654;

function asNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(field + ' inválido.');
  return parsed;
}

function sqlString(value) {
  return String(value ?? '').replace(/'/g, "''");
}

const items = Array.isArray(event.items) ? event.items : [];
if (items.length === 0) throw new Error('Nenhum custo especial informado.');

const policyId = asNumber(event.policyId, 'policyId');
if (event.replacePolicy) {
  await sdk.runDmlMitra({
    projectId,
    sql: `DELETE FROM CUSTO_ESPECIAL_PRODUTO WHERE POLITICA_ID = ${policyId}`,
  });
}

for (const item of items) {
  const itemId = asNumber(item.itemId, 'itemId');
  const codProd = asNumber(item.codProd, 'codProd');
  const custo = asNumber(item.custo, 'custo');
  const clienteId = item.clienteId == null || item.clienteId === '' ? 'NULL' : String(asNumber(item.clienteId, 'clienteId'));
  const politicaNome = sqlString(item.politicaNome);
  const status = sqlString(item.status || 'ACTIVE');
  const dataInicio = sqlString(item.dataInicio);
  const dataFim = sqlString(item.dataFim);
  const atualizadoEm = sqlString(item.atualizadoEm || new Date().toISOString().slice(0, 19).replace('T', ' '));

  await sdk.runDmlMitra({
    projectId,
    sql: `INSERT INTO CUSTO_ESPECIAL_PRODUTO
          (ITEM_ID, CODPROD, CLIENTE_ID, CUSTO, POLITICA_ID, POLITICA_NOME, STATUS, DATA_INICIO, DATA_FIM, ATUALIZADO_EM)
        VALUES
          (${itemId}, ${codProd}, ${clienteId}, ${custo}, ${policyId}, '${politicaNome}', '${status}', '${dataInicio}', '${dataFim}', '${atualizadoEm}')
        ON DUPLICATE KEY UPDATE
          CODPROD = VALUES(CODPROD),
          CLIENTE_ID = VALUES(CLIENTE_ID),
          CUSTO = VALUES(CUSTO),
          POLITICA_ID = VALUES(POLITICA_ID),
          POLITICA_NOME = VALUES(POLITICA_NOME),
          STATUS = VALUES(STATUS),
          DATA_INICIO = VALUES(DATA_INICIO),
          DATA_FIM = VALUES(DATA_FIM),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
  });
}

return { ok: true, policyId, total: items.length, replacePolicy: Boolean(event.replacePolicy) };
