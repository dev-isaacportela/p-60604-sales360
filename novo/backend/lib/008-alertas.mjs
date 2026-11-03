// Fragmentos SQL da spec 008 (alertas, prospects, direcionamento).
//
// Mesmo formato da 002: parametros de escopo sao EXPRESSOES SQL (ESCOPO_SQL
// numa SF SQL, ESCOPO_MARCADO numa SF JAVASCRIPT). Visibilidade sempre como
// predicado EXISTS correlacionado: serve SELECT e UPDATE da propria tabela sem
// cair no erro 1093 do MySQL e sem duplicar linha quando o vendedor tem duas
// linhas de escopo na mesma BU.

import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './guardas.mjs';
import { cod, naoPessoaFisica, titularDeOutro, titularesCobertos, carteiraVisivel, escopoAlvo, BLOQUEADOS } from './002-carteira.mjs';
import { HOJE_BR } from './003-agenda.mjs';

export const TIPOS_ALERTA = {
  PRODUTO_PERDIDO: 'Produto Perdido',
  SAZONALIDADE: 'Sazonalidade',
  REPOSICAO: 'Reposição',
  VOLUME_CRESCENTE: 'Volume Crescente',
  NAO_EXPLORADO: 'Não Explorado',
  PEDIDO_INCOMPLETO: 'Pedido Incompleto',
};

// RN-009: o alerta `al` (alias de ALERTAS_INTELIGENTES) esta numa linha da
// carteira exibida do mesmo vendedor e cliente, na BU do alerta.
export const alertaVisivel = (al, p) => `EXISTS (
    SELECT 1 FROM (${carteiraVisivel(p)}) CV_AV
    WHERE CV_AV.ID_CLIENTE = ${al}.ID_CLIENTE AND CV_AV.VENDEDOR_ID = ${al}.ID_VENDEDOR
      AND ${cod('CV_AV.CODFILIAL')} = ${cod(`${al}.CODFILIAL`)}
      AND ${cod('CV_AV.CODEPTO')} = ${cod(`${al}.CODEPTO`)}
      AND (CV_AV.ID_SECAO IS NULL OR ${cod(`${al}.ID_SECAO`)} = CV_AV.ID_SECAO))`;

// RN-011: so o dono ou o substituto com ferias ATIVAS em `hoje` marca.
export const podeMarcar = (al, hoje = HOJE_BR) =>
  `(${al}.ID_VENDEDOR = :VAR_USER OR ${al}.ID_VENDEDOR IN ${titularesCobertos(':VAR_USER', hoje)})`;

// Meu painel com o relogio do servidor (escritas e contador nao confiam na tela).
export const ESCOPO_ME = { modo: "'ME'", coordenador: "''", vendedor: "''", filial: "''", depto: "''", secao: "''", hoje: HOJE_BR };

// RN-013: nao lidos que o usuario pode marcar (contador do menu).
export const ALERTAS_MARCAVEIS = `(SELECT COUNT(*) FROM ALERTAS_INTELIGENTES AL_M
    WHERE AL_M.LIDO = 0 AND ${podeMarcar('AL_M')} AND ${alertaVisivel('AL_M', ESCOPO_ME)})`;

/**
 * Carteira de um vendedor dado (a rotina roda sem usuario de tela), no mesmo
 * formato de carteiraVisivel: (ID_CLIENTE, VENDEDOR_ID, CODFILIAL, CODEPTO,
 * ID_SECAO). RN-001 da 008 + RN-001/002 da 002 (sem Pessoa Fisica, titular).
 */
export const carteiraDoVendedor = (v) => `SELECT EC_D.ID_CLIENTE, BV_D.VENDEDOR_ID,
    TRIM(CAST(BV_D.CODFILIAL AS CHAR)) AS CODFILIAL, TRIM(CAST(BV_D.BU_CODIGO AS CHAR)) AS CODEPTO, BV_D.ID_SECAO
  FROM EQUIPE_CLIENTE EC_D
  JOIN BU_VENDEDOR BV_D ON BV_D.VENDEDOR_ID = EC_D.ID_VENDEDOR AND BV_D.ATIVO = 1
  WHERE BV_D.VENDEDOR_ID = ${v}
    AND BV_D.VENDEDOR_ID NOT IN ${BLOQUEADOS}
    AND ${naoPessoaFisica('EC_D.ID_CLIENTE')}
    AND NOT (BV_D.ID_SECAO IS NOT NULL
      AND ${titularDeOutro('EC_D.ID_CLIENTE', 'BV_D.CODFILIAL', 'BV_D.BU_CODIGO', 'BV_D.ID_SECAO', 'BV_D.VENDEDOR_ID')})`;

// RN-025: Direcionamento so para coordenador ativo, diretoria ou admin.
export const podeDirecionar = `(${COORDENADOR_ATIVO} OR ${temPapel('DIRETORIA', 'ADMIN')}) AND ${SEM_BLOQUEIO}`;

// RN-021: prospects que o usuario ve (dono, titular coberto, equipe, diretoria).
export const prospectVisivel = (pr) => `(${pr}.RESPONSAVEL_ID = :VAR_USER
    OR ${pr}.RESPONSAVEL_ID IN ${titularesCobertos(':VAR_USER', HOJE_BR)}
    OR ${pr}.RESPONSAVEL_ID IN (SELECT E_PV.VENDEDOR_ID FROM (${escopoAlvo({ ...ESCOPO_ME, modo: "'TEAM'" })}) E_PV)
    OR ${temPapel('DIRETORIA', 'ADMIN')})`;

// P-1 do plan: so o responsavel e o substituto com ferias ATIVAS agem.
export const prospectEditavel = (pr) => `(${pr}.RESPONSAVEL_ID = :VAR_USER
    OR ${pr}.RESPONSAVEL_ID IN ${titularesCobertos(':VAR_USER', HOJE_BR)})`;

// D-804: a 003 grava "Reagendamento em dd/mm/aaaa hh:mm:" quando a data muda.
export const REAGENDAMENTO = 'Reagendamento em ';
export const reagendada = (col) => `COALESCE(${col}, '') LIKE '%${REAGENDAMENTO}%'`;
export const temRelato = (col) => `(TRIM(COALESCE(${col}, '')) <> '' AND COALESCE(${col}, '') NOT LIKE '${REAGENDAMENTO}%')`;
