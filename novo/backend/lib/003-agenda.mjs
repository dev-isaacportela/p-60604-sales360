// Fragmentos SQL da Agenda (spec 003): relogio do servidor, compromissos de
// uma pessoa, conflito de horario, quem opera e de quem e o cliente.
//
// Toda regra de data e hora usa o relogio do BANCO em Brasilia (D-302 do
// plan): o `hoje` que a tela manda so escolhe o periodo exibido.

import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './guardas.mjs';
import { escopoAlvo, carteiraVisivel, titularesCobertos, BLOQUEADOS } from './002-carteira.mjs';

/* ─────────────── relogio (Brasilia, sem horario de verao desde 2019) ─────────────── */

const BR = 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)';
export const AGORA_BR = `DATE_FORMAT(${BR}, '%Y-%m-%d %H:%i:%s')`;
export const HOJE_BR = `DATE_FORMAT(${BR}, '%Y-%m-%d')`;
export const CARIMBO_BR = `DATE_FORMAT(${BR}, '%d/%m/%Y %H:%i')`;
// RN-003: hoje - 5 dias (3 h + 120 h).
export const LIMITE_RETRO = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 123 HOUR), '%Y-%m-%d')`;
// Gravado ha menos de 1 minuto: acha a linha que a instrucao anterior criou.
export const RECENTE_BR = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10860 SECOND), '%Y-%m-%d %H:%i:%s')`;

/* ─────────────── tipos (RN-001) ─────────────── */

export const TIPOS = {
  VISITA: ['Aumento de mix', 'Gerar demanda', 'Padronização de produto', 'Positivação', 'Financeiro', 'Renegociação', 'Manutenção'],
  PROSPECCAO: ['Prospecção', 'Apresentação comercial', 'Diagnóstico inicial', 'Follow-up de prospecção'],
  INTERNA: ['Reunião interna', 'Outros', 'Deslocamento'],
};
export const lista = (valores) => valores.map((v) => `'${v}'`).join(', ');

// D-305: a prospeccao guarda o tipo no inicio do OBJETIVO ("<tipo> — <objetivo>").
const SEP = ' — ';
export const tipoProspeccao = (col) => `CASE ${TIPOS.PROSPECCAO.map((t) => `WHEN ${col} = '${t}' OR ${col} LIKE '${t}${SEP}%' THEN '${t}'`).join(' ')} ELSE 'Prospecção' END`;
export const objetivoProspeccao = (col) => `CASE ${TIPOS.PROSPECCAO.map((t) => `WHEN ${col} = '${t}' THEN '' WHEN ${col} LIKE '${t}${SEP}%' THEN SUBSTRING(${col}, ${[...t].length + SEP.length + 1})`).join(' ')} ELSE COALESCE(${col}, '') END`;
export const objetivoGravado = (tipo, objetivo) => `CASE WHEN TRIM(${objetivo}) = '' THEN ${tipo} ELSE CONCAT(${tipo}, '${SEP}', ${objetivo}) END`;

/* ─────────────── texto (RN-007/008) ─────────────── */

export const textoOk = (expr) => `CHAR_LENGTH(${expr}) <= 20000`;
export const preenchido = (expr) => `TRIM(${expr}) <> ''`;

// Texto anterior + linha em branco + "<cabecalho>dd/mm/aaaa hh:mm:" + texto.
// Quebra de linha literal: vale no MySQL e no SQLite (o '\n' do MySQL nao).
const NL = '\n';
export const acrescentar = (coluna, texto, cabecalho = '') => `CONCAT(COALESCE(${coluna}, ''),
    CASE WHEN TRIM(COALESCE(${coluna}, '')) = '' THEN '' ELSE '${NL}${NL}' END,
    ${cabecalho ? `'${cabecalho}', ${CARIMBO_BR}, ':${NL}', ` : ''}${texto})`;

/* ─────────────── data e horario (RN-002/003) ─────────────── */

export const horarioOk = (ini, fim) => `CHAR_LENGTH(${ini}) = 5 AND CHAR_LENGTH(${fim}) = 5
    AND ${ini} >= '00:00' AND ${fim} <= '23:59' AND ${ini} < ${fim}`;
