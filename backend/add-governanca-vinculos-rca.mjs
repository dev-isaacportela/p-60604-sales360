import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function getErrorText(error) {
  return `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
}

async function ensureAuditoriaTable() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE VENDEDOR_RCA_AUDITORIA (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        USER_ID INT NOT NULL,
        COD_RCA_ANTERIOR INT,
        COD_RCA_NOVO INT,
        COD_SUPERVISOR_ANTERIOR INT,
        COD_SUPERVISOR_NOVO INT,
        ALTERADO_POR INT NOT NULL,
        ALTERADO_EM VARCHAR(19),
        OBSERVACAO VARCHAR(300)
      )`,
    });
    console.log('Tabela VENDEDOR_RCA_AUDITORIA criada.');
  } catch (error) {
    const text = getErrorText(error);
    if (!text.includes('already exists')) throw error;
    console.log('Tabela VENDEDOR_RCA_AUDITORIA já existe.');
  }
}

const sfDefinitions = [
  {
    name: 'registrarAuditoriaVinculoRca',
    description: 'Registra histórico de alteração de vínculo vendedor x RCA.',
    code: `
      INSERT INTO VENDEDOR_RCA_AUDITORIA (
        USER_ID,
        COD_RCA_ANTERIOR,
        COD_RCA_NOVO,
        COD_SUPERVISOR_ANTERIOR,
        COD_SUPERVISOR_NOVO,
        ALTERADO_POR,
        ALTERADO_EM,
        OBSERVACAO
      ) VALUES (
        {{userId}},
        CASE WHEN '{{codRcaAnterior}}' = '' THEN NULL ELSE {{codRcaAnterior}} END,
        CASE WHEN '{{codRcaNovo}}' = '' THEN NULL ELSE {{codRcaNovo}} END,
        CASE WHEN '{{codSupervisorAnterior}}' = '' THEN NULL ELSE {{codSupervisorAnterior}} END,
        CASE WHEN '{{codSupervisorNovo}}' = '' THEN NULL ELSE {{codSupervisorNovo}} END,
        :VAR_USER,
        SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
        NULLIF('{{observacao}}', '')
      )
    `,
  },
  {
    name: 'listarAuditoriaVinculoRca',
    description: 'Lista histórico de alterações de vínculo vendedor x RCA.',
    code: `
      SELECT
        A.ID,
        A.USER_ID,
        COALESCE(F.NOME, U.DESCR) AS USUARIO,
        U.DESCR AS EMAIL_USUARIO,
        A.COD_RCA_ANTERIOR,
        R1.RCA_NOME AS RCA_ANTERIOR_NOME,
        A.COD_RCA_NOVO,
        R2.RCA_NOME AS RCA_NOVO_NOME,
        A.COD_SUPERVISOR_ANTERIOR,
        S1.RCA_NOME AS SUPERVISOR_ANTERIOR_NOME,
        A.COD_SUPERVISOR_NOVO,
        S2.RCA_NOME AS SUPERVISOR_NOVO_NOME,
        A.ALTERADO_POR,
        COALESCE(FA.NOME, UA.DESCR) AS ALTERADO_POR_USUARIO,
        A.ALTERADO_EM,
        A.OBSERVACAO
      FROM VENDEDOR_RCA_AUDITORIA A
      LEFT JOIN INT_USER U ON U.ID = A.USER_ID
      LEFT JOIN FUNCIONARIOS F ON F.ID = A.USER_ID
      LEFT JOIN RCA_TOTVS R1 ON R1.COD_RCA = A.COD_RCA_ANTERIOR
      LEFT JOIN RCA_TOTVS R2 ON R2.COD_RCA = A.COD_RCA_NOVO
      LEFT JOIN RCA_TOTVS S1 ON S1.COD_RCA = A.COD_SUPERVISOR_ANTERIOR
      LEFT JOIN RCA_TOTVS S2 ON S2.COD_RCA = A.COD_SUPERVISOR_NOVO
      LEFT JOIN INT_USER UA ON UA.ID = A.ALTERADO_POR
      LEFT JOIN FUNCIONARIOS FA ON FA.ID = A.ALTERADO_POR
      ORDER BY A.ID DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
  },
];

async function upsertServerFunction(definition, existingList) {
  const existing = existingList.find((item) => item.name === definition.name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: definition.code,
      description: definition.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });

  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id || null;
}

async function main() {
  await ensureAuditoriaTable();

  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const ids = {};

  for (const def of sfDefinitions) {
    ids[def.name] = await upsertServerFunction(def, existing);
  }

  console.log('Governança de vínculos RCA configurada.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar governança de vínculos RCA:');
  console.error(error?.message || error);
  process.exit(1);
});
