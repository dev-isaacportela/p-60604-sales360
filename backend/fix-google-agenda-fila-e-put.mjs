/**
 * Google Agenda -- correcoes desta rodada.
 *
 * Tres defeitos, todos encontrados a partir do erro "Sua conexao com o Google esta
 * sendo preparada" que o Glauber (business) recebia na SF 370:
 *
 * 1. O cron da SF 372 (googleAgendaManutencao) nunca foi criado. Sem ele nada provisionava
 *    a integracao do usuario, e a espera de 5 minutos prometida na mensagem era infinita.
 *    (Corrigido a parte, junto com o provisionamento imediato do Glauber.)
 *
 * 2. PATCH nao funciona no motor de integracao. Testado nas duas integracoes (compartilhada
 *    e por usuario): devolve na hora um "Read timed out after 300s" -- resposta enlatada, nao
 *    timeout real. POST, PUT e DELETE respondem em 0s. Como a SF 212 usa PATCH para ATUALIZAR
 *    evento ja existente, toda reedicao de visita/tarefa falhava em silencio. Trocado por PUT.
 *
 * 3. A SF 212 grava no banco de dentro de SF JAVASCRIPT (runDmlMitra), o que e negado para
 *    acesso BUSINESS -- a mesma parede das SFs 365/370. Logo, sincronizar NUNCA funcionou para
 *    vendedor nenhum. Em vez de espalhar a escrita por varias SFs SQL (a SF 212 tambem grava
 *    para OUTROS usuarios, nos participantes de reuniao interna -- e :VAR_USER so alcanca o
 *    proprio), a tela passa a ENFILEIRAR (SF SQL, que business executa) e um worker em cron
 *    processa a fila como Administrator, onde a escrita e permitida.
 *
 * Custo da escolha: a sincronizacao deixa de ser instantanea e passa a levar ate 5 minutos
 * (piso do cron da plataforma). Em troca ela passa a funcionar para os 26 vendedores, cobre os
 * participantes de reuniao interna e ganha retentativa automatica -- hoje um item que falha
 * so tenta de novo se alguem editar o registro.
 */
import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  readServerFunctionMitra,
  listServerFunctionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// ------------------------------------------------------------------ fila
// UNIQUE(ENTIDADE, ENTIDADE_ID): salvar o mesmo item cinco vezes seguidas gera UM pedido
// pendente, nao cinco. O worker sempre le o estado atual do registro, entao o ultimo save
// e o que vale de qualquer forma.
const DDL_FILA = `
CREATE TABLE IF NOT EXISTS GOOGLE_AGENDA_FILA (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ENTIDADE VARCHAR(20) NOT NULL,
  ENTIDADE_ID INT NOT NULL,
  SOLICITADO_EM VARCHAR(19),
  PROCESSADO_EM VARCHAR(19) NULL,
  TENTATIVAS INT DEFAULT 0,
  ULTIMO_ERRO VARCHAR(500) NULL,
  UNIQUE KEY UK_FILA_ITEM (ENTIDADE, ENTIDADE_ID)
)`;

// SF SQL: e o unico caminho de escrita que acesso BUSINESS tem. O WHERE ... EXISTS garante
// que so entra na fila item que existe de verdade -- nao valida dono de proposito, porque
// coordenador edita item de vendedor e a SF 212 ja se comportava assim.
const SF_ENFILEIRAR = `
INSERT INTO GOOGLE_AGENDA_FILA (ENTIDADE, ENTIDADE_ID, SOLICITADO_EM, PROCESSADO_EM, TENTATIVAS, ULTIMO_ERRO)
SELECT '{{entidade}}', {{entidadeId}}, SUBSTRING(CURRENT_TIMESTAMP, 1, 19), NULL, 0, NULL
WHERE '{{entidade}}' IN ('VISITA', 'TAREFA', 'PROSPECCAO', 'INTERNA')
  AND (
       ('{{entidade}}' = 'VISITA'     AND EXISTS (SELECT 1 FROM VISITAS          WHERE ID = {{entidadeId}}))
    OR ('{{entidade}}' = 'TAREFA'     AND EXISTS (SELECT 1 FROM TAREFAS          WHERE ID = {{entidadeId}}))
    OR ('{{entidade}}' = 'PROSPECCAO' AND EXISTS (SELECT 1 FROM PROSPECT_VISITAS WHERE ID = {{entidadeId}}))
    OR ('{{entidade}}' = 'INTERNA'    AND EXISTS (SELECT 1 FROM AGENDA_INTERNA   WHERE ID = {{entidadeId}}))
  )
ON DUPLICATE KEY UPDATE
  SOLICITADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19),
  PROCESSADO_EM = NULL,
  TENTATIVAS = 0,
  ULTIMO_ERRO = NULL
`;

