// Fragmentos SQL de carteira, escopo e atribuicao de venda (spec 002), para
// toda spec que recorta dados pela carteira (003 agenda, 004 atividades, 005
// dashboard, 006/007 vendas, 008 alertas, 009 mix, 010 gestao).
//
// Os parametros de escopo sao EXPRESSOES SQL, nao valores: assim o mesmo texto
// serve a SF SQL e a SF JAVASCRIPT.
//
//   SF SQL:
//     import { ESCOPO_SQL, carteiraVisivel } from './lib/002-carteira.mjs';
//     code: `SELECT COUNT(DISTINCT CV.ID_CLIENTE) AS N FROM (${carteiraVisivel(ESCOPO_SQL)}) CV`
//     // a tela manda modo, coordenador, vendedor, filial, depto, secao, hoje (texto; '' = sem recorte)
//
//   SF JAVASCRIPT (runQueryMitra nao troca {{x}}; :VAR_USER fica):
//     const SQL = carteiraVisivel(ESCOPO_MARCADO);   // texto com '@@modo@@' etc.
//     // no corpo publicado: SQL.replace(/@@(\w+)@@/g, (_, k) => esc(valor[k]))
//     // (preencher() de add-002-carteira.mjs faz isso)
//
// Regras: RNT-003/004 (recorte e permissao), RNT-007 (venda do vendedor),
// RNT-010 (ferias ATIVAS), RN-001/002 da 002 (sem Pessoa Fisica, titular).
// Todo fragmento ja traz o SEM_BLOQUEIO de quem chama onde ele decide acesso.

import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './guardas.mjs';

/* ─────────────── utilitarios ─────────────── */

// Codigo sem zero a esquerda nem espaco (RNT-007: 2 = 02). Use dos DOIS lados.
export const cod = (expr) => `CAST(TRIM(CAST(${expr} AS CHAR)) AS UNSIGNED)`;

// Parametro numerico vindo da tela como texto: vazio vira NULL, nunca erro de sintaxe.
export const num = (param) => `CAST(NULLIF(TRIM('{{${param}}}'), '') AS UNSIGNED)`;

// Pagina 1-based; vazio ou 0 = 1.
export const pagina = (param = 'pagina') => `COALESCE(NULLIF(${num(param)}, 0), 1)`;

// Dia 'AAAA-MM-DD' de coluna DATE ou texto (C2 do modelo de dados).
export const dia = (expr) => `SUBSTRING(CAST(${expr} AS CHAR), 1, 10)`;

// Nome de exibicao do usuario (spec 001).
export const nomeUsuario = (alias) => `COALESCE(NULLIF(TRIM(${alias}.NOME), ''), ${alias}.DESCR)`;

// Nome do cliente na tela: fantasia, senao razao social.
export const nomeCliente = (alias) => `COALESCE(NULLIF(TRIM(${alias}.NOME_FANTASIA), ''), ${alias}.RAZAO_SOCIAL)`;

// Maiusculas sem acento (RNT-014) para LIKE. Troca antes do UPPER porque o
// UPPER do SQLite so conhece ASCII.
const ACENTOS = [
  ['á', 'A'], ['à', 'A'], ['â', 'A'], ['ã', 'A'], ['ä', 'A'], ['Á', 'A'], ['À', 'A'], ['Â', 'A'], ['Ã', 'A'], ['Ä', 'A'],
  ['é', 'E'], ['ê', 'E'], ['è', 'E'], ['É', 'E'], ['Ê', 'E'], ['È', 'E'],
  ['í', 'I'], ['î', 'I'], ['Í', 'I'], ['Î', 'I'],
  ['ó', 'O'], ['ô', 'O'], ['õ', 'O'], ['ö', 'O'], ['Ó', 'O'], ['Ô', 'O'], ['Õ', 'O'], ['Ö', 'O'],
  ['ú', 'U'], ['ü', 'U'], ['Ú', 'U'], ['Ü', 'U'],
  ['ç', 'C'], ['Ç', 'C'],
];
export const semAcento = (expr) =>
  `UPPER(${ACENTOS.reduce((acc, [de, para]) => `REPLACE(${acc}, '${de}', '${para}')`, `COALESCE(${expr}, '')`)})`;

