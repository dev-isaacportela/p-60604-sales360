
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

const codProd = asNumber(event.codProd, 'codProd');
const custo = asNumber(event.custo, 'custo');
const dataRef = sqlString(String(event.dataRef || '').slice(0, 10));
const atualizadoEm = sqlString(event.atualizadoEm || new Date().toISOString().slice(0, 19).replace('T', ' '));

await sdk.runDmlMitra({
  projectId,
  sql: `INSERT INTO CUSTO_PADRAO_PRODUTO (CODPROD, CUSTO, DATA_REF, ATUALIZADO_EM)
        VALUES (${codProd}, ${custo}, '${dataRef}', '${atualizadoEm}')
        ON DUPLICATE KEY UPDATE
          CUSTO = VALUES(CUSTO),
          DATA_REF = VALUES(DATA_REF),
          ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
});

return { ok: true, codProd, custo, dataRef };
