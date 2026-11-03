// Direcionamento Estratégico Semanal — parte 2: Clientes críticos sem compra.
// Cliente importante (curva A manual ou top 20% do faturamento 180d na carteira do executivo)
// com previsão de compra na semana (última compra + ciclo médio) que não comprou.
// Escopo: TARGET_USERS da SF 5. Venda casada por WINTHOR_CODCLI + BU_VENDEDOR (filial/depto/seção).
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, createServerFunctionMitra, updateServerFunctionMitra, listServerFunctionsMitra, listProfilesMitra, getProfileDetailsMitra, setProfileServerFunctionsMitra } from 'mitra-sdk';

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
  SELECT DT_INI, DATE_FORMAT(DATE_ADD(DT_INI, INTERVAL 6 DAY), '%Y-%m-%d') AS DT_FIM,
    DATE_FORMAT(DATE_SUB(DT_INI, INTERVAL 180 DAY), '%Y-%m-%d') AS DT_HIST, HOJE
  FROM (
    SELECT
      CASE WHEN '{{dataInicio}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{dataInicio}}' ELSE NULL END AS DT_INI,
      CASE WHEN '{{hoje}}' REGEXP '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$' THEN '{{hoje}}' ELSE DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') END AS HOJE
  ) X
),
BU_SCOPE AS (
  SELECT DISTINCT BV.VENDEDOR_ID,
    TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
    TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) AS CODEPTO,
    BV.ID_SECAO
  FROM BU_VENDEDOR BV
  JOIN (SELECT DISTINCT USER_ID FROM TARGET_USERS WHERE EXISTS (SELECT 1 FROM GESTOR)) TU ON TU.USER_ID = BV.VENDEDOR_ID
  CROSS JOIN INPUT_SCOPE I
  WHERE COALESCE(BV.ATIVO, TRUE) = TRUE
    AND (I.SCOPE_CODFILIAL IS NULL OR TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) = I.SCOPE_CODFILIAL)
    AND (I.SCOPE_CODEPTO IS NULL OR TRIM(COALESCE(CAST(BV.BU_CODIGO AS CHAR), '')) = I.SCOPE_CODEPTO)
    AND (I.SCOPE_ID_SECAO IS NULL OR TRIM(CAST(BV.ID_SECAO AS CHAR)) = I.SCOPE_ID_SECAO OR LPAD(TRIM(CAST(BV.ID_SECAO AS CHAR)), 2, '0') = I.SCOPE_ID_SECAO)
),
CARTEIRA AS (
  SELECT EC.ID_VENDEDOR AS VENDEDOR_ID, C.ID AS CLIENTE_ID,
    TRIM(COALESCE(CAST(C.WINTHOR_CODCLI AS CHAR), '')) AS CODCLI,
    MAX(CASE WHEN UPPER(EC.CURVA_CLASSIFICACAO) = 'A' THEN 1 ELSE 0 END) AS CURVA_A
  FROM EQUIPE_CLIENTE EC
  JOIN (SELECT DISTINCT VENDEDOR_ID FROM BU_SCOPE) BS ON BS.VENDEDOR_ID = EC.ID_VENDEDOR
  JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
  WHERE C.WINTHOR_CODCLI IS NOT NULL
  GROUP BY EC.ID_VENDEDOR, C.ID, C.WINTHOR_CODCLI
),
VENDAS AS (
  SELECT CA.VENDEDOR_ID, CA.CLIENTE_ID, R.DATA_SAIDA, SUM(COALESCE(R.TOTAL, R.VALOR)) AS VALOR
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  CROSS JOIN PERIODO P
  JOIN CARTEIRA CA ON CA.CODCLI = TRIM(COALESCE(CAST(R.CODCLI AS CHAR), ''))
  WHERE R.ATIVO = TRUE AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.DATA_SAIDA >= P.DT_HIST AND R.DATA_SAIDA <= P.DT_FIM
    AND EXISTS (
      SELECT 1 FROM BU_SCOPE BS
      WHERE BS.VENDEDOR_ID = CA.VENDEDOR_ID
        AND BS.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
        AND BS.CODEPTO = TRIM(COALESCE(CAST(R.CODEPTO AS CHAR), ''))
        AND (BS.ID_SECAO IS NULL OR BS.ID_SECAO = R.ID_SECAO
             OR LPAD(TRIM(CAST(BS.ID_SECAO AS CHAR)), 2, '0') = LPAD(TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR)), 2, '0'))
    )
  GROUP BY CA.VENDEDOR_ID, CA.CLIENTE_ID, R.DATA_SAIDA
),
HIST AS (
  SELECT V.VENDEDOR_ID, V.CLIENTE_ID,
    COUNT(CASE WHEN V.DATA_SAIDA < P.DT_INI THEN 1 END) AS N_COMPRAS,
    MIN(CASE WHEN V.DATA_SAIDA < P.DT_INI THEN V.DATA_SAIDA END) AS PRIMEIRA,
    MAX(CASE WHEN V.DATA_SAIDA < P.DT_INI THEN V.DATA_SAIDA END) AS ULTIMA,
    SUM(CASE WHEN V.DATA_SAIDA < P.DT_INI THEN V.VALOR ELSE 0 END) AS VALOR_180D,
    SUM(CASE WHEN V.DATA_SAIDA >= P.DT_INI THEN V.VALOR ELSE 0 END) AS VALOR_SEMANA,
    MAX(CASE WHEN V.DATA_SAIDA >= P.DT_INI THEN 1 ELSE 0 END) AS COMPROU
  FROM VENDAS V CROSS JOIN PERIODO P
  GROUP BY V.VENDEDOR_ID, V.CLIENTE_ID
),
RANKING AS (
  SELECT H.*, CA.CURVA_A,
    ROUND(DATEDIFF(H.ULTIMA, H.PRIMEIRA) / (H.N_COMPRAS - 1)) AS CICLO,
    (SELECT COUNT(*) FROM HIST H2 WHERE H2.VENDEDOR_ID = H.VENDEDOR_ID AND H2.VALOR_180D > H.VALOR_180D) AS ACIMA,
    (SELECT COUNT(*) FROM HIST H3 WHERE H3.VENDEDOR_ID = H.VENDEDOR_ID AND H3.VALOR_180D > 0) AS TOTAL_CARTEIRA
  FROM HIST H
  JOIN CARTEIRA CA ON CA.VENDEDOR_ID = H.VENDEDOR_ID AND CA.CLIENTE_ID = H.CLIENTE_ID
  WHERE H.N_COMPRAS >= 3
),
PREVISTOS AS (
  SELECT RK.*, DATE_FORMAT(DATE_ADD(RK.ULTIMA, INTERVAL RK.CICLO DAY), '%Y-%m-%d') AS DATA_PREVISTA
  FROM RANKING RK CROSS JOIN PERIODO P
  WHERE RK.CICLO BETWEEN 1 AND 90
    AND (RK.CURVA_A = 1 OR RK.ACIMA < CEIL(RK.TOTAL_CARTEIRA * 0.2))
    AND DATE_ADD(RK.ULTIMA, INTERVAL RK.CICLO DAY) <= P.DT_FIM
    AND DATEDIFF(P.DT_INI, RK.ULTIMA) <= RK.CICLO * 2
)
SELECT PV.VENDEDOR_ID AS EXECUTIVO_ID,
  COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(U.NOME), ''), U.DESCR, CONCAT('Executivo ', PV.VENDEDOR_ID)) AS EXECUTIVO_NOME,
  PV.CLIENTE_ID, COALESCE(NULLIF(TRIM(C.NOME_FANTASIA), ''), C.RAZAO_SOCIAL) AS CLIENTE, C.CIDADE, C.WINTHOR_CODCLI AS COD_CLIENTE,
  CASE WHEN PV.CURVA_A = 1 THEN 'A' ELSE 'TOP' END AS IMPORTANCIA,
  PV.ULTIMA AS ULTIMA_COMPRA, PV.CICLO, PV.DATA_PREVISTA, PV.N_COMPRAS,
  ROUND(PV.VALOR_180D / PV.N_COMPRAS, 2) AS TICKET_MEDIO,
  PV.COMPROU, ROUND(PV.VALOR_SEMANA, 2) AS VALOR_SEMANA,
  CASE WHEN PV.COMPROU = 0 AND PV.DATA_PREVISTA >= P.HOJE THEN 1 ELSE 0 END AS AINDA_NO_PRAZO
