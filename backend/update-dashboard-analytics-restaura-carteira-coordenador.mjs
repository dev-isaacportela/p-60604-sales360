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
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TARGET_IDS = [123, 182, 183, 184, 185, 186, 187, 188, 214, 287];

function patchCode(code) {
  let next = code;
  next = next.replaceAll(
    `  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_GLOBAL_ALVO
      WHERE C_GLOBAL_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_GLOBAL_ALVO.ATIVO, TRUE) = TRUE
    )
    AND (`,
    `  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (`,
  );
  next = next.replaceAll(
    `  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND NOT EXISTS (
      SELECT 1
      FROM COORDENADORES C_GLOBAL_HOME_ALVO
      WHERE C_GLOBAL_HOME_ALVO.USER_ID = BV.VENDEDOR_ID
        AND COALESCE(C_GLOBAL_HOME_ALVO.ATIVO, TRUE) = TRUE
    )
    AND (`,
    `  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (`,
  );
  next = next.replaceAll(
    `  LEFT JOIN COORDENADORES C_CARTEIRA_ALVO ON C_CARTEIRA_ALVO.USER_ID = EC.ID_VENDEDOR AND COALESCE(C_CARTEIRA_ALVO.ATIVO, TRUE) = TRUE
  WHERE C_CARTEIRA_ALVO.AUTO_ID IS NULL
    AND COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL`,
    `  WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL`,
  );
  next = next.replaceAll(
    `  LEFT JOIN COORDENADORES C_CARTEIRA_HOME_ALVO ON C_CARTEIRA_HOME_ALVO.USER_ID = EC.ID_VENDEDOR AND COALESCE(C_CARTEIRA_HOME_ALVO.ATIVO, TRUE) = TRUE
  WHERE C_CARTEIRA_HOME_ALVO.AUTO_ID IS NULL
    AND COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL`,
    `  WHERE COALESCE(C.WINTHOR_CODCLI, C.ID) IS NOT NULL`,
  );
  next = next.replaceAll(
    `  LEFT JOIN COORDENADORES C_CARTEIRA_HOME_ALVO ON C_CARTEIRA_HOME_ALVO.USER_ID = EC.ID_VENDEDOR AND COALESCE(C_CARTEIRA_HOME_ALVO.ATIVO, TRUE) = TRUE
  WHERE C_CARTEIRA_HOME_ALVO.AUTO_ID IS NULL
    AND C.ID IS NOT NULL`,
    `  WHERE C.ID IS NOT NULL`,
  );
  next = next.replaceAll(
    `    AND (
      I.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES_BU CB_GLOBAL
        WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
          AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
          AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
      )
    )`,
    `    AND (
      I.SCOPE_COD_SUPERVISOR IS NULL
      OR EXISTS (
        SELECT 1
        FROM COORDENADORES C_GLOBAL_SELF
        WHERE C_GLOBAL_SELF.USER_ID = BV.VENDEDOR_ID
          AND COALESCE(C_GLOBAL_SELF.ATIVO, TRUE) = TRUE
          AND C_GLOBAL_SELF.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM COORDENADORES C_GLOBAL_OTHER_COORD
          WHERE C_GLOBAL_OTHER_COORD.USER_ID = BV.VENDEDOR_ID
            AND COALESCE(C_GLOBAL_OTHER_COORD.ATIVO, TRUE) = TRUE
        )
        AND EXISTS (
          SELECT 1
          FROM COORDENADORES_BU CB_GLOBAL
          WHERE CB_GLOBAL.COD_SUPERVISOR = I.SCOPE_COD_SUPERVISOR
            AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB_GLOBAL.CODFILIAL AS CHAR)
            AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB_GLOBAL.CODEPTO AS CHAR)
        )
      )
    )`,
  );
  return next;
}

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

async function runSf(serverFunctionId, input, label) {
  const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(`${label}: ${error || status}`);
  const rows = extractRows(response);
  console.log(`${label}: ${rows.length} linha(s)`);
  return rows;
}

async function main() {
  const updated = [];
  for (const id of TARGET_IDS) {
    const current = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const original = current?.result?.code || '';
    const next = patchCode(original);
    if (next !== original) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: id,
        code: next,
        description: current?.result?.description || current?.result?.name || `SF ${id}`,
      });
      updated.push({ id, name: current?.result?.name });
    }
  }

  const scopeJoao = {
    scopeMode: 'GLOBAL',
    scopeUserId: '',
    scopeCodRca: '',
    scopeCodSupervisor: '913',
    scopeCodFilial: '',
    scopeCodepto: '',
    scopeIdSecao: '',
  };
  const scopeGlauber = { ...scopeJoao, scopeCodSupervisor: '469' };
  const filtros = { dataInicio: '2026-07-01', dataFim: '2026-07-31', departamentos: '', ramos: '', cliente: '106057', limit: '20', offset: '0' };

  await runSf(186, { ...filtros, ...scopeJoao }, 'Top clientes Joao sem cliente Glauber');
  await runSf(186, { ...filtros, ...scopeGlauber }, 'Top clientes Glauber com cliente Glauber');
  await runSf(214, scopeJoao, 'Diario Joao');
  await runSf(214, scopeGlauber, 'Diario Glauber');

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao restaurar carteira de coordenador no dashboard/analytics:');
  console.error(error?.message || error);
  process.exit(1);
});
