
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

function sqlTexto(valor) {
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
      } else {
        // A SF 212 e pura: devolve o que precisa ser gravado. Aqui isso e permitido porque
        // o cron roda como Administrator -- na tela quem persiste sao as SFs SQL.
        let saida = res.output;
        if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch (e) { saida = null; } }
        const resumo = (saida && saida.rows && saida.rows[0]) || saida || {};
        await persistir(resumo.gravacoes || []);
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
