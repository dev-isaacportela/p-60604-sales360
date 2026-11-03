// Spec 004 — atividades (tarefas e follow-ups).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-004-atividades.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nem coluna nova: TAREFAS, ATIVIDADES_LOG e GOOGLE_AGENDA_FILA
// ja existem. So SFs `s360*` (upsert por nome). Toda escrita e SF SQL; a busca
// de clientes e SF JAVASCRIPT so de leitura (RN-018 da 002).
//
// Escrita = varias instrucoes na mesma SF, sem transacao (como a plataforma).
// Cada instrucao repete a condicao (dono + valido + mudou) e a ordem e
// fila -> log -> alteracao: se o log falha, a atividade nao muda (RNF-002, D-002).
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
import { SEM_BLOQUEIO } from './lib/guardas.mjs';
import { ESCOPO_SQL, escopoAlvo, carteiraVisivel, nomeUsuario, nomeCliente, num, pagina } from './lib/002-carteira.mjs';
import { normalizarBusca, palavrasBusca, tolerancia, distanciaTrecho, camposBusca, relevancia } from './lib/002-regras.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/* ─────────────── fragmentos ─────────────── */

// Hora de Brasilia pelo servidor (RN-009, D-001): sem horario de verao desde 2019.
const AGORA = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR), '%Y-%m-%d %H:%i:%s')`;
const HA_UM_MINUTO = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 181 MINUTE), '%Y-%m-%d %H:%i:%s')`;

const STATUS = `'PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA'`;
const statusDe = (t) => `COALESCE(NULLIF(${t}.STATUS, ''), 'PENDENTE')`;
const prioridadeDe = (t) => `COALESCE(NULLIF(${t}.PRIORIDADE, ''), 'MEDIA')`;
const prazoDe = (t) => `NULLIF(${t}.DATA_LIMITE, '')`;

// RN-002: Meu painel = as proprias (nunca as do titular em ferias, RNT-010);
// demais modos = donos do escopo pedido (sem as linhas de cobertura).
const visivel = (t) => `${SEM_BLOQUEIO}
  AND (('{{modo}}' = 'ME' AND ${t}.VENDEDOR_ID = :VAR_USER)
    OR ('{{modo}}' <> 'ME' AND ${t}.VENDEDOR_ID IN (
      SELECT A_E.VENDEDOR_ID FROM (${escopoAlvo(ESCOPO_SQL)}) A_E WHERE A_E.COBERTURA = 0)))`;

// RF-003: vazio = sem filtro.
const filtros = (t) => `('{{status}}' = '' OR ${statusDe(t)} = '{{status}}')
  AND ('{{prioridade}}' = '' OR ${prioridadeDe(t)} = '{{prioridade}}')
  AND ('{{prazo}}' = '' OR ${t}.DATA_LIMITE = '{{prazo}}')`;

const rotuloCliente = (c) => `CONCAT(${nomeCliente(c)}, ' · ', ${c}.ID)`;

const COLUNAS = `T.ID, T.TITULO, T.DESCRICAO, ${statusDe('T')} AS STATUS, ${prioridadeDe('T')} AS PRIORIDADE,
    ${prazoDe('T')} AS DATA_LIMITE, T.CRIADO_EM, T.CONCLUIDO_EM, T.CLIENTE_ID,
    CASE WHEN C.ID IS NULL THEN NULL ELSE ${rotuloCliente('C')} END AS CLIENTE,
    T.VENDEDOR_ID, ${nomeUsuario('U')} AS RESPONSAVEL,
    CASE WHEN T.VENDEDOR_ID = :VAR_USER THEN 0 ELSE 1 END AS SOMENTE_LEITURA`;
const ORIGEM = `FROM TAREFAS T
  LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
  LEFT JOIN INT_USER U ON U.ID = T.VENDEDOR_ID`;

/* ── escrita ── */

const minha = (t) => `${t}.ID = ${num('id')} AND ${t}.VENDEDOR_ID = :VAR_USER AND ${SEM_BLOQUEIO}`;

const TITULO = `TRIM('{{titulo}}')`;
const DESCRICAO = `TRIM('{{descricao}}')`;
const PRIORIDADE = `COALESCE(NULLIF('{{prioridade}}', ''), 'MEDIA')`;
const CLIENTE = num('clienteId');

