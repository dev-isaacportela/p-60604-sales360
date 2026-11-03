// Spec 003 — Agenda e visitas (etapa 1: sem Google Agenda).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-003-agenda.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nem coluna nova (D-305): so SFs `s360*` SQL (upsert por nome).
// Cada criacao e uma instrucao so, com todas as regras no WHERE: tudo ou nada
// (RN-004, RN-013). Data e hora vem do relogio do banco (lib/003-agenda.mjs).
//
// `definitions` e exportado para o simulador executar o mesmo codigo publicado.
// Nomes aqui sao o contrato com novo/frontend/src/lib/server-functions.ts.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel } from './lib/guardas.mjs';
import { num, dia, nomeUsuario, nomeCliente, semAcento, ESCOPO_SQL } from './lib/002-carteira.mjs';
import {
  AGORA_BR, HOJE_BR, RECENTE_BR, TIPOS, lista, tipoProspeccao, objetivoProspeccao, objetivoGravado,
  textoOk, preenchido, acrescentar, horarioOk, dataOk, pessoasJson, alvos, pessoaValida, podeOperar,
  pessoasEscopo, compromissos, sobrepoe, conflito, CLIENTES_DE_QUEM_CRIA, PROSPECTS_DE_QUEM_CRIA, metaDe,
} from './lib/003-agenda.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/* ─────────────── parametros comuns ─────────────── */

const DATA = "'{{data}}'";
const INI = "'{{inicio}}'";
const FIM = "'{{fim}}'";
const TIPO = "'{{tipo}}'";
const ID = num('id');
const ORIGEM = (o) => `'{{origem}}' = '${o}'`;
const DESLOC = (alias) => `COALESCE(${alias}.TIPO, '') = 'Deslocamento'`;
// Titulo do interno: o digitado, ou "origem → destino" (cabe em VARCHAR(200)).
const TITULO_INTERNO = `CASE WHEN ${TIPO} = 'Deslocamento' THEN SUBSTRING(CONCAT(TRIM('{{origemDesloc}}'), ' → ', TRIM('{{destinoDesloc}}')), 1, 200) ELSE TRIM('{{titulo}}') END`;
const CAMPOS_INTERNO = `${TIPO} IN (${lista(TIPOS.INTERNA)})
  AND (${TIPO} = 'Deslocamento' OR CHAR_LENGTH(TRIM('{{titulo}}')) BETWEEN 1 AND 200)
  AND (${TIPO} <> 'Deslocamento' OR (CHAR_LENGTH(TRIM('{{origemDesloc}}')) BETWEEN 1 AND 200 AND CHAR_LENGTH(TRIM('{{destinoDesloc}}')) BETWEEN 1 AND 200))
  AND ${textoOk("'{{descricao}}'")}`;

// Compromisso de qualquer pessoa da lista sobreposto ao horario pedido.
const algumConflito = (pessoas, origem = "''", id = '0') => `EXISTS (
    SELECT 1 FROM (${compromissos(DATA, DATA)}) K_A
    WHERE K_A.PESSOA_ID IN ${pessoas} AND ${sobrepoe('K_A', INI, FIM, origem, id)})`;
const algumInvalido = (pessoas) => `EXISTS (SELECT 1 FROM ${pessoas} P_I WHERE NOT (${pessoaValida('P_I.ID')}))`;

/* ─────────────── listagem ─────────────── */

