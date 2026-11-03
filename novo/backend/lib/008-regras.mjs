// Regras da spec 008 que rodam no servidor, dentro das SFs JAVASCRIPT (fila de
// alertas, e-mails semanais, prospeccao, clientes criticos).
//
// Como em 002-regras.mjs: o add-008 publica o TEXTO destas funcoes, entao elas
// so usam umas as outras e as de 002-regras.mjs (importadas abaixo para o
// smoke chamar direto; no corpo da SF elas vao junto, com o mesmo nome).
// Constante usada por uma funcao entra em CONSTANTES_008.
// Datas sempre 'AAAA-MM-DD' (Brasilia).

import { diasEntre, somarDias, linhaCarteira, scoreRanking, curvaAuto, palavrasBusca, camposBusca, relevancia } from './002-regras.mjs';

/* ─────────────── datas ─────────────── */

// Mesmo dia `n` meses antes (ou o ultimo dia do mes, se ele for menor).
export function menosMeses(data, n) {
  const [y, m, d] = String(data).slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 - n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.toISOString().slice(0, 7)}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export function arred2(x) {
  return Math.round(Number(x) * 100) / 100;
}

// RNT-005: semanas operacionais (sexta a quinta, recortadas no mes) de 'AAAA-MM'.
export function semanasOperacionais(mes) {
  const [y, m] = String(mes).split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const iso = (d) => `${mes}-${String(d).padStart(2, '0')}`;
  const semanas = [];
  for (let ini = 1; ini <= ultimo;) {
    let fim = ini;
    while (fim < ultimo && new Date(Date.UTC(y, m - 1, fim)).getUTCDay() !== 4) fim += 1;
    semanas.push({ n: semanas.length + 1, inicio: iso(ini), fim: iso(fim) });
    ini = fim + 1;
  }
  return semanas;
}

export function semanaOperacionalDe(data) {
  const dia = String(data).slice(0, 10);
  return semanasOperacionais(dia.slice(0, 7)).find((s) => s.inicio <= dia && dia <= s.fim);
}

/* ─────────────── geracao de alertas (RN-002…007) ─────────────── */
// `vendas`: linhas do cliente numa BU { NUMPED, DIA, CODPROD, DESCRICAO, VALOR }.

export function porProduto(vendas) {
  const mapa = new Map();
  for (const v of vendas) {
    const chave = String(v.CODPROD);
    if (!mapa.has(chave)) mapa.set(chave, { codprod: chave, nome: `${v.CODPROD} - ${v.DESCRICAO ?? ''}`.trim(), linhas: [] });
    mapa.get(chave).linhas.push(v);
  }
  return [...mapa.values()];
}

export function soma(linhas) {
  return linhas.reduce((t, l) => t + Number(l.VALOR || 0), 0);
}

// RN-002: comprado entre 12 e 3 meses atras e nao nos ultimos 3. Ate 3, Alta.
export function produtoPerdido(vendas, hoje) {
  const ini = menosMeses(hoje, 12);
  const corte = menosMeses(hoje, 3);
  return porProduto(vendas)
    .map((p) => {
      const antes = p.linhas.filter((l) => l.DIA >= ini && l.DIA < corte);
      const recentes = p.linhas.filter((l) => l.DIA >= corte && l.DIA <= hoje);
      if (!antes.length || recentes.length) return null;
      const meses = new Set(antes.map((l) => l.DIA.slice(0, 7))).size;
      return { TIPO: 'PRODUTO_PERDIDO', PRIORIDADE: 'ALTA', PRODUTO: p.nome, VALOR: arred2(soma(antes) / meses),
        TITULO: `Cliente parou de comprar ${p.nome}`,
        DESCRICAO: `Comprou em ${meses} ${meses === 1 ? 'mês' : 'meses'} entre 12 e 3 meses atrás e não compra há mais de 3 meses.` };
    })
    .filter(Boolean)
    .sort((a, b) => b.VALOR - a.VALOR)
    .slice(0, 3);
}

