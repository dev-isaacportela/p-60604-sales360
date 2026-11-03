import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

// ---------------------------------------------------------------------------
// 1) SF dedicada da tela Mix Builder para a carteira do vendedor logado.
//    Nao reaproveitamos a SF 27 (usada por 5 telas) so para expor CODFILIAL.
//    Escopo ME: carteira propria + carteira de quem o usuario substitui.
// ---------------------------------------------------------------------------
const MIX_CARTEIRA_CLIENTES = `
SELECT
  C.ID,
  COALESCE(C.WINTHOR_CODCLI, C.ID) AS CODCLI,
  C.NOME_FANTASIA,
  C.RAZAO_SOCIAL,
  MIN(TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), ''))) AS CODFILIAL
FROM CLIENTES C
JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = C.ID
LEFT JOIN BU_VENDEDOR BV
  ON BV.VENDEDOR_ID = EC.ID_VENDEDOR
 AND COALESCE(BV.ATIVO, TRUE) = TRUE
WHERE (
  EC.ID_VENDEDOR = :VAR_USER
  OR EC.ID_VENDEDOR IN (SELECT F.ID FROM FUNCIONARIOS F WHERE F.ID_SUBSTITUTO = :VAR_USER)
)
AND (
  '{{busca}}' = ''
  OR C.NOME_FANTASIA LIKE '%{{busca}}%'
  OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
  OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
  OR CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) LIKE '%{{busca}}%'
)
GROUP BY C.ID, C.WINTHOR_CODCLI, C.NOME_FANTASIA, C.RAZAO_SOCIAL
ORDER BY C.NOME_FANTASIA
LIMIT {{limit}} OFFSET {{offset}}
`.trim();

// ---------------------------------------------------------------------------
// 2) Custos especiais: casamento SOMENTE por cliente (codcli), sem filial.
//    O bug anterior: o ramo "NOT EXISTS em CUSTO_ESPECIAL_CLIENTES" era avaliado
//    mesmo para politicas com CLIENTE_ID preenchido, entao um custo negociado para
//    um cliente aparecia para todos os outros.
//    Agora o custo so e global quando CLIENTE_ID E NULL *e* nao ha vinculo explicito.
//    O comparativo aceita CLIENTES.ID e WINTHOR_CODCLI porque a origem grava o codcli.
// ---------------------------------------------------------------------------
const MIX_CUSTOS_DISPONIVEIS = `
WITH CLIENTE_ALVO AS (
  SELECT C.ID AS ID, COALESCE(C.WINTHOR_CODCLI, C.ID) AS CODCLI
  FROM CLIENTES C
  WHERE C.ID = CAST(NULLIF('{{clienteId}}', '') AS UNSIGNED)
)
SELECT
  CE.CODPROD,
  CE.CLIENTE_ID,
  CE.CUSTO,
  'ESPECIAL' AS TIPO_CUSTO,
  CONCAT('ESPECIAL:', CE.POLITICA_ID, ':', CE.ITEM_ID) AS CUSTO_ID,
  CONCAT(CE.POLITICA_NOME, ' - ', CAST(CE.CUSTO AS CHAR)) AS LABEL,
  CE.POLITICA_ID,
  CE.POLITICA_NOME,
  CE.FILIAL_ID,
  CE.DATA_INICIO AS DATA_REF
FROM CUSTO_ESPECIAL_PRODUTO CE
WHERE CE.CODPROD = CAST(NULLIF('{{codprod}}', '') AS UNSIGNED)
  AND CE.STATUS = 'ACTIVE'
  AND (
    -- custo do proprio cliente
    EXISTS (
      SELECT 1 FROM CLIENTE_ALVO A
      WHERE CE.CLIENTE_ID IN (A.ID, A.CODCLI)
    )
    -- ou cliente explicitamente vinculado a politica
    OR EXISTS (
      SELECT 1
      FROM CUSTO_ESPECIAL_CLIENTES CEC
      JOIN CLIENTE_ALVO A ON CEC.CLIENTE_ID IN (A.ID, A.CODCLI)
      WHERE CEC.CUSTO_ESPECIAL_ID = CE.ITEM_ID
    )
    -- ou custo realmente geral: sem cliente e sem nenhum vinculo
    OR (
      CE.CLIENTE_ID IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM CUSTO_ESPECIAL_CLIENTES CEC_ANY
        WHERE CEC_ANY.CUSTO_ESPECIAL_ID = CE.ITEM_ID
      )
    )
  )
ORDER BY CE.POLITICA_NOME, CE.CUSTO
`.trim();

const serverFunctions = [
  {
    name: 'mixCarteiraClientes',
    description: 'Carteira do vendedor logado para o Mix Builder, com CODCLI e CODFILIAL. Params: busca, limit, offset.',
    code: MIX_CARTEIRA_CLIENTES,
  },
  {
    name: 'mixCustosDisponiveis',
    description: 'Custos especiais ativos de um produto para um cliente. Casa apenas por cliente (ID ou WINTHOR_CODCLI); nao vaza politica de outro cliente. Params: codprod, clienteId.',
    code: MIX_CUSTOS_DISPONIVEIS,
  },
];