// Ramo do cliente (o ramo nao esta em CLIENTES); vazio = 'Sem ramo'.
export const ramoDe = (cliente) => `COALESCE((SELECT NULLIF(TRIM(MAX(ICT_R.RAMO)), '') FROM IMP_CLIENTES_TOTVS ICT_R WHERE ICT_R.CODCLI = ${cliente}), 'Sem ramo')`;

// RN-001: Pessoa Fisica nunca entra na carteira nem em Disponiveis.
export const naoPessoaFisica = (cliente) => `NOT EXISTS (
    SELECT 1 FROM IMP_CLIENTES_TOTVS ICT_PF
    WHERE ICT_PF.CODCLI = ${cliente} AND UPPER(TRIM(ICT_PF.RAMO)) = 'PESSOA FISICA')`;

// RN-020: departamentos em que o titular e decidido por secao (Enfermagem).
export const DEPTOS_POR_SECAO = [2];

/* ─────────────── ferias e bloqueio ─────────────── */

// RN-002: usuario bloqueado nunca e candidato nem titular.
export const BLOQUEADOS = `(SELECT BLQ_T.USER_ID FROM USUARIO_BLOQUEIO BLQ_T WHERE BLQ_T.BLOQUEADO = 1)`;

// RNT-010: titulares que `substituto` cobre com ferias ATIVAS no dia `data`.
export const titularesCobertos = (substituto, data) => `(SELECT VT_F.USER_ID
    FROM FERIAS_VENDEDOR F_F
    JOIN VENDEDOR_RCA VT_F ON VT_F.COD_RCA = F_F.COD_RCA
    JOIN VENDEDOR_RCA VS_F ON VS_F.COD_RCA = F_F.COD_RCA_SUBSTITUTO
    WHERE VS_F.USER_ID = ${substituto} AND F_F.ATIVO = 1
      AND F_F.DT_INICIO <= ${data} AND F_F.DT_FIM >= ${data})`;

/* ─────────────── escopo de visualizacao (RNT-003/004) ─────────────── */

// Parametros de escopo de uma SF SQL (a tela sempre manda os sete).
export const ESCOPO_SQL = {
  modo: "'{{modo}}'", coordenador: "'{{coordenador}}'", vendedor: "'{{vendedor}}'",
  filial: "'{{filial}}'", depto: "'{{depto}}'", secao: "'{{secao}}'", hoje: "'{{hoje}}'",
};

// Mesmo formato com marcadores @@x@@, trocados pelo valor escapado no corpo
// de uma SF JAVASCRIPT (ver preencher() em add-002-carteira.mjs).
export const ESCOPO_MARCADO = Object.fromEntries(Object.keys(ESCOPO_SQL).map((k) => [k, `'@@${k}@@'`]));

const recorte = (bv, p) => `(${p.filial} = '' OR ${cod(`${bv}.CODFILIAL`)} = ${cod(p.filial)})
    AND (${p.depto} = '' OR ${cod(`${bv}.BU_CODIGO`)} = ${cod(p.depto)})
    AND (${p.secao} = '' OR ${bv}.ID_SECAO = ${cod(p.secao)})`;

// Linha de escopo `bv` numa BU (filial + departamento) de um coordenador ativo
// que satisfaz `condicaoCoordenador`, e vendedor com RCA (RNT-004).
const naEquipe = (bv, condicaoCoordenador) => `EXISTS (
      SELECT 1 FROM COORDENADORES C_EQ
      JOIN COORDENADORES_BU CB_EQ ON CB_EQ.COD_SUPERVISOR = C_EQ.COD_SUPERVISOR
      WHERE C_EQ.ATIVO = 1 AND ${condicaoCoordenador}
        AND ${cod('CB_EQ.CODFILIAL')} = ${cod(`${bv}.CODFILIAL`)}
        AND ${cod('CB_EQ.CODEPTO')} = ${cod(`${bv}.BU_CODIGO`)})
    AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VR_EQ WHERE VR_EQ.USER_ID = ${bv}.VENDEDOR_ID)`;