// RN-003: comprado no mesmo mes de anos anteriores e ainda nao no mes corrente. Ate 3, Alta.
export function sazonalidade(vendas, hoje) {
  const mes = hoje.slice(0, 7);
  const mm = hoje.slice(5, 7);
  return porProduto(vendas)
    .map((p) => {
      if (p.linhas.some((l) => l.DIA.slice(0, 7) === mes)) return null;
      const doMes = p.linhas.filter((l) => l.DIA.slice(5, 7) === mm && l.DIA.slice(0, 7) < mes);
      if (!doMes.length) return null;
      const anos = new Set(doMes.map((l) => l.DIA.slice(0, 4))).size;
      return { TIPO: 'SAZONALIDADE', PRIORIDADE: 'ALTA', PRODUTO: p.nome, VALOR: arred2(soma(doMes) / anos),
        TITULO: `Época de compra: ${p.nome}`,
        DESCRICAO: 'O cliente comprou este produto neste mesmo mês no ano anterior e ainda não comprou este mês.' };
    })
    .filter(Boolean)
    .sort((a, b) => b.VALOR - a.VALOR)
    .slice(0, 3);
}

// RN-004: 2+ compras em 12 meses; ultima + intervalo medio cai de hoje a hoje + 7. Ate 3, Media, R$ 0.
export function reposicao(vendas, hoje) {
  const ini = menosMeses(hoje, 12);
  const limite = somarDias(hoje, 7);
  return porProduto(vendas)
    .map((p) => {
      const dias = [...new Set(p.linhas.filter((l) => l.DIA >= ini && l.DIA <= hoje).map((l) => l.DIA))].sort();
      if (dias.length < 2) return null;
      const ciclo = diasEntre(dias[dias.length - 1], dias[0]) / (dias.length - 1);
      const prevista = somarDias(dias[dias.length - 1], Math.round(ciclo));
      if (prevista < hoje || prevista > limite) return null;
      return { TIPO: 'REPOSICAO', PRIORIDADE: 'MEDIA', PRODUTO: p.nome, VALOR: 0, PREVISTA: prevista,
        TITULO: `Reposição prevista: ${p.nome}`,
        DESCRICAO: `Compra a cada ${Math.round(ciclo)} dias; a próxima está prevista para ${prevista.split('-').reverse().join('/')}.` };
    })
    .filter(Boolean)
    .sort((a, b) => (a.PREVISTA < b.PREVISTA ? -1 : a.PREVISTA > b.PREVISTA ? 1 : 0))
    .slice(0, 3)
    .map(({ PREVISTA, ...a }) => a);
}

// RN-005: ultimos 3 meses > 120% dos 3 anteriores (anteriores > 0). Media.
export function volumeCrescente(vendas, hoje) {
  const m3 = menosMeses(hoje, 3);
  const m6 = menosMeses(hoje, 6);
  const ultimos = soma(vendas.filter((l) => l.DIA >= m3 && l.DIA <= hoje));
  const anteriores = soma(vendas.filter((l) => l.DIA >= m6 && l.DIA < m3));
  if (!(anteriores > 0) || ultimos * 100 <= anteriores * 120) return [];
  const pct = Math.round(((ultimos - anteriores) * 1000) / anteriores) / 10;
  return [{ TIPO: 'VOLUME_CRESCENTE', PRIORIDADE: 'MEDIA', PRODUTO: null, VALOR: arred2(ultimos),
    TITULO: 'Volume de compras em alta',
    DESCRICAO: `Os últimos 3 meses somam ${pct.toLocaleString('pt-BR')}% a mais que os 3 meses anteriores.` }];
}

// RN-006: produto que 2+ clientes do mesmo ramo (na mesma BU) compraram em 12
// meses e o cliente nunca. `outros`: vendas dos outros clientes do ramo. Ate 3, Baixa.
export function naoExplorado(vendas, outros, hoje) {
  const ini = menosMeses(hoje, 12);
  const meus = new Set(vendas.map((l) => String(l.CODPROD)));
  return porProduto(outros.filter((l) => l.DIA >= ini && l.DIA <= hoje))
    .filter((p) => !meus.has(p.codprod))
    .map((p) => ({ p, clientes: new Set(p.linhas.map((l) => String(l.ID_CLIENTE))).size }))
    .filter(({ clientes }) => clientes >= 2)
    .map(({ p, clientes }) => ({ TIPO: 'NAO_EXPLORADO', PRIORIDADE: 'BAIXA', PRODUTO: p.nome, VALOR: arred2(soma(p.linhas) / 12), CLIENTES: clientes,
      TITULO: `Produto não explorado: ${p.nome}`,
      DESCRICAO: `${clientes} clientes do mesmo ramo na sua carteira compram este produto; este cliente nunca comprou.` }))
    .sort((a, b) => b.CLIENTES - a.CLIENTES || b.VALOR - a.VALOR)
    .slice(0, 3)
    .map(({ CLIENTES, ...a }) => a);
}

