import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const targets = [
  { id: 5, name: 'listarVisitasPeriodo' },
  { id: 20, name: 'visitasDoDia' },
  { id: 42, name: 'agendaListarVisitasPaginado' },
  { id: 43, name: 'agendaContarVisitasPaginado' },
];

const oldSellerBlock = `  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN COORDENADORES C ON C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  JOIN BU_VENDEDOR BV
    ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
   AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

const newSellerBlock = `  SELECT DISTINCT BV.VENDEDOR_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  JOIN BU_VENDEDOR BV ON COALESCE(BV.ATIVO, TRUE) = TRUE
  LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
  WHERE I.SCOPE_MODE = 'SELLER'
    AND (BV.VENDEDOR_ID = I.SCOPE_USER_ID OR VR.COD_RCA = I.SCOPE_COD_RCA)
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C
        JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
        WHERE C.USER_ID = :VAR_USER
          AND COALESCE(C.ATIVO, TRUE) = TRUE
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
      )
    )
    AND (I.SCOPE_COD_SUPERVISOR IS NULL OR EXISTS (
      SELECT 1
      FROM COORDENADORES_BU CB_SELLER
      WHERE CB_SELLER.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
        AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_SELLER.CODFILIAL AS CHAR)
        AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_SELLER.CODEPTO AS CHAR)
    ))
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )`;

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function runSf(serverFunctionId, input) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) {
    throw new Error(`SF ${serverFunctionId} falhou: ${error || status}`);
  }
  return extractRows(response);
}

async function getSellerForSmoke() {
  const rows = await runSf(158, {});
  const seller = rows.find((row) => Number(row.USER_ID || 0) > 0 && Number(row.COD_RCA || 0) > 0);
  if (!seller) throw new Error('Nenhum vendedor disponivel para validar o filtro da agenda.');
  return seller;
}

async function main() {
  const updated = [];
  for (const target of targets) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
    if (current?.result?.name !== target.name) {
      throw new Error(`SF ${target.id} esperada ${target.name}, encontrada ${current?.result?.name || 'sem nome'}.`);
    }

    const code = current?.result?.code || '';
    if (!code.includes(oldSellerBlock)) {
      if (code.includes(newSellerBlock)) continue;
      throw new Error(`Bloco SELLER esperado nao encontrado na SF ${target.id}.`);
    }

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: target.id,
      code: code.replace(oldSellerBlock, newSellerBlock),
      description: current?.result?.description || `${target.name} com filtro de vendedor liberado para diretoria`,
    });
    updated.push(target.id);
  }

  const seller = await getSellerForSmoke();
  const sellerInput = {
    scopeMode: 'SELLER',
    scopeUserId: String(seller.USER_ID),
    scopeCodRca: String(seller.COD_RCA),
    scopeCodSupervisor: '',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);
  const end = new Date(today);
  end.setDate(today.getDate() + 30);
  const toIso = (date) => date.toISOString().slice(0, 10);

  const periodo = await runSf(5, { dataInicio: toIso(start), dataFim: toIso(end), ...sellerInput });
  const paginado = await runSf(42, { dataInicio: toIso(start), dataFim: toIso(end), status: '', busca: '', limit: '20', offset: '0', ...sellerInput });
  const total = await runSf(43, { dataInicio: toIso(start), dataFim: toIso(end), status: '', busca: '', limit: '20', offset: '0', ...sellerInput });

  console.log(JSON.stringify({
    updated,
    seller: { USER_ID: seller.USER_ID, COD_RCA: seller.COD_RCA, RCA: seller.RCA },
    periodoRows: periodo.length,
    paginadoRows: paginado.length,
    totalRows: total,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao liberar agenda por vendedor para diretoria:');
  console.error(error?.message || error);
  process.exit(1);
});
