// Direcionamento Estratégico Semanal — parte 3: Carteira sem visitação há mais de 30 dias.
// Cliente da carteira (EQUIPE_CLIENTE) dos executivos do escopo cuja última visita realizada
// (CONCLUIDA ou EM_ANDAMENTO, por qualquer executivo) tem mais de 30 dias — ou que nunca foi visitado.
// Escopo: TARGET_USERS da SF 5 + BU_VENDEDOR filtrado por filial/depto/seção.
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, createServerFunctionMitra, updateServerFunctionMitra, listServerFunctionsMitra } from 'mitra-sdk';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);

const base = (await readServerFunctionMitra({ projectId, serverFunctionId: 5 })).result.code;
const fim = base.indexOf('\nVENDEDOR_INFO AS');
if (!base.startsWith('WITH INPUT_SCOPE') || fim < 0) throw new Error('Estrutura da SF 5 mudou — revisar extração do TARGET_USERS');
// Linhas em branco seguidas no TARGET_USERS da SF 5 derrubam o parser da proteção de parâmetros
const scopeCtes = base.slice(0, fim).replace(/,\s*$/, '').replace(/\n[ \t]*(\n[ \t]*)+\n/g, '\n\n');

// Tela restrita à gestão: vendedor sem cargo de diretoria/coordenação não recebe dados
const code = `${scopeCtes},
GESTOR AS (
  SELECT U.ID
  FROM INT_USER U
  LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
  WHERE U.ID = :VAR_USER
    AND (
      UPPER(COALESCE(UC.CARGO, '')) IN ('ADMIN', 'DIRETORIA', 'COORDENADOR')
      OR LOWER(COALESCE(U.DESCR, '')) = 'ti@benenutri.com'
      OR EXISTS (SELECT 1 FROM COORDENADORES C WHERE C.USER_ID = :VAR_USER AND COALESCE(C.ATIVO, TRUE) = TRUE)
    )
),
PERIODO AS (
  SELECT CASE WHEN '{{hoje}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{hoje}}' ELSE DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') END AS HOJE
),
EXECUTIVOS AS (
  SELECT DISTINCT BV.VENDEDOR_ID
  FROM BU_VENDEDOR BV
  JOIN (SELECT DISTINCT USER_ID FROM TARGET_USERS WHERE EXISTS (SELECT 1 FROM GESTOR)) TU ON TU.USER_ID = BV.VENDEDOR_ID
  CROSS JOIN INPUT_SCOPE I
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) = I.SCOPE_CODEPTO)
    AND (I.SCOPE_ID_SECAO IS NULL OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO)
),
CARTEIRA AS (
  SELECT EC.ID_VENDEDOR AS VENDEDOR_ID, EC.ID_CLIENTE AS CLIENTE_ID,
    MAX(CASE WHEN UPPER(EC.CURVA_CLASSIFICACAO) IN ('A', 'B', 'C') THEN UPPER(EC.CURVA_CLASSIFICACAO) END) AS CURVA
  FROM EQUIPE_CLIENTE EC
  JOIN EXECUTIVOS E ON E.VENDEDOR_ID = EC.ID_VENDEDOR
  GROUP BY EC.ID_VENDEDOR, EC.ID_CLIENTE
),
ULT_VISITA AS (
  SELECT V.CLIENTE_ID, MAX(V.DATA_AGENDADA) AS ULTIMA
  FROM VISITAS V
  JOIN (SELECT DISTINCT CLIENTE_ID FROM CARTEIRA) CA ON CA.CLIENTE_ID = V.CLIENTE_ID
  CROSS JOIN PERIODO P
  WHERE V.STATUS IN ('CONCLUIDA', 'EM_ANDAMENTO') AND V.DATA_AGENDADA <= P.HOJE
  GROUP BY V.CLIENTE_ID
),
PROX_VISITA AS (
  SELECT V.CLIENTE_ID, MIN(V.DATA_AGENDADA) AS PROXIMA
  FROM VISITAS V
  JOIN (SELECT DISTINCT CLIENTE_ID FROM CARTEIRA) CA ON CA.CLIENTE_ID = V.CLIENTE_ID
  CROSS JOIN PERIODO P
  WHERE V.STATUS = 'AGENDADA' AND V.DATA_AGENDADA >= P.HOJE
  GROUP BY V.CLIENTE_ID
)
SELECT CA.VENDEDOR_ID AS EXECUTIVO_ID,
  COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Executivo ', CA.VENDEDOR_ID)) AS EXECUTIVO_NOME,
  CA.CLIENTE_ID, COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), C.RAZAO_SOCIAL) AS CLIENTE, C.CIDADE, C.WINTHOR_CODCLI AS COD_CLIENTE, CA.CURVA,
  CAST(UV.ULTIMA AS CHAR) AS ULTIMA_VISITA,
  CASE WHEN UV.ULTIMA IS NULL THEN NULL ELSE DATEDIFF(P.HOJE, UV.ULTIMA) END AS DIAS_SEM_VISITA,
  CAST(PV.PROXIMA AS CHAR) AS PROXIMA_VISITA
FROM CARTEIRA CA
CROSS JOIN PERIODO P
JOIN CLIENTES C ON C.ID = CA.CLIENTE_ID
LEFT JOIN ULT_VISITA UV ON UV.CLIENTE_ID = CA.CLIENTE_ID
LEFT JOIN PROX_VISITA PV ON PV.CLIENTE_ID = CA.CLIENTE_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = CA.VENDEDOR_ID
LEFT JOIN INT_USER U ON U.ID = CA.VENDEDOR_ID
WHERE UV.ULTIMA IS NULL OR DATEDIFF(P.HOJE, UV.ULTIMA) > 30
ORDER BY EXECUTIVO_NOME, CASE WHEN UV.ULTIMA IS NULL THEN 0 ELSE 1 END, UV.ULTIMA
LIMIT 5000`;

const nome = 'direcionamentoCarteiraSemVisita';
const descricao = 'Direcionamento Estratégico Semanal: clientes da carteira sem visita realizada há mais de 30 dias (ou nunca visitados), com última e próxima visita. Escopo ME/TEAM/SELLER/GLOBAL. Params: hoje (YYYY-MM-DD) + scope*.';
const existente = ((await listServerFunctionsMitra({ projectId })).result || []).find((f) => f.name === nome);
const r = existente
  ? await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code, description: descricao })
  : await createServerFunctionMitra({ projectId, name: nome, type: 'SQL', code, description: descricao });
console.log('SF', nome, existente?.id ?? r.result.serverFunctionId);
