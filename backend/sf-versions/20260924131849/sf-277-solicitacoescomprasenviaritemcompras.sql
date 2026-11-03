
const sdk = require('mitra-sdk');

const localProjectId = 45654;
const comprasProjectId = 45547;
const comprasInserirSolicitacaoSf = 340;

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

const itemRows = await runLocal(`
  SELECT I.ID, I.CODPROD, I.CODFORNEC, I.PRODUTO, I.QUANTIDADE, I.OBSERVACAO, I.COMPRAS_SOLICITACAO_ID,
         S.CLIENTE, S.DESCRICAO, S.PRIORIDADE, S.CODFILIAL, S.FILIAL_NOME, S.CRIADO_EM, S.EXECUTIVO_ID, S.EXECUTIVO_EMAIL,
         U.DESCR AS USUARIO_EMAIL,
         COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.DESCR), ''), NULLIF(TRIM(S.EXECUTIVO_EMAIL), ''), CONCAT('Usuario ', S.EXECUTIVO_ID)) AS VENDEDOR_NOME
  FROM SOLICITACAO_ITENS I
  JOIN SOLICITACOES S ON S.ID = I.SOLICITACAO_ID
  LEFT JOIN INT_USER U ON U.ID = S.EXECUTIVO_ID
  LEFT JOIN FUNCIONARIOS F ON F.ID = S.EXECUTIVO_ID
  WHERE I.SOLICITACAO_ID = ${solicitacaoId}
    AND I.CODPROD = '${esc(codprod)}'
  ORDER BY I.ID DESC
  LIMIT 1
`);

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

const remoteRows = await runCompras(`
  SELECT ID, STATUS
  FROM SGC_SOLICITACOES
  WHERE CODPROD = ${remoteInput.codprod}
    AND QUANTIDADE = ${remoteInput.quantidade}
    AND CODCLI = ${remoteInput.codcli}
    AND CRIADO_EM = '${esc(remoteInput.criadoEm)}'
    AND VENDEDOR_SOLICITANTE_EMAIL = '${esc(remoteInput.vendedorSolicitanteEmail)}'
  ORDER BY ID DESC
  LIMIT 1
`);

const comprasSolicitacaoId = remoteRows[0] && remoteRows[0].ID;
if (!comprasSolicitacaoId) throw new Error('Solicitacao enviada, mas nao foi possivel localizar o ID remoto.');

await runLocalDml(`
  UPDATE SOLICITACAO_ITENS
  SET COMPRAS_SOLICITACAO_ID = ${num(comprasSolicitacaoId)},
      COMPRAS_STATUS = '${esc(remoteRows[0].STATUS || 'PENDENTE')}',
      COMPRAS_SYNC_EM = '${esc(new Date().toISOString().slice(0, 19))}',
      COMPRAS_SYNC_ERRO = NULL
  WHERE ID = ${num(item.ID)}
`);

await runLocalDml(`
  UPDATE SOLICITACOES
  SET STATUS = CASE WHEN STATUS = 'ABERTA' THEN 'EM_ANALISE' ELSE STATUS END,
      ATUALIZADO_EM = '${esc(new Date().toISOString().slice(0, 19))}'
  WHERE ID = ${solicitacaoId}
`);

return { success: true, comprasSolicitacaoId: num(comprasSolicitacaoId), comprasStatus: remoteRows[0].STATUS || 'PENDENTE' };
