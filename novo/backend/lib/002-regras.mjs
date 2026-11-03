// Regras da carteira (spec 002) que rodam no servidor, dentro das SFs
// JAVASCRIPT `s360CarteiraCarregar` e `s360DisponiveisListar`.
//
// O add-002 publica o TEXTO destas funcoes (fn.toString()), entao elas nao
// podem importar nada nem usar constante de fora: so umas as outras e o que o
// JavaScript ja tem. O smoke testa o mesmo codigo, pela SF e chamando direto.
// Datas sempre 'AAAA-MM-DD' (Brasilia, vindas da tela).

/* ─────────────── datas ─────────────── */

export function diasEntre(depois, antes) {
  if (!depois || !antes) return null;
  const [a, b] = [depois, antes].map((d) => {
    const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  });
  return Math.round((a - b) / 86400000);
}

export function somarDias(data, dias) {
  const [y, m, d] = String(data).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Janelas usadas pelas consultas e pelas regras: dias 0..N-1 antes de hoje.
export function janelas(hoje) {
  const [y, m, d] = hoje.split('-').map(Number);
  const ultimoDoAnterior = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const anterior = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  return {
    hoje,
    d60: somarDias(hoje, -59),
    d90: somarDias(hoje, -89),
    d120: somarDias(hoje, -119),
    mes: `${hoje.slice(0, 7)}-01`,
    // RN-012: do dia 1 ate o mesmo dia do mes anterior (ou o ultimo dia dele).
    mesAntIni: `${anterior}-01`,
    mesAntFim: `${anterior}-${String(Math.min(d, ultimoDoAnterior)).padStart(2, '0')}`,
  };
}

/* ─────────────── busca inteligente (RN-018) ─────────────── */

export function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(\d)[.\-/](?=\d)/g, '$1')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function palavrasBusca(busca) {
  const ignorar = new Set(['CLIENTE', 'CLIENTES', 'ID', 'CODIGO', 'COD', 'CODCLI', 'NUMERO', 'N']);
  return normalizarBusca(busca).split(' ').filter((p) => p && !ignorar.has(p)).slice(0, 8);
}

// Letras erradas toleradas: < 4 exige trecho exato; 4-6 tolera 1; 7+ tolera 2.
export function tolerancia(palavra) {
  return palavra.length < 4 ? 0 : palavra.length <= 6 ? 1 : 2;
}

// Menor distancia de edicao entre `p` e qualquer trecho de `t` (Sellers).
export function distanciaTrecho(p, t) {
  let anterior = Array.from({ length: p.length + 1 }, (_, i) => i);
  let melhor = anterior[p.length];
  for (let j = 1; j <= t.length; j += 1) {
    const atual = [0];
    for (let i = 1; i <= p.length; i += 1) {
      atual[i] = Math.min(anterior[i] + 1, atual[i - 1] + 1, anterior[i - 1] + (p[i - 1] === t[j - 1] ? 0 : 1));
    }
    if (atual[p.length] < melhor) melhor = atual[p.length];
    anterior = atual;
  }
  return melhor;
}

// Pedacos exatos que a palavra com N letras erradas sempre preserva (um dos
// N+1 pedacos fica intacto): pre-filtro LIKE no SQL antes da regra de verdade.
export function pedacosBusca(palavra) {
  const n = tolerancia(palavra) + 1;
  const tamanho = Math.ceil(palavra.length / n);
  const pedacos = [];
  for (let i = 0; i < palavra.length; i += tamanho) pedacos.push(palavra.slice(i, i + tamanho));
  return pedacos;
}

// Campos da busca, normalizados. CNPJ tambem so com digitos.
export function camposBusca(c) {
  return [c.NOME_FANTASIA, c.RAZAO_SOCIAL, String(c.CNPJ ?? '').replace(/\D/g, ''), c.ID, c.WINTHOR_CODCLI,
    c.CIDADE, c.UF, c.RAMO, c.SEGMENTO]
    .map(normalizarBusca).filter(Boolean);
}

