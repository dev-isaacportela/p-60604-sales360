import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;
const projectId = Number(process.env.MITRA_PROJECT_ID);

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

function addActiveOnlyDuplicateCheck(code) {
  if (code.includes('COALESCE(AI.LIDO, 0) = 0')) return code;

  const escapedMarker = "AND COALESCE(AI.PRODUTO_REFERENCIA, '') = COALESCE(G.PRODUTO_REFERENCIA, '')\\n    AND AI.DATA_GERACAO";
  if (code.includes(escapedMarker)) {
    return code.replace(
      escapedMarker,
      "AND COALESCE(AI.PRODUTO_REFERENCIA, '') = COALESCE(G.PRODUTO_REFERENCIA, '')\\n    AND COALESCE(AI.LIDO, 0) = 0\\n    AND AI.DATA_GERACAO",
    );
  }

  const plainMarker = "AND COALESCE(AI.PRODUTO_REFERENCIA, '') = COALESCE(G.PRODUTO_REFERENCIA, '')\n    AND AI.DATA_GERACAO";
  if (code.includes(plainMarker)) {
    return code.replace(
      plainMarker,
      "AND COALESCE(AI.PRODUTO_REFERENCIA, '') = COALESCE(G.PRODUTO_REFERENCIA, '')\n    AND COALESCE(AI.LIDO, 0) = 0\n    AND AI.DATA_GERACAO",
    );
  }

  throw new Error('Nao foi possivel localizar o trecho de deduplicacao dos avisos.');
}

function addRefreshMode(code) {
  if (code.includes('const refresh =')) return code;

  const marker = "const vendedoresParaProcessar = force ? vendedores : vendedores.filter((id) => !existentes.has(id));";
  if (!code.includes(marker)) {
    throw new Error('Nao foi possivel localizar o trecho de processamento incremental dos avisos.');
  }

  return code.replace(marker, `const refresh = ['true', '1', 'sim', 's'].includes(String(evt.refresh || evt.atualizar || '').toLowerCase());

  let avisosArquivados = 0;
  if (refresh) {
    const archiveRes = await runDmlMitra({
      projectId,
      sql: "UPDATE ALERTAS_INTELIGENTES SET LIDO = 1, DATA_LEITURA = CURRENT_TIMESTAMP WHERE COALESCE(LIDO, 0) = 0 AND DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY)",
    });
    avisosArquivados = Number(archiveRes?.result?.rowCount || archiveRes?.result?.affectedRows || archiveRes?.rowCount || 0);
  }

  const vendedoresParaProcessar = refresh || force ? vendedores : vendedores.filter((id) => !existentes.has(id));`)
    .replace("MODO: force ? 'FORCE' : 'INCREMENTAL',", "MODO: refresh ? 'REFRESH' : (force ? 'FORCE' : 'INCREMENTAL'),\n        AVISOS_ARQUIVADOS: avisosArquivados,");
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const found = (listed?.result || []).find((item) => item.name === 'alertasInteligentesPopular');
  if (!found) throw new Error('Funcao alertasInteligentesPopular nao encontrada.');

  const current = await readServerFunctionMitra({ projectId, serverFunctionId: found.id });
  const currentCode = String(current?.result?.code || '');
  const nextCode = addRefreshMode(addActiveOnlyDuplicateCheck(currentCode));

  if (nextCode === currentCode) {
    console.log(JSON.stringify({ alertasInteligentesPopular: found.id, status: 'unchanged' }, null, 2));
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: found.id,
    code: nextCode,
    description: current?.result?.description || found.description || 'Gera e atualiza avisos inteligentes da carteira comercial.',
  });

  console.log(JSON.stringify({ alertasInteligentesPopular: found.id, status: 'updated' }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao habilitar atualizacao dos avisos:');
  console.error(error?.message || error);
  process.exit(1);
});
