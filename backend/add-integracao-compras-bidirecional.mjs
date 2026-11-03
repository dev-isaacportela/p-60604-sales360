import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const comprasProjectId = 45547;
const comprasInserirSolicitacaoSf = 340;

function jsString(value) {
  return JSON.stringify(String(value));
}

async function columnExists(tableName, columnName) {
  const res = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS TOTAL
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '${tableName}'
            AND COLUMN_NAME = '${columnName}'`,
  });
  const row = (res?.result?.rows || res?.rows || [])[0] || {};
  return Number(row.TOTAL || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await columnExists(tableName, columnName)) return;
  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${ddl}` });
}

const enviarItemCode = `
const sdk = require('mitra-sdk');

const localProjectId = ${projectId};
const comprasProjectId = ${comprasProjectId};
const comprasInserirSolicitacaoSf = ${comprasInserirSolicitacaoSf};

function esc(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapPrioridade(value) {
  const raw = String(value || '').toUpperCase();
  if (raw === 'ALTA') return 'ALTA';
  if (raw === 'BAIXA') return 'NORMAL';
  return 'NORMAL';
}

function rowsOf(response) {
  let output = response && response.result && response.result.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch (error) { output = {}; }
  }
  return (output && (output.rows || output.result)) || [];
}

async function runLocal(sql) {
  const response = await sdk.runQueryMitra({ projectId: localProjectId, sql });
  return (response && response.result && response.result.rows) || response.rows || [];
}

async function runLocalDml(sql) {
  await sdk.runDmlMitra({ projectId: localProjectId, sql });
}

async function runCompras(sql) {
  const response = await sdk.runQueryMitra({ projectId: comprasProjectId, sql });
  return (response && response.result && response.result.rows) || response.rows || [];
}

const solicitacaoId = num(event.solicitacaoId);
const codprod = String(event.codprod || '').trim();
if (!solicitacaoId || !codprod) throw new Error('solicitacaoId e codprod sao obrigatorios.');

const itemRows = await runLocal(\`
  SELECT I.ID, I.CODPROD, I.CODFORNEC, I.PRODUTO, I.QUANTIDADE, I.OBSERVACAO, I.COMPRAS_SOLICITACAO_ID,
         S.CLIENTE, S.DESCRICAO, S.PRIORIDADE, S.CODFILIAL, S.FILIAL_NOME, S.CRIADO_EM, S.EXECUTIVO_ID, S.EXECUTIVO_EMAIL,
         U.DESCR AS USUARIO_EMAIL,
         COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.DESCR), ''), NULLIF(TRIM(S.EXECUTIVO_EMAIL), ''), CONCAT('Usuario ', S.EXECUTIVO_ID)) AS VENDEDOR_NOME
  FROM SOLICITACAO_ITENS I
  JOIN SOLICITACOES S ON S.ID = I.SOLICITACAO_ID
  LEFT JOIN INT_USER U ON U.ID = S.EXECUTIVO_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = S.EXECUTIVO_ID
  WHERE I.SOLICITACAO_ID = \${solicitacaoId}
    AND I.CODPROD = '\${esc(codprod)}'
  ORDER BY I.ID DESC
  LIMIT 1
\`);

if (!itemRows.length) throw new Error('Item local nao encontrado para envio ao projeto de compras.');
const item = itemRows[0];
if (item.COMPRAS_SOLICITACAO_ID) {
  return { success: true, skipped: true, comprasSolicitacaoId: item.COMPRAS_SOLICITACAO_ID };
}

const clienteParts = String(item.CLIENTE || '').split(' — Cód. ');
const nomeCliente = clienteParts[0] || item.CLIENTE || '';
const codcli = num(clienteParts[1] || item.CLIENTE_ID || 0, 0);
const criadoEm = String(item.CRIADO_EM || new Date().toISOString().slice(0, 19)).slice(0, 19);
const vendedorEmail = String(item.USUARIO_EMAIL || item.EXECUTIVO_EMAIL || '');
const vendedorNome = String(item.VENDEDOR_NOME || vendedorEmail || '');
const codfilial = String(item.CODFILIAL || '').trim();
if (!codfilial) throw new Error('Filial da solicitacao nao encontrada para envio ao projeto de compras.');

const remoteInput = {
  codprod: num(item.CODPROD),
  descricaoProduto: String(item.PRODUTO || ''),
  quantidade: num(item.QUANTIDADE, 1),
  justificativa: String(item.OBSERVACAO || item.DESCRICAO || 'Solicitacao comercial'),
  codcli,
  nomeCliente,
  vendedorSolicitanteId: num(item.EXECUTIVO_ID),
  vendedorSolicitanteNome: vendedorNome,
  vendedorSolicitanteEmail: vendedorEmail,
  prioridade: mapPrioridade(item.PRIORIDADE),
  criadoPor: num(item.EXECUTIVO_ID),
  criadoEm,
  codfornec: num(item.CODFORNEC),
  fornecedorNome: '',
  codfilial,
  filialNome: '',
  embalagem: '',
  unidade: 'UN',
};

const insertResponse = await sdk.executeServerFunctionMitra({
  projectId: comprasProjectId,
  serverFunctionId: comprasInserirSolicitacaoSf,
  input: remoteInput,
});

const status = String(insertResponse && insertResponse.result && insertResponse.result.executionStatus || '');
const error = String(insertResponse && insertResponse.result && insertResponse.result.error || '').trim();
if ((status && status !== 'COMPLETED') || error) throw new Error(error || status || 'Falha ao enviar solicitacao para compras.');

const remoteRows = await runCompras(\`
  SELECT ID, STATUS
  FROM SGC_SOLICITACOES
  WHERE CODPROD = \${remoteInput.codprod}
    AND QUANTIDADE = \${remoteInput.quantidade}
    AND CODCLI = \${remoteInput.codcli}
    AND CRIADO_EM = '\${esc(remoteInput.criadoEm)}'
    AND VENDEDOR_SOLICITANTE_EMAIL = '\${esc(remoteInput.vendedorSolicitanteEmail)}'
  ORDER BY ID DESC
  LIMIT 1
\`);

const comprasSolicitacaoId = remoteRows[0] && remoteRows[0].ID;
if (!comprasSolicitacaoId) throw new Error('Solicitacao enviada, mas nao foi possivel localizar o ID remoto.');

await runLocalDml(\`
  UPDATE SOLICITACAO_ITENS
  SET COMPRAS_SOLICITACAO_ID = \${num(comprasSolicitacaoId)},
      COMPRAS_STATUS = '\${esc(remoteRows[0].STATUS || 'PENDENTE')}',
      COMPRAS_SYNC_EM = '\${esc(new Date().toISOString().slice(0, 19))}',
      COMPRAS_SYNC_ERRO = NULL
  WHERE ID = \${num(item.ID)}
\`);

await runLocalDml(\`
  UPDATE SOLICITACOES
  SET STATUS = CASE WHEN STATUS = 'ABERTA' THEN 'EM_ANALISE' ELSE STATUS END,
      ATUALIZADO_EM = '\${esc(new Date().toISOString().slice(0, 19))}'
  WHERE ID = \${solicitacaoId}
\`);

return { success: true, comprasSolicitacaoId: num(comprasSolicitacaoId), comprasStatus: remoteRows[0].STATUS || 'PENDENTE' };
`;