// RN-005 (titulo e prazo), RN-004; mesmas regras de lib/atividades.ts.
const VALIDO = `CHAR_LENGTH(${TITULO}) BETWEEN 1 AND 300
  AND CHAR_LENGTH('{{prazo}}') = 10 AND '{{prazo}}' LIKE '____-__-__'
  AND ${PRIORIDADE} IN ('ALTA', 'MEDIA', 'BAIXA')
  AND CHAR_LENGTH('{{descricao}}') <= 4000`;

// RN-008: vazio ou da carteira do proprio usuario em `hoje` (inclui titular
// coberto em ferias ATIVAS, RNT-010), qualquer que seja o escopo da tela.
const CARTEIRA_PROPRIA = carteiraVisivel({
  ...ESCOPO_SQL, modo: "'ME'", coordenador: "''", vendedor: "''", filial: "''", depto: "''", secao: "''",
});
const CLIENTE_OK = `(${CLIENTE} IS NULL OR ${CLIENTE} IN (SELECT CV_P.ID_CLIENTE FROM (${CARTEIRA_PROPRIA}) CV_P))`;

const nomeDoCliente = (id) => `(SELECT ${rotuloCliente('CL')} FROM CLIENTES CL WHERE CL.ID = ${id})`;

// Item ('TAREFA', id) pendente na fila do Google (RN-012; formato do
// googleAgendaEnfileirarSync atual). `cond` filtra TAREFAS T.
const enfileirar = (cond) => `UPDATE GOOGLE_AGENDA_FILA
SET SOLICITADO_EM = ${AGORA}, PROCESSADO_EM = NULL, TENTATIVAS = 0, ULTIMO_ERRO = NULL
WHERE ENTIDADE = 'TAREFA' AND ENTIDADE_ID IN (SELECT T.ID FROM TAREFAS T WHERE ${cond});
INSERT INTO GOOGLE_AGENDA_FILA (ENTIDADE, ENTIDADE_ID, SOLICITADO_EM, PROCESSADO_EM, TENTATIVAS, ULTIMO_ERRO)
SELECT 'TAREFA', T.ID, ${AGORA}, NULL, 0, NULL
FROM TAREFAS T
WHERE ${cond}
  AND NOT EXISTS (SELECT 1 FROM GOOGLE_AGENDA_FILA F WHERE F.ENTIDADE = 'TAREFA' AND F.ENTIDADE_ID = T.ID)`;

const INSERIR_LOG = `INSERT INTO ATIVIDADES_LOG (ID_ATIVIDADE, CAMPO_ALTERADO, VALOR_ANTERIOR, VALOR_NOVO, DATA_ALTERACAO, ID_USUARIO)`;
const corte = (expr) => `SUBSTRING(${expr}, 1, 255)`;

/* ── s360AtividadeAtualizar: o que mudou (RN-009) ── */

const CAMPOS = [
  ['TITULO', `TRIM(T.TITULO)`, TITULO],
  ['DESCRICAO', `TRIM(COALESCE(T.DESCRICAO, ''))`, DESCRICAO],
  ['CLIENTE_ID', `COALESCE(T.CLIENTE_ID, 0)`, `COALESCE(${CLIENTE}, 0)`],
  ['PRIORIDADE', prioridadeDe('T'), PRIORIDADE],
  ['DATA_LIMITE', `COALESCE(T.DATA_LIMITE, '')`, `'{{prazo}}'`],
];
const MUDOU = CAMPOS.map(([, atual, novo]) => `${atual} <> ${novo}`).join('\n    OR ');
// D-006: o cliente so e conferido na carteira quando muda.
const EDICAO = `${minha('T')}
  AND ${VALIDO}
  AND (COALESCE(T.CLIENTE_ID, 0) = COALESCE(${CLIENTE}, 0) OR ${CLIENTE_OK})
  AND (${MUDOU})`;
const valorLog = {
  TITULO: [corte('T.TITULO'), corte(TITULO)],
  DESCRICAO: [corte(`NULLIF(T.DESCRICAO, '')`), corte(`NULLIF(${DESCRICAO}, '')`)],
  CLIENTE_ID: [corte(`COALESCE(${nomeDoCliente('T.CLIENTE_ID')}, CAST(T.CLIENTE_ID AS CHAR))`), corte(nomeDoCliente(CLIENTE))],
  PRIORIDADE: [prioridadeDe('T'), PRIORIDADE],
  DATA_LIMITE: [prazoDe('T'), `'{{prazo}}'`],
};
const LOG_EDICAO = `${INSERIR_LOG}
SELECT X.ID, X.CAMPO, X.DE, X.PARA, ${AGORA}, :VAR_USER
FROM (
${CAMPOS.map(([campo, atual, novo]) => `  SELECT T.ID, '${campo}' AS CAMPO, ${valorLog[campo][0]} AS DE, ${valorLog[campo][1]} AS PARA
  FROM TAREFAS T WHERE ${EDICAO} AND ${atual} <> ${novo}`).join('\n  UNION ALL\n')}
) X`;

