import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

// Permissao do usuario logado: GLOBAL (diretoria/admin/dev/ti) ou coordenador (por COD_SUPERVISOR)
const PERM_CTE = `
PERM AS (
  SELECT
    CASE
      WHEN COALESCE(U.ISDEV, 0) = 1 THEN 1
      WHEN LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com' THEN 1
      WHEN UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA') THEN 1
      ELSE 0
    END AS GLOBAL_OK,
    (SELECT MAX(C.COD_SUPERVISOR) FROM COORDENADORES C
      WHERE C.USER_ID = U.ID AND COALESCE(C.ATIVO, TRUE) = TRUE) AS COD_SUP
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  WHERE U.ID = :VAR_USER
)`;

// Executivas visiveis: vendedoras comuns (exclui dev, ti, diretoria/admin e coordenadores).
// Diretoria/dev: todas. Coordenador: so as do seu filial+depto (escopo vindo do BU_VENDEDOR).
const SELLERS_CTE = `
SELLERS AS (
  SELECT U.ID, COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR) AS NOME, U.DESCR AS EMAIL
  FROM INT_USER U
  WHERE COALESCE(U.ISDEV, 0) = 0
    AND LOWER(COALESCE(U.DESCR, '')) <> 'ti@benenutri.com'
    AND U.ID <> :VAR_USER
    AND NOT EXISTS (
      SELECT 1 FROM USUARIO_CARGO UC
      WHERE UC.USER_ID = U.ID AND UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
    )
    AND NOT EXISTS (
      SELECT 1 FROM COORDENADORES CO
      WHERE CO.USER_ID = U.ID AND COALESCE(CO.ATIVO, TRUE) = TRUE AND CO.USER_ID <> :VAR_USER
    )
    AND (
      EXISTS (
        SELECT 1 FROM BU_VENDEDOR BV
        WHERE BV.VENDEDOR_ID = U.ID
          AND COALESCE(BV.ATIVO, TRUE) = TRUE
          AND (
            (SELECT GLOBAL_OK FROM PERM) = 1
            OR EXISTS (
              SELECT 1 FROM COORDENADORES_BU CB
              WHERE CB.COD_SUPERVISOR = (SELECT COD_SUP FROM PERM)
                AND TRIM(COALESCE(CAST(CB.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), ''))
                AND TRIM(COALESCE(CAST(CB.CODEPTO AS CHAR), '')) = TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), ''))
            )
          )
      )
      OR (
        (SELECT GLOBAL_OK FROM PERM) = 1
        AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = U.ID)
      )
    )
)`;

