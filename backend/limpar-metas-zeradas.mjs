/**
 * Remove as linhas zeradas de METAS_BU_VENDEDOR — autorizado pelo usuario.
 *
 * Contexto: ate a correcao, o botao Salvar da aba Analytics > Metas gravava
 * META_VALOR = 0 para TODO vendedor em escopo, mesmo sem edicao (campo vazio
 * virava '0' em normalizeCurrencyInput). Resultado: 49 linhas, nenhuma com
 * valor. Essas linhas nao representam meta nenhuma e, com a view
 * VW_META_VENDEDOR_MES, ainda bloqueiam o fallback historico de METAS_VENDEDOR.
 *
 * Só apaga linhas com META_VALOR = 0. Faz backup em backups/ antes.
 * Idempotente: rodar de novo nao apaga nada alem do que ja se aplica.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const query = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];

async function main() {
  const alvo = await query('SELECT * FROM METAS_BU_VENDEDOR WHERE COALESCE(META_VALOR, 0) = 0 ORDER BY ANO, MES, VENDEDOR_ID');
  const mantidas = await query('SELECT COUNT(*) AS N FROM METAS_BU_VENDEDOR WHERE COALESCE(META_VALOR, 0) <> 0');

  console.log(`Linhas zeradas a remover: ${alvo.length}`);
  console.log(`Linhas com valor (preservadas): ${mantidas[0]?.N ?? 0}`);
  if (alvo.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const destino = path.join('backups', `metas-bu-vendedor-zeradas-${stamp}.json`);
  fs.mkdirSync('backups', { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(alvo, null, 1));
  console.log(`Backup: ${destino}`);

  const res = await runDmlMitra({ projectId, sql: 'DELETE FROM METAS_BU_VENDEDOR WHERE COALESCE(META_VALOR, 0) = 0' });
  console.log('DELETE executado.', res?.result?.migration || res?.result?.migrationSkippedReason || '');

  const restante = await query('SELECT COUNT(*) AS N FROM METAS_BU_VENDEDOR');
  console.log(`METAS_BU_VENDEDOR agora tem ${restante[0]?.N ?? 0} linha(s).`);
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
