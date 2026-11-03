// Aplica a titularidade (CLIENTE_TITULAR_DEPTO) nas SFs de vendas que resolvem escopo por TARGET_USERS.
//  (1) Leitura da venda: venda/devolução cuja combinação cliente x filial x depto x seção tem titular
//      FORA do TARGET_USERS não entra (tabela-fonte vira derivada filtrada).
//  (2) Atribuição por vendedor (JOIN CARTEIRA_SCOPE CS ... CS.TARGET_USER_ID = B.TARGET_USER_ID):
//      a linha só conta para o titular — elimina a dupla contagem entre vendedores do mesmo time.
// Sem titular (empate pendente) => comportamento atual. Titular bloqueado/institucional é ignorado.
import { USUARIOS_EXCLUIDOS_SQL } from './titulares-config.mjs';

export const MARK = '/*TITULAR_VENDAS*/';

const FONTES = {
  IMP_VENDAS_DASHBOARD_TOTVS_RCA: { cli: 'CODCLI', fil: 'CODFILIAL', dep: 'CODEPTO', sec: (a) => `${a}.CODSEC` },
  IMP_DEVOLUCOES_TOTVS: { cli: 'CODCLI', fil: 'CODFILIAL', dep: 'CODEPTO', sec: (a) => `${a}.CODSEC` },
  PEDIDOS_SEMANAIS_SYNC_RAW: { cli: 'CODCLI', fil: 'CODFILIAL', dep: 'CODEPTO', sec: (a) => `COALESCE(${a}.ID_SECAO, ${a}.CODSECAO)` },
  // CTEs intermediários do painel do coordenador (mesmas colunas da fonte)
  VENDAS_PERIODO: { cli: 'CODCLI', fil: 'CODFILIAL', dep: 'CODEPTO', sec: (a) => `${a}.CODSEC` },
  DEVOLUCOES_PERIODO: { cli: 'CODCLI', fil: 'CODFILIAL', dep: 'CODEPTO', sec: (a) => `${a}.CODSEC` },
};
const TABELAS_BRUTAS = new Set(['IMP_VENDAS_DASHBOARD_TOTVS_RCA', 'IMP_DEVOLUCOES_TOTVS', 'PEDIDOS_SEMANAIS_SYNC_RAW']);

// Titulares normalizados (uma linha por variante de seção: "201" e "01"-padded), calculados uma vez por consulta.
// Só MANUAIS: titular AUTO existe apenas onde há um único candidato, então nunca muda o que alguém vê.
const CTE_TITULARES = `TITULARES_NORM AS (
  SELECT TRIM(CAST(C_TIT.WINTHOR_CODCLI AS CHAR)) AS CODCLI, T_TIT.CODFILIAL, T_TIT.CODEPTO,
         TRIM(CAST(T_TIT.ID_SECAO AS CHAR)) AS SEC, T_TIT.VENDEDOR_ID
  FROM CLIENTE_TITULAR_DEPTO T_TIT
  JOIN CLIENTES C_TIT ON C_TIT.ID = T_TIT.ID_CLIENTE
  WHERE COALESCE(T_TIT.ATIVO, TRUE) = TRUE
    AND T_TIT.ORIGEM = 'MANUAL'
    AND C_TIT.WINTHOR_CODCLI IS NOT NULL
    AND T_TIT.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}
  UNION
  SELECT TRIM(CAST(C_TIT.WINTHOR_CODCLI AS CHAR)), T_TIT.CODFILIAL, T_TIT.CODEPTO,
         LPAD(TRIM(CAST(T_TIT.ID_SECAO AS CHAR)), 2, '0'), T_TIT.VENDEDOR_ID
  FROM CLIENTE_TITULAR_DEPTO T_TIT
  JOIN CLIENTES C_TIT ON C_TIT.ID = T_TIT.ID_CLIENTE
  WHERE COALESCE(T_TIT.ATIVO, TRUE) = TRUE
    AND T_TIT.ORIGEM = 'MANUAL'
    AND C_TIT.WINTHOR_CODCLI IS NOT NULL
    AND T_TIT.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}

),`;

