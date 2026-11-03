import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function extractSfId(response) {
  return response?.result?.serverFunctionId
    || response?.result?.id
    || response?.serverFunctionId
    || response?.id
    || null;
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

const VENDEDORES_SCOPE_SELECT = `
  SELECT
    RAW.USER_ID,
    RAW.COD_RCA,
    MAX(RAW.RCA) AS RCA
  FROM (
    SELECT DISTINCT
      VR.USER_ID,
      VR.COD_RCA,
      COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA)) AS RCA
    FROM COORDENADORES C
    JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
    JOIN BU_VENDEDOR BV
      ON TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = CAST(CB.CODFILIAL AS CHAR)
     AND TRIM(CAST(BV.BU_CODIGO AS CHAR)) = CAST(CB.CODEPTO AS CHAR)
    JOIN VENDEDOR_RCA VR ON VR.USER_ID = BV.VENDEDOR_ID
    LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID
    LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA
    WHERE C.USER_ID = :VAR_USER
      AND COALESCE(C.ATIVO, TRUE) = TRUE
      AND COALESCE(BV.ATIVO, TRUE) = TRUE
  ) RAW
  GROUP BY RAW.USER_ID, RAW.COD_RCA
`;

const serverFunctions = [
  {
    name: 'feriasVendedorListar',
    description: 'Lista ferias ativas e futuras de vendedores no escopo do coordenador logado.',
    code: `
      WITH VENDEDORES_SCOPE AS (
        ${VENDEDORES_SCOPE_SELECT}
      )
      SELECT
        F.AUTO_ID,
        F.COD_RCA,
        COALESCE(F.RCA, VS.RCA, CONCAT('RCA ', F.COD_RCA)) AS RCA,
        DATE_FORMAT(F.DT_INICIO, '%Y-%m-%d') AS DT_INICIO,
        DATE_FORMAT(F.DT_FIM, '%Y-%m-%d') AS DT_FIM,
        F.COD_RCA_SUBSTITUTO,
        COALESCE(F.RCA_SUBSTITUTO, VSS.RCA, CONCAT('RCA ', F.COD_RCA_SUBSTITUTO)) AS RCA_SUBSTITUTO,
        F.ATIVO,
        CASE
          WHEN COALESCE(F.ATIVO, TRUE) = FALSE THEN 'ENCERRADA'
          WHEN CURRENT_DATE BETWEEN F.DT_INICIO AND F.DT_FIM THEN 'ATIVA'
          WHEN F.DT_INICIO > CURRENT_DATE THEN 'FUTURA'
          ELSE 'EXPIRADA'
        END AS STATUS_FERIAS,
        DATE_FORMAT(F.CREATED_AT, '%Y-%m-%d') AS CREATED_AT
      FROM FERIAS_VENDEDOR F
      JOIN VENDEDORES_SCOPE VS ON VS.COD_RCA = F.COD_RCA
      LEFT JOIN VENDEDORES_SCOPE VSS ON VSS.COD_RCA = F.COD_RCA_SUBSTITUTO
      WHERE COALESCE(F.ATIVO, TRUE) = TRUE
        AND F.DT_FIM >= CURRENT_DATE
      ORDER BY F.DT_INICIO, F.RCA
    `,
  },
  {
    name: 'feriasVendedorCadastrar',
    description: 'Cadastra periodo de ferias de vendedor com substituto dentro do escopo do coordenador.',
    code: `
      INSERT INTO FERIAS_VENDEDOR (
        COD_RCA,
        RCA,
        DT_INICIO,
        DT_FIM,
        COD_RCA_SUBSTITUTO,
        RCA_SUBSTITUTO,
        ATIVO,
        CREATED_AT
      )
      SELECT
        SRC.COD_RCA,
        SRC.RCA,
        STR_TO_DATE('{{dtInicio}}', '%Y-%m-%d'),
        STR_TO_DATE('{{dtFim}}', '%Y-%m-%d'),
        DEST.COD_RCA,
        DEST.RCA,
        TRUE,
        CURRENT_TIMESTAMP
      FROM (${VENDEDORES_SCOPE_SELECT}) SRC
      JOIN (${VENDEDORES_SCOPE_SELECT}) DEST ON DEST.COD_RCA = {{codRcaSubstituto}}
      WHERE SRC.COD_RCA = {{codRca}}
        AND SRC.COD_RCA <> DEST.COD_RCA
        AND '{{dtInicio}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND '{{dtFim}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND STR_TO_DATE('{{dtInicio}}', '%Y-%m-%d') <= STR_TO_DATE('{{dtFim}}', '%Y-%m-%d')
    `,
  },
  {
    name: 'feriasVendedorEncerrar',
    description: 'Encerra antecipadamente ferias de vendedor dentro do escopo do coordenador.',
    code: `
      UPDATE FERIAS_VENDEDOR F
      SET
        F.ATIVO = FALSE,
        F.DT_FIM = LEAST(F.DT_FIM, CURRENT_DATE)
      WHERE F.AUTO_ID = {{feriasId}}
        AND EXISTS (
          SELECT 1
          FROM (${VENDEDORES_SCOPE_SELECT}) VS
          WHERE VS.COD_RCA = F.COD_RCA
        )
    `,
  },
];

async function upsertServerFunctions() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};
  for (const definition of serverFunctions) {
    const found = existing.find((item) => item.name === definition.name);
    if (found) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: found.id, code: definition.code, description: definition.description });
      ids[definition.name] = found.id;
      continue;
    }
    const created = await createServerFunctionMitra({ projectId, name: definition.name, type: 'SQL', code: definition.code, description: definition.description });
    ids[definition.name] = extractSfId(created);
  }
  return ids;
}

async function smoke(ids) {
  const checks = [
    ['feriasVendedorListar', {}],
    ['feriasVendedorCadastrar', { codRca: 0, codRcaSubstituto: 0, dtInicio: '2099-01-01', dtFim: '2099-01-02' }],
    ['feriasVendedorEncerrar', { feriasId: 0 }],
  ];
  for (const [name, input] of checks) {
    const result = await executeServerFunctionMitra({ projectId, serverFunctionId: ids[name], input });
    const status = String(result?.result?.executionStatus || '');
    const error = String(result?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) throw new Error(`${name} falhou: ${error || status}`);
    console.log(`${name}: smoke OK (${extractRows(result).length} linha(s))`);
  }
}

async function main() {
  const ids = await upsertServerFunctions();
  await smoke(ids);
  console.log('Ferias de Vendedor configuradas.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar Ferias de Vendedor:');
  console.error(error?.message || error);
  process.exit(1);
});