const sincronizarStatusCode = `
const sdk = require('mitra-sdk');

const localProjectId = ${projectId};
const comprasProjectId = ${comprasProjectId};

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
const localItems = await runLocal(\`
  SELECT ID, SOLICITACAO_ID, COMPRAS_SOLICITACAO_ID
  FROM SOLICITACAO_ITENS
  WHERE COMPRAS_SOLICITACAO_ID IS NOT NULL
    AND COMPRAS_SOLICITACAO_ID > 0
    \${solicitacaoIdFilter ? 'AND SOLICITACAO_ID = ' + solicitacaoIdFilter : ''}
  ORDER BY ID DESC
  LIMIT 200
\`);

if (!localItems.length) return { success: true, synced: 0 };

const ids = localItems.map((item) => Number(item.COMPRAS_SOLICITACAO_ID)).filter(Boolean);
const remoteRows = await runCompras(\`
  SELECT ID, STATUS, AVALIADO_EM, OBS_AVALIACAO, ID_CARD_VINCULADO
  FROM SGC_SOLICITACOES
  WHERE ID IN (\${ids.join(',')})
\`);

const remoteById = new Map(remoteRows.map((row) => [Number(row.ID), row]));
const touched = new Map();
const now = new Date().toISOString().slice(0, 19);

for (const item of localItems) {
  const remote = remoteById.get(Number(item.COMPRAS_SOLICITACAO_ID));
  if (!remote) continue;
  await runLocalDml(\`
    UPDATE SOLICITACAO_ITENS
    SET COMPRAS_STATUS = '\${esc(remote.STATUS || '')}',
        COMPRAS_AVALIADO_EM = '\${esc(remote.AVALIADO_EM || '')}',
        COMPRAS_OBS_AVALIACAO = '\${esc(remote.OBS_AVALIACAO || '')}',
        COMPRAS_CARD_ID = \${Number(remote.ID_CARD_VINCULADO || 0) || 'NULL'},
        COMPRAS_SYNC_EM = '\${esc(now)}',
        COMPRAS_SYNC_ERRO = NULL
    WHERE ID = \${Number(item.ID)}
  \`);
  const arr = touched.get(Number(item.SOLICITACAO_ID)) || [];
  arr.push(remote.STATUS || '');
  touched.set(Number(item.SOLICITACAO_ID), arr);
}

for (const [solicitacaoId, statuses] of touched.entries()) {
  const nextStatus = localStatus(statuses);
  if (!nextStatus) continue;
  await runLocalDml(\`
    UPDATE SOLICITACOES
    SET STATUS = '\${esc(nextStatus)}', ATUALIZADO_EM = '\${esc(now)}'
    WHERE ID = \${solicitacaoId}
  \`);
}

return { success: true, synced: touched.size };
`;

