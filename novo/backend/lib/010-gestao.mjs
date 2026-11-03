// Fragmentos SQL da spec 010 (gestao, coordenacao e diretoria).
//
// Quem chama e sempre `:VAR_USER` (RNT-012). Codigos de filial, departamento
// e secao tem tipos diferentes conforme a tabela (C6): comparados como numero
// (`CAST(x AS UNSIGNED)`), entao 2 = 02 (RNT-007).

import { temPapel } from './guardas.mjs';

export const GESTAO = temPapel('GESTOR', 'ADMIN');
export const DIRETORIA = temPapel('DIRETORIA', 'ADMIN');

/** Nome de exibicao de um INT_USER pelo alias. */
export const nome = (a) => `COALESCE(NULLIF(TRIM(${a}.NOME), ''), ${a}.DESCR)`;

export const agora = `REPLACE('{{agora}}', 'T', ' ')`;

// Texto so de digitos, sem zero a esquerda. Sem CAST no parametro: em modo
// estrito o MySQL transforma o aviso de CAST('NUTRI') em erro numa escrita.
export const numerico = (expr) =>
  `(${expr} <> '' AND SUBSTRING(${expr}, 1, 1) <> '0' AND ${
    [...'0123456789'].reduce((e, d) => `REPLACE(${e}, '${d}', '')`, expr)} = '')`;

// O MySQL recusa (erro 1093) UPDATE/DELETE cuja subconsulta le a propria
// tabela alvo. Nessas SFs, os guardas leem uma derivada DISTINCT, que o
// otimizador materializa em vez de fundir.
export const SEM_BLOQUEIO_DERIVADO = `NOT EXISTS (
    SELECT 1 FROM (SELECT DISTINCT USER_ID, BLOQUEADO FROM USUARIO_BLOQUEIO) BLQ
    WHERE BLQ.USER_ID = :VAR_USER AND BLQ.BLOQUEADO = 1)`;

export const temPapelDerivado = (...papeis) => {
  const lista = papeis.map((p) => `'${p}'`).join(', ');
  return `(EXISTS (SELECT 1 FROM (SELECT DISTINCT USER_ID, PAPEL FROM USUARIO_PAPEL) UPA WHERE UPA.USER_ID = :VAR_USER AND UPA.PAPEL IN (${lista}))
    OR EXISTS (SELECT 1 FROM (SELECT DISTINCT USER_ID, CARGO FROM USUARIO_CARGO) UCA WHERE UCA.USER_ID = :VAR_USER AND UCA.CARGO IN (${lista})))`;
};

/**
 * RNT-004: `alvo` tem escopo ativo numa BU do cadastro ativo de coordenador
 * de quem chama (e RCA vinculado, quando `comRca`).
 */
export const naEquipe = (alvo, { comRca = false } = {}) => `(EXISTS (
    SELECT 1 FROM COORDENADORES CRDE
    JOIN COORDENADORES_BU CBUE ON CBUE.COD_SUPERVISOR = CRDE.COD_SUPERVISOR
    JOIN BU_VENDEDOR BVE ON CAST(BVE.CODFILIAL AS UNSIGNED) = CBUE.CODFILIAL
                        AND CAST(BVE.BU_CODIGO AS UNSIGNED) = CBUE.CODEPTO
    WHERE CRDE.USER_ID = :VAR_USER AND CRDE.ATIVO = 1
      AND BVE.ATIVO = 1 AND BVE.VENDEDOR_ID = ${alvo})${comRca
    ? `\n    AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VRE WHERE VRE.USER_ID = ${alvo})`
    : ''})`;

/**
 * CTEs do realizado (RNT-007 + RNT-008, D-010-5). Quem usa define antes um
 * CTE `VENDEDORES (VENDEDOR_ID)`; `mes` e uma expressao 'AAAA-MM'.
 *
 * Define:
 *  - ESCOPOS (VENDEDOR_ID, FILIAL, DEPTO, SECAO): escopos ativos do filtro;
 *  - MOVIMENTO (TIPO 'V'/'D', LINHA, CLIENTE, FILIAL, DEPTO, SECAO, DATA, VALOR):
 *    venda bruta e devolucao do mes, valor sempre positivo;
 *  - ATRIBUIDO (TIPO, LINHA, VENDEDOR_ID): a linha conta para o vendedor
 *    quando o cliente e da carteira dele (ou de um titular que ele substitui
 *    com ferias ativas na data) e filial + departamento (+ secao, se o escopo
 *    define) casam com um escopo ativo dele.
 * ponytail: CAST nas colunas tira o indice; se o Painel passar de 5 s (RNF-001),
 * filtrar o mes antes num CTE indexado.
 */
export const realizadoCtes = (mes) => `ESCOPOS AS (
  SELECT BV.VENDEDOR_ID, CAST(BV.CODFILIAL AS UNSIGNED) AS FILIAL,
         CAST(BV.BU_CODIGO AS UNSIGNED) AS DEPTO, BV.ID_SECAO AS SECAO
  FROM BU_VENDEDOR BV
  JOIN VENDEDORES V ON V.VENDEDOR_ID = BV.VENDEDOR_ID
  WHERE BV.ATIVO = 1
),
MOVIMENTO AS (
  SELECT 'V' AS TIPO, R.ID AS LINHA, R.CLIENTE_ID AS CLIENTE,
         CAST(R.CODFILIAL AS UNSIGNED) AS FILIAL, CAST(R.CODEPTO AS UNSIGNED) AS DEPTO,
         COALESCE(R.ID_SECAO, R.CODSECAO) AS SECAO,
         SUBSTRING(R.DATA_SAIDA, 1, 10) AS DATA, COALESCE(R.TOTAL, 0) AS VALOR
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  WHERE R.ATIVO = 1 AND R.STATUS_INGESTAO = 'ATIVO' AND R.CLIENTE_ID IS NOT NULL
    AND SUBSTRING(R.DATA_SAIDA, 1, 7) = ${mes}
  UNION ALL
  SELECT 'D', D.AUTO_ID, D.CODCLI,
         CAST(D.CODFILIAL AS UNSIGNED), CAST(D.CODEPTO AS UNSIGNED), D.CODSEC,
         SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10), COALESCE(D.VALOR_DEVOLVIDO, 0)
  FROM IMP_DEVOLUCOES_TOTVS D
  WHERE D.CODCLI IS NOT NULL
    AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 7) = ${mes}
),
ATRIBUIDO AS (
  SELECT DISTINCT M.TIPO, M.LINHA, E.VENDEDOR_ID
  FROM MOVIMENTO M
  JOIN ESCOPOS E ON E.FILIAL = M.FILIAL AND E.DEPTO = M.DEPTO
                AND (E.SECAO IS NULL OR E.SECAO = M.SECAO)
  WHERE EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC
                WHERE EC.ID_CLIENTE = M.CLIENTE AND EC.ID_VENDEDOR = E.VENDEDOR_ID)
     OR EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC
                JOIN VENDEDOR_RCA VT ON VT.USER_ID = EC.ID_VENDEDOR
                JOIN FERIAS_VENDEDOR FE ON FE.COD_RCA = VT.COD_RCA AND FE.ATIVO = 1
                JOIN VENDEDOR_RCA VS ON VS.COD_RCA = FE.COD_RCA_SUBSTITUTO
                WHERE EC.ID_CLIENTE = M.CLIENTE AND VS.USER_ID = E.VENDEDOR_ID
                  AND FE.DT_INICIO <= M.DATA AND FE.DT_FIM >= M.DATA)
)`;