// Relevancia > 0 quando toda palavra casa com algum campo; null quando nao casa.
export function relevancia(palavras, campos) {
  let total = 0;
  for (const palavra of palavras) {
    let melhor = 0;
    for (const campo of campos) {
      let pontos = 0;
      if (campo === palavra) pontos = 100;
      else if (campo.split(' ').some((parte) => parte === palavra)) pontos = 80;
      else if (campo.split(' ').some((parte) => parte.startsWith(palavra))) pontos = 70;
      else if (campo.includes(palavra)) pontos = 50;
      else if (tolerancia(palavra) > 0) {
        const d = distanciaTrecho(palavra, campo);
        if (d <= tolerancia(palavra)) pontos = 30 - 10 * d;
      }
      if (pontos > melhor) melhor = pontos;
    }
    if (!melhor) return null;
    total += melhor;
  }
  return total;
}

/* ─────────────── score, curva, temperatura ─────────────── */

export function arred1(x) {
  return Math.round(x * 10) / 10;
}

// RN-004: 0-100, uma casa.
export function scoreRanking({ compras90 = 0, visitas60 = 0, diasCompra = null, diasVisita = null }) {
  const compras = Math.max(0, Math.min(100, (Number(compras90) / 30000) * 100));
  const visitas = Math.min(100, Number(visitas60) * 20);
  const rc = diasCompra == null ? 15 : diasCompra <= 7 ? 100 : diasCompra <= 15 ? 85 : diasCompra <= 30 ? 65 : diasCompra <= 45 ? 40 : 15;
  const rv = diasVisita == null ? 10 : diasVisita <= 7 ? 100 : diasVisita <= 15 ? 80 : diasVisita <= 30 ? 55 : diasVisita <= 45 ? 30 : 10;
  return arred1(0.45 * compras + 0.25 * visitas + 0.2 * rc + 0.1 * rv);
}

// RN-005: D so manual.
export function curvaAuto(score) {
  return score >= 80 ? 'A' : score >= 55 ? 'B' : 'C';
}

// RN-006
export function limiteCurva(curva) {
  return { A: 8, B: 16, C: 32, D: 61 }[curva] ?? 32;
}

export function visitaPendente(curva, diasSemVisita) {
  return diasSemVisita == null || diasSemVisita > limiteCurva(curva);
}

// RN-008
export function classeTemperatura(total) {
  return total >= 70 ? 'Quente' : total >= 40 ? 'Morno' : 'Frio';
}

// Variacao percentual com 4 casas (evita 10,000000002 virar "acima de 10%").
export function variacaoPercentual(atual, anterior) {
  return Math.round(((Number(atual) - Number(anterior)) * 100 / Number(anterior)) * 10000) / 10000;
}

// RN-007: Recencia (30) + Frequencia (25) + Tendencia (25) + Visitas (20).
export function temperatura({ diasSemComprar = null, ciclo = null, atual60 = 0, anterior60 = 0, diasSemVisita = null }) {
  const recencia = diasSemComprar == null ? 0 : diasSemComprar < 30 ? 30 : diasSemComprar < 60 ? 20 : diasSemComprar < 90 ? 10 : 0;
  let frequencia = 0;
  if (ciclo && diasSemComprar != null) {
    const r = diasSemComprar / ciclo;
    frequencia = r <= 1.1 ? 25 : r <= 1.3 ? 15 : r <= 1.6 ? 5 : 0;
  }
  let tendencia = 0;
  let variacao = null;
  if (Number(anterior60) > 0) {
    variacao = variacaoPercentual(atual60, anterior60);
    tendencia = variacao > 10 ? 25 : variacao >= -10 ? 15 : variacao >= -30 ? 5 : 0;
  } else if (Number(atual60) > 0) {
    tendencia = 25;
  }
  const visitas = diasSemVisita == null ? 0 : diasSemVisita < 30 ? 20 : diasSemVisita < 60 ? 12 : diasSemVisita < 90 ? 5 : 0;
  const total = recencia + frequencia + tendencia + visitas;
  return { total, classe: classeTemperatura(total), recencia, frequencia, tendencia, visitas, diasSemComprar, ciclo, variacao, diasSemVisita };
}