// ---------------------------------------------------------------------------
// 3) SF 251: os 4 ALTER TABLE ... MODIFY incondicionais sao statements destrutivos
//    e a plataforma bloqueia (DESTRUCTIVE_BLOCKED), derrubando o sync inteiro depois
//    de ~24s. As colunas ja estao nos tipos alvo, entao passam a rodar so se divergirem.
// ---------------------------------------------------------------------------
const ALTERS_ANTIGOS = `  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY CUSTO DECIMAL(12,4) NOT NULL' });
  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_PADRAO_PRODUTO MODIFY DATA_REF VARCHAR(19) NOT NULL' });`;

const ALTERS_NOVOS = `  await ensureColumnType('CUSTO_PADRAO_PRODUTO', 'CUSTO', 'decimal(12,4)', 'DECIMAL(12,4) NOT NULL');
  await ensureColumnType('CUSTO_PADRAO_PRODUTO', 'DATA_REF', 'varchar(19)', 'VARCHAR(19) NOT NULL');`;

const ALTERS_ANTIGOS_2 = `  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO MODIFY CUSTO DECIMAL(12,4) NOT NULL' });
  await runDdlMitra({ projectId, sql: 'ALTER TABLE CUSTO_ESPECIAL_PRODUTO MODIFY ITEM_ID BIGINT NOT NULL' });`;

const ALTERS_NOVOS_2 = `  await ensureColumnType('CUSTO_ESPECIAL_PRODUTO', 'CUSTO', 'decimal(12,4)', 'DECIMAL(12,4) NOT NULL');
  await ensureColumnType('CUSTO_ESPECIAL_PRODUTO', 'ITEM_ID', 'bigint', 'BIGINT NOT NULL');`;

const HELPER = `
// ALTER TABLE ... MODIFY e statement destrutivo e a plataforma bloqueia por default.
// So emitimos o ALTER quando o tipo atual realmente diverge do alvo.
async function ensureColumnType(tableName, columnName, tipoAtual, tipoAlvo) {
  const info = await runQueryMitra({
    projectId,
    sql:
      "SELECT COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" + tableName + "' AND COLUMN_NAME = '" + columnName + "'",
  });
  const row = info?.result?.rows?.[0];
  if (!row) return;
  if (String(row.COLUMN_TYPE || '').toLowerCase() === tipoAtual && String(row.IS_NULLABLE) === 'NO') return;
  await runDdlMitra({ projectId, sql: 'ALTER TABLE ' + tableName + ' MODIFY ' + columnName + ' ' + tipoAlvo });
}

async function ensureTables() {`;

async function corrigirSf251() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
  let code = atual?.result?.code || '';

  if (code.includes('ensureColumnType')) {
    console.log('SF 251 ja corrigida.');
    return;
  }

  for (const [de, para] of [[ALTERS_ANTIGOS, ALTERS_NOVOS], [ALTERS_ANTIGOS_2, ALTERS_NOVOS_2]]) {
    if (!code.includes(de)) throw new Error('Trecho de ALTER nao encontrado na SF 251 — abortando sem alterar.');
    code = code.replace(de, para);
  }

  if (!code.includes('async function ensureTables() {')) {
    throw new Error('ensureTables nao encontrada na SF 251 — abortando sem alterar.');
  }
  code = code.replace('async function ensureTables() {', HELPER.trim());

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 251,
    code,
    description: atual?.result?.description || 'Sincroniza o cache de custos do Mix Builder quando o TTL expira.',
  });
  console.log('SF 251 corrigida (ALTER TABLE condicional).');
}

async function upsert() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || listed || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);
    if (found?.id) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: sf.code, description: sf.description });
      ids[sf.name] = found.id;
      console.log(`SF ${sf.name} atualizada (id ${found.id}).`);
      continue;
    }
    const created = await createServerFunctionMitra({ projectId, name: sf.name, type: 'SQL', code: sf.code, description: sf.description });
    ids[sf.name] = created?.result?.serverFunctionId || created?.result?.id;
    console.log(`SF ${sf.name} criada (id ${ids[sf.name]}).`);
  }
  return ids;
}

async function smoke(serverFunctionId, input, label) {
  const r = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(r?.result?.executionStatus || '');
  const error = String(r?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`${label} falhou: ${(error || status).slice(0, 300)}`);
  let out = r?.result?.output;
  if (typeof out === 'string') out = JSON.parse(out);
  console.log(`smoke ${label}: OK (${(out?.rows || []).length} linhas)`);
  return out?.rows || [];
}

async function main() {
  const ids = await upsert();
  await corrigirSf251();

  await smoke(ids.mixCarteiraClientes, { busca: '', limit: '5', offset: '0' }, 'mixCarteiraClientes');
  await smoke(ids.mixCustosDisponiveis, { codprod: '1', clienteId: '212' }, 'mixCustosDisponiveis');

  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir custos/carteira do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