// Worker em cron -> roda como Administrator, entao a SF 212 chamada aqui dentro herda esse
// acesso e volta a poder gravar. SF chamada por SF nao conta no rate limit do projeto.
const SF_WORKER = `
/**
 * SF - googleAgendaProcessarFila (CRON, executa como Administrator)
 *
 * Existe porque acesso BUSINESS nao escreve no banco de dentro de SF JAVASCRIPT: a tela
 * so enfileira (SF SQL) e quem sincroniza de fato e este worker, fora da sessao do usuario.
 */
const { executeServerFunctionMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = 45654;
const SF_SINCRONIZAR = 212;
const LOTE = 25;          // teto por rodada: o cron roda a cada 5 min e nao pode passar de 300s
const MAX_TENTATIVAS = 5; // item quebrado para de ser retentado em vez de girar para sempre

function escapeSql(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function rows(response) {
  if (Array.isArray(response && response.rows)) return response.rows;
  if (response && response.result && Array.isArray(response.result.rows)) return response.result.rows;
  if (response && Array.isArray(response.result)) return response.result;
  return [];
}

function now() {
  return new Date().toISOString().slice(0, 19);
}

async function processar() {
  const pendentes = rows(await runQueryMitra({
    projectId,
    sql: 'SELECT ID, ENTIDADE, ENTIDADE_ID, TENTATIVAS FROM GOOGLE_AGENDA_FILA '
      + 'WHERE PROCESSADO_EM IS NULL AND TENTATIVAS < ' + MAX_TENTATIVAS
      + ' ORDER BY ID LIMIT ' + LOTE,
  }));

  const relatorio = { pendentes: pendentes.length, ok: 0, falhas: 0, detalhes: [] };

  for (const linha of pendentes) {
    const id = Number(linha.ID);
    let erro = '';
    try {
      const execucao = await executeServerFunctionMitra({
        projectId,
        serverFunctionId: SF_SINCRONIZAR,
        input: { entidade: String(linha.ENTIDADE), entidadeId: Number(linha.ENTIDADE_ID) },
      });
      const res = execucao && execucao.result ? execucao.result : {};
      if (res.executionStatus === 'FAILED') {
        // O erro da SF vem como objeto em parte dos casos; sem o stringify vira "[object Object]".
        erro = typeof res.error === 'string' ? res.error : JSON.stringify(res.error || {});
      }
    } catch (e) {
      erro = String(e && e.message ? e.message : e);
    }

    if (erro) {
      relatorio.falhas += 1;
      relatorio.detalhes.push({ id, entidade: linha.ENTIDADE, entidadeId: linha.ENTIDADE_ID, erro: erro.slice(0, 200) });
      await runDmlMitra({
        projectId,
        sql: "UPDATE GOOGLE_AGENDA_FILA SET TENTATIVAS = TENTATIVAS + 1, ULTIMO_ERRO = '"
          + escapeSql(erro.slice(0, 500)) + "' WHERE ID = " + id + ' LIMIT 1',
      });
    } else {
      relatorio.ok += 1;
      await runDmlMitra({
        projectId,
        sql: "UPDATE GOOGLE_AGENDA_FILA SET PROCESSADO_EM = '" + now() + "', ULTIMO_ERRO = NULL WHERE ID = " + id + ' LIMIT 1',
      });
    }
  }

  // Higiene: pedidos ja concluidos ha mais de um dia nao servem para nada.
  await runDmlMitra({
    projectId,
    sql: "DELETE FROM GOOGLE_AGENDA_FILA WHERE PROCESSADO_EM IS NOT NULL "
      + "AND REPLACE(PROCESSADO_EM, 'T', ' ') < SUBSTRING(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY), 1, 19)",
  });

  return relatorio;
}

return await processar();
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

async function main() {
  console.log('1. Tabela de fila');
  await runDdlMitra({ projectId, sql: DDL_FILA });
  console.log('   OK.');

  console.log('\n2. SF SQL de enfileiramento (o que a tela passa a chamar)');
  const idEnfileirar = await upsertSf(
    'googleAgendaEnfileirar',
    'SQL',
    SF_ENFILEIRAR,
    'Coloca um item da agenda na fila de sincronizacao com o Google. E SQL porque acesso BUSINESS nao escreve de dentro de SF JAVASCRIPT.',
  );

  console.log('\n3. Worker da fila (cron, Administrator)');
  const idWorker = await upsertSf(
    'googleAgendaProcessarFila',
    'JAVASCRIPT',
    SF_WORKER,
    'Processa a fila de sincronizacao do Google Agenda chamando a SF 212. Roda em cron como Administrator porque a SF 212 grava no banco.',
  );
  await updateServerFunctionMitra({ projectId, serverFunctionId: idWorker, cronExpression: '0 */5 * * * *' });
  console.log('   cron 0 */5 * * * * aplicado.');

  console.log('\n4. SF 212: PATCH -> PUT (PATCH nao funciona no motor de integracao)');
  let c212 = String((await readServerFunctionMitra({ projectId, serverFunctionId: 212 }))?.result?.code || '');
  const dePatch = "method: 'PATCH', endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), body })";
  const paraPut = "method: 'PUT', endpoint: '/calendars/' + calendarId + '/events/' + encodeURIComponent(existingId), body })";
  if (!c212.includes(dePatch)) throw new Error('SF 212: chamada PATCH nao encontrada -- revise.');
  c212 = c212.split(dePatch).join(paraPut);
  // O rotulo gravado no log tambem precisa acompanhar, senao o historico mente sobre o verbo.
  c212 = c212.split("existingId ? 'PATCH' : 'POST'").join("existingId ? 'PUT' : 'POST'");
  c212 = c212.split("action: existingId ? 'patch' : 'post'").join("action: existingId ? 'put' : 'post'");
  if (/method: 'PATCH'/.test(c212)) throw new Error('SF 212: ainda restou PATCH -- abortando.');
  await updateServerFunctionMitra({ projectId, serverFunctionId: 212, code: c212 });
  console.log('   OK: nenhum PATCH restante na 212.');

  console.log(`\nIDs para a tela: googleAgendaEnfileirar = ${idEnfileirar} | worker = ${idWorker}`);
}

main().catch((e) => {
  console.error('FALHOU:', e?.message || e);
  process.exit(1);
});