// RN-007: pedido dos ultimos 7 dias abaixo de 50% da media dos anteriores. Um por cliente, Media.
export function pedidoIncompleto(vendas, hoje) {
  const pedidos = new Map();
  for (const l of vendas) {
    const p = pedidos.get(l.NUMPED) || { numped: l.NUMPED, dia: l.DIA, valor: 0 };
    p.valor += Number(l.VALOR || 0);
    if (l.DIA < p.dia) p.dia = l.DIA;
    pedidos.set(l.NUMPED, p);
  }
  const lista = [...pedidos.values()].sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  const desde = somarDias(hoje, -6);
  for (const pedido of lista.filter((p) => p.dia >= desde && p.dia <= hoje)) {
    const anteriores = lista.filter((p) => p.dia < pedido.dia);
    if (!anteriores.length) continue;
    const media = anteriores.reduce((t, p) => t + p.valor, 0) / anteriores.length;
    if (pedido.valor * 2 < media) {
      return [{ TIPO: 'PEDIDO_INCOMPLETO', PRIORIDADE: 'MEDIA', PRODUTO: null, VALOR: arred2(pedido.valor),
        TITULO: `Pedido ${pedido.numped} abaixo do habitual`,
        DESCRICAO: `O pedido ficou abaixo da metade da média dos pedidos anteriores (média de R$ ${arred2(media).toLocaleString('pt-BR')}).` }];
    }
  }
  return [];
}

export function chaveLinha(l) {
  const n = (x) => (x == null || String(x).trim() === '' ? '' : String(Number(x)));
  return [n(l.CODFILIAL), n(l.CODEPTO), n(l.ID_SECAO)].join('|');
}

/**
 * RN-001: alertas de um vendedor. `carteira`: linhas de carteiraDoVendedor com
 * NOME e RAMO; `vendas`: vendas de 12+ meses ja casadas com a linha (mesmas
 * colunas da linha + NUMPED, DIA, CODPROD, DESCRICAO, VALOR). `clienteId`
 * opcional (item de cliente da fila).
 */
export function gerarAlertas({ carteira, vendas, hoje, clienteId = null }) {
  const ini = menosMeses(hoje, 12);
  const porLinha = new Map();
  for (const v of vendas) {
    const chave = `${v.ID_CLIENTE}#${chaveLinha(v)}`;
    if (!porLinha.has(chave)) porLinha.set(chave, []);
    porLinha.get(chave).push(v);
  }
  const ramo = new Map(carteira.map((c) => [String(c.ID_CLIENTE), String(c.RAMO || '')]));
  const alertas = [];
  for (const c of carteira) {
    if (clienteId != null && Number(c.ID_CLIENTE) !== Number(clienteId)) continue;
    const meus = porLinha.get(`${c.ID_CLIENTE}#${chaveLinha(c)}`) || [];
    if (!meus.some((l) => l.DIA >= ini && l.DIA <= hoje)) continue;
    const r = ramo.get(String(c.ID_CLIENTE));
    const outros = r && r !== 'Sem ramo'
      ? vendas.filter((v) => String(v.ID_CLIENTE) !== String(c.ID_CLIENTE) && ramo.get(String(v.ID_CLIENTE)) === r && chaveLinha(v) === chaveLinha(c))
      : [];
    const achados = [
      ...produtoPerdido(meus, hoje), ...sazonalidade(meus, hoje), ...reposicao(meus, hoje),
      ...volumeCrescente(meus, hoje), ...naoExplorado(meus, outros, hoje), ...pedidoIncompleto(meus, hoje),
    ];
    for (const a of achados) {
      alertas.push({ ...a, VENDEDOR_ID: Number(c.VENDEDOR_ID), ID_CLIENTE: Number(c.ID_CLIENTE), NOME_CLIENTE: c.NOME,
        CODFILIAL: c.CODFILIAL, CODEPTO: c.CODEPTO, ID_SECAO: c.ID_SECAO ?? null, RAMO: r || null, MES_REFERENCIA: hoje.slice(0, 7) });
    }
  }
  return alertas;
}

