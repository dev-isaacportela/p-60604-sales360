
const sdk = require('mitra-sdk');
const projectId = 45654;
const dataLoaderId = 723;

function rows(response) {
  return (response && response.result && response.result.rows) || response.rows || [];
}

await sdk.executeDataLoaderMitra({ projectId, dataLoaderId });

await sdk.runDmlMitra({ projectId, sql: `
  UPDATE CLIENTES C
  JOIN IMP_CLIENTES_TOTVS ICT
    ON CAST(ICT.CODCLI AS CHAR) = CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR)
  SET C.UF = CASE WHEN TRIM(COALESCE(ICT.UF, '')) <> '' THEN TRIM(ICT.UF) ELSE C.UF END,
      C.CIDADE = CASE WHEN TRIM(COALESCE(ICT.CIDADE, '')) <> '' THEN TRIM(ICT.CIDADE) ELSE C.CIDADE END,
      C.SEGMENTO = CASE WHEN TRIM(COALESCE(ICT.RAMO, '')) <> '' THEN TRIM(ICT.RAMO) ELSE C.SEGMENTO END
` });

const totals = await sdk.runQueryMitra({ projectId, sql: `
  SELECT
    COUNT(*) AS CLIENTES_TOTAL,
    SUM(CASE WHEN TRIM(COALESCE(UF, '')) <> '' THEN 1 ELSE 0 END) AS CLIENTES_COM_UF
  FROM CLIENTES
` });

return { success: true, dataLoaderId, stats: rows(totals)[0] || null };
