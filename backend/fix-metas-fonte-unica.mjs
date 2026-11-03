/**
 * Corrige a integridade da feature Analytics > Metas — parte 1.
 *
 * 1) Cria a view VW_META_VENDEDOR_MES: fonte unica da meta mensal do vendedor.
 *    A verdade passa a ser o que o coordenador redistribui (METAS_BU_VENDEDOR,
 *    somado entre as BUs do vendedor). METAS_VENDEDOR fica apenas como fallback
 *    historico para periodos anteriores ao fluxo de redistribuicao.
 *
 * 2) Reaponta as 9 SFs que liam METAS_VENDEDOR direto para a view. Antes da
 *    correcao, a meta distribuida pelo coordenador nao chegava ao painel do
 *    coordenador, ao dashboard do vendedor nem ao relatorio semanal.
 *
 * 3) Fecha o bypass do escopo GLOBAL nas SFs 195 e 196: o ramo GLOBAL nao
 *    validava :VAR_USER, entao qualquer usuario autenticado enxergava a meta
 *    de todas as BUs. Agora GLOBAL exige cargo DIRETORIA/ADMIN; quem nao tem
 *    cai no proprio escopo em vez de receber erro.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

const SFS_META_VENDEDOR = [123, 124, 136, 155, 190, 192, 193, 237, 295];

const VIEW_SQL = `
CREATE OR REPLACE VIEW VW_META_VENDEDOR_MES AS
SELECT
  MBV.VENDEDOR_ID AS USER_ID,
  MBV.ANO AS ANO,
  MBV.MES AS MES,
  ROUND(SUM(COALESCE(MBV.META_VALOR, 0)), 2) AS VALOR_META
FROM METAS_BU_VENDEDOR MBV
GROUP BY MBV.VENDEDOR_ID, MBV.ANO, MBV.MES
UNION ALL
SELECT
  MV.USER_ID,
  MV.ANO,
  MV.MES,
  COALESCE(MV.VALOR_META, 0) AS VALOR_META
FROM METAS_VENDEDOR MV
WHERE NOT EXISTS (
  SELECT 1
  FROM METAS_BU_VENDEDOR B
  WHERE B.VENDEDOR_ID = MV.USER_ID
    AND B.ANO = MV.ANO
    AND B.MES = MV.MES
)
`;

const PARAMS_ANCHOR = `    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR
)`;

const PARAMS_REPLACEMENT = `    CASE WHEN '{{scopeCodSupervisor}}' REGEXP '^[0-9]+$' THEN CAST('{{scopeCodSupervisor}}' AS UNSIGNED) ELSE NULL END AS SCOPE_COD_SUPERVISOR,
    CASE WHEN (
      SELECT COUNT(*)
      FROM INT_USER U
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      WHERE U.ID = :VAR_USER
        AND (COALESCE(UC.CARGO, '') IN ('DIRETORIA', 'ADMIN') OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com')
    ) > 0 THEN 1 ELSE 0 END AS IS_DIRETORIA
)`;

const COORD_ANCHOR = `      (P.SCOPE_MODE = 'GLOBAL' AND (P.SCOPE_COD_SUPERVISOR IS NULL OR C.COD_SUPERVISOR = P.SCOPE_COD_SUPERVISOR))
      OR (P.SCOPE_MODE <> 'GLOBAL' AND C.USER_ID = :VAR_USER)`;

const COORD_REPLACEMENT = `      (P.SCOPE_MODE = 'GLOBAL' AND P.IS_DIRETORIA = 1 AND (P.SCOPE_COD_SUPERVISOR IS NULL OR C.COD_SUPERVISOR = P.SCOPE_COD_SUPERVISOR))
      OR (P.SCOPE_MODE = 'GLOBAL' AND P.IS_DIRETORIA = 0 AND C.USER_ID = :VAR_USER)
      OR (P.SCOPE_MODE <> 'GLOBAL' AND C.USER_ID = :VAR_USER)`;

function replaceOnce(code, anchor, replacement, label) {
  const parts = code.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: ancora encontrada ${parts.length - 1}x (esperado 1x)`);
  }
  return parts.join(replacement);
}

async function main() {
  console.log('== 1. View VW_META_VENDEDOR_MES ==');
  const ddl = await runDdlMitra({ projectId, sql: VIEW_SQL });
  console.log('   view criada.', ddl?.result?.migration ? `migration: ${ddl.result.migration}` : (ddl?.result?.migrationSkippedReason || ''));

  console.log('\n== 2. Reapontar SFs que liam METAS_VENDEDOR ==');
  for (const id of SFS_META_VENDEDOR) {
    const fn = (await readServerFunctionMitra({ projectId, serverFunctionId: id })).result;
    const code = String(fn.code || '');
    // \bMETAS_VENDEDOR\b nao casa com METAS_BU_VENDEDOR nem com o CTE METAS_VENDEDOR_SEMANA
    const ocorrencias = (code.match(/\bMETAS_VENDEDOR\b/g) || []).length;
    if (ocorrencias === 0) {
      console.log(`   SF ${id} (${fn.name}): nada a fazer`);
      continue;
    }
    const novo = code.replace(/\bMETAS_VENDEDOR\b/g, 'VW_META_VENDEDOR_MES');
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: novo });
    console.log(`   SF ${id} (${fn.name}): ${ocorrencias} referencia(s) reapontada(s)`);
  }

  console.log('\n== 3. Fechar bypass do escopo GLOBAL (SF 195 e 196) ==');
  for (const id of [195, 196]) {
    const fn = (await readServerFunctionMitra({ projectId, serverFunctionId: id })).result;
    let code = String(fn.code || '');
    if (code.includes('IS_DIRETORIA')) {
      console.log(`   SF ${id} (${fn.name}): ja protegida`);
      continue;
    }
    code = replaceOnce(code, PARAMS_ANCHOR, PARAMS_REPLACEMENT, `SF ${id} PARAMS`);
    code = replaceOnce(code, COORD_ANCHOR, COORD_REPLACEMENT, `SF ${id} COORD`);
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code });
    console.log(`   SF ${id} (${fn.name}): GLOBAL agora exige cargo DIRETORIA/ADMIN`);
  }

  console.log('\nOK');
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