// RN-012: queda de 30% ou mais, so com compra no periodo anterior.
export function quedaPercentual(atual, anterior) {
  if (!(Number(anterior) > 0)) return null;
  return arred1(((Number(anterior) - Number(atual)) * 100) / Number(anterior));
}

export function temQueda(atual, anterior) {
  const q = quedaPercentual(atual, anterior);
  return q != null && q >= 30;
}

/* ─────────────── montagem da carteira ─────────────── */

// Junta as tres consultas da SF numa linha por cliente (RN-001) com as regras.
export function linhaCarteira(c, venda, visita, hoje) {
  const v = venda || {};
  const ultimaCompra = v.ULTIMA || null;
  const ultimaVisita = (visita && visita.ULTIMA) || null;
  const diasCompra = ultimaCompra ? diasEntre(hoje, ultimaCompra) : null;
  const diasVisita = ultimaVisita ? diasEntre(hoje, ultimaVisita) : null;
  const ndias = Number(v.NDIAS || 0);
  const ciclo = ndias >= 2 ? arred1(diasEntre(v.ULTIMA, v.PRIMEIRA) / (ndias - 1)) : null;
  const score = scoreRanking({ compras90: Number(v.C90 || 0), visitas60: Number((visita && visita.N60) || 0), diasCompra, diasVisita });
  const manual = ['A', 'B', 'C', 'D'].includes(c.CURVA_MANUAL) ? c.CURVA_MANUAL : null;
  const curva = manual || curvaAuto(score);
  return {
    ID: Number(c.ID),
    NOME: c.NOME,
    RAZAO_SOCIAL: c.RAZAO_SOCIAL,
    NOME_FANTASIA: c.NOME_FANTASIA,
    CNPJ: c.CNPJ,
    CIDADE: c.CIDADE,
    UF: c.UF,
    SEGMENTO: c.SEGMENTO,
    RAMO: c.RAMO || 'Sem ramo',
    STATUS: String(c.STATUS || '').toUpperCase(),
    CURVA: curva,
    CURVA_MANUAL: manual,
    SCORE: score,
    TEMPERATURA: temperatura({ diasSemComprar: diasCompra, ciclo, atual60: Number(v.A60 || 0), anterior60: Number(v.P60 || 0), diasSemVisita: diasVisita }),
    DIAS_SEM_VISITA: diasVisita,
    DIAS_ULTIMA_COMPRA: diasCompra,
    LIMITE_CURVA: limiteCurva(curva),
    PENDENTE: visitaPendente(curva, diasVisita),
    RECEITA_MES: Number(v.MES || 0),
    ALERTA: Number(c.ALERTA) === 1,
    QUEDA: temQueda(Number(v.MES || 0), Number(v.MES_ANT || 0)),
    COBERTURA: Number(c.COBERTURA) === 1,
    PODE_REMOVER: Number(c.PODE_REMOVER) === 1,
  };
}

export function comparadorCarteira(ordem) {
  const nome = (a, b) => String(a.NOME).localeCompare(String(b.NOME), 'pt-BR') || a.ID - b.ID;
  const curva = { A: 0, B: 1, C: 2, D: 3 };
  const status = { ATIVO: 0, EM_RISCO: 1, INATIVO: 2 };
  const ranking = (a, b) => curva[a.CURVA] - curva[b.CURVA] || b.SCORE - a.SCORE || nome(a, b);
  const visita = (x) => (x.DIAS_SEM_VISITA == null ? Infinity : x.DIAS_SEM_VISITA);
  return {
    RANK_DA: (a, b) => -ranking(a, b),
    NOME_AZ: nome,
    NOME_ZA: (a, b) => -nome(a, b),
    STATUS: (a, b) => (status[a.STATUS] ?? 9) - (status[b.STATUS] ?? 9) || nome(a, b),
    DIAS_VISITA: (a, b) => visita(b) - visita(a) || nome(a, b),
  }[ordem] || ranking;
}