/**
 * Linhas ativas de BU_VENDEDOR do recorte pedido:
 * (VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, COBERTURA).
 * ME = as proprias + as do titular de ferias ATIVAS (COBERTURA = 1);
 * TEAM = BUs do coordenador ativo; SELLER = um vendedor (equipe do
 * coordenador, ou do coordenador escolhido pela diretoria); ALL / COORD so
 * para DIRETORIA/ADMIN. Modo sem permissao = zero linhas.
 */
export function escopoAlvo(p) {
  const vendedor = `BV_A.VENDEDOR_ID = ${cod(p.vendedor)}`;
  const doCoordenadorEscolhido = `(${p.coordenador} = '' OR C_EQ.COD_SUPERVISOR = ${cod(p.coordenador)})`;
  return `SELECT BV_A.VENDEDOR_ID, TRIM(CAST(BV_A.CODFILIAL AS CHAR)) AS CODFILIAL,
    TRIM(CAST(BV_A.BU_CODIGO AS CHAR)) AS CODEPTO, BV_A.ID_SECAO, 0 AS COBERTURA
  FROM BU_VENDEDOR BV_A
  WHERE BV_A.ATIVO = 1
    AND ${recorte('BV_A', p)}
    AND ${SEM_BLOQUEIO}
    AND (
      (${p.modo} = 'ME' AND BV_A.VENDEDOR_ID = :VAR_USER)
      OR (${p.modo} IN ('TEAM', 'SELLER') AND ${COORDENADOR_ATIVO}
          AND ${naEquipe('BV_A', 'C_EQ.USER_ID = :VAR_USER')}
          AND (${p.modo} = 'TEAM' OR ${vendedor}))
      OR (${p.modo} IN ('ALL', 'COORD', 'SELLER') AND ${temPapel('DIRETORIA', 'ADMIN')}
          AND ${naEquipe('BV_A', doCoordenadorEscolhido)}
          AND (${p.modo} <> 'SELLER' OR ${vendedor}))
    )
  UNION ALL
  SELECT BV_C.VENDEDOR_ID, TRIM(CAST(BV_C.CODFILIAL AS CHAR)), TRIM(CAST(BV_C.BU_CODIGO AS CHAR)), BV_C.ID_SECAO, 1
  FROM BU_VENDEDOR BV_C
  WHERE BV_C.ATIVO = 1 AND ${p.modo} = 'ME'
    AND ${recorte('BV_C', p)}
    AND ${SEM_BLOQUEIO}
    AND BV_C.VENDEDOR_ID IN ${titularesCobertos(':VAR_USER', p.hoje)}`;
}

/* ─────────────── titularidade (RN-002) ─────────────── */

// Existe titular ativo, nao bloqueado, diferente de `dono` para a combinacao.
// `excecao` (opcional): subconsulta de titulares que tambem valem como dono.
export const titularDeOutro = (cliente, filial, depto, secao, dono, excecao = '') => `EXISTS (
      SELECT 1 FROM CLIENTE_TITULAR_DEPTO T_O
      WHERE T_O.ID_CLIENTE = ${cliente}
        AND ${cod('T_O.CODFILIAL')} = ${cod(filial)}
        AND ${cod('T_O.CODEPTO')} = ${cod(depto)}
        AND T_O.ID_SECAO = ${secao}
        AND T_O.ATIVO = 1
        AND T_O.VENDEDOR_ID <> ${dono}
        AND T_O.VENDEDOR_ID NOT IN ${BLOQUEADOS}${excecao ? `\n        AND T_O.VENDEDOR_ID NOT IN ${excecao}` : ''})`;

/**
 * Carteira exibida: vinculo x linha de escopo do dono (D-004 do plan):
 * (ID_CLIENTE, VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, COBERTURA, CURVA).
 * Um cliente pode vir em varias linhas; agrupe por ID_CLIENTE na tela.
 */