const serverFunctions = [
  {
    name: 'gestaoAcessoExecutivasPermissao',
    description: 'Indica se o usuario logado pode gerenciar o acesso de executivas (diretoria, coordenador ou dev)',
    code: `WITH ${PERM_CTE}
SELECT
  CASE WHEN GLOBAL_OK = 1 OR COD_SUP IS NOT NULL THEN 1 ELSE 0 END AS PODE_ACESSAR,
  CASE WHEN GLOBAL_OK = 1 THEN 'GLOBAL' WHEN COD_SUP IS NOT NULL THEN 'COORDENADOR' ELSE 'NENHUM' END AS NIVEL
FROM PERM`,
  },
  {
    name: 'gestaoAcessoExecutivasListar',
    description: 'Lista executivas de venda visiveis ao gestor com status de acesso. Params: busca, status (TODOS|ATIVO|BLOQUEADO), limit, offset',
    code: `WITH ${PERM_CTE},
${SELLERS_CTE}
SELECT
  S.ID AS USER_ID,
  S.NOME,
  S.EMAIL,
  COALESCE(B.BLOQUEADO, 0) AS BLOQUEADO,
  B.MOTIVO,
  B.ATUALIZADO_EM,
  COALESCE(NULLIF(TRIM(A.NOME), ''), A.DESCR) AS ATUALIZADO_POR_NOME,
  COUNT(*) OVER () AS TOTAL
FROM SELLERS S
LEFT JOIN USUARIO_BLOQUEIO B ON B.USER_ID = S.ID
LEFT JOIN INT_USER A ON A.ID = B.ATUALIZADO_POR
WHERE (
    LOCATE('{', '{{busca}}') > 0 OR NULLIF(TRIM('{{busca}}'), '') IS NULL
    OR LOWER(S.NOME) LIKE CONCAT('%', LOWER(TRIM('{{busca}}')), '%')
    OR LOWER(S.EMAIL) LIKE CONCAT('%', LOWER(TRIM('{{busca}}')), '%')
  )
  AND (
    '{{status}}' NOT IN ('ATIVO', 'BLOQUEADO')
    OR ('{{status}}' = 'ATIVO' AND COALESCE(B.BLOQUEADO, 0) = 0)
    OR ('{{status}}' = 'BLOQUEADO' AND COALESCE(B.BLOQUEADO, 0) = 1)
  )
ORDER BY COALESCE(B.BLOQUEADO, 0) DESC, S.NOME
LIMIT {{limit}} OFFSET {{offset}}`,
  },
  {
    name: 'gestaoAcessoExecutivasAlterar',
    description: 'Bloqueia (bloquear=1) ou reativa (bloquear=0) o acesso de uma executiva. Valida a permissao do gestor. Params: userId, bloquear, motivo',
    code: `INSERT INTO USUARIO_BLOQUEIO (USER_ID, BLOQUEADO, MOTIVO, ATUALIZADO_POR, ATUALIZADO_EM)
WITH ${PERM_CTE},
${SELLERS_CTE}
SELECT
  S.ID,
  CASE WHEN '{{bloquear}}' = '1' THEN 1 ELSE 0 END,
  CASE WHEN LOCATE('{', '{{motivo}}') > 0 THEN NULL ELSE NULLIF(TRIM('{{motivo}}'), '') END,
  :VAR_USER,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s')
FROM SELLERS S
WHERE '{{userId}}' REGEXP '^[0-9]+$'
  AND '{{bloquear}}' IN ('0', '1')
  AND CAST(S.ID AS CHAR) = '{{userId}}'
ON DUPLICATE KEY UPDATE
  BLOQUEADO = VALUES(BLOQUEADO),
  MOTIVO = VALUES(MOTIVO),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
  },
  {
    name: 'meuAcessoBloqueado',
    description: 'Retorna BLOQUEADO=1 se o acesso do usuario logado foi desativado por um gestor',
    code: `SELECT COALESCE(MAX(BLOQUEADO), 0) AS BLOQUEADO FROM USUARIO_BLOQUEIO WHERE USER_ID = :VAR_USER`,
  },
];

async function main() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE IF NOT EXISTS USUARIO_BLOQUEIO (
        USER_ID INT NOT NULL PRIMARY KEY,
        BLOQUEADO INT NOT NULL DEFAULT 0,
        MOTIVO VARCHAR(500),
        ATUALIZADO_POR INT,
        ATUALIZADO_EM VARCHAR(19)
      )`,
    });
    console.log('Tabela USUARIO_BLOQUEIO criada.');
  } catch (error) {
    const text = String(error?.response?.data?.message || error?.message || error);
    if (!text.toLowerCase().includes('already exists')) throw error;
    console.log('Tabela USUARIO_BLOQUEIO ja existe.');
  }

  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  for (const def of serverFunctions) {
    const found = existing.find((sf) => sf.name === def.name);
    if (found) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: def.code, description: def.description });
      console.log(`SF ${def.name} atualizada (id ${found.id})`);
    } else {
      const res = await createServerFunctionMitra({ projectId, type: 'SQL', ...def });
      console.log(`SF ${def.name} criada (id ${res?.result?.serverFunctionId || res?.result?.id})`);
    }
  }
}

main().catch((error) => {
  console.error(error?.response?.data || error?.message || error);
  process.exit(1);
});