// Empates pendentes (2+ candidatos, sem titular manual): candidatos por combinação, nas duas variantes de seção.
// Nos totais somados a venda fica com UM candidato (o de menor código dentro do conjunto somado),
// para não inflar o total; na visão individual nada muda (só há um candidato no conjunto).
const CTE_EMPATES = `EMPATES_CAND AS (
  SELECT DISTINCT EC_EMP.ID_CLIENTE, TRIM(CAST(C_EMP.WINTHOR_CODCLI AS CHAR)) AS CODCLI,
         TRIM(CAST(BV_EMP.CODFILIAL AS CHAR)) AS CODFILIAL, TRIM(CAST(BV_EMP.BU_CODIGO AS CHAR)) AS CODEPTO,
         BV_EMP.ID_SECAO, BV_EMP.VENDEDOR_ID
  FROM EQUIPE_CLIENTE EC_EMP
  JOIN CLIENTES C_EMP ON C_EMP.ID = EC_EMP.ID_CLIENTE
  JOIN BU_VENDEDOR BV_EMP ON BV_EMP.VENDEDOR_ID = EC_EMP.ID_VENDEDOR AND COALESCE(BV_EMP.ATIVO, TRUE) = TRUE
  WHERE BV_EMP.ID_SECAO IS NOT NULL
    AND C_EMP.WINTHOR_CODCLI IS NOT NULL
    AND BV_EMP.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}
),
EMPATES_PEND AS (
  SELECT EC1.CODCLI, EC1.CODFILIAL, EC1.CODEPTO, EC1.ID_SECAO, EC1.VENDEDOR_ID
  FROM EMPATES_CAND EC1
  JOIN (
    SELECT ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO
    FROM EMPATES_CAND
    GROUP BY ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO
    HAVING COUNT(DISTINCT VENDEDOR_ID) > 1
  ) K ON K.ID_CLIENTE = EC1.ID_CLIENTE AND K.CODFILIAL = EC1.CODFILIAL
     AND K.CODEPTO = EC1.CODEPTO AND K.ID_SECAO = EC1.ID_SECAO
  LEFT JOIN CLIENTE_TITULAR_DEPTO T_EMP
    ON T_EMP.ID_CLIENTE = EC1.ID_CLIENTE AND T_EMP.CODFILIAL = EC1.CODFILIAL
   AND T_EMP.CODEPTO = EC1.CODEPTO AND T_EMP.ID_SECAO = EC1.ID_SECAO
   AND T_EMP.ORIGEM = 'MANUAL' AND COALESCE(T_EMP.ATIVO, TRUE) = TRUE
   AND T_EMP.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}
  WHERE T_EMP.ID IS NULL
),
EMPATES_NORM AS (
  SELECT CODCLI, CODFILIAL, CODEPTO, TRIM(CAST(ID_SECAO AS CHAR)) AS SEC, VENDEDOR_ID FROM EMPATES_PEND
  UNION
  SELECT CODCLI, CODFILIAL, CODEPTO, LPAD(TRIM(CAST(ID_SECAO AS CHAR)), 2, '0'), VENDEDOR_ID FROM EMPATES_PEND
),`;

// Existe, no empate pendente da venda, outro candidato com código menor dentro do conjunto somado
function empateOutroMenor(tabela, a, alvo, conjunto) {
  const k = chaveVenda(tabela, a);
  return `EXISTS (
      SELECT 1 FROM EMPATES_NORM EN_ROW
      WHERE EN_ROW.CODCLI = ${k.cli} AND EN_ROW.CODFILIAL = ${k.fil}
        AND EN_ROW.CODEPTO = ${k.dep} AND EN_ROW.SEC = ${k.sec}
        AND EN_ROW.VENDEDOR_ID < ${alvo}${conjunto ? `\n        AND EN_ROW.VENDEDOR_ID IN ${conjunto(a)}` : ''}
    )`;
}

function chaveVenda(tabela, a) {
  const f = FONTES[tabela];
  return {
    cli: `TRIM(CAST(${a}.${f.cli} AS CHAR))`,
    fil: `TRIM(COALESCE(CAST(${a}.${f.fil} AS CHAR), ''))`,
    dep: `TRIM(CAST(${a}.${f.dep} AS CHAR))`,
    sec: `TRIM(CAST(${f.sec(a)} AS CHAR))`,
  };
}

