
const { runDmlMitra, runQueryMitra, sendEmailMitra } = require('mitra-sdk');

function escapeSql(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildEmailHtml({ inicio, fim, total, alta, media, baixa, alertas }) {
  const rows = alertas.slice(0, 30).map((alerta) => {
    const valor = Number(alerta.VALOR_REFERENCIA || 0) > 0 ? formatMoney(alerta.VALOR_REFERENCIA) : '-';
    return '<tr>'
      + '<td style="padding:10px;border-bottom:1px solid #e6ece2;font-weight:700;color:#1b1c1a;">' + escapeHtml(alerta.PRIORIDADE || '-') + '</td>'
      + '<td style="padding:10px;border-bottom:1px solid #e6ece2;color:#1b1c1a;">' + escapeHtml(alerta.NOME_CLIENTE || ('Cliente ' + alerta.ID_CLIENTE)) + '</td>'
      + '<td style="padding:10px;border-bottom:1px solid #e6ece2;color:#1b1c1a;">' + escapeHtml(alerta.TITULO || '-') + '</td>'
      + '<td style="padding:10px;border-bottom:1px solid #e6ece2;color:#52604f;">' + escapeHtml(valor) + '</td>'
      + '</tr>';
  }).join('');

  const extra = total > 30
    ? '<p style="margin:16px 0 0;color:#52604f;font-size:13px;">Mostrando os 30 avisos de maior prioridade. Acesse a tela de Alertas para ver todos.</p>'
    : '';

  return '<div style="font-family:Inter,Arial,sans-serif;background:#f6f8f3;padding:24px;color:#1b1c1a;">'
    + '<div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e1e8dc;border-radius:18px;overflow:hidden;">'
    + '<div style="padding:24px 28px;background:#2f4f35;color:#ffffff;">'
    + '<p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.82;">Resumo semanal</p>'
    + '<h1 style="margin:0;font-size:24px;line-height:1.25;">Avisos comerciais agrupados</h1>'
    + '<p style="margin:10px 0 0;font-size:14px;opacity:.9;">Período: ' + escapeHtml(inicio) + ' até ' + escapeHtml(fim) + '</p>'
    + '</div>'
    + '<div style="padding:24px 28px;">'
    + '<p style="margin:0 0 18px;color:#52604f;">Você recebeu ' + total + ' aviso(s) nesta janela semanal.</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    + '<span style="background:#fee4e2;color:#b42318;border-radius:999px;padding:8px 12px;font-weight:700;font-size:13px;">Alta: ' + alta + '</span>'
    + '<span style="background:#fff4dc;color:#a26a00;border-radius:999px;padding:8px 12px;font-weight:700;font-size:13px;">Média: ' + media + '</span>'
    + '<span style="background:#e7f6e9;color:#17743b;border-radius:999px;padding:8px 12px;font-weight:700;font-size:13px;">Baixa: ' + baixa + '</span>'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
    + '<thead><tr style="background:#f6f8f3;color:#52604f;text-align:left;">'
    + '<th style="padding:10px;">Prioridade</th><th style="padding:10px;">Cliente</th><th style="padding:10px;">Aviso</th><th style="padding:10px;">Referência</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + extra
    + '<p style="margin:22px 0 0;color:#52604f;font-size:13px;">Este email é automático e consolida os avisos gerados desde o último ciclo semanal.</p>'
    + '</div></div></div>';
}

async function logResultado(projectId, { vendedorId, email, semana, total, status, erro }) {
  await runDmlMitra({
    projectId,
    sql: `INSERT INTO ALERTAS_EMAIL_SEMANAL (ID_VENDEDOR, EMAIL_DESTINO, SEMANA_REFERENCIA, TOTAL_ALERTAS, ENVIADO_EM, STATUS, ERRO)
      VALUES (${Number(vendedorId)}, '${escapeSql(email)}', '${escapeSql(semana)}', ${Number(total || 0)}, CURRENT_TIMESTAMP, '${escapeSql(status)}', '${escapeSql(erro || '')}')
      ON DUPLICATE KEY UPDATE
        EMAIL_DESTINO = VALUES(EMAIL_DESTINO),
        TOTAL_ALERTAS = VALUES(TOTAL_ALERTAS),
        ENVIADO_EM = VALUES(ENVIADO_EM),
        STATUS = VALUES(STATUS),
        ERRO = VALUES(ERRO)`,
  });
}

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};
  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || 45654);
  if (!projectId) return { rows: [{ STATUS: 'FAILED', MENSAGEM: 'projectId nao identificado.' }] };

  const dryRun = ['true', '1', 'sim', 's'].includes(String(evt.dryRun || '').toLowerCase());
  const force = ['true', '1', 'sim', 's'].includes(String(evt.force || '').toLowerCase());

  const periodoRes = await runQueryMitra({
    projectId,
    sql: "SELECT DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY), '%Y-%m-%d') AS INICIO, DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS FIM, CONCAT(DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY), '%Y-%m-%d'), '_', DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d')) AS SEMANA_REFERENCIA",
  });
  const periodo = periodoRes?.result?.rows?.[0] || {};
  const semana = String(periodo.SEMANA_REFERENCIA || 'semana-atual');

  const enviadosRes = await runQueryMitra({
    projectId,
    sql: `SELECT ID_VENDEDOR FROM ALERTAS_EMAIL_SEMANAL WHERE SEMANA_REFERENCIA = '${escapeSql(semana)}' AND STATUS = 'ENVIADO'`,
  });
  const enviados = new Set((enviadosRes?.result?.rows || []).map((row) => Number(row.ID_VENDEDOR || 0)));

  const alertasRes = await runQueryMitra({
    projectId,
    sql: `SELECT
        AI.ID,
        AI.ID_VENDEDOR,
        U.DESCR AS EMAIL_DESTINO,
        AI.ID_CLIENTE,
        AI.NOME_CLIENTE,
        AI.TIPO_ALERTA,
        AI.TITULO,
        AI.DESCRICAO,
        AI.VALOR_REFERENCIA,
        AI.PRIORIDADE,
        DATE_FORMAT(AI.DATA_GERACAO, '%Y-%m-%d %H:%i:%s') AS DATA_GERACAO
      FROM ALERTAS_INTELIGENTES AI
      JOIN INT_USER U ON U.ID = AI.ID_VENDEDOR
      WHERE AI.DATA_GERACAO >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)
        AND AI.DATA_GERACAO < CURRENT_TIMESTAMP
        AND U.DESCR LIKE '%@%'
      ORDER BY AI.ID_VENDEDOR,
        CASE AI.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        AI.DATA_GERACAO DESC,
        AI.ID DESC
      LIMIT 5000`,
  });

  const porVendedor = new Map();
  for (const row of alertasRes?.result?.rows || []) {
    const vendedorId = Number(row.ID_VENDEDOR || 0);
    if (!vendedorId) continue;
    if (!force && enviados.has(vendedorId)) continue;
    const atual = porVendedor.get(vendedorId) || { vendedorId, email: String(row.EMAIL_DESTINO || '').trim(), alertas: [] };
    atual.alertas.push(row);
    porVendedor.set(vendedorId, atual);
  }

  const resultados = [];
  for (const grupo of porVendedor.values()) {
    const total = grupo.alertas.length;
    const alta = grupo.alertas.filter((item) => item.PRIORIDADE === 'ALTA').length;
    const media = grupo.alertas.filter((item) => item.PRIORIDADE === 'MEDIA').length;
    const baixa = total - alta - media;

    if (dryRun) {
      resultados.push({ STATUS: 'DRY_RUN', ID_VENDEDOR: grupo.vendedorId, EMAIL: grupo.email, TOTAL_ALERTAS: total });
      continue;
    }

    try {
      const body = buildEmailHtml({
        inicio: periodo.INICIO,
        fim: periodo.FIM,
        total,
        alta,
        media,
        baixa,
        alertas: grupo.alertas,
      });
      await sendEmailMitra({
        projectId,
        to: [grupo.email],
        subject: 'Resumo semanal de avisos comerciais',
        body,
      });
      await logResultado(projectId, { vendedorId: grupo.vendedorId, email: grupo.email, semana, total, status: 'ENVIADO' });
      resultados.push({ STATUS: 'ENVIADO', ID_VENDEDOR: grupo.vendedorId, EMAIL: grupo.email, TOTAL_ALERTAS: total });
    } catch (error) {
      const erro = String(error?.message || error || 'Erro desconhecido').slice(0, 1000);
      await logResultado(projectId, { vendedorId: grupo.vendedorId, email: grupo.email, semana, total, status: 'ERRO', erro });
      resultados.push({ STATUS: 'ERRO', ID_VENDEDOR: grupo.vendedorId, EMAIL: grupo.email, TOTAL_ALERTAS: total, ERRO: erro });
    }
  }

  return {
    rows: resultados.length ? resultados : [{ STATUS: dryRun ? 'DRY_RUN_SEM_AVISOS' : 'SEM_AVISOS', SEMANA_REFERENCIA: semana }],
  };
}

return run();
