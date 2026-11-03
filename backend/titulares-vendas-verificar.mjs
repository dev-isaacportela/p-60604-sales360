// Verificação: dentro do CTE onde a venda é atribuída ao vendedor, cada venda (AUTO_ID/ID) deve aparecer 1 vez.
// Compara código original (backup) x patch, simulando como coordenadora (TEAM) / diretoria.
import 'dotenv/config';
import fs from 'fs';
import * as s from 'mitra-sdk';
import { aplicar } from './titulares-vendas-patch.mjs';
s.configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = +process.env.MITRA_PROJECT_ID;
const ATRIBS = ['CS.TARGET_USER_ID = B.TARGET_USER_ID', 'CS.USER_ID = BS.USER_ID', 'WHERE BV.VENDEDOR_ID = CCC.ID_VENDEDOR', 'WHERE BV.VENDEDOR_ID = CC.ID_VENDEDOR', 'BV_SCOPE.VENDEDOR_ID = EC.ID_VENDEDOR', 'BV_SCOPE.VENDEDOR_ID = EC.VENDEDOR_ID'];
function ctesAtrib(code) {
  const nomes = new Set();
  for (const a of ATRIBS) { let p = 0, i; while ((i = code.indexOf(a, p)) !== -1) { const k = code.lastIndexOf(' AS (', i); const m = code.slice(Math.max(0, k - 80), k).match(/([A-Z_][A-Z0-9_]*)\s*$/); if (m) nomes.add(m[1]); p = i + a.length; } }
  return [...nomes];
}
// corta a query principal: fim do último CTE (profundidade 0 após o WITH)
function corpoCtes(code) {
  const w = code.search(/\bWITH\b/i); let d = 0, fim = -1, q = false;
  for (let i = w; i < code.length; i++) { const c = code[i]; if (c === "'") q = !q; if (q) continue; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) fim = i; } else if (d === 0 && fim > 0 && /[A-Za-z]/.test(c)) { const resto = code.slice(i, i + 6).toUpperCase(); if (resto.startsWith('SELECT')) return code.slice(0, fim + 1); } }
  return null;
}
const CEN = { team: [35, { scopeMode: 'TEAM', ano: '2026', mes: '9' }], dir: [54, { ano: '2026', mes: '9' }] };
function render(code, uid, cen) { const p = { scopeMode: 'ME', limit: '500', offset: '0', ...cen }; return code.replace(/:VAR_USER\b/g, String(uid)).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in p ? String(p[k]) : '')); }
async function contar(code, cte, uid, cen) {
  const base = corpoCtes(code); if (!base) return 'sem-corte';
  for (const col of ['AUTO_ID', 'ID', "CONCAT(NUMPED,'|',CODPROD,'|',CODCLI,'|',TOTAL,'|',QT)"]) {
    try { const r = await s.runQueryMitra({ projectId, sql: render(`${base}\nSELECT COUNT(*) N, COUNT(DISTINCT ${col}) D FROM ${cte}`, uid, cen) }); const x = r.result.rows[0]; return `${x.N}/${x.D}${x.N == x.D ? ' ok' : ' DUP'}`; } catch (e) { if (!/Unknown column/.test(JSON.stringify(e))) return 'ERR ' + JSON.stringify(e?.message || e).slice(0, 120); }
  }
  return 'sem-id';
}
const [cenNome, ...ids] = process.argv.slice(2);
const [uid, cen] = CEN[cenNome];
for (const id of ids.map(Number)) {
  const orig = fs.readFileSync(`backups/sf-pre-titular-vendas/${id}.sql`, 'utf8');
  const novo = aplicar(orig).code.replace(/\n\/\*TITULAR_VENDAS\*\/\s*$/, '');
  const out = [];
  for (const cte of ctesAtrib(orig)) out.push(`${cte}: antes ${await contar(orig, cte, uid, cen)} | depois ${await contar(novo, cte, uid, cen)}`);
  console.log(id, out.join(' ; ') || '(sem ponto de atribuição)');
}
