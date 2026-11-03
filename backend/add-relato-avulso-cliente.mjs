// Relato avulso no histórico do cliente: um contato (ligação, WhatsApp, e-mail…) que não
// nasceu de visita. Cria RELATOS_CLIENTE, a SF registrarRelatoCliente e acrescenta os relatos
// à SF historicoVisitasCliente (22) com a mesma regra de escopo das visitas e tarefas.
import 'dotenv/config';
import fs from 'node:fs';
import {
  configureSdkMitra,
  runDdlMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  listServerFunctionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function lista(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.result || payload?.data || [];
}

const RELATO_BRANCH = `
  UNION ALL

  SELECT
    R.ID,
    R.DATA_CONTATO AS DATA_AGENDADA,
    COALESCE(NULLIF(R.HORA_CONTATO, ''), '--:--') AS HORA_INICIO,
    R.TIPO_CONTATO AS TIPO,
    'REGISTRADO' AS STATUS,
    R.RELATO,
    'RELATO' AS TIPO_REGISTRO
  FROM RELATOS_CLIENTE R
  WHERE R.CLIENTE_ID = (SELECT CLIENTE_ID FROM INPUT_CLIENTE)
    AND EXISTS (SELECT 1 FROM BU_SCOPE BS0 WHERE BS0.ID_CLIENTE = R.CLIENTE_ID)
    AND (
      EXISTS (
        SELECT 1
        FROM AUTOR_DEPTO AD
        JOIN BU_SCOPE BS ON BS.ID_CLIENTE = R.CLIENTE_ID AND BS.CODEPTO = AD.CODEPTO
        WHERE AD.AUTOR_ID = R.VENDEDOR_ID
      )
      OR EXISTS (
        SELECT 1
        FROM DIRETORIA_GLOBAL DG
        JOIN INPUT_SCOPE I ON 1 = 1
        WHERE I.SCOPE_CODEPTO IS NULL
           OR EXISTS (SELECT 1 FROM AUTOR_DEPTO AD2 WHERE AD2.AUTOR_ID = R.VENDEDOR_ID AND AD2.CODEPTO = I.SCOPE_CODEPTO)
      )
    )
`;

async function main() {
  const ddl = await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS RELATOS_CLIENTE (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CLIENTE_ID INT NOT NULL,
      VENDEDOR_ID INT NOT NULL,
      DATA_CONTATO VARCHAR(10) NOT NULL,
      HORA_CONTATO VARCHAR(5),
      TIPO_CONTATO VARCHAR(40) NOT NULL,
      RELATO TEXT NOT NULL,
      CRIADO_EM VARCHAR(19) NOT NULL,
      KEY IX_RELATOS_CLIENTE_CLIENTE (CLIENTE_ID, DATA_CONTATO)
    )`,
  });
  console.log('DDL:', JSON.stringify({ migration: ddl?.migration, skipped: ddl?.migrationSkippedReason }));

  const sfs = lista(await listServerFunctionsMitra({ projectId }));

  if (!sfs.find((fn) => fn.name === 'registrarRelatoCliente')) {
    const created = await createServerFunctionMitra({
      projectId,
      name: 'registrarRelatoCliente',
      type: 'SQL',
      description: 'Registra um relato avulso (contato sem visita) no histórico do cliente, em nome do usuário logado',
      code: `
INSERT INTO RELATOS_CLIENTE (CLIENTE_ID, VENDEDOR_ID, DATA_CONTATO, HORA_CONTATO, TIPO_CONTATO, RELATO, CRIADO_EM)
SELECT
  CAST('{{clienteId}}' AS UNSIGNED),
  :VAR_USER,
  '{{dataContato}}',
  NULLIF('{{horaContato}}', ''),
  '{{tipoContato}}',
  '{{relato}}',
  DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '-03:00'), '%Y-%m-%d %H:%i:%s')
FROM DUAL
WHERE '{{clienteId}}' REGEXP '^[0-9]+$'
  AND '{{dataContato}}' REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND TRIM('{{relato}}') <> '';
`,
    });
    console.log('SF registrarRelatoCliente criada:', created?.result?.serverFunctionId ?? created?.result?.id ?? created?.id);
  } else {
    console.log('SF registrarRelatoCliente já existe');
  }

  const sf22 = sfs.find((fn) => fn.name === 'historicoVisitasCliente');
  const arquivos = fs.readdirSync('migrations').filter((f) => f.startsWith('update-sf-historicovisitascliente-')).sort();
  const ultimo = fs.readFileSync(`migrations/${arquivos[arquivos.length - 1]}`, 'utf8');
  const codigo = ultimo.match(/CODE = COALESCE\('([\s\S]*?)', CODE\)/)[1].replace(/''/g, "'");
  if (codigo.includes('RELATOS_CLIENTE')) {
    console.log('SF 22 já inclui os relatos');
    return;
  }
  const marca = '), FILTRADO AS (';
  if (!codigo.includes(marca)) throw new Error('Ponto de inserção não encontrado na SF 22');
  const novo = codigo
    .replace(marca, `${RELATO_BRANCH}${marca}`)
    .replace(
      "(SELECT COUNT(*) FROM FILTRADO FT WHERE FT.TIPO_REGISTRO = 'TAREFA') AS TOTAL_TAREFAS_PERIODO",
      "(SELECT COUNT(*) FROM FILTRADO FT WHERE FT.TIPO_REGISTRO = 'TAREFA') AS TOTAL_TAREFAS_PERIODO,\n  (SELECT COUNT(*) FROM FILTRADO FR WHERE FR.TIPO_REGISTRO = 'RELATO') AS TOTAL_RELATOS_PERIODO",
    );
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: sf22.id,
    code: novo,
    description: 'Historico de visitas, tarefas e relatos avulsos do cliente no escopo do vendedor (relato restrito ao departamento do autor; inclui vendedores anteriores apos transferencia; diretoria GLOBAL ve todos)',
  });
  console.log('SF 22 atualizada com os relatos avulsos');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