// Existe titular (diferente de alvo) para a combinação da venda
function titularOutro(tabela, a, alvo) {
  const k = chaveVenda(tabela, a);
  return `EXISTS (
      SELECT 1 FROM TITULARES_NORM TN_ROW
      WHERE TN_ROW.CODCLI = ${k.cli} AND TN_ROW.CODFILIAL = ${k.fil}
        AND TN_ROW.CODEPTO = ${k.dep} AND TN_ROW.SEC = ${k.sec}
        AND TN_ROW.VENDEDOR_ID <> ${alvo}
    )`;
}

// Existe titular fora do TARGET_USERS para a combinação da venda
function titularFora(tabela, a) {
  const k = chaveVenda(tabela, a);
  return `EXISTS (
      SELECT 1 FROM TITULARES_NORM TF
      WHERE TF.CODCLI = ${k.cli} AND TF.CODFILIAL = ${k.fil}
        AND TF.CODEPTO = ${k.dep} AND TF.SEC = ${k.sec}
        AND TF.VENDEDOR_ID NOT IN (SELECT TU_TIT.USER_ID FROM TARGET_USERS TU_TIT)
    )`;
}

const RE_FONTE = /\b(FROM|JOIN)\s+(IMP_VENDAS_DASHBOARD_TOTVS_RCA|IMP_DEVOLUCOES_TOTVS|PEDIDOS_SEMANAIS_SYNC_RAW|VENDAS_PERIODO|DEVOLUCOES_PERIODO)\s+([A-Z][A-Z0-9_]*)\b/g;
const PALAVRAS = new Set(['WHERE', 'JOIN', 'LEFT', 'INNER', 'ON', 'GROUP', 'ORDER', 'UNION', 'HAVING', 'LIMIT', 'CROSS', 'RIGHT', 'AS']);
// Pontos de atribuição venda -> vendedor alvo, e a expressão do vendedor daquela linha
// [ponto de atribuição venda -> vendedor, vendedor da linha, conjunto de vendedores somados (null = todos)]
// [ponto de atribuição venda -> vendedor, vendedor da linha, conjunto de vendedores que TAMBÉM recebem
//  essa venda no mesmo CTE (função do alias da venda; null = qualquer candidato)]
// O conjunto precisa ser exatamente quem disputa a linha, senão a venda some (ninguém fica com ela).
const ATRIBS = [
  ['CS.TARGET_USER_ID = B.TARGET_USER_ID', 'B.TARGET_USER_ID', () => '(SELECT TU_EMP.USER_ID FROM TARGET_USERS TU_EMP)'],
  ['CS.USER_ID = BS.USER_ID', 'BS.USER_ID', () => '(SELECT TU_EMP.USER_ID FROM TARGET_USERS TU_EMP)'],
  // painel do coordenador (venda atribuída por cliente da carteira)
  ['WHERE BV.VENDEDOR_ID = CCC.ID_VENDEDOR', 'CCC.ID_VENDEDOR', (a) => `(SELECT CCC_EMP.ID_VENDEDOR FROM CLIENTES_CARTEIRA_COORDENADOR CCC_EMP WHERE CCC_EMP.ID_CLIENTE = ${a}.ID_CLIENTE_INTERNO)`],
  ['WHERE BV.VENDEDOR_ID = CC.ID_VENDEDOR', 'CC.ID_VENDEDOR', (a) => `(SELECT CC_EMP.ID_VENDEDOR FROM CLIENTES_CARTEIRA CC_EMP WHERE CC_EMP.ID_CLIENTE = ${a}.ID_CLIENTE_INTERNO)`],
  // diretoria / faturamento (ESCOPO_CARTEIRA x BU_VENDEDOR)
  ['BV_SCOPE.VENDEDOR_ID = EC.ID_VENDEDOR', 'EC.ID_VENDEDOR', (a) => `(SELECT EC_EMP.ID_VENDEDOR FROM ESCOPO_CARTEIRA EC_EMP WHERE EC_EMP.CODCLI = CAST(COALESCE(${a}.CODCLI, 0) AS UNSIGNED))`],
  ['BV_SCOPE.VENDEDOR_ID = EC.VENDEDOR_ID', 'EC.VENDEDOR_ID', (a) => `(SELECT EC_EMP.VENDEDOR_ID FROM ESCOPO_CARTEIRA EC_EMP WHERE EC_EMP.CODCLI = CAST(COALESCE(${a}.CODCLI, 0) AS UNSIGNED))`],
];

