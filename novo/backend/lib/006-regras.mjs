// Regras do acompanhamento semanal (spec 006) que rodam no servidor, dentro
// das SFs JAVASCRIPT s360SemanalMatriz, s360SemanalDetalhe e s360SemanalProdutos.
//
// Como em 002-regras.mjs: o add-006 publica o TEXTO destas funcoes, entao elas
// nao importam nada; so usam umas as outras. O smoke testa o mesmo codigo.
// Datas 'AAAA-MM-DD'.

/* ─────────────── semanas operacionais (RNT-005) ─────────────── */

export function limitesMes(ano, mes) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

// Mes deslocado: deslocarMes(2026, 1, -1) = { ano: 2025, mes: 12 }.
export function deslocarMes(ano, mes, delta) {
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

// Sexta a quinta, recortada no mes: a semana 1 comeca no dia 1 e vai ate a
// primeira quinta; a ultima termina no ultimo dia do mes.
export function semanasDoMes(ano, mes) {
  const { fim } = limitesMes(ano, mes);
  const ultimo = Number(fim.slice(8, 10));
  const mm = String(mes).padStart(2, '0');
  const iso = (d) => `${ano}-${mm}-${String(d).padStart(2, '0')}`;
  const semanas = [];
  for (let ini = 1; ini <= ultimo;) {
    const dow = new Date(Date.UTC(ano, mes - 1, ini)).getUTCDay();
    const fimSemana = Math.min(ultimo, ini + ((4 - dow + 7) % 7));
    semanas.push({ n: semanas.length + 1, ini: iso(ini), fim: iso(fimSemana) });
    ini = fimSemana + 1;
  }
  return semanas;
}

// Semana operacional do dia: 1 + sextas-feiras entre o dia 2 do mes e o dia.
export function semanaDoDia(dia) {
  const [ano, mes, d] = String(dia).slice(0, 10).split('-').map(Number);
  let n = 1;
  for (let k = 2; k <= d; k += 1) if (new Date(Date.UTC(ano, mes - 1, k)).getUTCDay() === 5) n += 1;
  return { ano, mes, n };
}

/* ─────────────── B/W, status e curva (RN-004, RN-008, RN-009) ─────────────── */

// Anterior ausente, zero ou negativo = "Sem base" (null). Queda total = -1.
export function bw(atual, anterior) {
  if (anterior === null || anterior === undefined || !(Number(anterior) > 0)) return null;
  return (Number(atual) - Number(anterior)) / Number(anterior);
}

// Faixa sobre o B/W arredondado a uma casa como aparece na tela.
export function statusPorBw(valor) {
  if (valor === null || valor === undefined) return 'Sem base';
  const pct = Math.round(Math.abs(valor) * 1000) / 10;
  if (pct < 15) return 'No padrão';
  if (pct <= 25) return 'Fora do padrão';
  return 'Alerta';
}

export function curvaPorValor(valorMedio) {
  if (valorMedio >= 15000) return 'A';
  if (valorMedio >= 7000) return 'B';
  return 'C';
}

export function dinheiro(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

/* ─────────────── matriz (RF-001..005, RN-001..010) ─────────────── */

/**
 * carteira: uma linha por cliente (CLIENTE_ID, CLIENTE, SEGMENTO, RAMO, CURVA,
 * COBERTURA, TITULAR, VENDEDOR_ID, VENDEDOR, EU_ID, EU).
 * dias: liquido por cliente x dia (CODCLI, DIA, VALOR, BRUTO) de M-2 a M.
 * agregado: TEAM/ALL/COORD -> uma linha "Equipe" por cliente (RN-010).
 */
export function montarMatriz({ carteira, dias, ano, mes, hoje, modo }) {
  const agregado = ['TEAM', 'ALL', 'COORD'].includes(modo);
  const semanas = semanasDoMes(ano, mes);
  const ant = deslocarMes(ano, mes, -1);
  const ant2 = deslocarMes(ano, mes, -2);
  const nAnt = semanasDoMes(ant.ano, ant.mes).length;
  const { ini, fim } = limitesMes(ano, mes);
  const mesEncerrado = fim < hoje;
  const semanaRef = hoje >= ini && hoje <= fim ? semanaDoDia(hoje).n : (mesEncerrado ? null : 1);

  const porCliente = new Map();
  for (const d of dias) {
    const id = Number(d.CODCLI);
    if (!porCliente.has(id)) porCliente.set(id, []);
    porCliente.get(id).push(d);
  }

  const linhas = carteira.map((c) => {
    const atual = {};
    const anterior = {};
    const meses = { m: 0, m1: 0, m2: 0 };
    const semanasComCompra = new Set();
    let brutoTres = 0;
    for (const d of porCliente.get(Number(c.CLIENTE_ID)) ?? []) {
      const s = semanaDoDia(d.DIA);
      const valor = Number(d.VALOR || 0);
      const bruto = Number(d.BRUTO || 0);
      if (s.ano === ano && s.mes === mes) { atual[s.n] = (atual[s.n] || 0) + valor; meses.m += valor; }
      else if (s.ano === ant.ano && s.mes === ant.mes) { anterior[s.n] = (anterior[s.n] || 0) + valor; meses.m1 += valor; }
      else if (s.ano === ant2.ano && s.mes === ant2.mes) meses.m2 += valor;
      else continue;
      brutoTres += bruto;
      if (bruto > 0) semanasComCompra.add(`${s.ano}-${s.mes}-${s.n}`);
    }
    const celulas = semanas.map((s) => {
      const valor = dinheiro(atual[s.n]);
      const valorAnt = s.n <= nAnt ? dinheiro(anterior[s.n]) : null;
      return { valor, anterior: valorAnt, bw: bw(valor, valorAnt) };
    });
    const fech = dinheiro(meses.m);
    const fechAnt = dinheiro(meses.m1);
    const bwFech = bw(fech, fechAnt);
    const valorMedio = semanasComCompra.size ? dinheiro(brutoTres / semanasComCompra.size) : 0;
    const bwRef = semanaRef === null ? bwFech : celulas[semanaRef - 1]?.bw ?? null;
    const herdada = !agregado && Number(c.COBERTURA) === 1;
    return {
      CLIENTE_ID: Number(c.CLIENTE_ID),
      CLIENTE: c.CLIENTE,
      CURVA: c.CURVA || curvaPorValor(valorMedio),
      SEGMENTO: c.SEGMENTO ?? '',
      RAMO: c.RAMO ?? 'Sem ramo',
      VENDEDOR_ID: agregado ? 0 : Number(modo === 'ME' ? c.EU_ID : c.VENDEDOR_ID),
      VENDEDOR: agregado ? 'Equipe' : (modo === 'ME' ? c.EU : c.VENDEDOR),
      DE_TITULAR: herdada ? c.TITULAR : null,
      SEMANAS: celulas,
      FECH_ANT: fechAnt,
      FECH: fech,
      BW_FECH: bwFech,
      STATUS: statusPorBw(bwRef),
      VALOR_MEDIO: valorMedio,
      MES_2: dinheiro(meses.m2),
      MES_1: fechAnt,
      MES: fech,
    };
  }).sort((a, b) => String(a.CLIENTE).localeCompare(String(b.CLIENTE), 'pt-BR'));

  const ramos = [...new Set(linhas.map((l) => l.RAMO))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { ok: true, agregado, semanas, semanaRef, mesEncerrado, linhas, ramos };
}

/* ─────────────── detalhe do cliente (RN-011) ─────────────── */

export function movimentoItem(qt, qtAnt) {
  if (qtAnt <= 0 && qt > 0) return 'Novo na semana';
  if (qtAnt > 0 && qt <= 0) return 'Deixou de comprar';
  if (qt > qtAnt) return 'Comprou a mais';
  if (qt < qtAnt) return 'Queda';
  return 'Estável';
}

// Itens de venda da semana n de (ano, mes) contra a mesma semana do mes anterior.
// linhas: (TIPO 'V'/'D', CODPROD, PRODUTO, NUMPED, DIA, QT, VALOR), so 'V' entra.
export function itensDaSemana(linhas, ano, mes, n) {
  const ORDEM = { 'Deixou de comprar': 0, 'Comprou a mais': 1, 'Novo na semana': 1, Queda: 2, 'Estável': 3 };
  const ant = deslocarMes(ano, mes, -1);
  const produtos = new Map();
  const historico = new Map();
  for (const l of linhas) {
    if (l.TIPO !== 'V') continue;
    const s = semanaDoDia(l.DIA);
    const p = String(l.CODPROD);
    if (!produtos.has(p)) produtos.set(p, { CODPROD: l.CODPROD, PRODUTO: l.PRODUTO, qt: 0, qtAnt: 0, total: 0 });
    const item = produtos.get(p);
    const qt = Number(l.QT || 0);
    if (s.ano === ano && s.mes === mes && s.n === n) { item.qt += qt; item.total += Number(l.VALOR || 0); }
    if (s.ano === ant.ano && s.mes === ant.mes && s.n === n) item.qtAnt += qt;
    // Historico ate o fim da semana aberta, para as ultimas 8 semanas com compra.
    const ordem = s.ano * 10000 + s.mes * 100 + s.n;
    if (ordem <= ano * 10000 + mes * 100 + n && qt > 0) {
      if (!historico.has(p)) historico.set(p, new Map());
      const h = historico.get(p);
      h.set(ordem, { ano: s.ano, mes: s.mes, n: s.n, qt: (h.get(ordem)?.qt || 0) + qt });
    }
  }
  return [...produtos.values()]
    .filter((i) => i.qt > 0 || i.qtAnt > 0)
    .map((i) => {
      const ultimas8 = [...(historico.get(String(i.CODPROD))?.entries() ?? [])]
        .sort((a, b) => a[0] - b[0]).slice(-8).map(([, v]) => v);
      return {
        ...i,
        total: dinheiro(i.total),
        dif: i.qt - i.qtAnt,
        vlUnit: i.qt > 0 ? dinheiro(i.total / i.qt) : 0,
        movimento: movimentoItem(i.qt, i.qtAnt),
        ultimas8,
        pico: ultimas8.reduce((m, s) => Math.max(m, s.qt), 0),
      };
    })
    .sort((a, b) => ORDEM[a.movimento] - ORDEM[b.movimento] || Math.abs(b.dif) - Math.abs(a.dif));
}

export function montarDetalhe({ linhas, ano, mes }) {
  const semanas = semanasDoMes(ano, mes).map((s) => {
    const daSemana = linhas.filter((l) => { const d = semanaDoDia(l.DIA); return d.ano === ano && d.mes === mes && d.n === s.n; });
    const pedidos = new Map();
    for (const l of daSemana) {
      if (l.TIPO === 'V') pedidos.set(String(l.NUMPED), (pedidos.get(String(l.NUMPED)) || 0) + Number(l.VALOR || 0));
    }
    return {
      ...s,
      pedidos: pedidos.size,
      valor: dinheiro(daSemana.reduce((t, l) => t + Number(l.VALOR || 0), 0)),
      listaPedidos: [...pedidos.entries()].map(([NUMPED, valor]) => ({ NUMPED, valor: dinheiro(valor) })),
      itens: itensDaSemana(linhas, ano, mes, s.n),
    };
  });
  // Sazonalidade: 12 meses que terminam no mes aberto.
  const meses = Array.from({ length: 12 }, (_, i) => deslocarMes(ano, mes, i - 11));
  const saz = new Map();
  for (const l of linhas) {
    if (l.TIPO !== 'V') continue;
    const [a, m] = String(l.DIA).split('-').map(Number);
    const i = meses.findIndex((x) => x.ano === a && x.mes === m);
    if (i < 0) continue;
    const p = String(l.CODPROD);
    if (!saz.has(p)) saz.set(p, { CODPROD: l.CODPROD, PRODUTO: l.PRODUTO, meses: meses.map((x) => ({ ...x, qt: 0, valor: 0 })) });
    const alvo = saz.get(p).meses[i];
    alvo.qt += Number(l.QT || 0);
    alvo.valor = dinheiro(alvo.valor + Number(l.VALOR || 0));
  }
  const sazonalidade = [...saz.values()].sort((a, b) => String(a.PRODUTO).localeCompare(String(b.PRODUTO), 'pt-BR'));
  return { ok: true, semanas, sazonalidade };
}

// Aba "Produtos" da planilha: um item por cliente x semana com movimento.
export function montarProdutos({ linhas, ano, mes }) {
  const porCliente = new Map();
  for (const l of linhas) {
    const id = Number(l.CODCLI);
    if (!porCliente.has(id)) porCliente.set(id, []);
    porCliente.get(id).push(l);
  }
  const saida = [];
  for (const [CLIENTE_ID, doCliente] of porCliente) {
    for (const s of semanasDoMes(ano, mes)) {
      for (const item of itensDaSemana(doCliente, ano, mes, s.n)) {
        const { ultimas8, pico, ...resto } = item;
        saida.push({ CLIENTE_ID, semana: s.n, ...resto });
      }
    }
  }
  return { ok: true, itens: saida };
}

export const REGRAS = [
  limitesMes, deslocarMes, semanasDoMes, semanaDoDia, bw, statusPorBw, curvaPorValor, dinheiro,
  montarMatriz, movimentoItem, itensDaSemana, montarDetalhe, montarProdutos,
];
