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
const ownerUserId = 5;
const ownerEmail = 'ti@benenutri.com';

const ownerCondition = `(:VAR_USER = ${ownerUserId} OR LOWER((SELECT COALESCE(DESCR, '') FROM INT_USER WHERE ID = :VAR_USER)) = '${ownerEmail}')`;

async function columnExists(tableName, columnName) {
  const response = await runQueryMitra({
    projectId,
    sql: `SELECT COUNT(*) AS TOTAL
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '${tableName}'
            AND COLUMN_NAME = '${columnName}'`,
  });
  const row = (response?.result?.rows || response?.rows || [])[0] || {};
  return Number(row.TOTAL || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await columnExists(tableName, columnName)) return;
  await runDdlMitra({ projectId, sql: `ALTER TABLE ${tableName} ADD COLUMN ${ddl}` });
}

const criarSolicitacaoCode = `
INSERT INTO SOLICITACOES (
  CLIENTE,
  TIPO_SOLICITACAO,
  DESCRICAO,
  PRIORIDADE,
  STATUS,
  PRAZO_DESEJADO,
  CODFILIAL,
  FILIAL_NOME,
  EXECUTIVO_ID,
  EXECUTIVO_EMAIL,
  REFERENCIA_COMERCIAL_ID,
  CRIADO_EM,
  ATUALIZADO_EM
)
SELECT
  '{{cliente}}',
  '{{tipoSolicitacao}}',
  '{{descricao}}',
  '{{prioridade}}',
  'ABERTA',
  '{{prazoDesejado}}',
  '{{codfilial}}',
  '{{filialNome}}',
  U.ID,
  U.DESCR,
  NULLIF('{{referenciaComercialId}}', ''),
  '{{criadoEm}}',
  '{{criadoEm}}'
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${ownerCondition}
`;

function wrapperCode(remoteSfId) {
  return `
const sdk = require('mitra-sdk');
const comprasProjectId = ${comprasProjectId};

function rowsFrom(response) {
  let output = response && response.result && response.result.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch (error) { output = {}; }
  }
  return (output && (output.rows || output.result)) || [];
}

const codprod = String(event.codprod || '').trim();
const codfilial = String(event.codfilial || '').trim();
if (!codprod || !codfilial) return [];

const response = await sdk.executeServerFunctionMitra({
  projectId: comprasProjectId,
  serverFunctionId: ${remoteSfId},
  input: { codprod, codfilial },
});

const status = String(response && response.result && response.result.executionStatus || '');
const error = String(response && response.result && response.result.error || '').trim();
if ((status && status !== 'COMPLETED') || error) throw new Error(error || status || 'Falha na consulta remota.');
return { rows: rowsFrom(response) };
`;
}

const definitions = [
  {
    name: 'solicitacoesComprasCriar',
    type: 'SQL',
    code: criarSolicitacaoCode,
    description: 'Cria solicitacao de compras vinculando o executivo ao usuario logado, filial escolhida e referencia comercial.',
  },
  {
    name: 'solicitacoesComprasProdutoSaidaFilial',
    type: 'JAVASCRIPT',
    code: wrapperCode(495),
    description: 'Consulta no projeto de compras a saida mensal do produto na filial selecionada.',
  },
  {
    name: 'solicitacoesComprasProdutoClientesFilial',
    type: 'JAVASCRIPT',
    code: wrapperCode(496),
    description: 'Consulta no projeto de compras os principais clientes compradores do produto na filial selecionada.',
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
  await addColumnIfMissing('SOLICITACOES', 'CODFILIAL', 'CODFILIAL VARCHAR(5)');
  await addColumnIfMissing('SOLICITACOES', 'FILIAL_NOME', 'FILIAL_NOME VARCHAR(200)');
  const ids = await upsertServerFunctions();
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