const definitions = [
  {
    name: 'solicitacoesComprasEnviarItemCompras',
    type: 'JAVASCRIPT',
    code: enviarItemCode,
    description: 'Envia um item de solicitacao comercial para o projeto de compras e grava o vinculo remoto.',
  },
  {
    name: 'solicitacoesComprasSincronizarStatusCompras',
    type: 'JAVASCRIPT',
    code: sincronizarStatusCode,
    description: 'Sincroniza status das solicitacoes enviadas ao projeto de compras de volta para o projeto comercial.',
  },
];

async function upsertServerFunctions() {
  const listed = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const ids = {};
  for (const definition of definitions) {
    const existing = listed.find((item) => item.name === definition.name);
    if (existing) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: Number(existing.id),
        type: definition.type,
        code: definition.code,
        description: definition.description,
      });
      ids[definition.name] = Number(existing.id);
    } else {
      const created = await createServerFunctionMitra({ projectId, ...definition });
      ids[definition.name] = Number(created?.result?.serverFunctionId || created?.result?.id || created?.id || created?.serverFunctionId);
    }
  }
  return ids;
}

async function main() {
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_SOLICITACAO_ID', 'COMPRAS_SOLICITACAO_ID INT');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_STATUS', 'COMPRAS_STATUS VARCHAR(30)');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_CARD_ID', 'COMPRAS_CARD_ID INT');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_AVALIADO_EM', 'COMPRAS_AVALIADO_EM VARCHAR(19)');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_OBS_AVALIACAO', 'COMPRAS_OBS_AVALIACAO TEXT');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_SYNC_EM', 'COMPRAS_SYNC_EM VARCHAR(19)');
  await addColumnIfMissing('SOLICITACAO_ITENS', 'COMPRAS_SYNC_ERRO', 'COMPRAS_SYNC_ERRO TEXT');

  const ids = await upsertServerFunctions();
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