const LISTAR = `WITH PES AS (${pessoasEscopo(ESCOPO_SQL)}),
ITENS AS (
  SELECT 'VISITA' AS ORIGEM, V.ID, COALESCE(V.TIPO, '') AS TIPO, COALESCE(V.STATUS, 'AGENDADA') AS STATUS,
    V.DATA_AGENDADA AS DATA, V.HORA_INICIO, V.HORA_FIM, ${nomeCliente('C')} AS TITULO, V.CLIENTE_ID, NULL AS PROSPECT_ID,
    V.VENDEDOR_ID AS DONO_ID, V.PLANEJAMENTO, V.RELATO, V.CHECKIN_HORA, V.CHECKOUT_HORA,
    NULL AS ORIGEM_DESLOC, NULL AS DESTINO_DESLOC,
    CASE WHEN ${podeOperar('V.VENDEDOR_ID')} THEN 1 ELSE 0 END AS PODE_OPERAR
  FROM VISITAS V
  LEFT JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE V.DATA_AGENDADA >= '{{de}}' AND V.DATA_AGENDADA <= '{{ate}}'
    AND V.VENDEDOR_ID IN (SELECT PESSOA_ID FROM PES)
  UNION ALL
  SELECT 'PROSPECCAO', PV.ID, ${tipoProspeccao('PV.OBJETIVO')}, COALESCE(PV.STATUS, 'AGENDADA'),
    PV.DATA_VISITA, PV.HORA_INICIO, PV.HORA_FIM, COALESCE(NULLIF(TRIM(P.NOME_FANTASIA), ''), P.RAZAO_SOCIAL), NULL, PV.PROSPECT_ID,
    PV.EXECUTIVO_ID, ${objetivoProspeccao('PV.OBJETIVO')}, PV.RESUMO,
    CASE WHEN PV.STATUS = 'EM_ANDAMENTO' THEN PV.ATUALIZADO_EM END, CASE WHEN PV.STATUS = 'CONCLUIDA' THEN PV.ATUALIZADO_EM END,
    NULL, NULL,
    CASE WHEN ${podeOperar('PV.EXECUTIVO_ID')} THEN 1 ELSE 0 END
  FROM PROSPECT_VISITAS PV
  LEFT JOIN PROSPECTS P ON P.ID = PV.PROSPECT_ID
  WHERE PV.DATA_VISITA >= '{{de}}' AND PV.DATA_VISITA <= '{{ate}}'
    AND PV.EXECUTIVO_ID IN (SELECT PESSOA_ID FROM PES)
  UNION ALL
  SELECT 'INTERNA', A.ID, COALESCE(A.TIPO, 'Reunião interna'), COALESCE(A.STATUS, 'AGENDADA'),
    A.DATA_AGENDADA, A.HORA_INICIO, A.HORA_FIM, A.TITULO, NULL, NULL,
    A.CRIADOR_ID, A.DESCRICAO, NULL, NULL, NULL,
    A.ORIGEM_DESLOCAMENTO, A.DESTINO_DESLOCAMENTO,
    CASE WHEN A.CRIADOR_ID = :VAR_USER THEN 1 ELSE 0 END
  FROM AGENDA_INTERNA A
  WHERE A.DATA_AGENDADA >= '{{de}}' AND A.DATA_AGENDADA <= '{{ate}}'
    AND (A.CRIADOR_ID IN (SELECT PESSOA_ID FROM PES)
      OR EXISTS (SELECT 1 FROM AGENDA_INTERNA_PARTICIPANTES AP WHERE AP.AGENDA_ID = A.ID AND AP.VENDEDOR_ID IN (SELECT PESSOA_ID FROM PES)))
)
SELECT I.ORIGEM, I.ID, I.TIPO, I.STATUS, I.DATA, I.HORA_INICIO, I.HORA_FIM, I.TITULO, I.CLIENTE_ID, I.PROSPECT_ID,
  I.DONO_ID, ${nomeUsuario('U')} AS DONO, CASE WHEN I.DONO_ID = :VAR_USER THEN 1 ELSE 0 END AS EH_DONO,
  I.PLANEJAMENTO, I.RELATO, I.CHECKIN_HORA, I.CHECKOUT_HORA, I.ORIGEM_DESLOC, I.DESTINO_DESLOC, I.PODE_OPERAR,
  (SELECT GROUP_CONCAT(CONCAT(PT.VENDEDOR_ID, ':', REPLACE(${nomeUsuario('UP')}, '|', ' ')) SEPARATOR '|')
     FROM AGENDA_INTERNA_PARTICIPANTES PT JOIN INT_USER UP ON UP.ID = PT.VENDEDOR_ID
     WHERE I.ORIGEM = 'INTERNA' AND PT.AGENDA_ID = I.ID) AS PARTICIPANTES
FROM ITENS I
LEFT JOIN INT_USER U ON U.ID = I.DONO_ID
WHERE ${SEM_BLOQUEIO}
ORDER BY I.DATA, I.HORA_INICIO, I.ORIGEM, I.ID`;

/* ─────────────── resumo da semana (RF-014) ─────────────── */

const RESUMO = `WITH PES AS (${pessoasEscopo(ESCOPO_SQL, { comCobertura: false })}),
K AS (
  SELECT K0.* FROM (${compromissos("'{{segunda}}'", "'{{domingo}}'")}) K0
  WHERE K0.PESSOA_ID IN (SELECT PESSOA_ID FROM PES)
)
SELECT
  (SELECT COUNT(*) FROM K WHERE K.STATUS = 'CONCLUIDA' AND K.DATA <= '{{sexta}}'
     AND (K.ORIGEM IN ('VISITA', 'PROSPECCAO') OR K.TIPO = 'Deslocamento')) AS REALIZADO,
  (SELECT COALESCE(SUM(${metaDe('PES.PESSOA_ID')}), 0) FROM PES) AS META,
  (SELECT COUNT(*) FROM PES) AS PESSOAS,
  (SELECT COUNT(*) FROM PES WHERE ${metaDe('PES.PESSOA_ID')} = 8) AS COORDENADORES,
  (SELECT COUNT(DISTINCT CONCAT(K.ORIGEM, '-', K.ID)) FROM K WHERE K.STATUS = 'AGENDADA') AS AGENDADAS,
  (SELECT COUNT(DISTINCT CONCAT(K.ORIGEM, '-', K.ID)) FROM K WHERE K.STATUS = 'EM_ANDAMENTO') AS EM_ANDAMENTO,
  (SELECT COUNT(DISTINCT CONCAT(K.ORIGEM, '-', K.ID)) FROM K WHERE K.STATUS = 'CONCLUIDA') AS CONCLUIDAS,
  (SELECT COUNT(DISTINCT CONCAT(K.ORIGEM, '-', K.ID)) FROM K WHERE K.STATUS = 'CANCELADA') AS CANCELADAS
FROM INT_USER U
WHERE U.ID = :VAR_USER AND ${SEM_BLOQUEIO}`;

