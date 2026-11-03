// Fix: lancamento de ferias falhava em silencio para diretoria/admin.
// O escopo das SFs 164/165/166 so considerava COORDENADORES (C.USER_ID = :VAR_USER);
// diretoria via todos os vendedores no combo (SF 158) mas o INSERT gravava 0 linhas.
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';
import { writeFileSync } from 'node:fs';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);

const VENDEDORES_SCOPE = `(
  SELECT RAW.USER_ID, RAW.COD_RCA, MAX(RAW.RCA) AS RCA
  FROM (
    SELECT DISTINCT
      VR.USER_ID,
      VR.COD_RCA,
      COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA
    FROM BU_VENDEDOR BV
    JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
    LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
    LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
    WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
      AND (
        EXISTS (
          SELECT 1 FROM INT_USER U
          LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
          WHERE U.ID = :VAR_USER
            AND (UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
                 OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com')
        )
        OR (
          EXISTS (
            SELECT 1
            FROM COORDENADORES C
            JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
            WHERE C.USER_ID = :VAR_USER
              AND COALESCE(C.ATIVO, TRUE) = TRUE
              AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = TRIM(CAST(CB.CODFILIAL AS CHAR))
              AND TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) = TRIM(CAST(CB.CODEPTO AS CHAR))
          )
          AND NOT EXISTS (
            SELECT 1 FROM COORDENADORES CO
            WHERE CO.USER_ID = BV.VENDEDOR_ID
              AND COALESCE(CO.ATIVO, TRUE) = TRUE
              AND CO.USER_ID <> :VAR_USER
          )
        )
      )
  ) RAW
  GROUP BY RAW.USER_ID, RAW.COD_RCA
)`;

const LISTAR = `
SELECT
  F.AUTO_ID,
  F.COD_RCA,
  COALESCE(F.RCA, VS.RCA, CONCAT('RCA ', F.COD_RCA)) AS RCA,
  DATE_FORMAT(F.DT_INICIO, '%Y-%m-%d') AS DT_INICIO,
  DATE_FORMAT(F.DT_FIM, '%Y-%m-%d') AS DT_FIM,
  F.COD_RCA_SUBSTITUTO,
  COALESCE(F.RCA_SUBSTITUTO, CONCAT('RCA ', F.COD_RCA_SUBSTITUTO)) AS RCA_SUBSTITUTO,
  F.ATIVO,
  CASE
    WHEN COALESCE(F.ATIVO, TRUE) = FALSE THEN 'ENCERRADA'
    WHEN CURRENT_DATE BETWEEN F.DT_INICIO AND F.DT_FIM THEN 'ATIVA'
    WHEN F.DT_INICIO > CURRENT_DATE THEN 'FUTURA'
    ELSE 'EXPIRADA'
  END AS STATUS_FERIAS,
  DATE_FORMAT(F.CREATED_AT, '%Y-%m-%d') AS CREATED_AT
FROM FERIAS_VENDEDOR F
JOIN (SELECT DISTINCT COD_RCA, RCA FROM ${VENDEDORES_SCOPE} X) VS ON VS.COD_RCA = F.COD_RCA
WHERE COALESCE(F.ATIVO, TRUE) = TRUE
  AND F.DT_FIM >= CURRENT_DATE
ORDER BY F.DT_INICIO, F.RCA`;

const CADASTRAR = `
INSERT INTO FERIAS_VENDEDOR (COD_RCA, RCA, DT_INICIO, DT_FIM, COD_RCA_SUBSTITUTO, RCA_SUBSTITUTO, ATIVO, CREATED_AT)
SELECT
  SRC.COD_RCA, MAX(SRC.RCA),
  STR_TO_DATE('{{dtInicio}}', '%Y-%m-%d'),
  STR_TO_DATE('{{dtFim}}', '%Y-%m-%d'),
  DEST.COD_RCA, MAX(DEST.RCA),
  TRUE, CURRENT_TIMESTAMP
FROM ${VENDEDORES_SCOPE} SRC
JOIN ${VENDEDORES_SCOPE} DEST
  ON '{{codRcaSubstituto}}' REGEXP '^[0-9]+$'
 AND DEST.COD_RCA = CAST(NULLIF('{{codRcaSubstituto}}', '') AS UNSIGNED)
WHERE '{{codRca}}' REGEXP '^[0-9]+$'
  AND SRC.COD_RCA = CAST(NULLIF('{{codRca}}', '') AS UNSIGNED)
  AND SRC.COD_RCA <> DEST.COD_RCA
  AND '{{dtInicio}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND '{{dtFim}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND STR_TO_DATE('{{dtInicio}}', '%Y-%m-%d') <= STR_TO_DATE('{{dtFim}}', '%Y-%m-%d')
GROUP BY SRC.COD_RCA, DEST.COD_RCA`;

const ENCERRAR = `
UPDATE FERIAS_VENDEDOR F
SET F.ATIVO = FALSE,
    F.DT_FIM = LEAST(F.DT_FIM, CURRENT_DATE)
WHERE '{{feriasId}}' REGEXP '^[0-9]+$'
  AND F.AUTO_ID = CAST(NULLIF('{{feriasId}}', '') AS UNSIGNED)
  AND F.COD_RCA IN (SELECT VS.COD_RCA FROM ${VENDEDORES_SCOPE} VS)`;

const backup = {};
for (const [id, code] of [[164, LISTAR], [165, CADASTRAR], [166, ENCERRAR]]) {
  const old = await readServerFunctionMitra({ projectId, serverFunctionId: id });
  backup[id] = old.result.code;
  await updateServerFunctionMitra({ projectId, serverFunctionId: id, code });
  console.log('SF', id, 'atualizada');
}
writeFileSync(new URL('./backup-ferias-sfs-before-fix.json', import.meta.url), JSON.stringify(backup, null, 2));