// RN-008: vendedor, BU, cliente, tipo, mes de referencia e produto.
export function chaveAlerta(a) {
  return [Number(a.VENDEDOR_ID ?? a.ID_VENDEDOR), chaveLinha(a), Number(a.ID_CLIENTE), a.TIPO ?? a.TIPO_ALERTA,
    a.MES_REFERENCIA ?? '', a.PRODUTO ?? a.PRODUTO_REFERENCIA ?? ''].join('#');
}

export function semDuplicados(novos, naoLidos) {
  const vistos = new Set(naoLidos.map(chaveAlerta));
  return novos.filter((a) => {
    const chave = chaveAlerta(a);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/* ─────────────── fila (RN-016, RNF-001) ─────────────── */

// Minutos entre dois 'AAAA-MM-DD HH:MM:SS' (ou com T).
export function minutosEntre(depois, antes) {
  const t = (x) => Date.parse(`${String(x).replace(' ', 'T').slice(0, 19)}Z`);
  return (t(depois) - t(antes)) / 60000;
}

// Itens da fila do dia -> quem vira erro (preso ha mais de 20 min) e quem processar agora.
export function planoFila(itens, agora, limite = 3) {
  const expirar = itens.filter((i) => i.STATUS === 'PROCESSANDO' && i.INICIADO_EM && minutosEntre(agora, i.INICIADO_EM) > 20).map((i) => Number(i.ID));
  const processar = itens.filter((i) => i.STATUS === 'PENDENTE').sort((a, b) => Number(a.ID) - Number(b.ID)).slice(0, limite);
  return { expirar, processar };
}

// Vendedor que falhou inteiro: um item por cliente da carteira.
export function itensPorCliente(vendedorId, carteira) {
  return [...new Set(carteira.map((c) => Number(c.ID_CLIENTE)))].map((id) => ({ VENDEDOR_ID: Number(vendedorId), CLIENTE_ID: id }));
}

/* ─────────────── e-mails semanais (RN-017, RN-018) ─────────────── */

export const ORDEM_PRIORIDADE = { ALTA: 1, MEDIA: 2, BAIXA: 3 };

export function moedaBR(x) {
  return `R$ ${arred2(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dataBR(iso) {
  return String(iso ?? '').slice(0, 10).split('-').reverse().join('/');
}

export function escHtml(x) {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const NOTA_RESUMO = 'Mostrando os 30 avisos de maior prioridade. Acesse a tela de Alertas para ver todos.';

// RN-017: ate 30 por prioridade e data (mais recente primeiro).
export function linhasResumo(avisos) {
  const ordenados = [...avisos].sort((a, b) => (ORDEM_PRIORIDADE[a.PRIORIDADE] ?? 9) - (ORDEM_PRIORIDADE[b.PRIORIDADE] ?? 9)
    || String(b.DATA_GERACAO).localeCompare(String(a.DATA_GERACAO)) || Number(b.ID) - Number(a.ID));
  return { linhas: ordenados.slice(0, 30), nota: ordenados.length > 30 ? NOTA_RESUMO : '' };
}

export function tabelaHtml(cabecalho, linhas) {
  const th = cabecalho.map((c) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">${escHtml(c)}</th>`).join('');
  const tr = linhas.map((l) => `<tr>${l.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;width:100%"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function htmlResumo(nome, resumo, total) {
  const rotulo = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
  const tabela = tabelaHtml(['Cliente', 'Aviso', 'Prioridade', 'Valor', 'Gerado em'],
    resumo.linhas.map((a) => [a.NOME_CLIENTE, a.TITULO, rotulo[a.PRIORIDADE] ?? a.PRIORIDADE, moedaBR(a.VALOR_REFERENCIA || 0), dataBR(a.DATA_GERACAO)]));
  return `<div style="font-family:Arial,sans-serif;font-size:14px"><p>Olá, ${escHtml(nome)}.</p>`
    + `<p>Nos últimos 7 dias foram gerados ${total} avisos comerciais para a sua carteira.</p>${tabela}`
    + `${resumo.nota ? `<p><em>${escHtml(resumo.nota)}</em></p>` : ''}</div>`;
}

// RN-018: ultima semana operacional ja encerrada antes do dia da execucao.
export function periodoRelatorio(execucao) {
  const ontem = somarDias(execucao, -1);
  const semana = semanaOperacionalDe(ontem);
  return semana.fim <= ontem ? semana : semanaOperacionalDe(somarDias(semana.inicio, -1));
}

// RNT-009 / RN-018: meta do mes / dias do mes x dias do periodo (dentro do mes).
export function metaProporcional(metaMes, inicio, fim) {
  const [y, m] = inicio.split('-').map(Number);
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return arred2((Number(metaMes || 0) / diasMes) * (diasEntre(fim, inicio) + 1));
}

/**
 * Relatorio de um coordenador. `vendas` e `devolucoes`: uma linha por item
 * atribuido a um vendedor { LINHA_ID, VENDEDOR_ID, VENDEDOR, CODCLI, CLIENTE,
 * BU, DIA, NUMPED, PRODUTO, VALOR }; `metas`: { VENDEDOR_ID, META } do mes.
 * O cabecalho soma cada item uma vez (LINHA_ID); o ranking, por vendedor.
 */
export function montarRelatorio({ vendas, devolucoes, metas, periodo }) {
  const unicos = (linhas) => [...new Map(linhas.map((l) => [l.LINHA_ID, l])).values()];
  const somar = (linhas) => arred2(soma(linhas));
  const agrupar = (chave, nome) => {
    const mapa = new Map();
    const add = (l, campo) => {
      const k = String(l[chave]);
      const g = mapa.get(k) || { chave: k, nome: l[nome], bruto: 0, devolucao: 0 };
      g[campo] += Number(l.VALOR || 0);
      mapa.set(k, g);
    };
    vendas.forEach((l) => add(l, 'bruto'));
    devolucoes.forEach((l) => add(l, 'devolucao'));
    return [...mapa.values()].map((g) => ({ ...g, bruto: arred2(g.bruto), devolucao: arred2(g.devolucao), liquido: arred2(g.bruto - g.devolucao) }))
      .sort((a, b) => b.liquido - a.liquido);
  };
  const bruto = somar(unicos(vendas));
  const devolucao = somar(unicos(devolucoes));
  const metaDe = new Map(metas.map((m) => [String(m.VENDEDOR_ID), Number(m.META || 0)]));
  const vendedores = agrupar('VENDEDOR_ID', 'VENDEDOR').map((v) => {
    const meta = metaDe.get(v.chave) || 0;
    const proporcional = metaProporcional(meta, periodo.inicio, periodo.fim);
    return { ...v, meta, metaProporcional: proporcional, atingido: proporcional > 0 ? Math.round((v.liquido * 1000) / proporcional) / 10 : null };
  });
  const analises = [];
  if (bruto > 0 && devolucao * 100 >= bruto * 8) analises.push(`Devolução de ${(Math.round((devolucao * 1000) / bruto) / 10).toLocaleString('pt-BR')}% do faturamento bruto na semana.`);
  for (const v of vendedores) {
    if (v.atingido == null) continue;
    if (v.atingido < 80) analises.push(`${v.nome}: ${v.atingido.toLocaleString('pt-BR')}% da meta proporcional da semana.`);
    else if (v.atingido >= 100) analises.push(`${v.nome} atingiu ${v.atingido.toLocaleString('pt-BR')}% da meta proporcional da semana.`);
  }
  return {
    periodo, bruto, devolucao, liquido: arred2(bruto - devolucao),
    pedidos: new Set(unicos(vendas).map((l) => String(l.NUMPED))).size,
    vendedores,
    clientes: agrupar('CODCLI', 'CLIENTE').slice(0, 12),
    bus: agrupar('BU', 'BU'),
    dias: agrupar('DIA', 'DIA').sort((a, b) => a.chave.localeCompare(b.chave)),
    produtos: agrupar('PRODUTO', 'PRODUTO').slice(0, 10),
    metaProporcional: arred2(vendedores.reduce((t, v) => t + v.metaProporcional, 0)),
    analises,
  };
}

export function assuntoRelatorio(periodo) {
  return `Relatório semanal de vendas - ${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)}`;
}

export function htmlRelatorio(nome, r) {
  const linhas = (lista) => lista.map((g) => [g.nome, moedaBR(g.bruto), moedaBR(g.devolucao), moedaBR(g.liquido)]);
  const cab = ['', 'Bruto', 'Devolução', 'Líquido'];
  return `<div style="font-family:Arial,sans-serif;font-size:14px"><p>Olá, ${escHtml(nome)}.</p>`
    + `<p>Semana operacional de ${dataBR(r.periodo.inicio)} a ${dataBR(r.periodo.fim)}.</p>`
    + `<p><strong>Faturamento líquido: ${moedaBR(r.liquido)}</strong> (bruto ${moedaBR(r.bruto)}, devolução ${moedaBR(r.devolucao)}) · ${r.pedidos} pedidos · meta proporcional ${moedaBR(r.metaProporcional)}</p>`
    + (r.analises.length ? `<ul>${r.analises.map((a) => `<li>${escHtml(a)}</li>`).join('')}</ul>` : '')
    + `<h3>Vendedores (líquido)</h3>${tabelaHtml(['Vendedor', 'Bruto', 'Devolução', 'Líquido', 'Meta proporcional', 'Atingido'],
      r.vendedores.map((v) => [v.nome, moedaBR(v.bruto), moedaBR(v.devolucao), moedaBR(v.liquido), moedaBR(v.metaProporcional), v.atingido == null ? 'Meta não distribuída' : `${v.atingido.toLocaleString('pt-BR')}%`]))}`
    + `<h3>Clientes (12 maiores, líquido)</h3>${tabelaHtml(['Cliente', ...cab.slice(1)], linhas(r.clientes))}`
    + `<h3>Unidades de negócio</h3>${tabelaHtml(['BU', ...cab.slice(1)], linhas(r.bus))}`
    + `<h3>Vendas por dia</h3>${tabelaHtml(['Dia', ...cab.slice(1)], r.dias.map((g) => [dataBR(g.chave), moedaBR(g.bruto), moedaBR(g.devolucao), moedaBR(g.liquido)]))}`
    + `<h3>Produtos (10 maiores)</h3>${tabelaHtml(['Produto', ...cab.slice(1)], linhas(r.produtos))}</div>`;
}

/* ─────────────── prospeccao da carteira (RN-020) ─────────────── */

// Compras (dias) dos ultimos 6 meses na mesma semana operacional do mes que hoje.
export function padraoSemanal(diasCompra, hoje) {
  const n = semanaOperacionalDe(hoje).n;
  const desde = menosMeses(hoje, 6);
  return [...new Set(diasCompra)].filter((d) => d >= desde && d <= hoje && semanaOperacionalDe(d).n === n).length;
}

export function tendenciaProspeccao({ dias, ciclo, padrao }) {
  if (dias != null && dias > 90) return 'INATIVO';
  const janela = !!ciclo && dias != null && dias >= 0.8 * ciclo;
  const semanal = padrao >= 2;
  return janela && semanal ? 'ALTA' : janela || semanal ? 'MEDIA' : 'BAIXA';
}

export const ORDEM_TENDENCIA = { ALTA: 1, MEDIA: 2, BAIXA: 3, INATIVO: 4 };
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mesmas consultas da carteira (002) + dias de compra de 6 meses -> lista da prospeccao. */
export function montarProspeccao({ clientes, vendas, visitas, compras, hoje, filtros }) {
  const f = filtros || {};
  const porCliente = (lista) => new Map((lista || []).map((x) => [Number(x.CODCLI ?? x.CLIENTE_ID), x]));
  const mv = porCliente(vendas);
  const mvi = porCliente(visitas);
  const diasDe = new Map();
  for (const c of compras || []) {
    const k = Number(c.CODCLI);
    if (!diasDe.has(k)) diasDe.set(k, []);
    diasDe.get(k).push(String(c.DIA));
  }
  let linhas = (clientes || [])
    .map((c) => linhaCarteira(c, mv.get(Number(c.ID)), mvi.get(Number(c.ID)), hoje))
    .filter((l) => l.DIAS_ULTIMA_COMPRA != null)
    .map((l) => {
      const ciclo = l.TEMPERATURA.ciclo;
      const padrao = padraoSemanal(diasDe.get(l.ID) || [], hoje);
      const dias = l.DIAS_ULTIMA_COMPRA;
      return {
        ID: l.ID, NOME: l.NOME, RAZAO_SOCIAL: l.RAZAO_SOCIAL, NOME_FANTASIA: l.NOME_FANTASIA, CNPJ: l.CNPJ, CIDADE: l.CIDADE, UF: l.UF,
        RAMO: l.RAMO, CURVA: l.CURVA, TEMPERATURA: l.TEMPERATURA.classe, CICLO: ciclo == null ? null : Math.round(ciclo),
        DIAS_SEM_COMPRAR: dias, ULTIMA_COMPRA: somarDias(hoje, -dias), PADRAO: padrao,
        TENDENCIA: tendenciaProspeccao({ dias, ciclo, padrao }), ATRASADO: ciclo != null && dias > ciclo, COBERTURA: l.COBERTURA,
      };
    });
  const altas = linhas.filter((l) => l.TENDENCIA === 'ALTA').length;
  if (f.tendencia) linhas = linhas.filter((l) => l.TENDENCIA === f.tendencia);
  const palavras = palavrasBusca(f.busca);
  if (palavras.length) linhas = linhas.filter((l) => relevancia(palavras, camposBusca(l)) != null);
  linhas.sort((a, b) => ORDEM_TENDENCIA[a.TENDENCIA] - ORDEM_TENDENCIA[b.TENDENCIA] || b.DIAS_SEM_COMPRAR - a.DIAS_SEM_COMPRAR
    || String(a.NOME).localeCompare(String(b.NOME), 'pt-BR'));
  const porPagina = 20;
  const total = linhas.length;
  const pagina = Math.min(Math.max(1, Math.ceil(total / porPagina)), Math.max(1, Number(f.pagina) || 1));
  return {
    ok: true, semana: semanaOperacionalDe(hoje).n, mes: MESES[Number(hoje.slice(5, 7)) - 1], altas, total, pagina, porPagina,
    linhas: linhas.slice((pagina - 1) * porPagina, pagina * porPagina),
  };
}

/* ─────────────── clientes criticos sem compra (RN-027) ─────────────── */

/**
 * `carteira`: { VENDEDOR_ID, EXECUTIVO, ID_CLIENTE, NOME, CURVA_MANUAL };
 * `vendas`: { VENDEDOR_ID, CODCLI, DIA, V (bruto), D (devolucao) } por dia;
 * `visitas`: { VENDEDOR_ID, CLIENTE_ID, ULTIMA, N60 } concluidas pelo executivo.
 */
export function montarCriticos({ carteira, vendas, visitas, semana, hoje }) {
  const inicio = somarDias(semana, -180);
  const antes = somarDias(semana, -1);
  const domingo = somarDias(semana, 6);
  const d90 = somarDias(hoje, -89);
  const chave = (v, c) => `${Number(v)}#${Number(c)}`;
  const vendasDe = new Map();
  for (const l of vendas) {
    const k = chave(l.VENDEDOR_ID, l.CODCLI);
    if (!vendasDe.has(k)) vendasDe.set(k, []);
    vendasDe.get(k).push(l);
  }
  const visitaDe = new Map(visitas.map((v) => [chave(v.VENDEDOR_ID, v.CLIENTE_ID), v]));
  const execs = new Map();
  for (const c of carteira) {
    const ls = vendasDe.get(chave(c.VENDEDOR_ID, c.ID_CLIENTE)) || [];
    const janela = ls.filter((l) => l.DIA >= inicio && l.DIA <= antes);
    const dias = [...new Set(janela.filter((l) => Number(l.V) > 0).map((l) => l.DIA))].sort();
    const fat = janela.reduce((t, l) => t + Number(l.V || 0) - Number(l.D || 0), 0);
    const ultimaCompra = ls.filter((l) => Number(l.V) > 0 && l.DIA <= hoje).map((l) => l.DIA).sort().pop() || null;
    const visita = visitaDe.get(chave(c.VENDEDOR_ID, c.ID_CLIENTE));
    const score = scoreRanking({
      compras90: ls.filter((l) => l.DIA >= d90 && l.DIA <= hoje).reduce((t, l) => t + Number(l.V || 0) - Number(l.D || 0), 0),
      visitas60: Number(visita?.N60 || 0),
      diasCompra: ultimaCompra ? diasEntre(hoje, ultimaCompra) : null,
      diasVisita: visita?.ULTIMA ? diasEntre(hoje, visita.ULTIMA) : null,
    });
    const curva = ['A', 'B', 'C', 'D'].includes(c.CURVA_MANUAL) ? c.CURVA_MANUAL : curvaAuto(score);
    if (!execs.has(Number(c.VENDEDOR_ID))) execs.set(Number(c.VENDEDOR_ID), { VENDEDOR_ID: Number(c.VENDEDOR_ID), EXECUTIVO: c.EXECUTIVO, base: [] });
    execs.get(Number(c.VENDEDOR_ID)).base.push({ c, ls, dias, fat, curva });
  }
  const saida = [];
  for (const e of execs.values()) {
    const comFat = e.base.filter((b) => b.fat > 0).sort((a, b) => b.fat - a.fat);
    const topo = new Set(comFat.slice(0, Math.ceil(comFat.length * 0.2)).map((b) => b.c.ID_CLIENTE));
    const clientes = [];
    for (const b of e.base) {
      if (b.curva !== 'A' && !topo.has(b.c.ID_CLIENTE)) continue;
      if (b.dias.length < 3) continue;
      const primeira = b.dias[0];
      const ultima = b.dias[b.dias.length - 1];
      const ciclo = diasEntre(ultima, primeira) / (b.dias.length - 1);
      if (ciclo < 1 || ciclo > 90) continue;
      const prevista = somarDias(ultima, Math.round(ciclo));
      if (prevista > domingo || diasEntre(semana, ultima) > 2 * ciclo) continue;
      const comprou = b.ls.some((l) => Number(l.V) > 0 && l.DIA >= semana && l.DIA <= domingo);
      clientes.push({
        ID_CLIENTE: Number(b.c.ID_CLIENTE), NOME: b.c.NOME, CURVA: b.curva, ULTIMA: ultima, CICLO: Math.round(ciclo), PREVISTA: prevista,
        COMPROU: comprou, SITUACAO: comprou ? 'Comprou' : prevista >= hoje ? 'Ainda no prazo' : 'Não comprou',
        TICKET: arred2(b.fat / b.dias.length),
      });
    }
    if (!clientes.some((x) => !x.COMPROU)) continue;
    const ordem = { 'Não comprou': 1, 'Ainda no prazo': 2, Comprou: 3 };
    clientes.sort((a, b) => ordem[a.SITUACAO] - ordem[b.SITUACAO] || b.TICKET - a.TICKET);
    saida.push({
      VENDEDOR_ID: e.VENDEDOR_ID, EXECUTIVO: e.EXECUTIVO, clientes,
      EM_RISCO: arred2(clientes.filter((x) => x.SITUACAO === 'Não comprou').reduce((t, x) => t + x.TICKET, 0)),
      NAO_COMPRARAM: clientes.filter((x) => x.SITUACAO === 'Não comprou').length,
      NO_PRAZO: clientes.filter((x) => x.SITUACAO === 'Ainda no prazo').length,
    });
  }
  saida.sort((a, b) => b.EM_RISCO - a.EM_RISCO || String(a.EXECUTIVO).localeCompare(String(b.EXECUTIVO), 'pt-BR'));
  return { ok: true, semana, executivos: saida };
}

// Constantes que viajam com as funcoes (o add-008 as escreve como `const`).
export const CONSTANTES_008 = { ORDEM_PRIORIDADE, NOTA_RESUMO, ORDEM_TENDENCIA, MESES };

export const REGRAS_008 = [
  menosMeses, arred2, soma, semanasOperacionais, semanaOperacionalDe, porProduto, produtoPerdido, sazonalidade, reposicao,
  volumeCrescente, naoExplorado, pedidoIncompleto, chaveLinha, gerarAlertas, chaveAlerta, semDuplicados, minutosEntre,
  planoFila, itensPorCliente, moedaBR, dataBR, escHtml, linhasResumo, tabelaHtml, htmlResumo, periodoRelatorio,
  metaProporcional, montarRelatorio, assuntoRelatorio, htmlRelatorio, padraoSemanal, tendenciaProspeccao,
  montarProspeccao, montarCriticos,
];
