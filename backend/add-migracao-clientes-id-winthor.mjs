import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const FUNCTION_NAME = 'migrarClientesIdParaWinthorCodcli';

const serverFunctionCode = String.raw`
const projectId = Number(process.env.MITRA_PROJECT_ID);
const baseURL = process.env.MITRA_BASE_URL;
const token = process.env.MITRA_TOKEN || '';

function formatToken(value) {
  return value.startsWith('Bearer ') ? value : 'Bearer ' + value;
}

async function postShortcut(endpoint, sql) {
  const response = await fetch(baseURL + endpoint, {
    method: 'POST',
    headers: {
      Authorization: formatToken(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId, sql, confirmDestructive: true }),
  });
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ': ' + (typeof payload === 'string' ? payload : JSON.stringify(payload)));
  }
  return payload;
}

async function runDdl(sql) {
  return postShortcut('/agentAiShortcut/runDdl', sql);
}

async function runDml(sql) {
  return postShortcut('/agentAiShortcut/runDml', sql);
}

await runDdl('ALTER TABLE SIMULACOES DROP FOREIGN KEY SIMULACOES_ibfk_1');
await runDdl('ALTER TABLE SIMULACOES ADD CONSTRAINT SIMULACOES_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE CLIENTE_BU_VENDEDOR DROP FOREIGN KEY CLIENTE_BU_VENDEDOR_ibfk_1');
await runDdl('ALTER TABLE CLIENTE_BU_VENDEDOR ADD CONSTRAINT CLIENTE_BU_VENDEDOR_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE PERFIL_COMPRA_CLIENTE DROP FOREIGN KEY PERFIL_COMPRA_CLIENTE_ibfk_1');
await runDdl('ALTER TABLE PERFIL_COMPRA_CLIENTE ADD CONSTRAINT PERFIL_COMPRA_CLIENTE_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE PEDIDOS_SEMANAIS DROP FOREIGN KEY PEDIDOS_SEMANAIS_ibfk_1');
await runDdl('ALTER TABLE PEDIDOS_SEMANAIS ADD CONSTRAINT PEDIDOS_SEMANAIS_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE PEDIDOS_SEMANAIS_SYNC DROP FOREIGN KEY PEDIDOS_SEMANAIS_SYNC_ibfk_1');
await runDdl('ALTER TABLE PEDIDOS_SEMANAIS_SYNC ADD CONSTRAINT PEDIDOS_SEMANAIS_SYNC_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE PEDIDOS_SEMANAIS_SYNC_RAW DROP FOREIGN KEY PEDIDOS_SEMANAIS_SYNC_RAW_ibfk_1');
await runDdl('ALTER TABLE PEDIDOS_SEMANAIS_SYNC_RAW ADD CONSTRAINT PEDIDOS_SEMANAIS_SYNC_RAW_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE VISITAS DROP FOREIGN KEY VISITAS_ibfk_1');
await runDdl('ALTER TABLE VISITAS ADD CONSTRAINT VISITAS_ibfk_1 FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDdl('ALTER TABLE PRODUCT_MIX DROP FOREIGN KEY PRODUCT_MIX_ibfk_1');
await runDdl('ALTER TABLE PRODUCT_MIX ADD CONSTRAINT PRODUCT_MIX_ibfk_1 FOREIGN KEY (ID_CLIENTE) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDml('DELETE ec FROM EQUIPE_CLIENTE ec LEFT JOIN CLIENTES c ON ec.ID_CLIENTE = c.ID WHERE c.ID IS NULL');
await runDdl('ALTER TABLE EQUIPE_CLIENTE ADD CONSTRAINT EQUIPE_CLIENTE_ibfk_1 FOREIGN KEY (ID_CLIENTE) REFERENCES CLIENTES(ID) ON UPDATE CASCADE');

await runDml('UPDATE CLIENTES SET ID = WINTHOR_CODCLI WHERE WINTHOR_CODCLI IS NOT NULL AND ID <> WINTHOR_CODCLI');

return {
  ok: true,
  message: 'Migração pontual de IDs de clientes concluída com sucesso',
  migratedAt: new Date().toISOString(),
};
`;

function extractServerFunctionId(response) {
  return Number(response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id);
}

async function main() {
  const description = 'Migração pontual: ajusta CLIENTES.ID para WINTHOR_CODCLI e recria FKs de clientes com ON UPDATE CASCADE.';
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = (listed?.result || listed || []).find((fn) => fn.name === FUNCTION_NAME);

  if (existing?.id) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: Number(existing.id),
      code: serverFunctionCode,
      description,
    });
    console.log(`SF atualizada: ${FUNCTION_NAME} -> ID ${existing.id}`);
    return;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: FUNCTION_NAME,
    type: 'JAVASCRIPT',
    code: serverFunctionCode,
    description,
  });

  console.log(`SF criada: ${FUNCTION_NAME} -> ID ${extractServerFunctionId(created)}`);
}

main().catch((error) => {
  console.error('Falha ao criar/atualizar SF de migracao de clientes:');
  console.error(error?.message || error);
  process.exit(1);
});
