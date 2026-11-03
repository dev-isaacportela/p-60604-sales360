import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra, executeServerFunctionMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);

const atual = await readServerFunctionMitra({ projectId, serverFunctionId: 251 });
let code = atual?.result?.code || '';

// Erros da SDK vem como objeto: String(err) vira "[object Object]" e apaga o diagnostico.
const HELPER = `
function descreverErro(error) {
  if (!error) return 'erro desconhecido';
  if (typeof error === 'string') return error;
  const partes = [];
  if (error.message) partes.push(String(error.message));
  const detalhe = error.response?.data || error.details || error.data || error.body;
  if (detalhe) {
    try { partes.push(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)); }
    catch { /* ignora */ }
  }
  if (!partes.length) {
    try { partes.push(JSON.stringify(error)); } catch { partes.push(String(error)); }
  }
  return partes.join(' | ').slice(0, 900);
}

function secondsSince(iso) {`;

if (!code.includes('function descreverErro')) {
  code = code.replace('function secondsSince(iso) {', HELPER.trim());
  code = code.split("String(error?.message || error)").join('descreverErro(error)');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 251, code, description: atual?.result?.description || '' });
  console.log('SF 251: diagnostico de erro melhorado.');
}

const r = await executeServerFunctionMitra({ projectId, serverFunctionId: 251, input: { ttlSeconds: '0' } });
let o = r?.result?.output; if (typeof o === 'string') try{o=JSON.parse(o)}catch{}
console.log('SF251 ->', r?.result?.executionStatus);
console.log('ERRO REAL:', String(o?.error || '(nenhum)'));
console.log('resto:', JSON.stringify({ updated:o?.updated, standardCount:o?.standardCount, specialCount:o?.specialCount }));
