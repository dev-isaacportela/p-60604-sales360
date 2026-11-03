// Ao salvar a meta por ramo/UF, a meta total do vendedor (METAS_BU_VENDEDOR, por filial)
// passa a ser a soma dos ramos. O novo total é repartido entre as filiais na proporção atual;
// a última filial absorve o arredondamento para a soma fechar exata.
// Segurança: só o coordenador (:VAR_USER) que cobre TODAS as filiais do vendedor naquele depto,
// e nunca para outro coordenador (Diretrizes, regra 4).
import 'dotenv/config';
import { configureSdkMitra, createServerFunctionMitra, listProfilesMitra, getProfileDetailsMitra, setProfileServerFunctionsMitra } from 'mitra-sdk';
configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);

const code = `UPDATE METAS_BU_VENDEDOR M
JOIN (
  SELECT X.VENDEDOR_ID, X.CODEPTO, X.MES, X.ANO, X.CODFILIAL,
    CASE WHEN X.RN = X.CNT THEN ROUND(X.NOVO_TOTAL - X.ACUM_ANT, 2) ELSE X.NOVO_ROW END AS NOVO
  FROM (
    SELECT B.VENDEDOR_ID, B.CODEPTO, B.MES, B.ANO, B.CODFILIAL, R.NOVO_TOTAL,
      ROUND(B.META_VALOR * R.NOVO_TOTAL / T.TOTAL, 2) AS NOVO_ROW,
      ROW_NUMBER() OVER (ORDER BY B.CODFILIAL) AS RN,
      COUNT(*) OVER () AS CNT,
      COALESCE(SUM(ROUND(B.META_VALOR * R.NOVO_TOTAL / T.TOTAL, 2)) OVER (ORDER BY B.CODFILIAL ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS ACUM_ANT
    FROM METAS_BU_VENDEDOR B
    JOIN (
      SELECT
        CASE WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' THEN CAST('{{vendedorId}}' AS UNSIGNED) END AS VENDEDOR_ID,
        CASE WHEN '{{codepto}}' REGEXP '^[0-9]+$' THEN CAST('{{codepto}}' AS UNSIGNED) END AS CODEPTO,
        CASE WHEN '{{mes}}' REGEXP '^[0-9]{1,2}$' THEN CAST('{{mes}}' AS UNSIGNED) END AS MES,
        CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) END AS ANO
    ) P ON P.VENDEDOR_ID = B.VENDEDOR_ID AND P.CODEPTO = B.CODEPTO AND P.MES = B.MES AND P.ANO = B.ANO
    JOIN (
      SELECT RU.VENDEDOR_ID, RU.CODEPTO, RU.MES, RU.ANO, SUM(RU.META_VALOR) AS NOVO_TOTAL
      FROM METAS_BU_VENDEDOR_RAMO_UF RU
      GROUP BY RU.VENDEDOR_ID, RU.CODEPTO, RU.MES, RU.ANO
    ) R ON R.VENDEDOR_ID = B.VENDEDOR_ID AND R.CODEPTO = B.CODEPTO AND R.MES = B.MES AND R.ANO = B.ANO
    JOIN (
      SELECT T0.VENDEDOR_ID, T0.CODEPTO, T0.MES, T0.ANO, SUM(T0.META_VALOR) AS TOTAL,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM COORDENADORES C
          JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
          WHERE C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE
            AND CB.CODFILIAL = T0.CODFILIAL AND CB.CODEPTO = T0.CODEPTO
        ) AND EXISTS (
          SELECT 1 FROM BU_VENDEDOR BV
          WHERE BV.VENDEDOR_ID = T0.VENDEDOR_ID AND COALESCE(BV.ATIVO, TRUE) = TRUE
            AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = TRIM(CAST(T0.CODFILIAL AS CHAR))
            AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = TRIM(CAST(T0.CODEPTO AS CHAR))
        ) THEN 0 ELSE 1 END) AS FORA_DO_ESCOPO
      FROM METAS_BU_VENDEDOR T0
      GROUP BY T0.VENDEDOR_ID, T0.CODEPTO, T0.MES, T0.ANO
    ) T ON T.VENDEDOR_ID = B.VENDEDOR_ID AND T.CODEPTO = B.CODEPTO AND T.MES = B.MES AND T.ANO = B.ANO
    WHERE T.TOTAL > 0
      AND T.FORA_DO_ESCOPO = 0
      AND R.NOVO_TOTAL <= T.TOTAL + 0.01
      AND NOT EXISTS (
        SELECT 1 FROM COORDENADORES CO
        WHERE CO.USER_ID = B.VENDEDOR_ID AND COALESCE(CO.ATIVO, TRUE) = TRUE AND CO.USER_ID <> :VAR_USER
      )
  ) X
) N ON N.VENDEDOR_ID = M.VENDEDOR_ID AND N.CODEPTO = M.CODEPTO AND N.MES = M.MES AND N.ANO = M.ANO AND N.CODFILIAL = M.CODFILIAL
SET M.META_VALOR = N.NOVO, M.UPDATED_AT = CURRENT_TIMESTAMP`;

const r = await createServerFunctionMitra({ projectId, name: 'painelCoordenadorSincronizarMetaVendedorPorRamo', type: 'SQL', code,
  description: 'Coordenador: ajusta a meta total do vendedor (por filial, proporcional) para a soma das metas por ramo/UF salvas. Input: vendedorId, codepto, mes, ano.' });
const id = r.result.serverFunctionId;
console.log('SF', id, r.result.migration || r.result.migrationSkippedReason || '');
// mesmos perfis da SF de salvar ramo (296)
const perfis = (await listProfilesMitra({ projectId })).result || [];
for (const p of perfis) {
  const d = (await getProfileDetailsMitra({ projectId, profileId: p.id })).result;
  const ids = (d.serverFunctions || []).map(s => s.id ?? s.serverFunctionId);
  if (ids.includes(296) && !ids.includes(id)) {
    await setProfileServerFunctionsMitra({ projectId, profileId: p.id, serverFunctionIds: [...ids, id] });
    console.log('perfil', p.name);
  }
}
