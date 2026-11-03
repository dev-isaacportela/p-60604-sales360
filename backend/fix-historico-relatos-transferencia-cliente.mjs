// Historico de relatos: o relato pertence ao cliente dentro do escopo do vendedor, restrito ao
// departamento (BU_VENDEDOR.BU_CODIGO, ativo ou nao) de quem registrou.
// Ao transferir o cliente, o novo dono da carteira passa a ver os relatos do anterior
// (antes a SF exigia VISITAS.VENDEDOR_ID = dono atual da carteira).
// Tambem alinha o TARGET_USERS ao padrao unico (ME/TEAM/SELLER/GLOBAL + diretoria) e guarda {{clienteId}}.
import 'dotenv/config';
import fs from 'node:fs';
import { configureSdkMitra, executeServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const SF_ID = 22; // historicoVisitasCliente

// Reaproveita o padrao unico de escopo (INPUT_SCOPE + TARGET_USERS) do script de carteira
const src = fs.readFileSync(new URL('./update-clientes-carteira-scope.mjs', import.meta.url), 'utf8');
let scopeCtes = src.match(/const scopeCtes = `([\s\S]*?)\nCARTEIRA_ESCOPO AS \(/)[1].trimEnd().replace(/,$/, '');

// Mantem o ramo de substituto de ferias que a SF ja tinha no modo ME
const feriasBranch = `
  UNION

  SELECT VR_DONO.USER_ID AS USER_ID
  FROM INPUT_SCOPE I
  JOIN VENDEDOR_RCA VR_SUB ON VR_SUB.USER_ID = :VAR_USER
  JOIN FERIAS_VENDEDOR FV ON FV.COD_RCA_SUBSTITUTO = VR_SUB.COD_RCA
  JOIN VENDEDOR_RCA VR_DONO ON VR_DONO.COD_RCA = FV.COD_RCA
  WHERE I.SCOPE_MODE = 'ME'
    AND COALESCE(FV.ATIVO, TRUE) = TRUE
    AND CURRENT_DATE BETWEEN FV.DT_INICIO AND FV.DT_FIM
`;
scopeCtes = scopeCtes.replace(
  /(JOIN FUNCIONARIOS F ON F\.ID_SUBSTITUTO = :VAR_USER\n  WHERE I\.SCOPE_MODE = 'ME'\n)/,
  `$1${feriasBranch}`,
);
if (!scopeCtes.includes('FERIAS_VENDEDOR') || !scopeCtes.includes("'GLOBAL'")) {
  throw new Error('Nao foi possivel montar o TARGET_USERS padrao.');
}

const code = `
WITH ${scopeCtes},
INPUT_CLIENTE AS (
  SELECT CASE WHEN '{{clienteId}}' REGEXP '^[0-9]+$' THEN CAST('{{clienteId}}' AS UNSIGNED) ELSE NULL END AS CLIENTE_ID
),
CARTEIRA_SCOPE AS (
  SELECT DISTINCT
    EC.ID_CLIENTE,
    EC.ID_VENDEDOR AS VENDEDOR_DONO_CLIENTE
  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
  JOIN INPUT_CLIENTE IC ON IC.CLIENTE_ID = EC.ID_CLIENTE
),
BU_SCOPE AS (
  SELECT DISTINCT
    CS.ID_CLIENTE,
    CS.VENDEDOR_DONO_CLIENTE AS TARGET_USER_ID,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM CARTEIRA_SCOPE CS
  JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = CS.VENDEDOR_DONO_CLIENTE
  JOIN INPUT_SCOPE I ON 1 = 1
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(CAST(BV.BU_CODIGO AS CHAR)) = I.SCOPE_CODEPTO)
    AND (
      I.SCOPE_ID_SECAO IS NULL
      OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO
      OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO
    )
),
DIRETORIA_GLOBAL AS (
  SELECT 1 AS OK
  FROM INPUT_SCOPE I
  JOIN INT_USER U ON U.ID = :VAR_USER
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  WHERE I.SCOPE_MODE = 'GLOBAL'
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
    )
  LIMIT 1
),
AUTOR_DEPTO AS (
  SELECT DISTINCT
    BV.VENDEDOR_ID AS AUTOR_ID,
    TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO
  FROM BU_VENDEDOR BV
),
BASE AS (
  SELECT
    V.ID,
    V.DATA_AGENDADA,
    V.HORA_INICIO,
    COALESCE(V.TIPO, 'Visita') AS TIPO,
    V.STATUS,
    V.RELATO,
    'VISITA' AS TIPO_REGISTRO
  FROM VISITAS V
  WHERE V.CLIENTE_ID = (SELECT CLIENTE_ID FROM INPUT_CLIENTE)
    AND EXISTS (SELECT 1 FROM BU_SCOPE BS0 WHERE BS0.ID_CLIENTE = V.CLIENTE_ID)
    AND (
      EXISTS (
        SELECT 1
        FROM AUTOR_DEPTO AD
        JOIN BU_SCOPE BS ON BS.ID_CLIENTE = V.CLIENTE_ID AND BS.CODEPTO = AD.CODEPTO
        WHERE AD.AUTOR_ID = V.VENDEDOR_ID
      )
      OR EXISTS (
        SELECT 1
        FROM DIRETORIA_GLOBAL DG
        JOIN INPUT_SCOPE I ON 1 = 1
        WHERE I.SCOPE_CODEPTO IS NULL
           OR EXISTS (SELECT 1 FROM AUTOR_DEPTO AD2 WHERE AD2.AUTOR_ID = V.VENDEDOR_ID AND AD2.CODEPTO = I.SCOPE_CODEPTO)
      )
    )

  UNION ALL

  SELECT
    T.ID,
    COALESCE(NULLIF(T.DATA_LIMITE, ''), SUBSTRING(T.CRIADO_EM, 1, 10)) AS DATA_AGENDADA,
    COALESCE(NULLIF(SUBSTRING(T.CRIADO_EM, 12, 5), ''), '--:--') AS HORA_INICIO,
    'Tarefa' AS TIPO,
    T.STATUS,
    COALESCE(NULLIF(T.DESCRICAO, ''), T.TITULO) AS RELATO,
    'TAREFA' AS TIPO_REGISTRO
  FROM TAREFAS T
  WHERE T.CLIENTE_ID = (SELECT CLIENTE_ID FROM INPUT_CLIENTE)
    AND T.STATUS = 'CONCLUIDA'
    AND EXISTS (SELECT 1 FROM BU_SCOPE BS0 WHERE BS0.ID_CLIENTE = T.CLIENTE_ID)
    AND (
      EXISTS (
        SELECT 1
        FROM AUTOR_DEPTO AD
        JOIN BU_SCOPE BS ON BS.ID_CLIENTE = T.CLIENTE_ID AND BS.CODEPTO = AD.CODEPTO
        WHERE AD.AUTOR_ID = T.VENDEDOR_ID
      )
      OR EXISTS (
        SELECT 1
        FROM DIRETORIA_GLOBAL DG
        JOIN INPUT_SCOPE I ON 1 = 1
        WHERE I.SCOPE_CODEPTO IS NULL
           OR EXISTS (SELECT 1 FROM AUTOR_DEPTO AD2 WHERE AD2.AUTOR_ID = T.VENDEDOR_ID AND AD2.CODEPTO = I.SCOPE_CODEPTO)
      )
    )
), FILTRADO AS (
  SELECT *
  FROM BASE
  WHERE ('{{status}}' = '' OR LOCATE('{', '{{status}}') > 0 OR STATUS = '{{status}}')
    AND ('{{dataInicio}}' = '' OR LOCATE('{', '{{dataInicio}}') > 0 OR DATA_AGENDADA >= '{{dataInicio}}')
    AND ('{{dataFim}}' = '' OR LOCATE('{', '{{dataFim}}') > 0 OR DATA_AGENDADA <= '{{dataFim}}')
)
SELECT
  F.ID,
  F.DATA_AGENDADA,
  F.HORA_INICIO,
  F.TIPO,
  F.STATUS,
  F.RELATO,
  F.TIPO_REGISTRO,
  (SELECT COUNT(*) FROM FILTRADO FV WHERE FV.TIPO_REGISTRO = 'VISITA') AS TOTAL_VISITAS_PERIODO,
  (SELECT COUNT(*) FROM FILTRADO FT WHERE FT.TIPO_REGISTRO = 'TAREFA') AS TOTAL_TAREFAS_PERIODO