/* ── s360AtividadeStatus (RN-003) ── */

const TROCA = `${minha('T')}
  AND '{{status}}' IN (${STATUS})
  AND ${statusDe('T')} <> '{{status}}'`;

/* ─────────────── s360AtividadeClientes (JAVASCRIPT) ─────────────── */

function source(fn) {
  const texto = fn.toString();
  return texto.slice(texto.indexOf('{') + 1, texto.lastIndexOf('}')).trim();
}

// Clientes da carteira propria, com os campos da RN-018 da 002.
const SQL_CLIENTES = `SELECT DISTINCT C.ID, C.WINTHOR_CODCLI, C.RAZAO_SOCIAL, C.NOME_FANTASIA, ${nomeCliente('C')} AS NOME,
    C.CNPJ, C.CIDADE, C.UF, C.SEGMENTO
  FROM (${carteiraVisivel({ ...ESCOPO_SQL, modo: "'ME'", coordenador: "''", vendedor: "''", filial: "''", depto: "''", secao: "''", hoje: "'@@hoje@@'" })}) CV
  JOIN CLIENTES C ON C.ID = CV.ID_CLIENTE`;

async function corpoClientes() {
  const { runQueryMitra } = require('mitra-sdk');
  const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);
  const e = event || {};
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(String(e.hoje)) ? String(e.hoje) : '';
  if (!hoje) return { ok: false, error: 'Data de referência inválida.' };
  const resposta = await runQueryMitra({ projectId, sql: SQL.replace(/@@hoje@@/g, hoje) });
  let saida = resposta?.result ?? resposta;
  if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { saida = {}; } }
  const linhas = saida?.rows ?? saida?.result?.rows ?? saida?.result ?? [];
  const porNome = (a, b) => String(a.NOME).localeCompare(String(b.NOME), 'pt-BR');
  const palavras = palavrasBusca(String(e.busca ?? '').slice(0, 120));
  const achados = palavras.length
    ? linhas.map((l) => ({ l, r: relevancia(palavras, camposBusca(l)) }))
      .filter((x) => x.r != null)
      .sort((a, b) => b.r - a.r || porNome(a.l, b.l))
      .map((x) => x.l)
    : [...linhas].sort(porNome);
  return {
    ok: true,
    total: achados.length,
    linhas: achados.slice(0, 80).map((l) => ({ ID: l.ID, NOME: l.NOME, RAZAO_SOCIAL: l.RAZAO_SOCIAL, CNPJ: l.CNPJ, CIDADE: l.CIDADE, UF: l.UF })),
  };
}

const CORPO_CLIENTES = [
  `const SQL = ${JSON.stringify(SQL_CLIENTES)};`,
  [normalizarBusca, palavrasBusca, tolerancia, distanciaTrecho, camposBusca, relevancia].map(String).join('\n\n'),
  source(corpoClientes),
].join('\n\n');

/* ─────────────── definicoes ─────────────── */

const ESCOPO_DESCR = 'Escopo: modo ME|TEAM|SELLER|ALL|COORD, coordenador, vendedor, filial, depto, secao (texto, vazio = sem recorte), hoje AAAA-MM-DD.';
const FILTROS_DESCR = 'Filtros: status PENDENTE|EM_ANDAMENTO|CONCLUIDA, prioridade ALTA|MEDIA|BAIXA, prazo AAAA-MM-DD (vazio = sem filtro).';
const RESPOSTA_DESCR = 'Devolve affectedRows (soma das instrucoes); 0 = recusado (nao e sua, invalida ou nada mudou).';

