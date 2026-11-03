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
