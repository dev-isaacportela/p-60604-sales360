
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
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatPercent(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function rowsOf(response) {
  return response?.result?.rows || response?.rows || [];
}

async function query(projectId, sql) {
  const response = await runQueryMitra({ projectId, sql });
  return rowsOf(response);
}

function barRows(rows, labelKey, valueKey, color) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  if (!rows.length) {
    return '<p style="margin:0;color:#687366;font-size:13px;">Sem dados para o período.</p>';
  }
  return rows.map((row) => {
    const value = Number(row[valueKey] || 0);
    const width = Math.max(5, Math.round((value / max) * 100));
    return '<div style="margin:0 0 10px;">'
      + '<div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#1f2a1f;margin-bottom:4px;">'
      + '<strong style="font-weight:700;">' + escapeHtml(row[labelKey] || '-') + '</strong>'
      + '<span>' + formatMoney(value) + '</span>'
      + '</div>'
      + '<div style="height:9px;background:#edf2ea;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(13,104,21,.04);">'
      + '<div style="height:9px;width:' + width + '%;background:' + color + ';border-radius:999px;"></div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function metaVsRealizadoChart(rows) {
  if (!rows.length) return '<p style="margin:0;color:#6f756d;font-size:13px;">Sem vendedores com meta ou realizado no período.</p>';
  const max = Math.max(...rows.map((row) => Math.max(Number(row.META_SEMANA || 0), Number(row.FATURAMENTO_LIQUIDO || 0))), 1);
  return rows.slice(0, 8).map((row) => {
    const meta = Number(row.META_SEMANA || 0);
    const realizado = Number(row.FATURAMENTO_LIQUIDO || 0);
    const metaWidth = Math.max(4, Math.round((meta / max) * 100));
    const realizadoWidth = Math.max(4, Math.round((realizado / max) * 100));
    const percent = meta > 0 ? (realizado / meta) * 100 : 0;
    const tone = percent >= 100 ? '#14591b' : percent >= 85 ? '#2c7a32' : '#d80000';
    return '<div style="margin:0 0 14px;">'
      + '<div style="display:flex;justify-content:space-between;gap:12px;font-size:14px;color:#101510;margin-bottom:2px;">'
      + '<strong style="font-weight:800;">' + escapeHtml(row.RCA || '-') + '</strong>'
      + '<span style="color:' + tone + ';font-weight:800;">' + formatPercent(percent) + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#6f756d;margin-bottom:5px;">Meta: ' + formatMoney(meta) + ' | Realizado: ' + formatMoney(realizado) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr;gap:4px;align-items:center;margin-bottom:4px;font-size:12px;color:#6f756d;">'
      + '<div style="height:7px;background:#eef2eb;border-radius:999px;overflow:hidden;"><div style="height:7px;width:' + metaWidth + '%;background:#c6d7c5;border-radius:999px;"></div></div>'
      + '</div>'
      + '<div style="height:7px;background:#eef2eb;border-radius:999px;overflow:hidden;">'
      + '<div style="height:7px;width:' + realizadoWidth + '%;background:' + tone + ';border-radius:999px;"></div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function productRows(rows) {
  if (!rows.length) return '<p style="margin:0;color:#6f756d;font-size:13px;">Sem produtos vendidos no período.</p>';
  const max = Math.max(...rows.map((row) => Number(row.VALOR || 0)), 1);
  return rows.slice(0, 10).map((row) => {
    const value = Number(row.VALOR || 0);
    const width = Math.max(5, Math.round((value / max) * 100));
    return '<div style="margin:0 0 11px;">'
      + '<div style="display:flex;justify-content:space-between;gap:12px;font-size:14px;color:#101510;margin-bottom:2px;">'
      + '<strong style="font-weight:700;">' + escapeHtml(row.DESCRICAO || ('Produto ' + (row.CODPROD || ''))) + '</strong>'
      + '<strong>' + formatMoney(value) + '</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:#6f756d;margin-bottom:5px;">Qt: ' + formatNumber(row.QT) + ' unidades</div>'
      + '<div style="height:7px;background:#eef2eb;border-radius:999px;overflow:hidden;">'
      + '<div style="height:7px;width:' + width + '%;background:#2f7d32;border-radius:999px;"></div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function dailyChart(rows) {
  if (!rows.length) return '<p style="margin:0;color:#6f756d;font-size:13px;">Sem vendas diárias no período.</p>';
  const max = Math.max(...rows.map((row) => Number(row.VALOR_LIQUIDO || 0)), 1);
  return '<div style="display:flex;align-items:flex-end;gap:34px;height:158px;padding:14px 26px 0;border-bottom:1px solid #edf0ea;background:linear-gradient(180deg,#fbfcf8 0%,#ffffff 100%);border-radius:16px;">'
    + rows.map((row, index) => {
      const value = Number(row.VALOR_LIQUIDO || 0);
      const height = Math.max(8, Math.round((value / max) * 120));
      const color = index === rows.length - 1 ? '#0d6815' : '#b8d0b9';
      return '<div style="flex:1;text-align:center;min-width:34px;">'
        + '<div title="' + escapeHtml(formatMoney(value)) + '" style="height:' + height + 'px;background:' + color + ';border-radius:8px 8px 2px 2px;margin:0 auto;width:36px;box-shadow:0 10px 20px rgba(13,104,21,.12);"></div>'
        + '<div style="font-size:11px;color:#6f756d;margin-top:8px;text-transform:uppercase;">' + escapeHtml(row.DIA_LABEL || '') + '</div>'
        + '</div>';
    }).join('')
    + '</div>';
}

function buildInsights({ kpi, vendedores, clientes, bus, dias, produtos }) {
  const insights = [];
  const liquido = Number(kpi.FATURAMENTO_LIQUIDO || 0);
  const devolvido = Number(kpi.TOTAL_DEVOLVIDO || 0);
  const bruto = Number(kpi.FATURAMENTO_BRUTO || 0);
  const devolucaoPerc = bruto > 0 ? (devolvido / bruto) * 100 : 0;
  if (liquido <= 0) insights.push('Não houve faturamento líquido positivo no período. Priorize revisão de carteira e causas de ausência de pedidos.');
  if (devolucaoPerc >= 8) insights.push('As devoluções passaram de 8% do faturamento bruto. Vale revisar clientes e produtos com maior impacto antes do próximo ciclo.');
  if (vendedores[0]) insights.push('Principal contribuição da semana: ' + vendedores[0].RCA + ' com ' + formatMoney(vendedores[0].FATURAMENTO_LIQUIDO) + '.');
  const vendedorMetaBaixa = vendedores.find((item) => Number(item.META_SEMANA || 0) > 0 && Number(item.PERCENTUAL_META || 0) < 80);
  if (vendedorMetaBaixa) insights.push(vendedorMetaBaixa.RCA + ' está abaixo de 80% da meta proporcional da semana. Recomenda-se plano de ação com foco em clientes ativos sem compra.');
  if (vendedores[0] && Number(vendedores[0].META_SEMANA || 0) > 0 && Number(vendedores[0].PERCENTUAL_META || 0) >= 100) insights.push(vendedores[0].RCA + ' superou a meta proporcional semanal e pode servir como referência de cadência comercial.');
  if (clientes[0]) insights.push('Cliente de maior faturamento: ' + clientes[0].CLIENTE + ' com ' + formatMoney(clientes[0].FATURAMENTO_LIQUIDO) + '.');
  if (produtos[0]) insights.push('Produto líder da semana: ' + produtos[0].DESCRICAO + ' com ' + formatMoney(produtos[0].VALOR) + ' e quantidade ' + formatNumber(produtos[0].QT) + '.');
  if (bus.length > 1 && Number(bus[0].FATURAMENTO_LIQUIDO || 0) > Number(bus[1].FATURAMENTO_LIQUIDO || 0) * 1.8) insights.push('A BU líder concentrou grande parte do resultado. Avalie oportunidade de ativação nas demais BUs.');
  const diasComVenda = dias.filter((row) => Number(row.VALOR_LIQUIDO || 0) > 0).length;
  if (diasComVenda > 0 && diasComVenda <= 2) insights.push('As vendas ficaram concentradas em poucos dias da semana. Acompanhe cadência de pedidos e follow-up no meio da semana.');
  if (!insights.length) insights.push('Semana com distribuição saudável de vendas e sem sinais críticos automáticos.');
  return insights;
}

function tableRows(rows, columns) {
  if (!rows.length) {
    return '<tr><td colspan="' + columns.length + '" style="padding:12px;color:#687366;border-bottom:1px solid #e6ece2;">Sem dados.</td></tr>';
  }
  return rows.map((row) => '<tr>' + columns.map((column) => {
    const raw = row[column.key];
    const value = column.money ? formatMoney(raw) : column.number ? formatNumber(raw) : raw;
    return '<td style="padding:12px 10px;border-bottom:1px solid #edf0ea;color:#1f2a1f;">' + escapeHtml(value ?? '-') + '</td>';
  }).join('') + '</tr>').join('');
}

function buildEmailHtml(data) {
  const { coordenador, periodo, kpi, vendedores, clientes, bus, dias, produtos, insights } = data;
  const insightCards = insights.slice(0, 4).map((item, index) => {
    const titles = ['Performance em risco', 'Taxa de devolução', 'Produto em destaque', 'Próxima ação'];
    return '<div style="background:#ffffff;border:1px solid #e2e7dc;border-radius:16px;padding:16px 18px;margin-bottom:14px;color:#101510;box-shadow:0 10px 24px rgba(33,42,31,.055);">'
      + '<strong style="display:block;font-size:13px;margin-bottom:6px;color:#0d6815;">' + escapeHtml(titles[index] || 'Análise') + '</strong>'
      + '<span style="display:block;font-size:13px;line-height:1.55;color:#232923;">' + escapeHtml(item) + '</span>'
      + '</div>';
  }).join('');

  return '<div style="font-family:Inter,Arial,sans-serif;background:#ecebe6;padding:34px 16px;color:#101510;">'
    + '<div style="max-width:760px;margin:0 auto;background:#f7f6f2;border:1px solid #e0e3da;border-radius:26px;overflow:hidden;box-shadow:0 28px 70px rgba(33,42,31,.12);">'
    + '<div style="background:linear-gradient(135deg,#ffffff 0%,#fbfcf8 62%,#eef6ea 100%);border-bottom:1px solid #e4e7de;padding:28px 30px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;">'
    + '<div><div style="font-size:21px;font-weight:900;letter-spacing:.02em;color:#0d6815;line-height:1;">Comercial 360</div><div style="font-size:10px;font-weight:800;letter-spacing:.18em;margin-top:5px;color:#111;">MANAGER PORTAL</div></div>'
    + '<div style="font-size:12px;color:#343a34;margin-top:4px;background:#edf7ed;border:1px solid #dceadc;border-radius:999px;padding:8px 12px;font-weight:700;">Relatório semanal</div>'
    + '</div>'
    + '<div style="padding:36px 28px 30px;">'
    + '<div style="background:#ffffff;border:1px solid #e7ebe2;border-radius:22px;padding:25px 26px;margin-bottom:22px;">'
    + '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:#8a9288;margin-bottom:8px;">Painel de coordenação</div>'
    + '<h1 style="font-size:30px;line-height:1.05;margin:0 0 8px;font-weight:900;color:#050505;">Acompanhamento semanal</h1>'
    + '<p style="font-size:15px;color:#232923;margin:0;">Performance da equipe | ' + escapeHtml(periodo.INICIO) + ' a ' + escapeHtml(periodo.FIM) + '</p>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">'
    + '<div style="background:#ffffff;border:1px solid #e2e7dc;border-radius:18px;padding:18px 18px;min-height:82px;box-shadow:0 10px 26px rgba(33,42,31,.045);"><div style="font-size:12px;font-weight:800;margin-bottom:7px;color:#1e281e;">Faturamento líquido</div><div style="font-size:24px;font-weight:900;letter-spacing:-.02em;">' + formatMoney(kpi.FATURAMENTO_LIQUIDO) + '</div><span style="display:inline-block;background:#e8f5e5;color:#0d6815;font-size:11px;font-weight:800;margin-top:8px;padding:4px 8px;border-radius:999px;">Escopo filtrado</span></div>'
    + '<div style="background:#ffffff;border:1px solid #e2e7dc;border-radius:18px;padding:18px 18px;min-height:82px;box-shadow:0 10px 26px rgba(33,42,31,.045);"><div style="font-size:12px;font-weight:800;margin-bottom:7px;color:#1e281e;">Pedidos</div><div style="font-size:24px;font-weight:900;letter-spacing:-.02em;">' + formatNumber(kpi.QTD_PEDIDOS) + '</div><span style="display:inline-block;background:#e8f5e5;color:#0d6815;font-size:11px;font-weight:800;margin-top:8px;padding:4px 8px;border-radius:999px;">Semana anterior</span></div>'
    + '<div style="background:#ffffff;border:1px solid #e2e7dc;border-radius:18px;padding:18px 18px;min-height:82px;box-shadow:0 10px 26px rgba(33,42,31,.045);"><div style="font-size:12px;font-weight:800;margin-bottom:7px;color:#1e281e;">Clientes com Compra</div><div style="font-size:24px;font-weight:900;letter-spacing:-.02em;">' + formatNumber(kpi.QTD_CLIENTES_COM_COMPRA) + '</div><span style="display:inline-block;background:#f0f1ee;color:#111;font-size:11px;font-weight:800;margin-top:8px;padding:4px 8px;border-radius:999px;">Carteira validada</span></div>'
    + '<div style="background:#fff3f1;border:1px solid #ffd8d4;border-radius:18px;padding:18px 18px;min-height:82px;box-shadow:0 10px 26px rgba(216,0,0,.045);"><div style="font-size:12px;font-weight:800;margin-bottom:7px;color:#d80000;">Devoluções</div><div style="font-size:24px;font-weight:900;color:#d80000;letter-spacing:-.02em;">' + formatMoney(kpi.TOTAL_DEVOLVIDO) + '</div><span style="display:inline-block;color:#d80000;background:#ffe2df;font-size:11px;font-weight:800;margin-top:8px;padding:4px 8px;border-radius:999px;">' + formatPercent(kpi.PERC_DEVOLUCAO) + ' do bruto</span></div>'
    + '</div>'
    + '<section style="background:#ffffff;border:1px solid #e2e7dc;border-radius:20px;padding:24px 24px;margin-bottom:24px;box-shadow:0 14px 34px rgba(33,42,31,.05);"><h2 style="font-size:18px;margin:0 0 16px;font-weight:900;">Evolução diária (seg-sex)</h2>' + dailyChart(dias) + '</section>'
    + '<section style="background:#ffffff;border:1px solid #e2e7dc;border-radius:20px;padding:24px 24px;margin-bottom:24px;box-shadow:0 14px 34px rgba(33,42,31,.05);"><h2 style="font-size:18px;margin:0 0 18px;font-weight:900;">Vendedores - Meta vs Realizado</h2>' + metaVsRealizadoChart(vendedores) + '</section>'
    + '<section style="background:#ffffff;border:1px solid #e2e7dc;border-radius:20px;padding:24px 24px;margin-bottom:24px;box-shadow:0 14px 34px rgba(33,42,31,.05);"><h2 style="font-size:18px;margin:0 0 18px;font-weight:900;">Principais Produtos</h2>' + productRows(produtos) + '</section>'
    + '<section style="background:#ffffff;border:1px solid #e2e7dc;border-radius:20px;padding:24px 24px;margin-bottom:24px;box-shadow:0 14px 34px rgba(33,42,31,.05);">'
    + '<h2 style="font-size:18px;margin:0 0 16px;font-weight:900;">Top Clientes da Semana</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:14px;overflow:hidden;"><thead><tr style="color:#111;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:#f7f8f4;">'
    + '<th style="padding:9px 0;border-bottom:1px solid #e8e8e4;">Cliente</th><th style="padding:9px 0;border-bottom:1px solid #e8e8e4;text-align:center;">Ped.</th><th style="padding:9px 0;border-bottom:1px solid #e8e8e4;text-align:right;">Valor</th>'
    + '</tr></thead><tbody>' + tableRows(clientes.slice(0, 12), [{ key: 'CLIENTE' }, { key: 'QTD_PEDIDOS', number: true }, { key: 'FATURAMENTO_LIQUIDO', money: true }]) + '</tbody></table>'
    + '</section>'
    + '<section style="background:#f8faf7;border:1px solid #e2e7dc;border-radius:22px;padding:26px 28px;margin-bottom:26px;color:#101510;box-shadow:0 18px 40px rgba(33,42,31,.08);">'
    + '<h2 style="font-size:21px;margin:0 0 18px;font-weight:900;color:#101510;">Análises e ações</h2>'
    + insightCards
    + '<div style="text-align:center;margin-top:22px;"><span style="display:inline-block;background:#0d6815;color:#ffffff;border-radius:12px;padding:14px 34px;font-size:14px;font-weight:900;box-shadow:0 10px 24px rgba(13,104,21,.18);">Visualizar plano de ação</span></div>'
    + '</section>'
    + '<div style="text-align:center;color:#7a8078;font-size:11px;line-height:1.6;margin-top:18px;">Comercial 360 - Relatório automático semanal<br/>Escopo aplicado: vendedores, filiais, departamentos e seções do coordenador.</div>'
    + '</div></div></div>';
}

async function logResultado(projectId, data) {
  await runDmlMitra({
    projectId,
    sql: 'INSERT INTO RELATORIO_SEMANAL_COORDENADORES_LOG (COD_SUPERVISOR, EMAIL_DESTINO, SEMANA_REFERENCIA, DATA_INICIO, DATA_FIM, FATURAMENTO_LIQUIDO, TOTAL_PEDIDOS, ENVIADO_EM, STATUS, ERRO) VALUES ('
      + Number(data.codSupervisor) + ', '
      + "'" + escapeSql(data.email) + "', "
      + "'" + escapeSql(data.semana) + "', "
      + "'" + escapeSql(data.inicio) + "', "
      + "'" + escapeSql(data.fim) + "', "
      + Number(data.faturamento || 0) + ', '
      + Number(data.pedidos || 0) + ', CURRENT_TIMESTAMP, '
      + "'" + escapeSql(data.status) + "', "
      + "'" + escapeSql(data.erro || '') + "') "
      + 'ON DUPLICATE KEY UPDATE EMAIL_DESTINO = VALUES(EMAIL_DESTINO), FATURAMENTO_LIQUIDO = VALUES(FATURAMENTO_LIQUIDO), TOTAL_PEDIDOS = VALUES(TOTAL_PEDIDOS), ENVIADO_EM = VALUES(ENVIADO_EM), STATUS = VALUES(STATUS), ERRO = VALUES(ERRO)',
  });
}

function territorioMatch(sourceAlias, buAlias) {
  return " TRIM(COALESCE(CAST(" + buAlias + ".CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(" + sourceAlias + ".CODFILIAL AS CHAR), ''))"
    + " AND TRIM(CAST(" + buAlias + ".BU_CODIGO AS CHAR)) = TRIM(CAST(" + sourceAlias + ".CODEPTO AS CHAR))"
    + " AND ((" + buAlias + ".ID_SECAO IS NOT NULL AND (TRIM(CAST(" + buAlias + ".ID_SECAO AS CHAR)) = TRIM(CAST(" + sourceAlias + ".CODSEC AS CHAR)) OR LPAD(TRIM(CAST(" + buAlias + ".ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(" + sourceAlias + ".CODSEC AS CHAR))))"
    + " OR (" + buAlias + ".ID_SECAO IS NULL AND NOT EXISTS (SELECT 1 FROM BU_VENDEDOR BV2 WHERE BV2.VENDEDOR_ID = " + buAlias + ".VENDEDOR_ID AND TRIM(COALESCE(CAST(BV2.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(" + buAlias + ".CODFILIAL AS CHAR), '')) AND TRIM(CAST(BV2.BU_CODIGO AS CHAR)) = TRIM(CAST(" + buAlias + ".BU_CODIGO AS CHAR)) AND BV2.ID_SECAO IS NOT NULL AND (TRIM(CAST(BV2.ID_SECAO AS CHAR)) = TRIM(CAST(" + sourceAlias + ".CODSEC AS CHAR)) OR LPAD(TRIM(CAST(BV2.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(" + sourceAlias + ".CODSEC AS CHAR)))))"
    + ")";
}

function scopedSalesWhere(alias, codSupervisor, periodo) {
  return " FROM (SELECT DISTINCT V.*, EC.ID_VENDEDOR AS VENDEDOR_ATRIBUIDO "
    + "FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V "
    + "JOIN CLIENTES CCLI ON TRIM(CAST(COALESCE(CCLI.WINTHOR_CODCLI, CCLI.ID) AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR)) "
    + "JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = CCLI.ID "
    + "JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(BV.ATIVO, TRUE) = TRUE AND " + territorioMatch('V', 'BV') + " "
    + "JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = " + Number(codSupervisor)
    + " AND TRIM(COALESCE(CAST(CB.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), ''))"
    + " AND TRIM(CAST(CB.CODEPTO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR)) "
    + "WHERE SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) >= '" + escapeSql(periodo.INICIO) + "'"
    + " AND SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) < '" + escapeSql(periodo.FIM_EXCLUSIVO) + "') " + alias;
}

function scopedReturnsWhere(alias, codSupervisor, periodo) {
  return " FROM (SELECT DISTINCT D.*, EC.ID_VENDEDOR AS VENDEDOR_ATRIBUIDO "
    + "FROM IMP_DEVOLUCOES_TOTVS D "
    + "JOIN CLIENTES CCLI ON TRIM(CAST(COALESCE(CCLI.WINTHOR_CODCLI, CCLI.ID) AS CHAR)) = TRIM(CAST(D.CODCLI AS CHAR)) "
    + "JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = CCLI.ID "
    + "JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(BV.ATIVO, TRUE) = TRUE AND " + territorioMatch('D', 'BV') + " "
    + "JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = " + Number(codSupervisor)
    + " AND TRIM(COALESCE(CAST(CB.CODFILIAL AS CHAR), '')) = TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), ''))"
    + " AND TRIM(CAST(CB.CODEPTO AS CHAR)) = TRIM(CAST(BV.BU_CODIGO AS CHAR)) "
    + "WHERE SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) >= '" + escapeSql(periodo.INICIO) + "'"
    + " AND SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10) < '" + escapeSql(periodo.FIM_EXCLUSIVO) + "') " + alias;
}

async function loadReportData(projectId, coordenador, periodo) {
  const cod = Number(coordenador.COD_SUPERVISOR);
  const salesFrom = scopedSalesWhere('V', cod, periodo);
  const returnsFrom = scopedReturnsWhere('D', cod, periodo);

  const kpiRows = await query(projectId,
    "SELECT "
    + "ROUND(COALESCE((SELECT SUM(COALESCE(V.TOTAL, 0))" + salesFrom + "), 0), 2) AS FATURAMENTO_BRUTO, "
    + "ROUND(COALESCE((SELECT SUM(COALESCE(D.VALOR_DEVOLVIDO, 0))" + returnsFrom + "), 0), 2) AS TOTAL_DEVOLVIDO, "
    + "COUNT(DISTINCT V.NUMPED) AS QTD_PEDIDOS, "
    + "COUNT(DISTINCT V.CODCLI) AS QTD_CLIENTES_COM_COMPRA "
    + salesFrom
  );
  const kpi = kpiRows[0] || {};
  kpi.FATURAMENTO_LIQUIDO = Number(kpi.FATURAMENTO_BRUTO || 0) - Number(kpi.TOTAL_DEVOLVIDO || 0);
  kpi.PERC_DEVOLUCAO = Number(kpi.FATURAMENTO_BRUTO || 0) > 0 ? (Number(kpi.TOTAL_DEVOLVIDO || 0) / Number(kpi.FATURAMENTO_BRUTO || 0)) * 100 : 0;

  const vendedores = await query(projectId,
    "WITH VENDAS_VENDEDOR AS ("
    + "SELECT V.VENDEDOR_ATRIBUIDO AS USER_ID, COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO) AS COD_RCA, COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(RT.RCA_NOME), ''), CONCAT('Vendedor ', V.VENDEDOR_ATRIBUIDO)) AS RCA, "
    + "ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO_LIQUIDO, COUNT(DISTINCT V.NUMPED) AS QTD_PEDIDOS "
    + salesFrom
    + " LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = V.VENDEDOR_ATRIBUIDO LEFT JOIN FUNCIONARIOS F ON F.ID = V.VENDEDOR_ATRIBUIDO LEFT JOIN RCA_TOTVS RT ON RT.COD_RCA = VR.COD_RCA GROUP BY V.VENDEDOR_ATRIBUIDO, COALESCE(VR.COD_RCA, V.VENDEDOR_ATRIBUIDO), COALESCE(NULLIF(TRIM(F.NOME), ''), NULLIF(TRIM(RT.RCA_NOME), ''), CONCAT('Vendedor ', V.VENDEDOR_ATRIBUIDO))), "
    + "METAS_VENDEDOR_SEMANA AS ("
    + "SELECT MV.USER_ID, ROUND(SUM(COALESCE(MV.VALOR_META, 0) / DAY(LAST_DAY(STR_TO_DATE(CONCAT(MV.ANO, '-', LPAD(MV.MES, 2, '0'), '-01'), '%Y-%m-%d'))) * "
    + "GREATEST(DATEDIFF(LEAST(LAST_DAY(STR_TO_DATE(CONCAT(MV.ANO, '-', LPAD(MV.MES, 2, '0'), '-01'), '%Y-%m-%d')), STR_TO_DATE('" + escapeSql(periodo.FIM) + "', '%Y-%m-%d')), "
    + "GREATEST(STR_TO_DATE(CONCAT(MV.ANO, '-', LPAD(MV.MES, 2, '0'), '-01'), '%Y-%m-%d'), STR_TO_DATE('" + escapeSql(periodo.INICIO) + "', '%Y-%m-%d'))) + 1, 0)), 2) AS META_SEMANA "
    + "FROM METAS_VENDEDOR MV "
    + "WHERE STR_TO_DATE(CONCAT(MV.ANO, '-', LPAD(MV.MES, 2, '0'), '-01'), '%Y-%m-%d') <= STR_TO_DATE('" + escapeSql(periodo.FIM) + "', '%Y-%m-%d') "
    + "AND LAST_DAY(STR_TO_DATE(CONCAT(MV.ANO, '-', LPAD(MV.MES, 2, '0'), '-01'), '%Y-%m-%d')) >= STR_TO_DATE('" + escapeSql(periodo.INICIO) + "', '%Y-%m-%d') "
    + "GROUP BY MV.USER_ID) "
    + "SELECT VV.COD_RCA, VV.RCA, VV.FATURAMENTO_LIQUIDO, VV.QTD_PEDIDOS, COALESCE(MV.META_SEMANA, 0) AS META_SEMANA, "
    + "CASE WHEN COALESCE(MV.META_SEMANA, 0) <= 0 THEN 0 ELSE ROUND((VV.FATURAMENTO_LIQUIDO / MV.META_SEMANA) * 100, 2) END AS PERCENTUAL_META "
    + "FROM VENDAS_VENDEDOR VV LEFT JOIN METAS_VENDEDOR_SEMANA MV ON MV.USER_ID = VV.USER_ID "
    + "ORDER BY VV.FATURAMENTO_LIQUIDO DESC LIMIT 10"
  );

  const clientes = await query(projectId,
    "SELECT COALESCE(NULLIF(TRIM(CAST(V.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', V.CODCLI)) AS CLIENTE, "
    + "ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO_LIQUIDO, COUNT(DISTINCT V.NUMPED) AS QTD_PEDIDOS "
    + salesFrom
    + " GROUP BY COALESCE(NULLIF(TRIM(CAST(V.CLIENTE AS CHAR)), ''), CONCAT('Cliente ', V.CODCLI)) ORDER BY FATURAMENTO_LIQUIDO DESC LIMIT 12"
  );

  const produtos = await query(projectId,
    "SELECT V.CODPROD, COALESCE(NULLIF(TRIM(CAST(MAX(V.DESCRICAO) AS CHAR)), ''), CONCAT('Produto ', V.CODPROD)) AS DESCRICAO, "
    + "ROUND(SUM(COALESCE(V.QT, 0)), 2) AS QT, ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VALOR "
    + salesFrom
    + " WHERE V.CODPROD IS NOT NULL "
    + "GROUP BY V.CODPROD ORDER BY VALOR DESC LIMIT 12"
  );

  const bus = await query(projectId,
    "SELECT CONCAT('Filial ', TRIM(CAST(V.CODFILIAL AS CHAR)), ' / Depto ', TRIM(CAST(V.CODEPTO AS CHAR)), ' / Secao ', COALESCE(TRIM(CAST(V.CODSEC AS CHAR)), 'Todas')) AS BU_LABEL, "
    + "ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS FATURAMENTO_LIQUIDO "
    + salesFrom
    + " GROUP BY TRIM(CAST(V.CODFILIAL AS CHAR)), TRIM(CAST(V.CODEPTO AS CHAR)), COALESCE(TRIM(CAST(V.CODSEC AS CHAR)), 'Todas') ORDER BY FATURAMENTO_LIQUIDO DESC LIMIT 10"
  );

  const dias = await query(projectId,
    "SELECT SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) AS DIA, DATE_FORMAT(STR_TO_DATE(SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10), '%Y-%m-%d'), '%d/%m') AS DIA_LABEL, "
    + "ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS VALOR_LIQUIDO "
    + salesFrom
    + " GROUP BY SUBSTRING(CAST(V.DTSAIDA AS CHAR), 1, 10) ORDER BY DIA"
  );

  const insights = buildInsights({ kpi, vendedores, clientes, bus, dias, produtos });
  return { kpi, vendedores, clientes, bus, dias, produtos, insights };
}

async function run() {
  const evt = typeof event === 'object' && event ? event : {};
  const ctx = typeof context === 'object' && context ? context : {};
  const projectId = Number(process.env.MITRA_PROJECT_ID || ctx.projectId || evt.projectId || 45654);
  if (!projectId) return { rows: [{ STATUS: 'FAILED', MENSAGEM: 'projectId nao identificado.' }] };

  const dryRun = ['true', '1', 'sim', 's'].includes(String(evt.dryRun || '').toLowerCase());
  const force = ['true', '1', 'sim', 's'].includes(String(evt.force || '').toLowerCase());
  const onlyEmail = String(evt.email || '').trim().toLowerCase();
  const previewEmail = String(evt.previewEmail || '').trim().toLowerCase();

  const periodoRows = await query(projectId,
    "SELECT "
    + "COALESCE(NULLIF('" + escapeSql(evt.dataInicio || '') + "', ''), DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) + 7 DAY), '%Y-%m-%d')) AS INICIO, "
    + "COALESCE(NULLIF('" + escapeSql(evt.dataFim || '') + "', ''), DATE_FORMAT(DATE_SUB(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), INTERVAL 1 DAY), '%Y-%m-%d')) AS FIM, "
    + "DATE_FORMAT(DATE_ADD(STR_TO_DATE(COALESCE(NULLIF('" + escapeSql(evt.dataFim || '') + "', ''), DATE_FORMAT(DATE_SUB(DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY), INTERVAL 1 DAY), '%Y-%m-%d')), '%Y-%m-%d'), INTERVAL 1 DAY), '%Y-%m-%d') AS FIM_EXCLUSIVO"
  );
  const periodo = periodoRows[0] || {};
  periodo.SEMANA_REFERENCIA = String(periodo.INICIO || '') + '_' + String(periodo.FIM || '');

  const coordenadores = await query(projectId,
    "SELECT C.COD_SUPERVISOR, C.NOME, COALESCE(NULLIF(C.EMAIL, ''), U.DESCR) AS EMAIL "
    + "FROM COORDENADORES C LEFT JOIN INT_USER U ON U.ID = C.USER_ID "
    + "WHERE COALESCE(C.ATIVO, TRUE) = TRUE "
    + "AND COALESCE(NULLIF(C.EMAIL, ''), U.DESCR) LIKE '%@%' "
    + "AND EXISTS (SELECT 1 FROM COORDENADORES_BU CB WHERE CB.COD_SUPERVISOR = C.COD_SUPERVISOR) "
    + (onlyEmail ? "AND LOWER(COALESCE(NULLIF(C.EMAIL, ''), U.DESCR)) = '" + escapeSql(onlyEmail) + "' " : '')
    + "ORDER BY C.NOME, C.EMAIL"
  );

  const enviadosRows = await query(projectId,
    "SELECT COD_SUPERVISOR FROM RELATORIO_SEMANAL_COORDENADORES_LOG WHERE SEMANA_REFERENCIA = '" + escapeSql(periodo.SEMANA_REFERENCIA) + "' AND STATUS = 'ENVIADO'"
  );
  const enviados = new Set(enviadosRows.map((row) => Number(row.COD_SUPERVISOR || 0)));
  const resultados = [];

  for (const coordenador of coordenadores) {
    const cod = Number(coordenador.COD_SUPERVISOR || 0);
    const email = String(coordenador.EMAIL || '').trim();
    const emailDestino = previewEmail || email;
    if (!cod || !email) continue;
    if (!force && enviados.has(cod)) {
      resultados.push({ STATUS: 'JA_ENVIADO', COD_SUPERVISOR: cod, EMAIL: email, SEMANA_REFERENCIA: periodo.SEMANA_REFERENCIA });
      continue;
    }

    try {
      const reportData = await loadReportData(projectId, coordenador, periodo);
      if (dryRun) {
        resultados.push({ STATUS: 'DRY_RUN', COD_SUPERVISOR: cod, EMAIL: email, FATURAMENTO_LIQUIDO: reportData.kpi.FATURAMENTO_LIQUIDO, TOTAL_PEDIDOS: reportData.kpi.QTD_PEDIDOS });
        continue;
      }
      const body = buildEmailHtml({ coordenador, periodo, ...reportData });
      await sendEmailMitra({
        projectId,
        to: [emailDestino],
        subject: 'Relatório semanal de vendas - ' + periodo.INICIO + ' a ' + periodo.FIM,
        body,
      });
      if (!previewEmail) {
        await logResultado(projectId, {
          codSupervisor: cod,
          email,
          semana: periodo.SEMANA_REFERENCIA,
          inicio: periodo.INICIO,
          fim: periodo.FIM,
          faturamento: reportData.kpi.FATURAMENTO_LIQUIDO,
          pedidos: reportData.kpi.QTD_PEDIDOS,
          status: 'ENVIADO',
        });
      }
      resultados.push({ STATUS: previewEmail ? 'PREVIEW_ENVIADO' : 'ENVIADO', COD_SUPERVISOR: cod, EMAIL: emailDestino, FATURAMENTO_LIQUIDO: reportData.kpi.FATURAMENTO_LIQUIDO, TOTAL_PEDIDOS: reportData.kpi.QTD_PEDIDOS });
      if (previewEmail) break;
    } catch (error) {
      const erro = (error instanceof Error ? error.message : JSON.stringify(error || {})).slice(0, 1000);
      await logResultado(projectId, { codSupervisor: cod, email, semana: periodo.SEMANA_REFERENCIA, inicio: periodo.INICIO, fim: periodo.FIM, status: 'ERRO', erro });
      resultados.push({ STATUS: 'ERRO', COD_SUPERVISOR: cod, EMAIL: email, ERRO: erro });
    }
  }

  return { rows: resultados.length ? resultados : [{ STATUS: dryRun ? 'DRY_RUN_SEM_COORDENADORES' : 'SEM_COORDENADORES', SEMANA_REFERENCIA: periodo.SEMANA_REFERENCIA }] };
}

return run();
