import 'dotenv/config';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

async function q(sql) {
  const res = await runQueryMitra({ projectId, sql });
  return res?.result?.rows || [];
}

async function dml(sql) {
  return runDmlMitra({ projectId, sql });
}

function normalizeString(value) {
  return String(value || '').trim();
}

function buildBuResolver(bus) {
  const byCode = new Map();
  const byName = new Map();
  for (const bu of bus) {
    const code = normalizeString(bu.CODIGO).toUpperCase();
    const name = normalizeString(bu.NOME).toUpperCase();
    if (code) byCode.set(code, bu);
    if (name) byName.set(name, bu);
  }

  return (rawBuCodigo) => {
    const raw = normalizeString(rawBuCodigo);
    const upper = raw.toUpperCase();

    if (byCode.has(upper)) return byCode.get(upper);
    if (byName.has(upper)) return byName.get(upper);

    if (/^\d+$/.test(raw)) {
      const normalizedNumeric = String(Number(raw));
      if (byCode.has(normalizedNumeric.toUpperCase())) return byCode.get(normalizedNumeric.toUpperCase());
    }

    return null;
  };
}

async function main() {
  const [filiais, secoes, bus, buVendedor] = await Promise.all([
    q(`SELECT CODFILIAL, NOME_FILIAL FROM FILIAL WHERE COALESCE(ATIVO, TRUE) = TRUE ORDER BY CAST(CODFILIAL AS UNSIGNED), CODFILIAL`),
    q(`SELECT ID, ID_BU, NOME_SECAO FROM SECAO WHERE COALESCE(ATIVO, TRUE) = TRUE ORDER BY ID_BU, ID`),
    q(`SELECT ID, CODIGO, NOME FROM BU WHERE COALESCE(ATIVO, TRUE) = TRUE ORDER BY ID`),
    q(`SELECT ID, VENDEDOR_ID, BU_CODIGO, CODFILIAL, ID_SECAO, COALESCE(ATIVO, TRUE) AS ATIVO FROM BU_VENDEDOR WHERE COALESCE(ATIVO, TRUE) = TRUE ORDER BY VENDEDOR_ID, ID`),
  ]);

  if (filiais.length === 0) {
    throw new Error('Nenhuma filial ativa encontrada para preencher escopo.');
  }

  const defaultFilial = String(filiais[0].CODFILIAL);
  const resolveBu = buildBuResolver(bus);

  const secoesByBuId = new Map();
  for (const secao of secoes) {
    const buId = Number(secao.ID_BU);
    if (!secoesByBuId.has(buId)) secoesByBuId.set(buId, []);
    secoesByBuId.get(buId).push(secao);
  }

  const rowsByVendorBu = new Map();
  for (const row of buVendedor) {
    const buResolved = resolveBu(row.BU_CODIGO);
    const normalizedBuCodigo = normalizeString(buResolved?.CODIGO || row.BU_CODIGO);
    const key = `${row.VENDEDOR_ID}::${normalizedBuCodigo.toUpperCase()}`;
    if (!rowsByVendorBu.has(key)) rowsByVendorBu.set(key, []);
    rowsByVendorBu.get(key).push({ ...row, normalizedBuCodigo, buResolved });
  }

  const planned = [];
  const skipped = [];

  for (const groupRows of rowsByVendorBu.values()) {
    groupRows.sort((a, b) => Number(a.ID) - Number(b.ID));

    const buResolved = groupRows[0].buResolved;
    const normalizedBuCodigo = groupRows[0].normalizedBuCodigo;

    if (!buResolved) {
      for (const row of groupRows) {
        skipped.push({
          id: row.ID,
          vendedorId: row.VENDEDOR_ID,
          buCodigoAtual: row.BU_CODIGO,
          motivo: 'BU_CODIGO sem mapeamento para tabela BU',
        });
      }
      continue;
    }

    const secoesBu = secoesByBuId.get(Number(buResolved.ID)) || [];
    if (secoesBu.length === 0) {
      for (const row of groupRows) {
        skipped.push({
          id: row.ID,
          vendedorId: row.VENDEDOR_ID,
          buCodigoAtual: row.BU_CODIGO,
          buCodigoNormalizado: normalizedBuCodigo,
          motivo: 'BU sem seções ativas',
        });
      }
      continue;
    }

    for (let i = 0; i < groupRows.length; i += 1) {
      const row = groupRows[i];
      const secao = secoesBu[i % secoesBu.length];
      planned.push({
        id: Number(row.ID),
        vendedorId: Number(row.VENDEDOR_ID),
        buCodigoAtual: normalizeString(row.BU_CODIGO),
        buCodigoNovo: normalizedBuCodigo,
        codFilialNovo: defaultFilial,
        idSecaoNovo: Number(secao.ID),
      });
    }
  }

  for (const item of planned) {
    await dml(`
      UPDATE BU_VENDEDOR
      SET
        BU_CODIGO = '${item.buCodigoNovo.replace(/'/g, "''")}',
        CODFILIAL = '${item.codFilialNovo.replace(/'/g, "''")}',
        ID_SECAO = ${item.idSecaoNovo},
        ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE ID = ${item.id}
    `);
  }

  const after = await q(`
    SELECT
      ID,
      VENDEDOR_ID,
      BU_CODIGO,
      CODFILIAL,
      ID_SECAO,
      COALESCE(ATIVO, TRUE) AS ATIVO
    FROM BU_VENDEDOR
    WHERE COALESCE(ATIVO, TRUE) = TRUE
    ORDER BY VENDEDOR_ID, ID
  `);

  console.log(JSON.stringify({
    updatedCount: planned.length,
    skippedCount: skipped.length,
    defaultFilial,
    planned,
    skipped,
    after,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao corrigir escopo em BU_VENDEDOR:');
  console.error(error?.message || error);
  process.exit(1);
});
