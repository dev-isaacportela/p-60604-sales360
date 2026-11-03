// Direcionamento Estratégico Semanal — parte 1: Controle de Agenda e Visitas por executivo.
// Lista visitas e prospecções da semana: não concluídas, sem relato, reagendadas e canceladas.
// Escopo: reaproveita o TARGET_USERS (ME/TEAM/SELLER/GLOBAL) da SF listarVisitasPeriodo (5).
// Compromissos internos ficam de fora: AGENDA_INTERNA não tem fluxo de conclusão.
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
  SELECT
    CASE WHEN '{{dataInicio}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{dataInicio}}' ELSE NULL END AS DT_INI,
    CASE WHEN '{{dataFim}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{dataFim}}' ELSE NULL END AS DT_FIM,
    CASE WHEN '{{hoje}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{hoje}}' ELSE DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') END AS HOJE
),
EXECUTIVOS AS (
  SELECT TU.USER_ID,
    COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Executivo ', TU.USER_ID)) AS EXECUTIVO_NOME
  FROM (SELECT DISTINCT USER_ID FROM TARGET_USERS WHERE EXISTS (SELECT 1 FROM GESTOR)) TU
  LEFT JOIN FUNCIONARIOS F ON F.ID = TU.USER_ID
  LEFT JOIN INT_USER U ON U.ID = TU.USER_ID
),
ITENS AS (
  SELECT 'VISITA' AS ORIGEM, V.ID, V.VENDEDOR_ID AS EXECUTIVO_ID,
    CAST(V.DATA_AGENDADA AS CHAR) AS DATA_AGENDADA, V.HORA_INICIO, V.TIPO, V.STATUS,
    C.NOME_FANTASIA AS CONTA, C.CIDADE, C.WINTHOR_CODCLI AS COD_CLIENTE,
    CASE WHEN NULLIF(TRIM(V.RELATO), '') IS NULL THEN 1 ELSE 0 END AS SEM_RELATO,
    CASE WHEN V.RELATO LIKE '%Reagendamento em%' THEN 1 ELSE 0 END AS REAGENDADA
  FROM VISITAS V
  JOIN EXECUTIVOS E ON E.USER_ID = V.VENDEDOR_ID
  JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  JOIN PERIODO P ON V.DATA_AGENDADA BETWEEN P.DT_INI AND P.DT_FIM
  WHERE V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')

  UNION ALL

  SELECT 'PROSPECCAO' AS ORIGEM, PV.ID, PV.EXECUTIVO_ID,
    CAST(PV.DATA_VISITA AS CHAR), PV.HORA_INICIO, 'Prospecção', PV.STATUS,
    COALESCE(NULLIF(PR.NOME_FANTASIA, ''), PR.RAZAO_SOCIAL), NULL, NULL,
    CASE WHEN NULLIF(TRIM(PV.RESUMO), '') IS NULL THEN 1 ELSE 0 END,
    CASE WHEN PV.RESUMO LIKE '%Reagendamento em%' THEN 1 ELSE 0 END
  FROM PROSPECT_VISITAS PV
  JOIN EXECUTIVOS E ON E.USER_ID = PV.EXECUTIVO_ID
  JOIN PROSPECTS PR ON PR.ID = PV.PROSPECT_ID
  JOIN PERIODO P ON PV.DATA_VISITA BETWEEN P.DT_INI AND P.DT_FIM
  WHERE PV.STATUS IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')
)
SELECT I.ORIGEM, I.ID, I.EXECUTIVO_ID, E.EXECUTIVO_NOME, I.DATA_AGENDADA, I.HORA_INICIO, I.TIPO, I.STATUS,
  I.CONTA, I.CIDADE, I.COD_CLIENTE, I.SEM_RELATO, I.REAGENDADA,
  CASE WHEN I.STATUS NOT IN ('CONCLUIDA', 'CANCELADA') AND I.DATA_AGENDADA < P.HOJE THEN 1 ELSE 0 END AS ATRASADO
FROM ITENS I
JOIN EXECUTIVOS E ON E.USER_ID = I.EXECUTIVO_ID
CROSS JOIN PERIODO P
ORDER BY E.EXECUTIVO_NOME, I.DATA_AGENDADA, I.HORA_INICIO, I.ID`;

const nome = 'direcionamentoAgendaSemanaExecutivos';
const descricao = 'Direcionamento Estratégico Semanal: visitas e prospecções da semana por executivo, com status, flags SEM_RELATO, REAGENDADA e ATRASADO. Escopo ME/TEAM/SELLER/GLOBAL. Params: dataInicio, dataFim, hoje (YYYY-MM-DD) + scope*.';
const existente = ((await listServerFunctionsMitra({ projectId })).result || []).find((f) => f.name === nome);
const r = existente
  ? await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code, description: descricao })
  : await createServerFunctionMitra({
  projectId,
  name: 'direcionamentoAgendaSemanaExecutivos',
  type: 'SQL',
  code,
  description: descricao,
});
console.log(JSON.stringify(r.result ?? r));