/* ─────────────── historico do cliente (RF-015) ─────────────── */

const CLIENTE_VISIVEL = `(${num('clienteId')} IN ${CLIENTES_DE_QUEM_CRIA} OR ${temPapel('DIRETORIA', 'ADMIN')})`;

/* ─────────────── definicoes ─────────────── */

const ESCOPO_DESCR = 'Escopo: modo ME|TEAM|SELLER|ALL|COORD, coordenador, vendedor, filial, depto, secao (texto, vazio = sem recorte), hoje AAAA-MM-DD (ferias pelo relogio do servidor).';

export const definitions = [
  /* ── leitura ── */
  {
    name: 's360AgendaListar',
    type: 'SQL',
    description: `Itens da agenda no periodo (RF-001/002/012/013): visitas, prospeccoes e compromissos internos das pessoas do escopo, com PODE_OPERAR (RN-012) e participantes. ${ESCOPO_DESCR} Mais de, ate (AAAA-MM-DD).`,
    code: LISTAR,
  },
  {
    name: 's360AgendaResumo',
    type: 'SQL',
    description: `Painel lateral (RF-014): REALIZADO da meta semanal (seg-sex, um por pessoa; visita, prospeccao e deslocamento), META (16 vendedor, 8 coordenador), contagem por status de seg a dom. ${ESCOPO_DESCR} Mais segunda, sexta, domingo.`,
    code: RESUMO,
  },
  {
    name: 's360AgendaClientes',
    type: 'SQL',
    description: 'Clientes para a visita (RF-004, RNT-014): carteira do usuario, do titular coberto por ferias ativas e, para coordenador, da equipe; a partir de 2 letras; ate 50. Params: busca.',
    code: `SELECT C.ID, ${nomeCliente('C')} AS NOME, C.RAZAO_SOCIAL, C.CNPJ, C.CIDADE
FROM CLIENTES C
WHERE CHAR_LENGTH(TRIM('{{busca}}')) >= 2
  AND C.ID IN ${CLIENTES_DE_QUEM_CRIA}
  AND (${semAcento("CONCAT(COALESCE(C.NOME_FANTASIA, ''), ' ', COALESCE(C.RAZAO_SOCIAL, ''))")} LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%')
    OR REPLACE(REPLACE(REPLACE(COALESCE(C.CNPJ, ''), '.', ''), '/', ''), '-', '') LIKE CONCAT('%', REPLACE(REPLACE(REPLACE(TRIM('{{busca}}'), '.', ''), '/', ''), '-', ''), '%')
    OR CAST(C.ID AS CHAR) = TRIM('{{busca}}'))
  AND ${SEM_BLOQUEIO}
ORDER BY NOME, C.ID
LIMIT 50`,
  },
  {
    name: 's360AgendaProspects',
    type: 'SQL',
    description: 'Prospects ativos para a visita de prospeccao (RF-005): nao Convertido nem Perdido, do usuario, do titular coberto, da equipe (coordenador) ou todos (diretoria); ate 50. Params: busca (vazio = todos).',
    code: `SELECT P.ID, COALESCE(NULLIF(TRIM(P.NOME_FANTASIA), ''), P.RAZAO_SOCIAL) AS NOME, P.CIDADE
FROM PROSPECTS P
WHERE P.ID IN ${PROSPECTS_DE_QUEM_CRIA}
  AND ('{{busca}}' = '' OR ${semAcento("CONCAT(COALESCE(P.NOME_FANTASIA, ''), ' ', COALESCE(P.RAZAO_SOCIAL, ''))")} LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%'))
  AND ${SEM_BLOQUEIO}
ORDER BY NOME, P.ID
LIMIT 50`,
  },
  {
    name: 's360AgendaPessoas',
    type: 'SQL',
    description: 'Lista de convite (RN-013, RF-010): o usuario e quem tem escopo ativo, sem bloqueados. Sem parametros.',
    code: `SELECT U.ID, ${nomeUsuario('U')} AS NOME, CASE WHEN U.ID = :VAR_USER THEN 1 ELSE 0 END AS EH_VOCE
FROM INT_USER U
WHERE ${pessoaValida('U.ID')}
  AND ${SEM_BLOQUEIO}
ORDER BY EH_VOCE DESC, NOME`,
  },
  {
    name: 's360AgendaConflito',
    type: 'SQL',
    description: 'Primeiro compromisso que se sobrepoe ao horario (RN-004), para a mensagem depois de uma gravacao recusada. Params: pessoas [{"id":n}], data, inicio, fim, origem e id do item que se edita (vazio ao criar).',
    code: `SELECT K.PESSOA_ID, ${nomeUsuario('U')} AS NOME, CASE WHEN K.PESSOA_ID = :VAR_USER THEN 1 ELSE 0 END AS EH_VOCE,
  K.ORIGEM AS ORIGEM_EXISTENTE, K.TIPO AS TIPO_EXISTENTE, K.HORA_INICIO, K.HORA_FIM
FROM (${compromissos(DATA, DATA)}) K
JOIN INT_USER U ON U.ID = K.PESSOA_ID
WHERE K.PESSOA_ID IN ${pessoasJson('pessoas')}
  AND ${sobrepoe('K', INI, FIM, "'{{origem}}'", ID)}
  AND ${SEM_BLOQUEIO}
ORDER BY EH_VOCE DESC, K.HORA_INICIO
LIMIT 1`,
  },
  {
    name: 's360AgendaHistoricoResumo',
    type: 'SQL',
    description: 'Contadores do historico do cliente na Agenda (RF-015): VISITAS (nao canceladas), TAREFAS, VENDAS (pedidos). Params: clienteId.',
    code: `SELECT ${nomeCliente('C')} AS CLIENTE,
  (SELECT COUNT(*) FROM VISITAS V WHERE V.CLIENTE_ID = C.ID AND COALESCE(V.STATUS, '') <> 'CANCELADA') AS VISITAS,
  (SELECT COUNT(*) FROM TAREFAS T WHERE T.CLIENTE_ID = C.ID) AS TAREFAS,
  (SELECT COUNT(DISTINCT S.NUMPED) FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S WHERE S.CODCLI = C.ID) AS VENDAS
FROM CLIENTES C
WHERE C.ID = ${num('clienteId')}
  AND ${CLIENTE_VISIVEL}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaHistoricoEventos',
    type: 'SQL',
    description: 'Linha do tempo do historico do cliente na Agenda (RF-015): 10 eventos mais recentes entre visitas, atividades e pedidos. Params: clienteId.',
    code: `SELECT E.TIPO, E.DATA, E.TITULO, E.TEXTO, E.VALOR, E.SITUACAO
FROM (
  SELECT 'VISITA' AS TIPO, V.DATA_AGENDADA AS DATA, COALESCE(NULLIF(V.TIPO, ''), 'Visita') AS TITULO, V.RELATO AS TEXTO, NULL AS VALOR, V.STATUS AS SITUACAO
  FROM VISITAS V WHERE V.CLIENTE_ID = ${num('clienteId')} AND COALESCE(V.STATUS, '') <> 'CANCELADA'
  UNION ALL
  SELECT 'TAREFA', ${dia('T.CRIADO_EM')}, T.TITULO, T.DESCRICAO, NULL, T.STATUS
  FROM TAREFAS T WHERE T.CLIENTE_ID = ${num('clienteId')}
  UNION ALL
  SELECT 'PEDIDO', MAX(${dia('S.DTSAIDA')}), CONCAT('Pedido ', S.NUMPED), NULL, SUM(S.TOTAL), NULL
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S WHERE S.CODCLI = ${num('clienteId')}
  GROUP BY S.NUMPED
) E
WHERE ${CLIENTE_VISIVEL}
  AND ${SEM_BLOQUEIO}
ORDER BY E.DATA DESC, E.TIPO
LIMIT 10`,
  },

  /* ── criacao (uma instrucao: tudo ou nada) ── */
  {
    name: 's360VisitaCriar',
    type: 'SQL',
    description: 'Cria a visita ao cliente para cada vendedor (RF-003/011, RN-001..004, RN-013), tudo ou nada: carteira de quem cria, retroativo de 5 dias e conflito pelo relogio do servidor. Params: clienteId, vendedores [{"id":n}] ([] = so eu), data, inicio, fim, tipo, planejamento. Devolve affectedRows = visitas criadas.',
    code: `INSERT INTO VISITAS (CLIENTE_ID, VENDEDOR_ID, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, STATUS, PLANEJAMENTO, CRIADO_EM)
SELECT C.ID, A.ID, ${DATA}, ${INI}, ${FIM}, ${TIPO}, 'AGENDADA', NULLIF('{{planejamento}}', ''), ${AGORA_BR}
FROM ${alvos('vendedores')} A
JOIN CLIENTES C ON C.ID = ${num('clienteId')}
WHERE C.ID IN ${CLIENTES_DE_QUEM_CRIA}
  AND ${TIPO} IN (${lista(TIPOS.VISITA)})
  AND ${dataOk(DATA)}
  AND ${horarioOk(INI, FIM)}
  AND ${textoOk("'{{planejamento}}'")}
  AND NOT ${algumInvalido(alvos('vendedores'))}
  AND NOT ${algumConflito(alvos('vendedores'))}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ProspeccaoCriar',
    type: 'SQL',
    description: 'Cria a visita de prospeccao para cada vendedor, tudo ou nada (RF-003/005/011), e leva o prospect de Novo a Visita agendada (RN-022 da 008). Tipo no inicio do OBJETIVO (D-305), ate 200. Params: prospectId, vendedores, data, inicio, fim, tipo, objetivo. Devolve affectedRows.',
    code: `INSERT INTO PROSPECT_VISITAS (PROSPECT_ID, EXECUTIVO_ID, DATA_VISITA, HORA_INICIO, HORA_FIM, OBJETIVO, STATUS, CRIADO_EM, ATUALIZADO_EM)
SELECT P.ID, A.ID, ${DATA}, ${INI}, ${FIM}, ${objetivoGravado(TIPO, "TRIM('{{objetivo}}')")}, 'AGENDADA', ${AGORA_BR}, ${AGORA_BR}
FROM ${alvos('vendedores')} A
JOIN PROSPECTS P ON P.ID = ${num('prospectId')}
WHERE P.ID IN ${PROSPECTS_DE_QUEM_CRIA}
  AND ${TIPO} IN (${lista(TIPOS.PROSPECCAO)})
  AND CHAR_LENGTH(${objetivoGravado(TIPO, "TRIM('{{objetivo}}')")}) <= 200
  AND ${dataOk(DATA)}
  AND ${horarioOk(INI, FIM)}
  AND NOT ${algumInvalido(alvos('vendedores'))}
  AND NOT ${algumConflito(alvos('vendedores'))}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECTS
SET STATUS_PIPELINE = 'VISITA_AGENDADA', ATUALIZADO_EM = ${AGORA_BR}
WHERE PROSPECTS.ID = ${num('prospectId')}
  AND COALESCE(PROSPECTS.STATUS_PIPELINE, 'NOVO') = 'NOVO'
  AND EXISTS (SELECT 1 FROM PROSPECT_VISITAS PV WHERE PV.PROSPECT_ID = PROSPECTS.ID AND PV.STATUS = 'AGENDADA' AND PV.CRIADO_EM >= ${RECENTE_BR})
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360InternoCriar',
    type: 'SQL',
    description: 'Cria reuniao interna, Outros ou deslocamento com participantes (RF-003/010, RN-002/004): sem conflito do criador nem de nenhum participante. Params: tipo, titulo, descricao, origemDesloc, destinoDesloc, data, inicio, fim, participantes [{"id":n}]. Devolve affectedRows (1 + participantes).',
    code: `INSERT INTO AGENDA_INTERNA (TITULO, DESCRICAO, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, ORIGEM_DESLOCAMENTO, DESTINO_DESLOCAMENTO, STATUS, CRIADOR_ID, CRIADO_EM, ATUALIZADO_EM)
SELECT ${TITULO_INTERNO}, NULLIF('{{descricao}}', ''), ${DATA}, ${INI}, ${FIM}, ${TIPO},
  CASE WHEN ${TIPO} = 'Deslocamento' THEN TRIM('{{origemDesloc}}') END, CASE WHEN ${TIPO} = 'Deslocamento' THEN TRIM('{{destinoDesloc}}') END,
  'AGENDADA', :VAR_USER, ${AGORA_BR}, ${AGORA_BR}
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${CAMPOS_INTERNO}
  AND ${dataOk(DATA)}
  AND ${horarioOk(INI, FIM)}
  AND NOT ${algumInvalido(pessoasJson('participantes'))}
  AND NOT ${conflito(':VAR_USER', DATA, INI, FIM)}
  AND NOT ${algumConflito(pessoasJson('participantes'))}
  AND ${SEM_BLOQUEIO};
INSERT INTO AGENDA_INTERNA_PARTICIPANTES (AGENDA_ID, VENDEDOR_ID, CRIADO_EM)
SELECT DISTINCT A.ID, J.ID, ${AGORA_BR}
FROM AGENDA_INTERNA A
JOIN ${pessoasJson('participantes')} J ON J.ID <> :VAR_USER
WHERE A.ID = (SELECT MAX(A2.ID) FROM AGENDA_INTERNA A2
    WHERE A2.CRIADOR_ID = :VAR_USER AND A2.TITULO = ${TITULO_INTERNO} AND A2.DATA_AGENDADA = ${DATA}
      AND A2.HORA_INICIO = ${INI} AND A2.CRIADO_EM >= ${RECENTE_BR})
  AND NOT EXISTS (SELECT 1 FROM AGENDA_INTERNA_PARTICIPANTES AP WHERE AP.AGENDA_ID = A.ID)
  AND ${SEM_BLOQUEIO}`,
  },

  /* ── acoes (RN-005), uma por acao para os tres tipos ── */
  {
    name: 's360AgendaReagendar',
    type: 'SQL',
    description: 'Editar / reagendar item Agendado (RF-008, RN-003/004/009): data, horario, tipo e planejamento/objetivo; interno tambem titulo, descricao, origemDesloc, destinoDesloc. Mudou a data de visita ou prospeccao: motivo obrigatorio, acrescentado com "Reagendamento em". Conflito contra o dono (e participantes). Params: origem VISITA|PROSPECCAO|INTERNA, id, data, inicio, fim, tipo, planejamento, motivo, titulo, descricao, origemDesloc, destinoDesloc.',
    code: `UPDATE VISITAS
SET RELATO = CASE WHEN VISITAS.DATA_AGENDADA <> ${DATA} THEN ${acrescentar('VISITAS.RELATO', "'{{motivo}}'", 'Reagendamento em ')} ELSE VISITAS.RELATO END,
  DATA_AGENDADA = ${DATA}, HORA_INICIO = ${INI}, HORA_FIM = ${FIM}, TIPO = ${TIPO}, PLANEJAMENTO = NULLIF('{{planejamento}}', '')
WHERE ${ORIGEM('VISITA')}
  AND VISITAS.ID = ${ID}
  AND COALESCE(VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('VISITAS.VENDEDOR_ID')}
  AND ${TIPO} IN (${lista(TIPOS.VISITA)})
  AND ${horarioOk(INI, FIM)}
  AND ${textoOk("'{{planejamento}}'")}
  AND (VISITAS.DATA_AGENDADA = ${DATA} OR (${dataOk(DATA)} AND ${preenchido("'{{motivo}}'")} AND ${textoOk("'{{motivo}}'")}))
  AND NOT ${conflito('VISITAS.VENDEDOR_ID', DATA, INI, FIM, "'VISITA'", 'VISITAS.ID')}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECT_VISITAS
SET RESUMO = CASE WHEN PROSPECT_VISITAS.DATA_VISITA <> ${DATA} THEN ${acrescentar('PROSPECT_VISITAS.RESUMO', "'{{motivo}}'", 'Reagendamento em ')} ELSE PROSPECT_VISITAS.RESUMO END,
  DATA_VISITA = ${DATA}, HORA_INICIO = ${INI}, HORA_FIM = ${FIM},
  OBJETIVO = ${objetivoGravado(TIPO, "TRIM('{{planejamento}}')")}, ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND PROSPECT_VISITAS.ID = ${ID}
  AND COALESCE(PROSPECT_VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND ${TIPO} IN (${lista(TIPOS.PROSPECCAO)})
  AND CHAR_LENGTH(${objetivoGravado(TIPO, "TRIM('{{planejamento}}')")}) <= 200
  AND ${horarioOk(INI, FIM)}
  AND (PROSPECT_VISITAS.DATA_VISITA = ${DATA} OR (${dataOk(DATA)} AND ${preenchido("'{{motivo}}'")} AND ${textoOk("'{{motivo}}'")}))
  AND NOT ${conflito('PROSPECT_VISITAS.EXECUTIVO_ID', DATA, INI, FIM, "'PROSPECCAO'", 'PROSPECT_VISITAS.ID')}
  AND ${SEM_BLOQUEIO};
UPDATE AGENDA_INTERNA
SET TITULO = ${TITULO_INTERNO}, DESCRICAO = NULLIF('{{descricao}}', ''),
  ORIGEM_DESLOCAMENTO = CASE WHEN ${TIPO} = 'Deslocamento' THEN TRIM('{{origemDesloc}}') END,
  DESTINO_DESLOCAMENTO = CASE WHEN ${TIPO} = 'Deslocamento' THEN TRIM('{{destinoDesloc}}') END,
  DATA_AGENDADA = ${DATA}, HORA_INICIO = ${INI}, HORA_FIM = ${FIM}, TIPO = ${TIPO}, ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('INTERNA')}
  AND AGENDA_INTERNA.ID = ${ID}
  AND AGENDA_INTERNA.CRIADOR_ID = :VAR_USER
  AND COALESCE(AGENDA_INTERNA.STATUS, 'AGENDADA') = 'AGENDADA'
  AND (${DESLOC('AGENDA_INTERNA')}) = (${TIPO} = 'Deslocamento')
  AND ${CAMPOS_INTERNO}
  AND ${horarioOk(INI, FIM)}
  AND (AGENDA_INTERNA.DATA_AGENDADA = ${DATA} OR ${dataOk(DATA)})
  AND NOT ${conflito(':VAR_USER', DATA, INI, FIM, "'INTERNA'", 'AGENDA_INTERNA.ID')}
  AND NOT EXISTS (SELECT 1 FROM AGENDA_INTERNA_PARTICIPANTES PR
    WHERE PR.AGENDA_ID = AGENDA_INTERNA.ID AND ${conflito('PR.VENDEDOR_ID', DATA, INI, FIM, "'INTERNA'", 'AGENDA_INTERNA.ID')})
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaCheckin',
    type: 'SQL',
    description: 'Check-in (RF-007, RN-006): visita ou prospeccao Agendada (data futura aceita) vira Em andamento com data e hora de Brasilia do servidor. Params: origem VISITA|PROSPECCAO, id. Devolve affectedRows.',
    code: `UPDATE VISITAS
SET STATUS = 'EM_ANDAMENTO', CHECKIN_HORA = ${AGORA_BR}
WHERE ${ORIGEM('VISITA')}
  AND VISITAS.ID = ${ID}
  AND COALESCE(VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('VISITAS.VENDEDOR_ID')}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECT_VISITAS
SET STATUS = 'EM_ANDAMENTO', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND PROSPECT_VISITAS.ID = ${ID}
  AND COALESCE(PROSPECT_VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaCheckout',
    type: 'SQL',
    description: 'Check-out (RF-007, RN-007/008): Em andamento vira Concluida com hora do servidor; o relato (obrigatorio, ate 20.000) e ACRESCENTADO. Prospeccao: prospect Novo ou Visita agendada vai a Visitado (RN-022 da 008). Params: origem VISITA|PROSPECCAO, id, relato. Devolve affectedRows.',
    code: `UPDATE VISITAS
SET RELATO = ${acrescentar('VISITAS.RELATO', "'{{relato}}'")}, STATUS = 'CONCLUIDA', CHECKOUT_HORA = ${AGORA_BR}
WHERE ${ORIGEM('VISITA')}
  AND VISITAS.ID = ${ID}
  AND VISITAS.STATUS = 'EM_ANDAMENTO'
  AND ${podeOperar('VISITAS.VENDEDOR_ID')}
  AND ${preenchido("'{{relato}}'")} AND ${textoOk("'{{relato}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECT_VISITAS
SET RESUMO = ${acrescentar('PROSPECT_VISITAS.RESUMO', "'{{relato}}'")}, STATUS = 'CONCLUIDA', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND PROSPECT_VISITAS.ID = ${ID}
  AND PROSPECT_VISITAS.STATUS = 'EM_ANDAMENTO'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND ${preenchido("'{{relato}}'")} AND ${textoOk("'{{relato}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECTS
SET STATUS_PIPELINE = 'VISITADO', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND COALESCE(PROSPECTS.STATUS_PIPELINE, 'NOVO') IN ('NOVO', 'VISITA_AGENDADA')
  AND PROSPECTS.ID IN (SELECT PV.PROSPECT_ID FROM PROSPECT_VISITAS PV
    WHERE PV.ID = ${ID} AND PV.STATUS = 'CONCLUIDA' AND PV.ATUALIZADO_EM >= ${RECENTE_BR})
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaCancelar',
    type: 'SQL',
    description: 'Cancela item Agendado (RF-008, RN-010). Visita e prospeccao: motivo obrigatorio, acrescentado com "Cancelamento em". Interno: so o criador, motivo opcional (vai para a descricao). Params: origem, id, motivo. Devolve affectedRows.',
    code: `UPDATE VISITAS
SET RELATO = ${acrescentar('VISITAS.RELATO', "'{{motivo}}'", 'Cancelamento em ')}, STATUS = 'CANCELADA'
WHERE ${ORIGEM('VISITA')}
  AND VISITAS.ID = ${ID}
  AND COALESCE(VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('VISITAS.VENDEDOR_ID')}
  AND ${preenchido("'{{motivo}}'")} AND ${textoOk("'{{motivo}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECT_VISITAS
SET RESUMO = ${acrescentar('PROSPECT_VISITAS.RESUMO', "'{{motivo}}'", 'Cancelamento em ')}, STATUS = 'CANCELADA', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND PROSPECT_VISITAS.ID = ${ID}
  AND COALESCE(PROSPECT_VISITAS.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND ${preenchido("'{{motivo}}'")} AND ${textoOk("'{{motivo}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE AGENDA_INTERNA
SET DESCRICAO = CASE WHEN ${preenchido("'{{motivo}}'")} THEN ${acrescentar('AGENDA_INTERNA.DESCRICAO', "'{{motivo}}'", 'Cancelamento em ')} ELSE AGENDA_INTERNA.DESCRICAO END,
  STATUS = 'CANCELADA', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('INTERNA')}
  AND AGENDA_INTERNA.ID = ${ID}
  AND AGENDA_INTERNA.CRIADOR_ID = :VAR_USER
  AND COALESCE(AGENDA_INTERNA.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${textoOk("'{{motivo}}'")}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaRelatoEditar',
    type: 'SQL',
    description: 'Editar Relato de item Concluido (RF-008, RN-005/008): troca o texto inteiro, ate 20.000. Interno: a descricao, so o criador. Params: origem, id, relato. Devolve affectedRows.',
    code: `UPDATE VISITAS
SET RELATO = '{{relato}}'
WHERE ${ORIGEM('VISITA')}
  AND VISITAS.ID = ${ID}
  AND VISITAS.STATUS = 'CONCLUIDA'
  AND ${podeOperar('VISITAS.VENDEDOR_ID')}
  AND ${preenchido("'{{relato}}'")} AND ${textoOk("'{{relato}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE PROSPECT_VISITAS
SET RESUMO = '{{relato}}', ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('PROSPECCAO')}
  AND PROSPECT_VISITAS.ID = ${ID}
  AND PROSPECT_VISITAS.STATUS = 'CONCLUIDA'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND ${preenchido("'{{relato}}'")} AND ${textoOk("'{{relato}}'")}
  AND ${SEM_BLOQUEIO};
UPDATE AGENDA_INTERNA
SET DESCRICAO = NULLIF('{{relato}}', ''), ATUALIZADO_EM = ${AGORA_BR}
WHERE ${ORIGEM('INTERNA')}
  AND AGENDA_INTERNA.ID = ${ID}
  AND AGENDA_INTERNA.CRIADOR_ID = :VAR_USER
  AND AGENDA_INTERNA.STATUS = 'CONCLUIDA'
  AND (NOT ${DESLOC('AGENDA_INTERNA')} OR ${preenchido("'{{relato}}'")})
  AND ${textoOk("'{{relato}}'")}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360InternoConcluir',
    type: 'SQL',
    description: 'Conclui reuniao interna, Outros ou deslocamento Agendado pelo criador (RF-009, RN-011). Deslocamento: relato obrigatorio e so a partir do dia agendado (relogio do servidor). Observacao/relato acrescentado a descricao com "Conclusao em". Params: id, relato. Devolve affectedRows.',
    code: `UPDATE AGENDA_INTERNA
SET DESCRICAO = CASE WHEN ${preenchido("'{{relato}}'")} THEN ${acrescentar('AGENDA_INTERNA.DESCRICAO', "'{{relato}}'", 'Conclusão em ')} ELSE AGENDA_INTERNA.DESCRICAO END,
  STATUS = 'CONCLUIDA', ATUALIZADO_EM = ${AGORA_BR}
WHERE AGENDA_INTERNA.ID = ${ID}
  AND AGENDA_INTERNA.CRIADOR_ID = :VAR_USER
  AND COALESCE(AGENDA_INTERNA.STATUS, 'AGENDADA') = 'AGENDADA'
  AND ${textoOk("'{{relato}}'")}
  AND (NOT ${DESLOC('AGENDA_INTERNA')} OR (${preenchido("'{{relato}}'")} AND AGENDA_INTERNA.DATA_AGENDADA <= ${HOJE_BR}))
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360InternoParticipanteIncluir',
    type: 'SQL',
    description: 'Criador adiciona participante a interno ou deslocamento Agendado (RF-010, RN-004): pessoa com escopo ativo, sem conflito de horario. Params: id, pessoaId. Devolve affectedRows.',
    code: `INSERT INTO AGENDA_INTERNA_PARTICIPANTES (AGENDA_ID, VENDEDOR_ID, CRIADO_EM)
SELECT A.ID, U.ID, ${AGORA_BR}
FROM AGENDA_INTERNA A
JOIN INT_USER U ON U.ID = ${num('pessoaId')}
WHERE A.ID = ${ID}
  AND A.CRIADOR_ID = :VAR_USER
  AND COALESCE(A.STATUS, 'AGENDADA') = 'AGENDADA'
  AND U.ID <> :VAR_USER
  AND ${pessoaValida('U.ID')}
  AND NOT EXISTS (SELECT 1 FROM AGENDA_INTERNA_PARTICIPANTES AP WHERE AP.AGENDA_ID = A.ID AND AP.VENDEDOR_ID = U.ID)
  AND NOT ${conflito('U.ID', 'A.DATA_AGENDADA', 'A.HORA_INICIO', 'A.HORA_FIM', "'INTERNA'", 'A.ID')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360InternoParticipanteRetirar',
    type: 'SQL',
    description: 'Criador retira participante de interno ou deslocamento Agendado (RF-010, RN-014). Params: id, pessoaId. Devolve affectedRows.',
    code: `DELETE FROM AGENDA_INTERNA_PARTICIPANTES
WHERE AGENDA_ID = ${ID}
  AND VENDEDOR_ID = ${num('pessoaId')}
  AND EXISTS (SELECT 1 FROM AGENDA_INTERNA A
    WHERE A.ID = ${ID} AND A.CRIADOR_ID = :VAR_USER AND COALESCE(A.STATUS, 'AGENDADA') = 'AGENDADA')
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AgendaAtividadeCriar',
    type: 'SQL',
    description: 'Atividade de follow-up no encerramento da visita (RN-007): do usuario, com o cliente da visita Concluida que ele opera. Params: visitaId, titulo (1-300), descricao (<= 500), prioridade ALTA|MEDIA|BAIXA, dataLimite (AAAA-MM-DD ou vazio). Devolve affectedRows.',
    code: `INSERT INTO TAREFAS (VENDEDOR_ID, TITULO, DESCRICAO, STATUS, PRIORIDADE, DATA_LIMITE, CRIADO_EM, CLIENTE_ID)
SELECT :VAR_USER, TRIM('{{titulo}}'), NULLIF(TRIM('{{descricao}}'), ''), 'PENDENTE', '{{prioridade}}', NULLIF('{{dataLimite}}', ''), ${AGORA_BR}, V.CLIENTE_ID
FROM VISITAS V
WHERE V.ID = ${num('visitaId')}
  AND V.STATUS = 'CONCLUIDA'
  AND ${podeOperar('V.VENDEDOR_ID')}
  AND CHAR_LENGTH(TRIM('{{titulo}}')) BETWEEN 1 AND 300
  AND CHAR_LENGTH('{{descricao}}') <= 500
  AND '{{prioridade}}' IN ('ALTA', 'MEDIA', 'BAIXA')
  AND ('{{dataLimite}}' = '' OR CHAR_LENGTH('{{dataLimite}}') = 10)
  AND ${SEM_BLOQUEIO}`,
  },
];

/* ─────────────── publicacao ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function functionId(item) {
  return item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;
}

async function upsert() {
  const listaSf = await listServerFunctionsMitra({ projectId });
  const porNome = new Map((listaSf?.result ?? []).map((fn) => [fn.name, fn]));
  for (const definition of definitions) {
    const existente = porNome.get(definition.name);
    if (existente) {
      const id = functionId(existente);
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: definition.code, description: definition.description });
      console.log(`  atualizada  ${definition.name} (${id})`);
      continue;
    }
    const criada = await createServerFunctionMitra({
      projectId, name: definition.name, type: definition.type, code: definition.code, description: definition.description,
    });
    console.log(`  criada      ${definition.name} (${functionId(criada)})`);
  }
}

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 003)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
