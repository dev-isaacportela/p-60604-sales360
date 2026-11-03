import 'dotenv/config';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const TARGET_FUNCTIONS = [
  'listarVisitasPeriodo',
  'visitasDoDia',
  'agendaListarVisitasPaginado',
  'agendaContarVisitasPaginado',
];

function prioritizeUserName(code) {
  let next = code;

  next = next.replaceAll(
    "COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Vendedor ', VR.USER_ID))",
    "COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, RT.RCA_NOME, CONCAT('Vendedor ', VR.USER_ID))",
  );

  next = next.replaceAll(
    "COALESCE(NULLIF(TRIM(F.NOME), ''), RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA))",
    "COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, RT.RCA_NOME, CONCAT('RCA ', VR.COD_RCA))",
  );

  if (next.includes('LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID') && !next.includes('LEFT JOIN INT_USER U ON U.ID = VR.USER_ID')) {
    next = next.replace(
      'LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID',
      'LEFT JOIN FUNCIONARIOS F ON F.ID = VR.USER_ID\n  LEFT JOIN INT_USER U ON U.ID = VR.USER_ID',
    );
  }

  return next;
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const sfMap = new Map((listed?.result || []).map((sf) => [sf.name, sf]));
  const updated = [];

  for (const name of TARGET_FUNCTIONS) {
    const existing = sfMap.get(name);
    if (!existing) continue;

    const current = await readServerFunctionMitra({ projectId, serverFunctionId: existing.id });
    const code = String(current?.result?.code || '');
    const nextCode = prioritizeUserName(code);

    if (nextCode === code) continue;

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: nextCode,
      description: current?.result?.description || existing.description,
    });
    updated.push({ name, id: existing.id });
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao priorizar nome de usuário na agenda do coordenador:');
  console.error(error?.message || error);
  process.exit(1);
});
