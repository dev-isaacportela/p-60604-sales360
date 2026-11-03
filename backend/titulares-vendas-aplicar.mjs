import 'dotenv/config';
import fs from 'fs';
import * as s from 'mitra-sdk';
import { aplicar } from './titulares-vendas-patch.mjs';
s.configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = +process.env.MITRA_PROJECT_ID;
const ids = process.argv.slice(2).map(Number);
const CEN = { isabella: { scopeMode: 'SELLER', scopeUserId: '27' }, maria: { scopeMode: 'SELLER', scopeUserId: '41' }, global: { scopeMode: 'GLOBAL', scopeUserId: '' } };
function inputs(code, cen) {
  const inp = {};
  for (const m of code.matchAll(/\{\{(\w+)\}\}/g)) inp[m[1]] = '';
  Object.assign(inp, { scopeCodRca: '', scopeCodSupervisor: '', scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '' }, cen);
  if ('limit' in inp) inp.limit = 500; if ('offset' in inp) inp.offset = 0;
  return inp;
}
function resumo(r) {
  const o = r.result; if (o.error || o.executionStatus !== 'COMPLETED') return { err: String(o.error || o.executionStatus).slice(0, 160) };
  let rows = o.output?.rows ?? o.output; if (!Array.isArray(rows)) rows = [rows];
  let soma = 0; for (const x of rows) for (const v of Object.values(x || {})) if (typeof v === 'number') soma += v;
  return { n: rows.length, soma: Math.round(soma * 100) / 100 };
}
async function snap(id, code) { const res = {}; for (const [k, c] of Object.entries(CEN)) { const t = Date.now(); try { res[k] = resumo(await s.executeServerFunctionMitra({ projectId, serverFunctionId: id, input: inputs(code, c) })); } catch (e) { res[k] = { err: String(e?.message?.message || e?.message || e).slice(0, 160) }; } res[k].ms = Date.now() - t; } return res; }
const rel = [];
for (const id of ids) {
  const atual = (await s.readServerFunctionMitra({ projectId, serverFunctionId: id })).result;
  // FROM_BACKUP: reaplica a versão atual do patch a partir do código original (backup)
  const base = process.env.FROM_BACKUP ? fs.readFileSync(`backups/sf-pre-titular-vendas/${id}.sql`, 'utf8') : atual.code;
  const r = aplicar(base);
  if (!r.mudou) { console.log(id, atual.name, 'sem mudança'); continue; }
  const antes = await snap(id, atual.code);
  await s.updateServerFunctionMitra({ projectId, serverFunctionId: id, code: r.code });
  const depois = await snap(id, atual.code);
  const novoErro = Object.keys(CEN).some((k) => depois[k].err && !antes[k].err);
  const lento = Object.keys(CEN).some((k) => depois[k].ms > Math.max(15000, antes[k].ms * 4));
  if (novoErro || lento) { await s.updateServerFunctionMitra({ projectId, serverFunctionId: id, code: atual.code }); }
  const linha = { id, nome: atual.name, row: r.rowLevel, tab: r.tableLevel, status: novoErro ? 'REVERTIDO-ERRO' : lento ? 'REVERTIDO-LENTO' : 'OK', antes, depois };
  rel.push(linha); console.log(JSON.stringify(linha));
}
fs.writeFileSync(`/tmp/sfall/rel-${Date.now()}.json`, JSON.stringify(rel, null, 1));