// RN-010 / RN-008 sobre a carteira filtrada.
export function indicadoresCarteira(linhas) {
  const ativos = linhas.filter((l) => l.STATUS === 'ATIVO').length;
  const receita = Math.round(linhas.reduce((s, l) => s + l.RECEITA_MES, 0) * 100) / 100;
  const media = linhas.length ? Math.round(linhas.reduce((s, l) => s + l.TEMPERATURA.total, 0) / linhas.length) : null;
  return {
    total: linhas.length,
    ativos,
    receita,
    ticket: ativos ? Math.round((receita / ativos) * 100) / 100 : null,
    score: media,
    classe: media == null ? null : classeTemperatura(media),
    pendentes: linhas.filter((l) => l.PENDENTE).length,
  };
}

// Filtros, busca, ordem e pagina (RN-013, RN-018). Indicadores e grafico por
// ramo valem para a carteira filtrada inteira, nao para a pagina.
export function montarCarteira({ clientes, vendas, visitas, hoje, filtros }) {
  const f = filtros || {};
  const porCliente = (lista) => new Map((lista || []).map((x) => [Number(x.CODCLI ?? x.CLIENTE_ID), x]));
  const mv = porCliente(vendas);
  const mvi = porCliente(visitas);
  let linhas = (clientes || []).map((c) => linhaCarteira(c, mv.get(Number(c.ID)), mvi.get(Number(c.ID)), hoje));
  if (f.ramo) linhas = linhas.filter((l) => l.RAMO === f.ramo);
  if (f.status) linhas = linhas.filter((l) => l.STATUS === String(f.status).toUpperCase());
  const palavras = palavrasBusca(f.busca);
  if (palavras.length) {
    linhas = linhas
      .map((l) => ({ l, r: relevancia(palavras, camposBusca(l)) }))
      .filter((x) => x.r != null)
      .sort((a, b) => b.r - a.r || String(a.l.NOME).localeCompare(String(b.l.NOME), 'pt-BR'))
      .map((x) => x.l);
  } else {
    linhas.sort(comparadorCarteira(f.ordem));
  }
  const indicadores = indicadoresCarteira(linhas);
  const ramos = {};
  for (const l of linhas) ramos[l.RAMO] = (ramos[l.RAMO] || 0) + 1;
  if (Number(f.pendentes) === 1) linhas = linhas.filter((l) => l.PENDENTE);
  const porPagina = Math.min(50, Math.max(1, Number(f.porPagina) || 10));
  const total = linhas.length;
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(ultima, Math.max(1, Number(f.pagina) || 1));
  return {
    ok: true,
    total,
    pagina,
    porPagina,
    linhas: linhas.slice((pagina - 1) * porPagina, pagina * porPagina),
    indicadores,
    ramos: Object.entries(ramos).map(([ramo, n]) => ({ ramo, n })).sort((a, b) => b.n - a.n || a.ramo.localeCompare(b.ramo)),
  };
}

// Disponiveis com busca: candidatos do pre-filtro SQL -> RN-018 -> pagina.
export function filtrarDisponiveis(linhas, busca, pagina, porPagina = 10) {
  const palavras = palavrasBusca(busca);
  const achados = (linhas || [])
    .map((l) => ({ l, r: relevancia(palavras, camposBusca(l)) }))
    .filter((x) => x.r != null)
    .sort((a, b) => b.r - a.r || String(a.l.NOME).localeCompare(String(b.l.NOME), 'pt-BR') || String(a.l.ESCOPO).localeCompare(String(b.l.ESCOPO)))
    .map((x) => x.l);
  const ultima = Math.max(1, Math.ceil(achados.length / porPagina));
  const p = Math.min(ultima, Math.max(1, Number(pagina) || 1));
  return { total: achados.length, pagina: p, linhas: achados.slice((p - 1) * porPagina, p * porPagina) };
}

// Todas as funcoes acima, na ordem em que o corpo publicado as declara.
export const REGRAS = [
  diasEntre, somarDias, janelas, normalizarBusca, palavrasBusca, tolerancia, distanciaTrecho, pedacosBusca,
  camposBusca, relevancia, arred1, scoreRanking, curvaAuto, limiteCurva, visitaPendente, classeTemperatura,
  variacaoPercentual, temperatura, quedaPercentual, temQueda, linhaCarteira, comparadorCarteira,
  indicadoresCarteira, montarCarteira, filtrarDisponiveis,
];
