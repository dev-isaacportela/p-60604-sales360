import 'dotenv/config';
import fs from 'fs';
import * as s from 'mitra-sdk';
import { aplicar } from './faturamento-dedup-patch.mjs';
s.configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = +process.env.MITRA_PROJECT_ID;
const r = (c, p) => c.replace(/:VAR_USER\b/g, '54').replace(/\{\{(\w+)\}\}/g, (m, k) => (p[k] ?? ''));
const modo = process.argv[2]; const ids = process.argv.slice(3).map(Number);
for (const id of ids) {
  const atual = (await s.readServerFunctionMitra({ projectId, serverFunctionId: id })).result.code;
  fs.writeFileSync(`backups/sf-pre-dedup-faturamento/${id}.sql`, atual);
  const novo = aplicar(atual, id === 242).code;
  const linha = { id };
  for (const [k, p] of [['set', { ano: '2026', mes: '9' }], ['ano', { ano: '2026', mes: '' }]]) {
    const run = async (c) => { try { const x = (await s.runQueryMitra({ projectId, sql: r(c, p) })).result.rows; let t = 0; for (const o of x) t += Number(o.FATURAMENTO ?? o.FATURAMENTO_BRUTO ?? o.TOTAL ?? 0); return `${x.length}/${Math.round(t)}`; } catch (e) { return 'ERR ' + JSON.stringify(e?.message || e).slice(0, 150); } };
    linha[k] = `${await run(atual)} -> ${await run(novo)}`;
  }
  console.log(JSON.stringify(linha));
  if (modo === 'publicar') { await s.updateServerFunctionMitra({ projectId, serverFunctionId: id, code: novo }); const t = await s.executeServerFunctionMitra({ projectId, serverFunctionId: id, input: { ano: '2026', mes: '9' } }); if (t.result.error) { await s.updateServerFunctionMitra({ projectId, serverFunctionId: id, code: atual }); console.log(id, 'REVERTIDO', t.result.error.slice(0, 150)); } else console.log(id, 'publicado'); }
}