export const carteiraVisivel = (p) => `SELECT EC_V.ID_CLIENTE, A_V.VENDEDOR_ID, A_V.CODFILIAL, A_V.CODEPTO, A_V.ID_SECAO,
    A_V.COBERTURA, EC_V.CURVA_CLASSIFICACAO AS CURVA
  FROM EQUIPE_CLIENTE EC_V
  JOIN (${escopoAlvo(p)}) A_V ON A_V.VENDEDOR_ID = EC_V.ID_VENDEDOR
  WHERE ${naoPessoaFisica('EC_V.ID_CLIENTE')}
    AND NOT (A_V.ID_SECAO IS NOT NULL
      AND ${titularDeOutro('EC_V.ID_CLIENTE', 'A_V.CODFILIAL', 'A_V.CODEPTO', 'A_V.ID_SECAO', 'A_V.VENDEDOR_ID')})`;

/* ─────────────── venda (RNT-007/008) ─────────────── */

// Linha de venda/devolucao `s` (colunas CODCLI, CODFILIAL, CODEPTO, CODSEC)
// conta para a linha de carteira `a` (saida de carteiraVisivel): mesma BU,
// secao quando o escopo define, e a combinacao da venda nao e de outro titular.
export const vendaConta = (s, a) => `${s}.CODCLI = ${a}.ID_CLIENTE
      AND ${cod(`${s}.CODFILIAL`)} = ${cod(`${a}.CODFILIAL`)}
      AND ${cod(`${s}.CODEPTO`)} = ${cod(`${a}.CODEPTO`)}
      AND (${a}.ID_SECAO IS NULL OR ${cod(`${s}.CODSEC`)} = ${a}.ID_SECAO)
      AND NOT ${titularDeOutro(`${s}.CODCLI`, `${s}.CODFILIAL`, `${s}.CODEPTO`, cod(`${s}.CODSEC`), `${a}.VENDEDOR_ID`)}`;

/**
 * RNT-007 completa para telas de venda: a linha `s` conta para `vendedor`
 * (expressao) na data `data` (expressao 'AAAA-MM-DD', em geral dia(s.DTSAIDA)):
 * (a) cliente na carteira dele ou de titular que ele cobre com ferias ATIVAS
 * nessa data; (b) filial + departamento (+ secao quando definida) de um escopo
 * ativo dele; e (RN-002) a combinacao nao tem outro titular.
 */
export const vendaDoVendedor = (s, vendedor, data) => `EXISTS (
      SELECT 1 FROM BU_VENDEDOR BV_D
      WHERE BV_D.VENDEDOR_ID = ${vendedor} AND BV_D.ATIVO = 1
        AND ${cod('BV_D.CODFILIAL')} = ${cod(`${s}.CODFILIAL`)}
        AND ${cod('BV_D.BU_CODIGO')} = ${cod(`${s}.CODEPTO`)}
        AND (BV_D.ID_SECAO IS NULL OR BV_D.ID_SECAO = ${cod(`${s}.CODSEC`)}))
    AND EXISTS (
      SELECT 1 FROM EQUIPE_CLIENTE EC_D
      WHERE EC_D.ID_CLIENTE = ${s}.CODCLI
        AND (EC_D.ID_VENDEDOR = ${vendedor} OR EC_D.ID_VENDEDOR IN ${titularesCobertos(vendedor, data)}))
    AND NOT ${titularDeOutro(`${s}.CODCLI`, `${s}.CODFILIAL`, `${s}.CODEPTO`, cod(`${s}.CODSEC`), vendedor, titularesCobertos(vendedor, data))}`;

/* ─────────────── candidatos a titular (RN-002/003) ─────────────── */

