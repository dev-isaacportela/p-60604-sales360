import 'dotenv/config';
import { configureSdkMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const PF_WHERE = `
  (
    CNPJ IS NULL
    OR TRIM(CNPJ) = ''
    OR LENGTH(REPLACE(REPLACE(REPLACE(TRIM(CNPJ), '.', ''), '/', ''), '-', '')) <> 14
  )
`;

const steps = [
  {
    label: 'Desvincular tarefas de clientes PF',
    sql: `
      UPDATE TAREFAS
      SET CLIENTE_ID = NULL
      WHERE CLIENTE_ID IN (
        SELECT ID
        FROM CLIENTES
        WHERE ${PF_WHERE}
      )
    `,
    optional: true,
  },
  {
    label: 'Remover itens de simulacao de clientes PF',
    sql: `
      DELETE SI
      FROM SIMULACAO_ITENS SI
      JOIN SIMULACOES S ON S.ID = SI.SIMULACAO_ID
      JOIN CLIENTES C ON C.ID = S.CLIENTE_ID
      WHERE ${PF_WHERE}
    `,
    optional: true,
  },
  {
    label: 'Remover simulacoes de clientes PF',
    sql: `
      DELETE S
      FROM SIMULACOES S
      JOIN CLIENTES C ON C.ID = S.CLIENTE_ID
      WHERE ${PF_WHERE}
    `,
    optional: true,
  },
  {
    label: 'Remover visitas de clientes PF',
    sql: `
      DELETE V
      FROM VISITAS V
      JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
      WHERE ${PF_WHERE}
    `,
    optional: true,
  },
  {
    label: 'Remover vinculos BU de clientes PF',
    sql: `
      DELETE CBV
      FROM CLIENTE_BU_VENDEDOR CBV
      JOIN CLIENTES C ON C.ID = CBV.CLIENTE_ID
      WHERE ${PF_WHERE}
    `,
    optional: true,
  },
  {
    label: 'Remover ownership de clientes PF',
    sql: `
      DELETE EC
      FROM EQUIPE_CLIENTE EC
      JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
      WHERE ${PF_WHERE}
    `,
    optional: true,
  },
  {
    label: 'Remover clientes PF da base',
    sql: `
      DELETE FROM CLIENTES
      WHERE ${PF_WHERE}
    `,
    optional: false,
  },
];

function isMissingTableError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return (
    text.includes("doesn't exist")
    || text.includes('unknown table')
    || text.includes('table') && text.includes('not found')
    || text.includes('nao existe')
  );
}

async function runStep(step) {
  try {
    const result = await runDmlMitra({ projectId, sql: step.sql });
    console.log(`[OK] ${step.label}`);
    console.log(JSON.stringify(result?.result || result || {}, null, 2));
  } catch (error) {
    if (step.optional && isMissingTableError(error)) {
      console.log(`[SKIP] ${step.label} (tabela ausente neste projeto)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log('Iniciando limpeza: manter somente clientes PJ (CNPJ 14 digitos).');

  for (const step of steps) {
    await runStep(step);
  }

  console.log('Limpeza concluida. Apenas clientes PJ permanecem na base.');
}

main().catch((error) => {
  console.error('Falha ao remover clientes PF:');
  console.error(error?.message || error);
  process.exit(1);
});