// Carteira "logada" (um dono por cliente): cliente sai quando TODAS as BUs do vendedor têm titular de fora
const ANCORA_CARTEIRA_LOGADA = `  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
),`;
const CARTEIRA_LOGADA_FILTRADA = `  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
  WHERE NOT (
    EXISTS (SELECT 1 FROM BU_VENDEDOR B_T1 WHERE B_T1.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(B_T1.ATIVO, TRUE) = TRUE)
    AND NOT EXISTS (
      SELECT 1 FROM BU_VENDEDOR B_T2
      WHERE B_T2.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(B_T2.ATIVO, TRUE) = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM CLIENTE_TITULAR_DEPTO T_CL
          WHERE T_CL.ID_CLIENTE = EC.ID_CLIENTE
            AND T_CL.CODFILIAL = TRIM(COALESCE(CAST(B_T2.CODFILIAL AS CHAR), ''))
            AND T_CL.CODEPTO = TRIM(CAST(B_T2.BU_CODIGO AS CHAR))
            AND T_CL.ID_SECAO = B_T2.ID_SECAO
            AND COALESCE(T_CL.ATIVO, TRUE) = TRUE
            AND T_CL.ORIGEM = 'MANUAL'
            AND T_CL.VENDEDOR_ID NOT IN (SELECT TU_CL.USER_ID FROM TARGET_USERS TU_CL)
            AND T_CL.VENDEDOR_ID NOT IN ${USUARIOS_EXCLUIDOS_SQL}
        )
    )
  )
),`;

export function aplicar(code) {
  if (code.includes(MARK)) return { code, mudou: false, rowLevel: 0, tableLevel: 0 };
  let rowLevel = 0;
  let out = code;
  if (/CARTEIRA_LOGADA_RAW\s+AS\s*\(/.test(out) && out.split(ANCORA_CARTEIRA_LOGADA).length === 2) {
    out = out.replace(ANCORA_CARTEIRA_LOGADA, CARTEIRA_LOGADA_FILTRADA);
    rowLevel++;
  }
  for (const [ATRIB, alvo, conjunto] of ATRIBS) {
    const src = out;
    out = '';
    let pos = 0;
    let idx;
    while ((idx = src.indexOf(ATRIB, pos)) !== -1) {
      // início do CTE corrente: último " AS (" antes da posição
      const inicioCte = src.lastIndexOf(' AS (', idx);
      const trecho = src.slice(inicioCte < 0 ? 0 : inicioCte, idx);
      let ultima = null;
      for (const m of trecho.matchAll(RE_FONTE)) if (!PALAVRAS.has(m[3])) ultima = m;
      out += src.slice(pos, idx + ATRIB.length);
      if (ultima) {
        out += `\n  AND NOT ${titularOutro(ultima[2], ultima[3], alvo)}\n  AND NOT ${empateOutroMenor(ultima[2], ultima[3], alvo, conjunto)}`;
        rowLevel++;
      }
      pos = idx + ATRIB.length;
    }
    out += src.slice(pos);
  }
  // (1) leitura filtrada
  let tableLevel = 0;
  const temTargetUsers = /\bTARGET_USERS\s+AS\s*\(/i.test(code);
  out = out.replace(RE_FONTE, (m, kw, tabela, alias) => {
    if (PALAVRAS.has(alias) || !TABELAS_BRUTAS.has(tabela) || !temTargetUsers) return m;
    tableLevel++;
    const a0 = `${alias}_SRC`;
    return `${kw} (SELECT ${a0}.* FROM ${tabela} ${a0} WHERE NOT ${titularFora(tabela, a0)}) ${alias}`;
  });
  if (tableLevel + rowLevel === 0) return { code, mudou: false, rowLevel, tableLevel };
  // CTE de titulares logo após o WITH (não depende de nenhum outro CTE)
  const mWith = out.match(/\bWITH(\s+RECURSIVE)?\s/i);
  if (!mWith) throw new Error('SF sem WITH');
  const ins = mWith.index + mWith[0].length;
  out = `${out.slice(0, ins)}\n${CTE_TITULARES}\n${rowLevel > 0 ? `${CTE_EMPATES}\n` : ''}${out.slice(ins)}`;
  return { code: `${out}\n${MARK}`, mudou: tableLevel + rowLevel > 0, rowLevel, tableLevel };
}
