import 'dotenv/config';
import {
  configureSdkMitra,
  listDataLoadersMitra,
  updateDataLoaderMitra,
  executeDataLoaderMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;
const integrationURL = process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DATA_LOADER_NAME = 'VENDAS_DASHBOARD_TOTVS_RCA';

const QUERY_VENDAS_ITENS = `
  SELECT
      v.numnota,
      v.numtransvenda,
      v.numped,
      TO_CHAR(v.dtsaida, 'YYYY-MM-DD') AS dtsaida,
      v.codfilial,
      v.codprod,
      v.descricao,
      v.codusur AS cod_rca,
      u.nome AS rca,
      r.nome AS supervisor,
      v.codcli,
      v.cliente,
      v.codfornec,
      v.codepto,
      NVL(dpto.descricao, 'SEM DEPTO') AS departamento,
      s.codsec,
      NVL(s.descricao, 'SEM SECAO') AS secao,
      NVL(ati.ramo, 'SEM RAMO') AS ramo_cliente,
      SUM(NVL(v.qt, 0)) AS qt,
      CASE
        WHEN SUM(NVL(v.qt, 0)) = 0 THEN 0
        ELSE ROUND(SUM(NVL(v.vlvenda, 0)) / SUM(NVL(v.qt, 0)), 6)
      END AS vlunit,
      SUM(NVL(v.vlvenda, 0)) AS total
  FROM view_vendas_resumo_faturamento v
  LEFT JOIN pcusuari u ON v.codusur = u.codusur
  LEFT JOIN pcsuperv r ON v.codsupervisor = r.codsupervisor
  LEFT JOIN pcdepto dpto ON v.codepto = dpto.codepto
  LEFT JOIN pcsecao s ON v.codsec = s.codsec
  LEFT JOIN pcclient cli ON v.codcli = cli.codcli
  LEFT JOIN pcativi ati ON cli.codatv1 = ati.codativ
  WHERE v.codoper = 'S'
  GROUP BY
      v.numnota,
      v.numtransvenda,
      v.numped,
      TO_CHAR(v.dtsaida, 'YYYY-MM-DD'),
      v.codfilial,
      v.codprod,
      v.descricao,
      v.codusur,
      u.nome,
      r.nome,
      v.codcli,
      v.cliente,
      v.codfornec,
      v.codepto,
      s.codsec,
      dpto.descricao,
      s.descricao,
      ati.ramo
`;

async function main() {
  const listed = await listDataLoadersMitra({ projectId });
  const existing = (listed?.result || []).find((loader) => {
    const name = loader?.name || loader?.NAME || '';
    return name === DATA_LOADER_NAME;
  });

  const dataLoaderId = Number(existing?.id || existing?.dataLoaderId || 0);
  if (!dataLoaderId) {
    throw new Error(`Data Loader ${DATA_LOADER_NAME} não encontrado.`);
  }

  await updateDataLoaderMitra({
    projectId,
    dataLoaderId,
    name: DATA_LOADER_NAME,
    jdbcId: Number(existing?.jdbcConnectionConfigId || existing?.jdbcId || 2),
    query: QUERY_VENDAS_ITENS,
  });

  await executeDataLoaderMitra({ projectId, dataLoaderId });

  console.log(`Data Loader ${DATA_LOADER_NAME} atualizado e executado (ID ${dataLoaderId}).`);
}

main().catch((error) => {
  console.error('Falha ao atualizar Data Loader de vendas TOTVS com nível de item:');
  console.error(error?.message || error);
  process.exit(1);
});