export const definitions = [
  /* ── leitura ── */
  {
    name: 's360AtividadesAbertas',
    type: 'SQL',
    description: `Atividades A Fazer e Em andamento do escopo (RF-001, RN-002, RN-007), com responsavel e SOMENTE_LEITURA. ${ESCOPO_DESCR} ${FILTROS_DESCR}`,
    code: `SELECT ${COLUNAS}
${ORIGEM}
WHERE ${statusDe('T')} IN ('PENDENTE', 'EM_ANDAMENTO')
  AND ${filtros('T')}
  AND ${visivel('T')}
ORDER BY CASE WHEN ${statusDe('T')} = 'PENDENTE' THEN 0 ELSE 1 END,
  CASE WHEN ${prazoDe('T')} IS NULL THEN 1 ELSE 0 END, T.DATA_LIMITE, T.ID`,
  },
  {
    name: 's360AtividadesConcluidas',
    type: 'SQL',
    description: `Atividades concluidas do escopo, conclusao mais recente primeiro, 20 por pagina, com TOTAL (RN-007). ${ESCOPO_DESCR} ${FILTROS_DESCR} Mais pagina.`,
    code: `WITH N AS (
  SELECT ${COLUNAS},
    ROW_NUMBER() OVER (ORDER BY CASE WHEN T.CONCLUIDO_EM IS NULL THEN 1 ELSE 0 END, REPLACE(T.CONCLUIDO_EM, 'T', ' ') DESC, T.ID DESC) AS RN,
    COUNT(*) OVER () AS TOTAL
  ${ORIGEM}
  WHERE ${statusDe('T')} = 'CONCLUIDA'
    AND ${filtros('T')}
    AND ${visivel('T')}
)
SELECT N.* FROM N
WHERE N.RN > (${pagina()} - 1) * 20 AND N.RN <= ${pagina()} * 20
ORDER BY N.RN`,
  },
  {
    name: 's360AtividadesResumo',
    type: 'SQL',
    description: `Cards Total, Em andamento, Atrasadas e Concluidas com os filtros aplicados (RF-002, RN-006, RN-013). ${ESCOPO_DESCR} ${FILTROS_DESCR}`,
    code: `SELECT COUNT(*) AS TOTAL,
  COALESCE(SUM(CASE WHEN ${statusDe('T')} = 'EM_ANDAMENTO' THEN 1 ELSE 0 END), 0) AS EM_ANDAMENTO,
  COALESCE(SUM(CASE WHEN ${statusDe('T')} <> 'CONCLUIDA' AND ${prazoDe('T')} IS NOT NULL AND T.DATA_LIMITE < '{{hoje}}' THEN 1 ELSE 0 END), 0) AS ATRASADAS,
  COALESCE(SUM(CASE WHEN ${statusDe('T')} = 'CONCLUIDA' THEN 1 ELSE 0 END), 0) AS CONCLUIDAS
FROM TAREFAS T
WHERE ${filtros('T')}
  AND ${visivel('T')}`,
  },
  {
    name: 's360AtividadeLog',
    type: 'SQL',
    description: `Log de alteracoes de uma atividade, mais recente primeiro (RF-008, RN-009); so se a atividade aparece para quem pede. ${ESCOPO_DESCR} Mais id.`,
    code: `SELECT L.ID, L.CAMPO_ALTERADO, L.VALOR_ANTERIOR, L.VALOR_NOVO, L.DATA_ALTERACAO, ${nomeUsuario('U')} AS USUARIO
FROM ATIVIDADES_LOG L
JOIN TAREFAS T ON T.ID = L.ID_ATIVIDADE
LEFT JOIN INT_USER U ON U.ID = L.ID_USUARIO
WHERE L.ID_ATIVIDADE = ${num('id')}
  AND ${visivel('T')}
ORDER BY REPLACE(L.DATA_ALTERACAO, 'T', ' ') DESC, L.ID DESC`,
  },
  {
    name: 's360AtividadeClientes',
    type: 'JAVASCRIPT',
    description: 'Clientes para vincular a atividade (RF-009, RN-008): so a carteira do proprio usuario, busca inteligente (RN-018 da 002), ate 80 e o total. Params: busca, hoje AAAA-MM-DD. Devolve { ok, total, linhas }.',
    code: CORPO_CLIENTES,
  },

  /* ── escrita ── */
  {
    // Atividade -> log CRIACAO -> fila. Log e fila acham a criada por
    // LAST_INSERT_ID() + dono + criada ha menos de 1 minuto (D-003).
    name: 's360AtividadeCriar',
    type: 'SQL',
    description: `Cria atividade A Fazer do usuario (RF-004, RN-004, RN-005, RN-008, RN-012) com log e fila do Google numa acao. Params: titulo, descricao, clienteId (vazio = sem cliente), prioridade (vazio = MEDIA), prazo AAAA-MM-DD, hoje. ${RESPOSTA_DESCR}`,
    code: `INSERT INTO TAREFAS (VENDEDOR_ID, CLIENTE_ID, TITULO, DESCRICAO, STATUS, PRIORIDADE, DATA_LIMITE, CRIADO_EM)
SELECT U.ID, ${CLIENTE}, ${TITULO}, NULLIF(${DESCRICAO}, ''), 'PENDENTE', ${PRIORIDADE}, '{{prazo}}', ${AGORA}
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${VALIDO}
  AND ${CLIENTE_OK}
  AND ${SEM_BLOQUEIO};
${INSERIR_LOG}
SELECT T.ID, 'CRIACAO', NULL, ${corte('T.TITULO')}, ${AGORA}, :VAR_USER
FROM TAREFAS T
WHERE T.ID = LAST_INSERT_ID()
  AND T.VENDEDOR_ID = :VAR_USER
  AND REPLACE(T.CRIADO_EM, 'T', ' ') >= ${HA_UM_MINUTO}
  AND NOT EXISTS (SELECT 1 FROM ATIVIDADES_LOG L0 WHERE L0.ID_ATIVIDADE = T.ID);
INSERT INTO GOOGLE_AGENDA_FILA (ENTIDADE, ENTIDADE_ID, SOLICITADO_EM, PROCESSADO_EM, TENTATIVAS, ULTIMO_ERRO)
SELECT 'TAREFA', L.ID_ATIVIDADE, ${AGORA}, NULL, 0, NULL
FROM ATIVIDADES_LOG L
JOIN TAREFAS T ON T.ID = L.ID_ATIVIDADE
WHERE L.ID = LAST_INSERT_ID()
  AND L.CAMPO_ALTERADO = 'CRIACAO'
  AND L.ID_USUARIO = :VAR_USER
  AND REPLACE(L.DATA_ALTERACAO, 'T', ' ') >= ${HA_UM_MINUTO}
  AND ${prazoDe('T')} IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM GOOGLE_AGENDA_FILA F WHERE F.ENTIDADE = 'TAREFA' AND F.ENTIDADE_ID = L.ID_ATIVIDADE)`,
  },
  {
    name: 's360AtividadeAtualizar',
    type: 'SQL',
    description: `Edita titulo, descricao, cliente, prioridade e prazo da propria atividade (RF-005, RN-001, RN-005, RN-008, RN-009): fila, uma linha de log por campo mudado e a alteracao. Params: id, titulo, descricao, clienteId, prioridade, prazo, hoje. ${RESPOSTA_DESCR}`,
    code: `${enfileirar(EDICAO)};
${LOG_EDICAO};
UPDATE TAREFAS AS T
SET TITULO = ${TITULO},
    DESCRICAO = NULLIF(${DESCRICAO}, ''),
    CLIENTE_ID = ${CLIENTE},
    PRIORIDADE = ${PRIORIDADE},
    DATA_LIMITE = '{{prazo}}'
WHERE ${EDICAO}`,
  },
  {
    name: 's360AtividadeStatus',
    type: 'SQL',
    description: `Troca o status da propria atividade (RF-006, RN-003): Concluida grava CONCLUIDO_EM (Brasilia, servidor), sair dela apaga; log STATUS; fila se tem prazo. Params: id, status PENDENTE|EM_ANDAMENTO|CONCLUIDA. ${RESPOSTA_DESCR}`,
    code: `${enfileirar(`${TROCA} AND ${prazoDe('T')} IS NOT NULL`)};
${INSERIR_LOG}
SELECT T.ID, 'STATUS', ${statusDe('T')}, '{{status}}', ${AGORA}, :VAR_USER
FROM TAREFAS T
WHERE ${TROCA};
UPDATE TAREFAS AS T
SET STATUS = '{{status}}',
    CONCLUIDO_EM = CASE WHEN '{{status}}' = 'CONCLUIDA' THEN ${AGORA} ELSE NULL END
WHERE ${TROCA}`,
  },
  {
    // A FK do log nao tem cascata: o log sai antes da atividade.
    name: 's360AtividadeExcluir',
    type: 'SQL',
    description: `Exclui a propria atividade e o log dela (RF-007, RN-010); fila do Google se tem prazo. Params: id. ${RESPOSTA_DESCR}`,
    code: `${enfileirar(`${minha('T')} AND ${prazoDe('T')} IS NOT NULL`)};
DELETE FROM ATIVIDADES_LOG
WHERE ID_ATIVIDADE IN (SELECT T.ID FROM TAREFAS T WHERE ${minha('T')});
DELETE FROM TAREFAS
WHERE ${minha('TAREFAS')}`,
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
  const lista = await listServerFunctionsMitra({ projectId });
  const porNome = new Map((lista?.result ?? []).map((fn) => [fn.name, fn]));
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
  console.log(`Publicando ${definitions.length} server functions (spec 004)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