export const dataOk = (data) => `CHAR_LENGTH(${data}) = 10 AND ${data} >= ${LIMITE_RETRO}`;

/* ─────────────── pessoas ─────────────── */

// Lista [{"id":2},...] vinda da tela (JSON_TABLE; o simulador traduz).
export const pessoasJson = (param) => `(SELECT J_${param}.ID FROM JSON_TABLE('{{${param}}}', '$[*]' COLUMNS (ID INT PATH '$.id')) J_${param})`;

// Para quem a visita e criada (RN-013): a lista, ou so o usuario com lista vazia.
export const alvos = (param) => `(SELECT A_L.ID FROM ${pessoasJson(param)} A_L
    UNION SELECT U_L.ID FROM INT_USER U_L WHERE U_L.ID = :VAR_USER AND '{{${param}}}' = '[]')`;

// Pode receber visita ou convite: o proprio usuario ou alguem com escopo ativo (RN-013).
export const pessoaValida = (id) => `(${id} = :VAR_USER OR EXISTS (
      SELECT 1 FROM BU_VENDEDOR BV_PV WHERE BV_PV.VENDEDOR_ID = ${id} AND BV_PV.ATIVO = 1))
    AND ${id} NOT IN ${BLOQUEADOS}`;

// RN-012: visita e prospeccao sao operadas pelo dono e pelo substituto de ferias ATIVAS.
export const podeOperar = (dono) => `(${dono} = :VAR_USER OR ${dono} IN ${titularesCobertos(':VAR_USER', HOJE_BR)})`;

/**
 * Pessoas do escopo aberto (RNT-003), com ferias pelo relogio do servidor:
 * as linhas de escopoAlvo mais o proprio usuario em Meu painel e, para
 * coordenador ativo, em Time inteiro (a meta do time inclui o coordenador).
 * Sem cobertura: so as pessoas da meta (o titular coberto nao entra na meta
 * do substituto; spec 005 RN-005 "Meu painel: a meta da pessoa").
 */
export const pessoasEscopo = (p, { comCobertura = true } = {}) => `SELECT DISTINCT E_P.VENDEDOR_ID AS PESSOA_ID
  FROM (${escopoAlvo({ ...p, hoje: HOJE_BR })}) E_P${comCobertura ? '' : ' WHERE E_P.COBERTURA = 0'}
  UNION
  SELECT U_P.ID FROM INT_USER U_P
  WHERE U_P.ID = :VAR_USER AND ${SEM_BLOQUEIO}
    AND (${p.modo} = 'ME' OR (${p.modo} = 'TEAM' AND ${COORDENADOR_ATIVO}))`;

/* ─────────────── compromissos e conflito (RN-004) ─────────────── */

/**
 * Compromissos de cada pessoa entre `de` e `ate` (expressoes 'AAAA-MM-DD'):
 * (ORIGEM, ID, PESSOA_ID, DATA, HORA_INICIO, HORA_FIM, TIPO, STATUS).
 * Visita -> dono; prospeccao -> executivo; interno -> criador e cada
 * participante. Tabela derivada: o MySQL a materializa e o UPDATE da propria
 * tabela nao cai no erro 1093.
 */