FROM FILTRADO F
ORDER BY F.DATA_AGENDADA DESC, F.HORA_INICIO DESC
LIMIT {{limit}} OFFSET {{offset}}
`;

async function main() {
  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: SF_ID,
    code,
    description: 'Historico de visitas/tarefas do cliente no escopo do vendedor (relato restrito ao departamento do autor; inclui vendedores anteriores apos transferencia; diretoria GLOBAL ve todos)',
  });
  console.log(`SF ${SF_ID} atualizada.`);

  const base = {
    status: '', dataInicio: '', dataFim: '', limit: 5, offset: 0,
    scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', scopeCodSupervisor: '',
    scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '',
  };
  for (const input of [{ ...base, clienteId: '1' }, { ...base, clienteId: '' }, { ...base, clienteId: '1', scopeMode: 'GLOBAL' }]) {
    const r = await executeServerFunctionMitra({ projectId, serverFunctionId: SF_ID, input });
    const st = r?.result?.executionStatus;
    if (st !== 'COMPLETED') throw new Error(`Smoke falhou (${JSON.stringify(input)}): ${r?.result?.error || st}`);
    const out = r.result.output;
    console.log(`Smoke ${input.scopeMode}/cliente=${input.clienteId || '(vazio)'}: OK (${out?.rows?.length ?? 0} linha(s))`);
  }
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
