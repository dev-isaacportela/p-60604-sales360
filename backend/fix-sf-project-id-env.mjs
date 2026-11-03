/**
 * Troca o id de projeto escrito no codigo das Server Functions JavaScript
 * por const <var> = Number(process.env.MITRA_PROJECT_ID).
 *
 * O runtime injeta o id do projeto onde a SF roda: neste DEV resolve para o DEV
 * e, depois do promote, para a producao.
 *
 * NAO toca nos ids de projetos externos usados como fonte de dados
 * (45547 Compras, 44515 Planejamento, 46967 catalogo de custos remoto).
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const ID_PRODUCAO = 45654;
const ALVOS = [130, 208, 212, 237, 238, 239, 251, 264, 268, 277, 278, 288, 294, 303, 365, 370, 371, 372, 375];

const NOVO = 'Number(process.env.MITRA_PROJECT_ID)';

/** Formas em que o id da producao aparece hoje, da mais especifica para a mais simples. */
function substituir(code) {
  let out = code;
  let trocas = 0;

  // 1) fallback: const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || 45654);
  out = out.replace(
    /const\s+(\w*[pP]rojectId)\s*=\s*Number\(\s*process\.env\.MITRA_PROJECT_ID(?:\s*\|\|[^;]*?)?\|\|\s*45654\s*\)\s*;/g,
    (_m, varName) => { trocas++; return `const ${varName} = ${NOVO};`; }
  );

  // 2) numero puro: const projectId = 45654;  /  const localProjectId = 45654;
  out = out.replace(
    /const\s+(\w*[pP]rojectId)\s*=\s*45654\s*;/g,
    (_m, varName) => { trocas++; return `const ${varName} = ${NOVO};`; }
  );

  return { out, trocas };
}

const relatorio = [];
for (const serverFunctionId of ALVOS) {
  const lido = await readServerFunctionMitra({ projectId, serverFunctionId });
  const sf = lido?.result ?? lido;
  const code = sf.code ?? '';

  const { out, trocas } = substituir(code);

  const restou = (out.match(new RegExp(`\\b${ID_PRODUCAO}\\b`, 'g')) || []).length;
  if (trocas === 0 || restou > 0) {
    relatorio.push({ serverFunctionId, nome: sf.name, status: 'NAO APLICADO', trocas, restou });
    console.log(`!! SF ${serverFunctionId} (${sf.name}): trocas=${trocas} restou=${restou} -> NAO atualizada`);
    continue;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId,
    code: out,
    description: sf.description,
  });
  relatorio.push({ serverFunctionId, nome: sf.name, status: 'OK', trocas });
  console.log(`ok SF ${serverFunctionId} (${sf.name}): ${trocas} troca(s)`);
}

const falhas = relatorio.filter((r) => r.status !== 'OK');
console.log(`\nAtualizadas: ${relatorio.length - falhas.length}/${ALVOS.length}`);
if (falhas.length) console.log('Pendentes:', JSON.stringify(falhas, null, 2));
