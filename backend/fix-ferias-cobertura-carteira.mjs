// Ferias: substituto passa a ver a carteira do vendedor em ferias tambem em
// Minha Carteira (27, 38, 84, 119, 362) e pode agendar visita (44).
// Mesma regra ja usada nas demais telas: FERIAS_VENDEDOR ativa e CURRENT_DATE no periodo.
// A carteira (EQUIPE_CLIENTE) nao muda de dono.
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';
import { writeFileSync } from 'node:fs';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = Number(process.env.MITRA_PROJECT_ID);

// Donos das ferias que o "viewer" esta cobrindo hoje
const feriasOwners = (viewer) => `(
  SELECT VR_DONO.USER_ID
  FROM VENDEDOR_RCA VR_SUB
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE VR_SUB.USER_ID = ${viewer}
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
)`;

const TARGET_BRANCH = `  JOIN FUNCIONARIOS F ON F.ID_SUBSTITUTO = :VAR_USER
  WHERE I.SCOPE_MODE = 'ME'
`;
const TARGET_BRANCH_NEW = TARGET_BRANCH + `
  UNION

  SELECT FO.USER_ID
  FROM INPUT_SCOPE I
  JOIN ${feriasOwners(':VAR_USER')} FO ON 1 = 1
  WHERE I.SCOPE_MODE = 'ME'
`;

const VENDEDOR_EXPR = `CASE
    WHEN '{{vendedorId}}' REGEXP '^[0-9]+$' AND CAST('{{vendedorId}}' AS UNSIGNED) > 0 THEN CAST('{{vendedorId}}' AS UNSIGNED)
    ELSE :VAR_USER
  END`;

const patches = {
  27: [[TARGET_BRANCH, TARGET_BRANCH_NEW]],
  38: [[TARGET_BRANCH, TARGET_BRANCH_NEW]],
  84: [[TARGET_BRANCH, TARGET_BRANCH_NEW]],
  119: [['OR F.ID_SUBSTITUTO = :VAR_USER)', `OR F.ID_SUBSTITUTO = :VAR_USER OR EC.ID_VENDEDOR IN ${feriasOwners(':VAR_USER')})`]],
  362: [['WHERE F.ID_SUBSTITUTO = :VAR_USER)', `WHERE F.ID_SUBSTITUTO = :VAR_USER) OR EC.ID_VENDEDOR IN ${feriasOwners(':VAR_USER')}`]],
  44: [[`        OR F.ID_SUBSTITUTO = ${VENDEDOR_EXPR}\n      )`, `        OR F.ID_SUBSTITUTO = ${VENDEDOR_EXPR}\n        OR EC.ID_VENDEDOR IN ${feriasOwners(VENDEDOR_EXPR)}\n      )`]],
};

const backup = {};
for (const [id, list] of Object.entries(patches)) {
  const old = (await readServerFunctionMitra({ projectId, serverFunctionId: +id })).result.code;
  if (old.includes('FERIAS_VENDEDOR')) { console.log('SF', id, 'ja tem ferias, pulando'); continue; }
  let code = old;
  for (const [a, b] of list) {
    const n = code.split(a).length - 1;
    if (n !== 1) throw new Error(`SF ${id}: trecho esperado 1x, encontrado ${n}x`);
    code = code.replace(a, () => b);
  }
  backup[id] = old;
  await updateServerFunctionMitra({ projectId, serverFunctionId: +id, code });
  console.log('SF', id, 'atualizada');
}
writeFileSync(new URL('./backup-ferias-cobertura-before-fix.json', import.meta.url), JSON.stringify(backup, null, 2));
