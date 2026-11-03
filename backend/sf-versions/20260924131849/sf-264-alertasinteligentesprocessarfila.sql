
const { executeServerFunctionMitra, runDmlMitra, runQueryMitra } = require('mitra-sdk');

function sqlString(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function extractRows(response) {
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return []; }
  }
  if (Array.isArray(output?.rows)) return output.rows;
  if (Array.isArray(output?.result)) return output.result;
  if (Array.isArray(output)) return output;
  return [];
}

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};
  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || 45654);
  const acao = String(evt.acao || evt.action || 'processar').toLowerCase();
  const loteSolicitado = Number(evt.lote || evt.limit || 1);
  const lote = Math.max(1, Math.min(Number.isFinite(loteSolicitado) ? loteSolicitado : 1, 3));
  const iniciarFila = ['iniciar', 'start'].includes(acao);
  const forcarNovaFila = ['reiniciar', 'reset'].includes(acao) || ['true', '1', 'sim', 's'].includes(String(evt.force || evt.forcar || '').toLowerCase());
  let runId = String(evt.runId || ((iniciarFila || forcarNovaFila) ? ('ALERTAS-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)) : '')).trim();
  const sfGeracaoId = Number(evt.sfGeracaoId || 130);

  await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'ERRO', ERRO = 'Processamento expirado antes de finalizar.', FINALIZADO_EM = CURRENT_TIMESTAMP WHERE STATUS = 'PROCESSANDO' AND INICIADO_EM < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 MINUTE)" });

  const ativaRes = await runQueryMitra({
    projectId,
    sql: "SELECT RUN_ID, COUNT(*) AS TOTAL FROM ALERTAS_PROCESSAMENTO WHERE STATUS IN ('PENDENTE','PROCESSANDO') GROUP BY RUN_ID ORDER BY MAX(ID) DESC LIMIT 1",
  });
  const filaAtiva = ativaRes?.result?.rows?.[0] || null;

  const hojeRes = await runQueryMitra({
    projectId,
    sql: "SELECT RUN_ID, SUM(CASE WHEN STATUS = 'PENDENTE' THEN 1 ELSE 0 END) AS PENDENTES, SUM(CASE WHEN STATUS = 'PROCESSANDO' THEN 1 ELSE 0 END) AS PROCESSANDO, COUNT(*) AS TOTAL FROM ALERTAS_PROCESSAMENTO WHERE DATE(CRIADO_EM) = CURRENT_DATE GROUP BY RUN_ID ORDER BY MAX(ID) DESC LIMIT 1",
  });
  const filaHoje = hojeRes?.result?.rows?.[0] || null;
  const temFilaHoje = Number(filaHoje?.TOTAL || 0) > 0;

  if (((iniciarFila || acao === 'processar') && !filaAtiva && !temFilaHoje) || forcarNovaFila) {
    if (!runId) runId = 'ALERTAS-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const safeRunId = sqlString(runId);
    await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'CANCELADO', FINALIZADO_EM = CURRENT_TIMESTAMP WHERE STATUS IN ('PENDENTE','PROCESSANDO')" });
    await runDmlMitra({
      projectId,
      sql: "INSERT INTO ALERTAS_PROCESSAMENTO (RUN_ID, VENDEDOR_ID, STATUS, CRIADO_EM) SELECT '" + safeRunId + "', VENDEDOR_ID, 'PENDENTE', CURRENT_TIMESTAMP FROM (SELECT DISTINCT VENDEDOR_ID FROM BU_VENDEDOR WHERE VENDEDOR_ID IS NOT NULL AND COALESCE(ATIVO, TRUE) = TRUE) V ORDER BY VENDEDOR_ID",
    });
  } else if (filaAtiva?.RUN_ID) {
    runId = String(filaAtiva.RUN_ID);
  } else if (filaHoje?.RUN_ID) {
    runId = String(filaHoje.RUN_ID);
  }

  const pendentesRes = await runQueryMitra({
    projectId,
    sql: "SELECT ID, RUN_ID, VENDEDOR_ID, CLIENTE_ID FROM ALERTAS_PROCESSAMENTO WHERE STATUS = 'PENDENTE' ORDER BY ID LIMIT " + lote,
  });
  const pendentes = pendentesRes?.result?.rows || [];
  const processados = [];

  for (const item of pendentes) {
    const id = Number(item.ID || 0);
    const vendedorId = Number(item.VENDEDOR_ID || 0);
    const clienteId = Number(item.CLIENTE_ID || 0);
    const inicio = Date.now();
    if (!id || !vendedorId) continue;

    await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'PROCESSANDO', INICIADO_EM = CURRENT_TIMESTAMP, ERRO = NULL WHERE ID = " + id });

    try {
      const result = await executeServerFunctionMitra({
        projectId,
        serverFunctionId: sfGeracaoId,
        input: clienteId > 0 ? { vendedorId: String(vendedorId), clienteId: String(clienteId) } : { vendedorId: String(vendedorId) },
      });
      const executionStatus = String(result?.result?.executionStatus || '');
      const executionError = String(result?.result?.error || '').trim();
      if ((executionStatus && executionStatus !== 'COMPLETED') || executionError) {
        throw new Error(executionError || ('Geracao finalizou com status ' + executionStatus));
      }
      const rows = extractRows(result);
      const ok = rows.find((row) => String(row.STATUS || '') === 'OK') || {};
      const duracao = Date.now() - inicio;
      await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'CONCLUIDO', FINALIZADO_EM = CURRENT_TIMESTAMP, DURACAO_MS = " + duracao + ", TOTAL_ALERTAS_ATIVOS = " + Number(ok.TOTAL_ALERTAS_ATIVOS || 0) + " WHERE ID = " + id });
      processados.push({ STATUS: 'PROCESSADO', ID: id, RUN_ID: item.RUN_ID, VENDEDOR_ID: vendedorId, CLIENTE_ID: clienteId || null, DURACAO_MS: duracao, TOTAL_ALERTAS_ATIVOS: Number(ok.TOTAL_ALERTAS_ATIVOS || 0) });
    } catch (error) {
      const duracao = Date.now() - inicio;
      const erro = sqlString(error?.message || error || 'Falha desconhecida');
      if (!clienteId) {
        const clientesRes = await runQueryMitra({
          projectId,
          sql: "SELECT DISTINCT ID_CLIENTE FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = " + vendedorId + " AND ID_CLIENTE IS NOT NULL ORDER BY ID_CLIENTE",
        });
        const clientes = clientesRes?.result?.rows || [];
        if (clientes.length > 0) {
          await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'DIVIDIDO', FINALIZADO_EM = CURRENT_TIMESTAMP, DURACAO_MS = " + duracao + ", ERRO = 'Dividido por cliente apos falha do vendedor completo: " + erro.slice(0, 700) + "' WHERE ID = " + id });
          const values = clientes.map((row) => "('" + sqlString(item.RUN_ID) + "', " + vendedorId + ", " + Number(row.ID_CLIENTE || 0) + ", 'PENDENTE', CURRENT_TIMESTAMP)").join(',');
          if (values) {
            await runDmlMitra({ projectId, sql: "INSERT INTO ALERTAS_PROCESSAMENTO (RUN_ID, VENDEDOR_ID, CLIENTE_ID, STATUS, CRIADO_EM) VALUES " + values });
          }
          processados.push({ STATUS: 'DIVIDIDO', ID: id, RUN_ID: item.RUN_ID, VENDEDOR_ID: vendedorId, CLIENTES_ENFILEIRADOS: clientes.length, DURACAO_MS: duracao });
          continue;
        }
      }
      await runDmlMitra({ projectId, sql: "UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'ERRO', FINALIZADO_EM = CURRENT_TIMESTAMP, DURACAO_MS = " + duracao + ", ERRO = '" + erro.slice(0, 900) + "' WHERE ID = " + id });
      processados.push({ STATUS: 'ERRO', ID: id, RUN_ID: item.RUN_ID, VENDEDOR_ID: vendedorId, CLIENTE_ID: clienteId || null, DURACAO_MS: duracao, ERRO: erro.slice(0, 300) });
    }
  }

  const resumoRes = await runQueryMitra({
    projectId,
    sql: "SELECT STATUS, COUNT(*) AS TOTAL FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = (SELECT RUN_ID FROM ALERTAS_PROCESSAMENTO ORDER BY ID DESC LIMIT 1) GROUP BY STATUS ORDER BY STATUS",
  });
  const resumo = resumoRes?.result?.rows || [];
  const pendentesRestantes = resumo.reduce((acc, row) => acc + (String(row.STATUS) === 'PENDENTE' ? Number(row.TOTAL || 0) : 0), 0);

  return { rows: [
    { STATUS: 'OK', ACAO: acao, LOTE: lote, PROCESSADOS_NESTA_EXECUCAO: processados.length, PENDENTES: pendentesRestantes, RUN_ID: runId || String(resumo[0]?.RUN_ID || '') },
    ...processados,
    ...resumo.map((row) => ({ STATUS: 'RESUMO_FILA', FILA_STATUS: row.STATUS, TOTAL: Number(row.TOTAL || 0) })),
  ] };
}

return run();