// O vendedor que satisfaz `condicaoVendedor` (sobre BV_K) e candidato na
// combinacao: tem o cliente na carteira e escopo ativo com aquela secao.
export const ehCandidato = (cliente, filial, depto, secao, condicaoVendedor) => `EXISTS (
      SELECT 1 FROM EQUIPE_CLIENTE EC_K
      JOIN BU_VENDEDOR BV_K ON BV_K.VENDEDOR_ID = EC_K.ID_VENDEDOR AND BV_K.ATIVO = 1
      WHERE EC_K.ID_CLIENTE = ${cliente}
        AND ${cod('BV_K.CODFILIAL')} = ${cod(filial)}
        AND ${cod('BV_K.BU_CODIGO')} = ${cod(depto)}
        AND BV_K.ID_SECAO = ${secao}
        AND BV_K.VENDEDOR_ID NOT IN ${BLOQUEADOS}
        AND ${condicaoVendedor})`;

// Todas as combinacoes candidatas (de um cliente, ou de todos com `cliente` NULL):
// (ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO, VENDEDOR_ID).
export const candidatos = (cliente) => `SELECT DISTINCT EC_K.ID_CLIENTE,
    TRIM(CAST(BV_K.CODFILIAL AS CHAR)) AS CODFILIAL,
    TRIM(CAST(BV_K.BU_CODIGO AS CHAR)) AS CODEPTO,
    BV_K.ID_SECAO, BV_K.VENDEDOR_ID
  FROM EQUIPE_CLIENTE EC_K
  JOIN BU_VENDEDOR BV_K ON BV_K.VENDEDOR_ID = EC_K.ID_VENDEDOR AND BV_K.ATIVO = 1
  WHERE BV_K.ID_SECAO IS NOT NULL
    AND TRIM(COALESCE(CAST(BV_K.CODFILIAL AS CHAR), '')) <> ''
    AND BV_K.VENDEDOR_ID NOT IN ${BLOQUEADOS}
    AND (${cliente} IS NULL OR EC_K.ID_CLIENTE = ${cliente})`;

/* ─────────────── responsavel no escopo (RN-019) ─────────────── */

// Ha vinculo do cliente na filial e secao (secao NULL = qualquer secao do
// departamento, ou o vinculo sem secao) de um vendedor com esse escopo ativo.
// `condicaoVendedor` (sobre EC_R) restringe a quem; '' = qualquer um.
export const responsavelNoEscopo = (cliente, filial, depto, secao, condicaoVendedor = '') => `EXISTS (
      SELECT 1 FROM EQUIPE_CLIENTE EC_R
      JOIN BU_VENDEDOR BV_R ON BV_R.VENDEDOR_ID = EC_R.ID_VENDEDOR AND BV_R.ATIVO = 1
      WHERE EC_R.ID_CLIENTE = ${cliente}
        AND ${cod('EC_R.CODFILIAL')} = ${cod(filial)}
        AND ${cod('BV_R.CODFILIAL')} = ${cod(filial)}
        AND ${cod('BV_R.BU_CODIGO')} = ${cod(depto)}
        AND ((${secao} IS NOT NULL AND EC_R.ID_SECAO = ${secao})
          OR (${secao} IS NULL AND (EC_R.ID_SECAO IS NULL OR EC_R.ID_SECAO IN (
                SELECT S_R.ID FROM SECAO S_R JOIN BU B_R ON B_R.ID = S_R.ID_BU
                WHERE ${cod('B_R.CODIGO')} = ${cod(depto)}))))${condicaoVendedor ? `\n        AND ${condicaoVendedor}` : ''})`;

// Gestao de titulares (RN-020): DIRETORIA/ADMIN em tudo; coordenador ativo nas suas BUs.
export const podeGerir = (filial, depto) => `(${temPapel('DIRETORIA', 'ADMIN')} OR EXISTS (
      SELECT 1 FROM COORDENADORES C_G
      JOIN COORDENADORES_BU CB_G ON CB_G.COD_SUPERVISOR = C_G.COD_SUPERVISOR
      WHERE C_G.USER_ID = :VAR_USER AND C_G.ATIVO = 1
        AND ${cod('CB_G.CODFILIAL')} = ${cod(filial)}
        AND ${cod('CB_G.CODEPTO')} = ${cod(depto)}))`;
