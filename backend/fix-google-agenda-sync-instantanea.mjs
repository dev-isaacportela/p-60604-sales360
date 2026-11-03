/**
 * Google Agenda -- sincronizacao volta a ser INSTANTANEA para usuario business.
 *
 * DE ONDE VEIO O ATRASO
 * Acesso BUSINESS nao escreve no banco de dentro de SF JAVASCRIPT. A SF 212 grava em tres
 * lugares, entao a tela nao podia chama-la: passou a so ENFILEIRAR, e um worker em cron
 * sincronizava depois -- ate 5 minutos. Funcionava, mas o vendedor salvava a visita e nao
 * via nada no Google Calendar.
 *
 * COMO FICA INSTANTANEA
 * A SF 212 vira funcao PURA: le, fala com o Google e devolve, junto com o resultado, a lista
 * de GRAVACOES que precisam acontecer. Quem persiste sao SFs SQL chamadas pela tela -- que
 * acesso business executa normalmente.
 *
 * A fila NAO foi removida: continua como rede de segurança. Se a SF 212 falhar, a tela
 * enfileira e o worker (cron, Administrator) refaz a sincronizacao e persiste sozinho.
 *
 * POR QUE A SF 212 NAO GRAVA COM :VAR_USER, COMO AS OUTRAS
 * Porque ela grava tambem para os PARTICIPANTES de uma reuniao interna, e :VAR_USER so
 * alcança quem esta logado. Por isso a SF SQL de vinculo valida o envolvimento do usuario
 * com o item (dono, executivo, criador ou participante) em vez de confiar no id recebido.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// ------------------------------------------------------------------ SFs SQL de persistencia

// O id do usuario NAO e confiavel (vem do navegador). Em vez de aceita-lo, a SF exige que ele
// seja de fato um envolvido no item. A unica excecao e LIMPAR um vinculo (evento vazio +
// CANCELADO): e o caso do participante retirado da reuniao, que por definicao ja nao consta
// mais na lista -- e limpar vinculo nao corrompe nada, no maximo forca uma recriacao.
const SF_GRAVAR_VINCULO = `
INSERT INTO GOOGLE_AGENDA_EVENTOS (
  USER_ID, ENTIDADE, ENTIDADE_ID, GOOGLE_EVENT_ID, STATUS_SYNC, ULTIMA_SYNC, ULTIMO_ERRO, ATUALIZADO_EM
)
SELECT {{userId}}, '{{entidade}}', {{entidadeId}}, '{{googleEventId}}', '{{statusSync}}',
       SUBSTRING(CURRENT_TIMESTAMP, 1, 19), '{{erro}}', SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE '{{entidade}}' IN ('VISITA', 'TAREFA', 'PROSPECCAO', 'INTERNA')
  AND '{{statusSync}}' IN ('SINCRONIZADO', 'CANCELADO', 'ERRO', 'PENDENTE')
  AND (
    ('{{googleEventId}}' = '' AND '{{statusSync}}' = 'CANCELADO')
    OR {{userId}} IN (
            SELECT VENDEDOR_ID  FROM VISITAS                       WHERE '{{entidade}}' = 'VISITA'     AND ID = {{entidadeId}}
      UNION SELECT VENDEDOR_ID  FROM TAREFAS                       WHERE '{{entidade}}' = 'TAREFA'     AND ID = {{entidadeId}}
      UNION SELECT EXECUTIVO_ID FROM PROSPECT_VISITAS              WHERE '{{entidade}}' = 'PROSPECCAO' AND ID = {{entidadeId}}
      UNION SELECT CRIADOR_ID   FROM AGENDA_INTERNA                WHERE '{{entidade}}' = 'INTERNA'    AND ID = {{entidadeId}}
      UNION SELECT VENDEDOR_ID  FROM AGENDA_INTERNA_PARTICIPANTES  WHERE '{{entidade}}' = 'INTERNA'    AND AGENDA_ID = {{entidadeId}}
    )
  )
ON DUPLICATE KEY UPDATE
  GOOGLE_EVENT_ID = VALUES(GOOGLE_EVENT_ID),
  STATUS_SYNC = VALUES(STATUS_SYNC),
  ULTIMA_SYNC = VALUES(ULTIMA_SYNC),
  ULTIMO_ERRO = VALUES(ULTIMO_ERRO),
  ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
`;

const SF_LOG_SYNC = `
INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM)
SELECT {{userId}}, '{{entidade}}', {{entidadeId}}, '{{acao}}', '{{status}}', '{{mensagem}}',
       SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE '{{status}}' IN ('SUCESSO', 'ERRO')
`;

// So o proprio usuario: e o que a tela de Configuracoes mostra ("ultima sincronizacao" e
// "ultimo erro"). Nao faz sentido -- nem seria seguro -- mexer nesses campos de outra pessoa.
const SF_MARCAR_SYNC = `
UPDATE GOOGLE_AGENDA_CONFIG
SET ULTIMA_SYNC = CASE WHEN '{{erro}}' = '' THEN SUBSTRING(CURRENT_TIMESTAMP, 1, 19) ELSE ULTIMA_SYNC END,
    ULTIMO_ERRO = NULLIF('{{erro}}', ''),
    ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE USER_ID = :VAR_USER
`;

// ------------------------------------------------------------------ acumulador injetado na 212
const ACUMULADOR = `
// ---------------------------------------------------------------- gravacoes pendentes
// Esta SF NAO grava: acesso BUSINESS nao escreve no banco de dentro de SF JAVASCRIPT.
// Tudo que precisaria ser gravado e acumulado aqui e devolvido em "gravacoes". Quem persiste
// e a TELA (SFs SQL, instantaneo) ou o worker em cron (Administrator, rede de seguranca).
const gravacoes = [];

/** Texto que vai virar literal em SQL do outro lado: sem aspas, barras ou quebras. */
function limpo(texto, limite) {
  return String(texto == null ? '' : texto)
    .replace(/['"\\\\\\r\\n\\t]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, limite || 300);
}

function log(userId, entidade, entidadeId, acao, status, mensagem) {
  gravacoes.push({
    tipo: 'log',
    userId: Number(userId) || 0,
    entidade: limpo(entidade, 20),
    entidadeId: Number(entidadeId) || 0,
    acao: limpo(acao, 20),
    status: limpo(status, 20),
    mensagem: limpo(mensagem, 300),
  });
}

function saveMapping(userId, entidade, entidadeId, googleEventId, status, erro) {
  gravacoes.push({
    tipo: 'vinculo',
    userId: Number(userId) || 0,
    entidade: limpo(entidade, 20),
    entidadeId: Number(entidadeId) || 0,
    googleEventId: limpo(googleEventId, 200),
    statusSync: limpo(status, 20),
    erro: limpo(erro, 300),
  });
}

function marcarConfig(userId, erro) {
  gravacoes.push({ tipo: 'config', userId: Number(userId) || 0, erro: limpo(erro, 300) });
}
`;

async function upsertSf(nome, tipo, code, description) {
  const sfs = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const existente = sfs.find((s) => s.name === nome);
  if (existente) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existente.id, code, description });
    console.log(`  ${nome} (${existente.id}) atualizada.`);
    return existente.id;
  }
  await createServerFunctionMitra({ projectId, name: nome, type: tipo, code, description });
  const relidas = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const id = relidas.find((s) => s.name === nome)?.id;
  console.log(`  ${nome} criada (id ${id}).`);
  return id;
}

function aplicar(codigo, nome, pares) {
  for (const [de, para] of pares) {
    if (!codigo.includes(de)) throw new Error(`${nome}: trecho nao encontrado -->\n${de.slice(0, 160)}`);
    codigo = codigo.split(de).join(para);
  }
  return codigo;
}

async function main() {
  console.log('1. SFs SQL de persistencia (o que a tela chama depois da SF 212)');
  const idVinculo = await upsertSf('googleAgendaGravarVinculo', 'SQL', SF_GRAVAR_VINCULO,
    'Grava o vinculo entre um item da agenda e o evento no Google. Valida que o usuario e envolvido no item, porque o id vem do navegador.');
  const idLog = await upsertSf('googleAgendaLogSync', 'SQL', SF_LOG_SYNC,
    'Registra no historico o resultado de uma sincronizacao com o Google Agenda.');
  const idMarcar = await upsertSf('googleAgendaMarcarSync', 'SQL', SF_MARCAR_SYNC,
    'Atualiza ultima sincronizacao e ultimo erro do usuario logado (exibidos em Configuracoes).');

  console.log('\n2. SF 212 vira funcao pura (devolve as gravacoes em vez de executa-las)');
  let c = String((await readServerFunctionMitra({ projectId, serverFunctionId: 212 }))?.result?.code || '');

  // Substitui os tres helpers de escrita pelo acumulador.
  const iDml = c.indexOf('function dml(sql) {');
  const iFimLog = c.indexOf('\n}\n', c.indexOf('async function log(userId, entidade, entidadeId, acao, status, mensagem) {'));
  if (iDml === -1 || iFimLog === -1) throw new Error('SF 212: nao consegui delimitar dml()/log().');
  c = c.slice(0, iDml) + ACUMULADOR.trim() + c.slice(iFimLog + 3);

  const iSave = c.indexOf('async function saveMapping(userId, entidade, entidadeId, googleEventId, status, erro) {');
  const iFimSave = c.indexOf('\n}\n', iSave);
  if (iSave === -1 || iFimSave === -1) throw new Error('SF 212: nao consegui delimitar saveMapping().');
  c = c.slice(0, iSave) + c.slice(iFimSave + 3);

  c = aplicar(c, 'SF 212', [
    // As duas escritas diretas em GOOGLE_AGENDA_CONFIG viram entradas no acumulador.
    [
      "    await dml(`UPDATE GOOGLE_AGENDA_CONFIG SET ULTIMA_SYNC = '${now()}', ULTIMO_ERRO = NULL WHERE USER_ID = ${Number(userId)} LIMIT 1`);",
      '    marcarConfig(userId, \'\');',
    ],
    [
      "    await dml(`UPDATE GOOGLE_AGENDA_CONFIG SET ULTIMO_ERRO = '${escapeSql(mensagem)}' WHERE USER_ID = ${Number(userId)} LIMIT 1`);",
      '    marcarConfig(userId, mensagem);',
    ],
    // O retorno passa a carregar as gravacoes.
    [
      `  return {
    entidade,
    entidadeId,`,
      `  return {
    gravacoes,
    entidade,
    entidadeId,`,
    ],
    [
      "const {\n  callIntegrationMitra,\n  runDmlMitra,\n  runQueryMitra,\n} = require('mitra-sdk');",
      "const {\n  callIntegrationMitra,\n  runQueryMitra,\n} = require('mitra-sdk');",
    ],
  ]);

  // Os `await` que sobraram em log()/saveMapping() sao inofensivos (await de valor comum),
  // mas conferir que nenhuma escrita real restou e o que importa.
  if (/runDmlMitra\s*\(/.test(c)) throw new Error('SF 212: ainda escreve no banco -- abortando.');
  if (!c.includes('const gravacoes = [];')) throw new Error('SF 212: acumulador nao foi injetado.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 212, code: c });
  console.log('   OK: nenhum runDmlMitra na 212.');

  console.log('\n3. Worker (375) passa a persistir as gravacoes que a 212 devolve');
  let w = String((await readServerFunctionMitra({ projectId, serverFunctionId: 375 }))?.result?.code || '');
  w = aplicar(w, 'SF 375', [
    [
      `      const res = execucao && execucao.result ? execucao.result : {};
      if (res.executionStatus === 'FAILED') {
        // O erro da SF vem como objeto em parte dos casos; sem o stringify vira "[object Object]".
        erro = typeof res.error === 'string' ? res.error : JSON.stringify(res.error || {});
      }`,
      `      const res = execucao && execucao.result ? execucao.result : {};
      if (res.executionStatus === 'FAILED') {
        // O erro da SF vem como objeto em parte dos casos; sem o stringify vira "[object Object]".
        erro = typeof res.error === 'string' ? res.error : JSON.stringify(res.error || {});
      } else {
        // A SF 212 e pura: devolve o que precisa ser gravado. Aqui isso e permitido porque
        // o cron roda como Administrator -- na tela quem persiste sao as SFs SQL.
        let saida = res.output;
        if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch (e) { saida = null; } }
        await persistir((saida && saida.gravacoes) || []);
      }`,
    ],
    [
      'async function processar() {',
      `function sqlTexto(valor) {
  return String(valor == null ? '' : valor).replace(/'/g, "''");
}

/** Executa as gravacoes que a SF 212 devolveu. So o cron pode fazer isto. */
async function persistir(gravacoes) {
  for (const g of gravacoes) {
    if (g.tipo === 'vinculo') {
      await runDmlMitra({
        projectId,
        sql: "INSERT INTO GOOGLE_AGENDA_EVENTOS (USER_ID, ENTIDADE, ENTIDADE_ID, GOOGLE_EVENT_ID, STATUS_SYNC, ULTIMA_SYNC, ULTIMO_ERRO, ATUALIZADO_EM) VALUES ("
          + Number(g.userId) + ", '" + sqlTexto(g.entidade) + "', " + Number(g.entidadeId) + ", '" + sqlTexto(g.googleEventId)
          + "', '" + sqlTexto(g.statusSync) + "', '" + now() + "', '" + sqlTexto(g.erro) + "', '" + now() + "') "
          + "ON DUPLICATE KEY UPDATE GOOGLE_EVENT_ID = VALUES(GOOGLE_EVENT_ID), STATUS_SYNC = VALUES(STATUS_SYNC), "
          + "ULTIMA_SYNC = VALUES(ULTIMA_SYNC), ULTIMO_ERRO = VALUES(ULTIMO_ERRO), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)",
      });
    } else if (g.tipo === 'log') {
      await runDmlMitra({
        projectId,
        sql: "INSERT INTO GOOGLE_AGENDA_LOGS (USER_ID, ENTIDADE, ENTIDADE_ID, ACAO, STATUS, MENSAGEM, EXECUTADO_EM) VALUES ("
          + Number(g.userId) + ", '" + sqlTexto(g.entidade) + "', " + Number(g.entidadeId) + ", '" + sqlTexto(g.acao)
          + "', '" + sqlTexto(g.status) + "', '" + sqlTexto(g.mensagem) + "', '" + now() + "')",
      });
    } else if (g.tipo === 'config') {
      await runDmlMitra({
        projectId,
        sql: "UPDATE GOOGLE_AGENDA_CONFIG SET "
          + (g.erro ? "ULTIMO_ERRO = '" + sqlTexto(g.erro) + "'" : "ULTIMA_SYNC = '" + now() + "', ULTIMO_ERRO = NULL")
          + ", ATUALIZADO_EM = '" + now() + "' WHERE USER_ID = " + Number(g.userId) + " LIMIT 1",
      });
    }
  }
}

async function processar() {`,
    ],
  ]);
  await updateServerFunctionMitra({ projectId, serverFunctionId: 375, code: w });
  console.log('   OK.');

  console.log(`\nIDs para a tela: gravarVinculo=${idVinculo} logSync=${idLog} marcarSync=${idMarcar}`);
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