export const compromissos = (de, ate) => `SELECT 'VISITA' AS ORIGEM, V_K.ID, V_K.VENDEDOR_ID AS PESSOA_ID, V_K.DATA_AGENDADA AS DATA,
    V_K.HORA_INICIO, V_K.HORA_FIM, COALESCE(V_K.TIPO, '') AS TIPO, COALESCE(V_K.STATUS, 'AGENDADA') AS STATUS
  FROM VISITAS V_K WHERE V_K.DATA_AGENDADA >= ${de} AND V_K.DATA_AGENDADA <= ${ate}
  UNION ALL
  SELECT 'PROSPECCAO', P_K.ID, P_K.EXECUTIVO_ID, P_K.DATA_VISITA, P_K.HORA_INICIO, P_K.HORA_FIM, 'Prospecção', COALESCE(P_K.STATUS, 'AGENDADA')
  FROM PROSPECT_VISITAS P_K WHERE P_K.DATA_VISITA >= ${de} AND P_K.DATA_VISITA <= ${ate}
  UNION ALL
  SELECT 'INTERNA', A_K.ID, A_K.CRIADOR_ID, A_K.DATA_AGENDADA, A_K.HORA_INICIO, A_K.HORA_FIM, COALESCE(A_K.TIPO, ''), COALESCE(A_K.STATUS, 'AGENDADA')
  FROM AGENDA_INTERNA A_K WHERE A_K.DATA_AGENDADA >= ${de} AND A_K.DATA_AGENDADA <= ${ate}
  UNION ALL
  SELECT 'INTERNA', AP_K.ID, PP_K.VENDEDOR_ID, AP_K.DATA_AGENDADA, AP_K.HORA_INICIO, AP_K.HORA_FIM, COALESCE(AP_K.TIPO, ''), COALESCE(AP_K.STATUS, 'AGENDADA')
  FROM AGENDA_INTERNA_PARTICIPANTES PP_K JOIN AGENDA_INTERNA AP_K ON AP_K.ID = PP_K.AGENDA_ID
  WHERE AP_K.DATA_AGENDADA >= ${de} AND AP_K.DATA_AGENDADA <= ${ate}`;

// Sobreposicao: inicio novo < fim existente e fim novo > inicio existente;
// cancelado e o proprio item (origem + id) nao contam.
export const sobrepoe = (k, ini, fim, origem, id) => `${k}.STATUS <> 'CANCELADA'
      AND ${k}.HORA_INICIO < ${fim} AND ${k}.HORA_FIM > ${ini}
      AND NOT (${k}.ORIGEM = ${origem} AND ${k}.ID = COALESCE(${id}, 0))`;

export const conflito = (pessoa, data, ini, fim, origem = "''", id = '0') => `EXISTS (
      SELECT 1 FROM (${compromissos(data, data)}) K_C
      WHERE K_C.PESSOA_ID = ${pessoa} AND ${sobrepoe('K_C', ini, fim, origem, id)})`;

/* ─────────────── de quem e o cliente / prospect ─────────────── */

const ESCOPO_FIXO = { modo: "'ME'", coordenador: "''", vendedor: "''", filial: "''", depto: "''", secao: "''", hoje: HOJE_BR };

// RF-004 / RN-013: carteira do usuario, do titular coberto e (coordenador) da equipe.
export const CLIENTES_DE_QUEM_CRIA = `(SELECT CV_M.ID_CLIENTE FROM (${carteiraVisivel(ESCOPO_FIXO)}) CV_M
    UNION SELECT CV_T.ID_CLIENTE FROM (${carteiraVisivel({ ...ESCOPO_FIXO, modo: "'TEAM'" })}) CV_T)`;

// RF-005: prospects ativos do usuario, do titular coberto, da equipe; diretoria ve todos.
export const PROSPECTS_DE_QUEM_CRIA = `(SELECT P_Q.ID FROM PROSPECTS P_Q
    WHERE COALESCE(P_Q.STATUS_PIPELINE, 'NOVO') NOT IN ('CONVERTIDO', 'PERDIDO')
      AND (P_Q.RESPONSAVEL_ID = :VAR_USER
        OR P_Q.RESPONSAVEL_ID IN ${titularesCobertos(':VAR_USER', HOJE_BR)}
        OR P_Q.RESPONSAVEL_ID IN (SELECT E_Q.VENDEDOR_ID FROM (${escopoAlvo({ ...ESCOPO_FIXO, modo: "'TEAM'" })}) E_Q)
        OR ${temPapel('DIRETORIA', 'ADMIN')}))`;

/* ─────────────── meta semanal ─────────────── */

// ponytail: meta fixa (16 vendedor, 8 coordenador ativo) ate a spec 005 criar a meta configuravel.
export const metaDe = (pessoa) => `CASE WHEN EXISTS (SELECT 1 FROM COORDENADORES C_M WHERE C_M.USER_ID = ${pessoa} AND C_M.ATIVO = 1) THEN 8 ELSE 16 END`;
