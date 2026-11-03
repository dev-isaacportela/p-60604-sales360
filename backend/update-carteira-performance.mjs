import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL || decodeTokenPayload(process.env.MITRA_TOKEN)?.backURL || process.env.MITRA_BASE_URL_SPACE,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL || decodeTokenPayload(process.env.MITRA_TOKEN)?.backURL || process.env.MITRA_BASE_URL_SPACE,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_NAME = 'minhaCarteiraClientesRanking';

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

function optimizeRankingSql(sql) {
  const oldJoin = `FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN CARTEIRA_LOGADA CL ON 1 = 1
  JOIN CLIENTES CCLI
    ON CCLI.ID = CL.ID_CLIENTE
   AND (
     CAST(CCLI.ID AS CHAR) = CAST(V.CODCLI AS CHAR)
     OR CAST(CCLI.WINTHOR_CODCLI AS CHAR) = CAST(V.CODCLI AS CHAR)
   )`;

  const newJoin = `FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
  JOIN CLIENTES CCLI
    ON (
     CAST(CCLI.ID AS CHAR) = CAST(V.CODCLI AS CHAR)
     OR CAST(CCLI.WINTHOR_CODCLI AS CHAR) = CAST(V.CODCLI AS CHAR)
   )
  JOIN CARTEIRA_LOGADA CL ON CL.ID_CLIENTE = CCLI.ID`;

  if (sql.includes(newJoin)) return sql;
  if (!sql.includes(oldJoin)) {
    throw new Error('Trecho de join crítico não encontrado na função de ranking. Nenhuma alteração aplicada.');
  }

  return sql.replace(oldJoin, newJoin);
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const serverFunctions = listed?.result || listed || [];
  const match = serverFunctions.find((item) => item.name === TARGET_NAME);

  if (!match?.id) {
    throw new Error(`Função não encontrada: ${TARGET_NAME}`);
  }

  const detail = await readServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
  });

  const currentCode = detail?.result?.code || '';
  const updatedCode = optimizeRankingSql(currentCode);

  if (updatedCode === currentCode) {
    console.log(`${TARGET_NAME} já estava otimizada.`);
    return;
  }

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: match.id,
    code: updatedCode,
    description: detail?.result?.description || match.description || 'Ranking paginado da carteira com consulta otimizada.',
  });

  console.log(`${TARGET_NAME} otimizada para evitar join cartesiano entre carteira e vendas.`);
}

main().catch((error) => {
  console.error('Falha ao otimizar ranking da carteira:');
  console.error(error?.message || error);
  process.exit(1);
});