FROM PREVISTOS PV
CROSS JOIN PERIODO P
JOIN CLIENTES C ON C.ID = PV.CLIENTE_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = PV.VENDEDOR_ID
LEFT JOIN INT_USER U ON U.ID = PV.VENDEDOR_ID
ORDER BY EXECUTIVO_NOME, PV.COMPROU, PV.VALOR_180D DESC
LIMIT 2000`;

const nome = 'direcionamentoClientesCriticosSemCompra';
const descricao = 'Direcionamento Estratégico Semanal: clientes importantes (curva A ou top 20% do faturamento 180d) com previsão de compra na semana (última compra + ciclo médio) e flag COMPROU. Escopo ME/TEAM/SELLER/GLOBAL. Params: dataInicio (segunda, YYYY-MM-DD), hoje + scope*.';
const sfs = (await listServerFunctionsMitra({ projectId })).result || [];
const existente = sfs.find((f) => f.name === nome);
const r = existente
  ? await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code, description: descricao })
  : await createServerFunctionMitra({ projectId, name: nome, type: 'SQL', code, description: descricao });
const novoId = existente?.id ?? r.result.serverFunctionId;
console.log('SF', nome, novoId);

// Mesmos perfis que já têm a parte 1 da tela
const parte1 = sfs.find((f) => f.name === 'direcionamentoAgendaSemanaExecutivos')?.id;
for (const p of (await listProfilesMitra({ projectId })).result || []) {
  const d = (await getProfileDetailsMitra({ projectId, profileId: p.id })).result;
  const ids = (d.serverFunctions || []).map((s) => s.id ?? s.serverFunctionId);
  if (ids.includes(parte1) && !ids.includes(novoId)) {
    await setProfileServerFunctionsMitra({ projectId, profileId: p.id, serverFunctionIds: [...ids, novoId] });
    console.log('perfil', p.name, '+', novoId);
  }
}
