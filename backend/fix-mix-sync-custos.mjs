import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  runDdlMitra,
  runDmlMitra,
  runQueryMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/*
 * Causa raiz do sync de custos parado desde 2026-06-15:
 *
 * A SF 251 monta CUSTO_ESPECIAL_ID = POLICY_ITEM.ID * 1000000 + CLIENTE_ID.
 * Com cliente 107982 isso gera 2.153.107.982, acima do teto do INT (2.147.483.647),
 * e o INSERT em CUSTO_ESPECIAL_CLIENTES morre com "Out of range value".
 * A coluna irma (CUSTO_ESPECIAL_PRODUTO.ITEM_ID) ja e BIGINT; esta ficou para tras.
 *
 * O certo seria ALTER TABLE ... MODIFY BIGINT, mas a plataforma bloqueia statement
 * destrutivo e o SDK 1.0.58 nao expoe confirmDestructive. Como a tabela e um CACHE
 * derivado (reconstruido do projeto de custos a cada sync), criamos a versao correta
 * ao lado e migramos as leituras/escritas. A tabela antiga fica intacta.
 */
const TABELA_NOVA = 'CUSTO_ESPECIAL_CLIENTES_BIG';

async function criarTabelaNova() {
  await runDdlMitra({
    projectId,
    sql:
      `CREATE TABLE IF NOT EXISTS ${TABELA_NOVA} (` +
      'CUSTO_ESPECIAL_ID BIGINT NOT NULL, ' +
      'CLIENTE_ID INT NOT NULL, ' +
      'PRIMARY KEY (CUSTO_ESPECIAL_ID, CLIENTE_ID), ' +
      `INDEX IDX_${TABELA_NOVA}_CLIENTE (CLIENTE_ID)` +
      ')',
  });

  await runDmlMitra({
    projectId,
    sql:
      `INSERT INTO ${TABELA_NOVA} (CUSTO_ESPECIAL_ID, CLIENTE_ID) ` +
      'SELECT CUSTO_ESPECIAL_ID, CLIENTE_ID FROM CUSTO_ESPECIAL_CLIENTES ' +
      'ON DUPLICATE KEY UPDATE CLIENTE_ID = VALUES(CLIENTE_ID)',
  });

  const n = await runQueryMitra({ projectId, sql: `SELECT COUNT(*) AS N FROM ${TABELA_NOVA}` });
  console.log(`${TABELA_NOVA} pronta com ${n?.result?.rows?.[0]?.N} linhas migradas.`);
}

async function corrigirSf251() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
  let code = atual?.result?.code || '';

  // 1) passa a escrever na tabela com CUSTO_ESPECIAL_ID BIGINT
  code = code.split('CUSTO_ESPECIAL_CLIENTES (CUSTO_ESPECIAL_ID, CLIENTE_ID)').join(`${TABELA_NOVA} (CUSTO_ESPECIAL_ID, CLIENTE_ID)`);
  code = code.split("'CREATE TABLE IF NOT EXISTS CUSTO_ESPECIAL_CLIENTES (' +").join(`'CREATE TABLE IF NOT EXISTS ${TABELA_NOVA} (' +`);
  code = code.split("'CUSTO_ESPECIAL_ID INT NOT NULL, ' +").join("'CUSTO_ESPECIAL_ID BIGINT NOT NULL, ' +");
  code = code.split("'INDEX IDX_CUSTO_ESPECIAL_CLIENTES_CLIENTE (CLIENTE_ID)' +").join(`'INDEX IDX_${TABELA_NOVA}_CLIENTE (CLIENTE_ID)' +`);

  // 2) MIX_CUSTOS_SYNC.VALOR e VARCHAR(255): mensagem longa fazia o proprio catch
  //    estourar e a SF terminava FAILED em vez de devolver o fallback.
  if (!code.includes('.slice(0, 240)')) {
    code = code.split("await setStatus('LAST_ERROR', descreverErro(error), now);")
               .join("await setStatus('LAST_ERROR', descreverErro(error).slice(0, 240), now);");
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 251,
    code,
    description: atual?.result?.description || 'Sincroniza o cache de custos do Mix Builder quando o TTL expira.',
  });
  console.log('SF 251 atualizada (tabela BIGINT + LAST_ERROR truncado).');
}

async function corrigirSf228() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 228 });
  const code = (atual?.result?.code || '').split('CUSTO_ESPECIAL_CLIENTES').join(TABELA_NOVA);
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: 228,
    code,
    description: atual?.result?.description || '',
  });
  console.log('SF 228 apontada para a tabela nova.');
}

async function main() {
  await criarTabelaNova();
  await corrigirSf251();
  await corrigirSf228();

  console.log('\nExecutando sync completo (pode levar ~40s)...');
  const r = await executeServerFunctionMitra({ projectId, serverFunctionId: 251, input: { ttlSeconds: '0' } });
  let out = r?.result?.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* mantem */ } }
  console.log('SF 251 ->', r?.result?.executionStatus, JSON.stringify(out));

  const status = await runQueryMitra({ projectId, sql: 'SELECT CHAVE, VALOR FROM MIX_CUSTOS_SYNC ORDER BY CHAVE' });
  for (const row of status?.result?.rows || []) console.log(`  ${row.CHAVE} = ${String(row.VALOR).slice(0, 120)}`);
}

main().catch((error) => {
  console.error('Falha ao corrigir o sync de custos:');
  console.error(error?.message || error);
  process.exit(1);
});
