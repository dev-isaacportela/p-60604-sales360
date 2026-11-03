// Mix Builder (spec 009) — regra pura: custo, preço, margem, totais, troca de
// cliente, bloqueio do salvar, planilha e proposta. Sem React, sem SDK: é o que
// tests/mix.test.mjs importa.

import { fmtData, moeda } from './formato.ts'

export type TipoCusto = 'PADRAO' | 'ESPECIAL' | 'SEM_CUSTO'
export type Preferencia = 'PADRAO' | 'ESPECIAL'

export interface OpcaoCusto {
  tipo: 'PADRAO' | 'ESPECIAL'
  custo: number
  politicaId: number
  politicaNome: string
}

export interface Produto {
  codprod: number
  nome: string
  categoria: string
  foto: string
}

export interface Item extends Produto {
  qtd: number
  tipo: TipoCusto
  custo: number
  margem: number
  preco: number
  precoConcorrente: number
  politicaId: number
  politicaNome: string
}

export const MARGEM_INICIAL = 30 // RN-002
export const AVISO_SEM_CUSTO = 'Nenhum custo disponível para este produto. Produto adicionado com custo zero.'
export const ETIQUETA_SEM_CUSTO = 'Custo zero: verificar fonte'
export const AVISO_POPUP = 'Libere os pop-ups deste site para gerar o PDF do mix.'
export const AVISO_FORA_CARTEIRA = 'Este cliente não está mais na sua carteira. O mix pode ser visualizado, duplicado e impresso, mas não alterado.'

const arred2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/* ── números (RNT-011) ── */

/** `12.3` → `12,3%`; negativo com o sinal de menos tipográfico. */
export function pct(n: number): string {
  const texto = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${n < 0 && texto !== '0,0' ? '−' : ''}${texto}%`
}

/** `1.500,50` e `1500.50` → 1500.5. Texto vazio ou inválido → NaN. */
export function lerValor(texto: string): number {
  const limpo = String(texto ?? '').trim().replace(/\s|R\$/g, '')
  if (!limpo) return NaN
  return Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
}

/* ── preço e margem (RN-001, RN-003) ── */

export const limitarMargem = (m: number) => Math.min(95, Math.max(0, Number.isFinite(m) ? m : 0))

export const precoPelaMargem = (custo: number, margem: number) => arred2(custo / (1 - limitarMargem(margem) / 100))

/** Margem pode ficar negativa quando o preço digitado é menor que o custo. */
export const margemPeloPreco = (custo: number, preco: number) => (preco > 0 ? arred2(((preco - custo) / preco) * 100) : 0)

/* ── custos (RN-007, RN-008, RN-009) ── */

/** Linhas de s360MixCustosOpcoes → opções por produto (já vêm ordenadas por custo). */
export function opcoesPorProduto(linhas: Record<string, unknown>[]): Map<number, OpcaoCusto[]> {
  const mapa = new Map<number, OpcaoCusto[]>()
  for (const l of linhas) {
    const codprod = Number(l.CODPROD)
    const lista = mapa.get(codprod) ?? []
    lista.push({ tipo: l.TIPO_CUSTO as OpcaoCusto['tipo'], custo: Number(l.CUSTO), politicaId: Number(l.POLITICA_ID) || 0, politicaNome: String(l.POLITICA_NOME ?? '') })
    mapa.set(codprod, lista)
  }
  return mapa
}

/** RN-008: especial = o menor especial (ou o padrão); padrão = o padrão (ou o primeiro especial). */
export function custoInicial(opcoes: OpcaoCusto[], preferencia: Preferencia): OpcaoCusto | null {
  const especiais = opcoes.filter(o => o.tipo === 'ESPECIAL').sort((a, b) => a.custo - b.custo)
  const padrao = opcoes.find(o => o.tipo === 'PADRAO')
  return (preferencia === 'ESPECIAL' ? especiais[0] ?? padrao : padrao ?? especiais[0]) ?? null
}

export function itemNovo(produto: Produto, opcoes: OpcaoCusto[], preferencia: Preferencia): { item: Item; aviso: string } {
  const opcao = custoInicial(opcoes, preferencia)
  const custo = opcao?.custo ?? 0
  return {
    item: {
      ...produto,
      qtd: 1,
      tipo: opcao?.tipo ?? 'SEM_CUSTO',
      custo,
      margem: MARGEM_INICIAL,
      preco: precoPelaMargem(custo, MARGEM_INICIAL),
      precoConcorrente: 0,
      politicaId: opcao?.politicaId ?? 0,
      politicaNome: opcao?.politicaNome ?? '',
    },
    aviso: opcao ? '' : AVISO_SEM_CUSTO,
  }
}

/** RN-004: troca o custo mantendo a margem. */
export function trocarCusto(item: Item, opcao: OpcaoCusto | null): Item {
  const custo = opcao?.custo ?? 0
  return {
    ...item,
    tipo: opcao?.tipo ?? 'SEM_CUSTO',
    custo,
    politicaId: opcao?.politicaId ?? 0,
    politicaNome: opcao?.politicaNome ?? '',
    preco: precoPelaMargem(custo, item.margem),
  }
}

export const mudarMargem = (item: Item, margem: number): Item => {
  const m = limitarMargem(margem)
  return { ...item, margem: m, preco: precoPelaMargem(item.custo, m) }
}

export const mudarPreco = (item: Item, preco: number): Item => {
  const p = Math.max(0, Number.isFinite(preco) ? arred2(preco) : 0)
  return { ...item, preco: p, margem: margemPeloPreco(item.custo, p) }
}

/** Item fora do especial, mas o cliente tem especial vigente para o produto: o menor deles. */
export const especialDisponivel = (item: Pick<Item, 'tipo'>, opcoes: OpcaoCusto[]): OpcaoCusto | null =>
  item.tipo === 'ESPECIAL' ? null : custoInicial(opcoes.filter(o => o.tipo === 'ESPECIAL'), 'ESPECIAL')

export const rotuloCusto = (item: Pick<Item, 'tipo' | 'politicaNome'>) =>
  item.tipo === 'ESPECIAL' ? `Especial${item.politicaNome ? ` · ${item.politicaNome}` : ''}` : item.tipo === 'PADRAO' ? 'Padrão' : 'Sem custo'

/**
 * RN-010: cada item especial é reavaliado para o novo cliente. A mesma
 * política continua se valer para ele; senão o item vai ao padrão (ou a custo
 * zero, sem padrão), sempre mantendo a margem.
 */
export function aplicarTrocaCliente(itens: Item[], opcoes: Map<number, OpcaoCusto[]>): { itens: Item[]; trocados: number; mensagem: string } {
  let trocados = 0
  const novos = itens.map(item => {
    if (item.tipo !== 'ESPECIAL') return item
    const lista = opcoes.get(item.codprod) ?? []
    const mesma = lista.find(o => o.tipo === 'ESPECIAL' && o.politicaId === item.politicaId)
    if (mesma) return trocarCusto(item, mesma)
    trocados += 1
    return trocarCusto(item, lista.find(o => o.tipo === 'PADRAO') ?? null)
  })
  const mensagem = trocados === 0 ? ''
    : trocados === 1 ? '1 item teve o custo trocado para o padrão porque o novo cliente não tem direito ao custo especial.'
    : `${trocados} itens tiveram o custo trocado para o padrão porque o novo cliente não tem direito ao custo especial.`
  return { itens: novos, trocados, mensagem }
}

/** Item gravado → item da tela; a política é deduzida pelo custo igual (D-906). */
export function itemGravado(linha: Record<string, unknown>, opcoes: OpcaoCusto[]): Item {
  const tipo = (['PADRAO', 'ESPECIAL', 'SEM_CUSTO'].includes(String(linha.TIPO_CUSTO)) ? linha.TIPO_CUSTO : 'PADRAO') as TipoCusto
  const custo = Number(linha.CUSTO_UNITARIO) || 0
  const politica = tipo === 'ESPECIAL' ? opcoes.find(o => o.tipo === 'ESPECIAL' && o.custo === custo) : undefined
  return {
    codprod: Number(linha.ID_PRODUTO),
    nome: String(linha.NOME ?? ''),
    categoria: String(linha.CATEGORIA ?? ''),
    foto: fotoSegura(String(linha.FOTO_URL ?? '')),
    qtd: Number(linha.QUANTIDADE) || 1,
    tipo,
    custo,
    margem: Number(linha.MARGEM_PERCENT) || 0,
    preco: Number(linha.PRECO_VENDA) || 0,
    precoConcorrente: Number(linha.PRECO_CONCORRENTE) || 0,
    politicaId: politica?.politicaId ?? 0,
    politicaNome: politica?.politicaNome ?? '',
  }
}

/* ── cálculos (RN-005, RN-006) ── */

export function calcularItem(item: Item) {
  return {
    subtotal: arred2(item.qtd * item.preco),
    cmv: item.preco > 0 ? (item.custo / item.preco) * 100 : 0,
    markup: item.custo > 0 ? ((item.preco - item.custo) / item.custo) * 100 : 0,
    cmvConcorrente: item.precoConcorrente > 0 ? (item.custo / item.precoConcorrente) * 100 : null,
  }
}

export function totais(itens: Item[]) {
  const custo = arred2(itens.reduce((s, i) => s + i.qtd * i.custo, 0))
  const venda = arred2(itens.reduce((s, i) => s + i.qtd * i.preco, 0))
  const unidades = itens.reduce((s, i) => s + i.qtd, 0)
  return {
    itens: itens.length,
    unidades,
    custo,
    venda,
    // 2 casas, como o servidor grava: 29,9965 é 30,00 e cai em Saudável.
    margem: venda > 0 ? arred2(((venda - custo) / venda) * 100) : 0,
    cmv: venda > 0 ? (custo / venda) * 100 : 0,
    markup: custo > 0 ? ((venda - custo) / custo) * 100 : 0,
    precoMedio: unidades > 0 ? venda / unidades : 0,
  }
}

export type FaixaMargem = 'Saudável' | 'Atenção' | 'Baixa'
export const faixaMargem = (m: number): FaixaMargem => (m >= 30 ? 'Saudável' : m >= 20 ? 'Atenção' : 'Baixa')
export const faixaCmvConcorrente = (cmv: number): 'verde' | 'ambar' | 'vermelho' => (cmv <= 70 ? 'verde' : cmv <= 85 ? 'ambar' : 'vermelho')

/* ── filtro e ordenação (RF-009) ── */

export type Ordem = 'inclusao' | 'menorMargem' | 'maiorMargem' | 'maiorSubtotal'
export const LIMITE_CONTROLES = 5

export function filtrarOrdenar(itens: Item[], filtro: string, ordem: Ordem): Item[] {
  const alvo = semAcento(filtro.trim())
  const lista = alvo ? itens.filter(i => semAcento(`${i.codprod} ${i.nome}`).includes(alvo)) : [...itens]
  if (ordem === 'menorMargem') lista.sort((a, b) => a.margem - b.margem)
  if (ordem === 'maiorMargem') lista.sort((a, b) => b.margem - a.margem)
  if (ordem === 'maiorSubtotal') lista.sort((a, b) => b.qtd * b.preco - a.qtd * a.preco)
  return lista
}

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/* ── salvar (C-008, C-017, RN-013) ── */

export function motivoBloqueioSalvar(estado: { clienteId: number | null; nome: string; itens: Item[]; foraDaCarteira?: boolean }): string | null {
  if (!estado.clienteId) return 'Selecione o cliente para salvar'
  if (estado.foraDaCarteira) return AVISO_FORA_CARTEIRA
  if (!estado.nome.trim()) return 'Informe o nome do mix para salvar'
  if (!estado.itens.length) return 'Adicione ao menos um produto para salvar'
  return null
}

/** Contrato `itens` das SFs de gravação. Os totais nunca vão: o servidor calcula. */
export const payloadItens = (itens: Item[]) =>
  JSON.stringify(itens.map(i => ({ p: i.codprod, q: i.qtd, t: i.tipo, c: i.custo, m: i.margem, v: i.preco, k: i.precoConcorrente || 0 })))

/** RF-012: cópia só na tela, sem id; vira mix novo no Salvar. */
export function duplicar<T extends { nome: string }>(mix: T, itens: Item[]): T & { id: null; itens: Item[] } {
  return { ...mix, id: null, nome: `${mix.nome} - Cópia`, itens: itens.map(i => ({ ...i })) }
}

/* ── atualização de custos (RN-014) ── */

export function idadeCustos(ultimaUtc: string | null | undefined, agora: Date = new Date()): { texto: string; aviso: boolean } {
  const instante = ultimaUtc ? Date.parse(`${String(ultimaUtc).replace(' ', 'T').slice(0, 19)}Z`) : NaN
  if (!Number.isFinite(instante)) return { texto: 'Custos ainda sem registro de atualização.', aviso: true }
  const minutos = Math.floor((agora.getTime() - instante) / 60000)
  if (minutos > 120) {
    const idade = minutos >= 1440 ? `${Math.floor(minutos / 1440)} dia(s)` : `${Math.floor(minutos / 60)}h`
    return { texto: `Custos sincronizados há ${idade}. Os valores podem estar desatualizados.`, aviso: true }
  }
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instante)
  return { texto: `Custos atualizados às ${hora}`, aviso: false }
}

/* ── fotos (RN-017) ── */

export const fotoSegura = (url: string | null | undefined) => (/^https:\/\//i.test(String(url ?? '')) ? String(url) : '')

/* ── planilha (RN-015, uso interno) ── */

const dec = (n: number) => (Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '')
const campo = (v: string | number) => {
  const t = String(v)
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function csvMix(itens: Item[]): string {
  const cab = ['#', 'Código', 'Produto', 'Categoria', 'Custo Unitário', 'Quantidade', 'Preço Venda', 'CMV %', 'Mark up %', 'Margem %', 'Preço Concorrente', 'Subtotal']
  const linhas = itens.map((i, n) => {
    const c = calcularItem(i)
    return [n + 1, i.codprod, i.nome, i.categoria, dec(i.custo), i.qtd, dec(i.preco), dec(c.cmv), dec(c.markup), dec(i.margem), i.precoConcorrente ? dec(i.precoConcorrente) : '', dec(c.subtotal)]
  })
  const t = totais(itens)
  const total = ['TOTAL', '', '', '', dec(t.custo), t.unidades, '', dec(t.cmv), dec(t.markup), dec(t.margem), '', dec(t.venda)]
  // BOM: o Excel abre os acentos certos.
  return '﻿' + [cab, ...linhas, total].map(l => l.map(campo).join(';')).join('\r\n')
}

export function nomeArquivo(nome: string): string {
  const base = semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'mix'}.csv`
}

/* ── proposta para o cliente (RN-015) ── */

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export interface Proposta {
  nome: string
  cliente: string
  descricao: string
  data: string // ISO
}

/**
 * HTML da janela de impressão. Nunca custo, margem, CMV, mark up nem
 * concorrente. Cores de sistema (Canvas/CanvasText/GrayText): papel claro,
 * nenhuma cor literal (RNFT-004). Espera as fotos por até 8 s (RNF-002).
 */
export function htmlProposta(p: Proposta, itens: Item[], logo: string): string {
  const t = totais(itens)
  const linhas = itens.map(i => `<tr>
    <td>${esc(i.codprod)}</td>
    <td class="foto">${i.foto ? `<img src="${esc(i.foto)}" alt="" onerror="this.style.visibility='hidden'">` : ''}</td>
    <td>${esc(i.nome)}<div class="cat">${esc(i.categoria || 'Sem categoria')}</div></td>
    <td class="n">${esc(i.qtd)}</td>
    <td class="n">${esc(moeda(i.preco))}</td>
    <td class="n">${esc(moeda(i.qtd * i.preco))}</td>
  </tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(p.nome)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, sans-serif; color: CanvasText; background: Canvas; margin: 0; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid GrayText; padding-bottom: 8px; }
  header img { height: 40px; }
  h1 { font-size: 18px; margin: 12px 0 4px; }
  .meta, .cat { color: GrayText; }
  .resumo { display: flex; gap: 24px; margin: 12px 0; }
  .resumo b { display: block; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid GrayText; vertical-align: middle; }
  .n { text-align: right; white-space: nowrap; }
  .foto { width: 52px; }
  .foto img { width: 44px; height: 44px; object-fit: contain; }
  tr { break-inside: avoid; }
</style></head><body>
<header><img src="${esc(logo)}" alt="Benenutri"><span class="meta">${esc(fmtData(p.data))}</span></header>
<h1>${esc(p.nome)}</h1>
<div class="meta">Cliente: ${esc(p.cliente)}</div>
${p.descricao ? `<p>${esc(p.descricao)}</p>` : ''}
<div class="resumo">
  <div>Produtos<b>${t.itens}</b></div>
  <div>Unidades<b>${t.unidades}</b></div>
  <div>Valor Final<b>${esc(moeda(t.venda))}</b></div>
  <div>Preço Médio<b>${esc(moeda(t.precoMedio))}</b></div>
</div>
<table><thead><tr><th>Código</th><th>Foto</th><th>Produto</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Subtotal</th></tr></thead>
<tbody>${linhas}</tbody></table>
<script>(function () {
  var feito = false
  function imprimir() { if (feito) return; feito = true; window.focus(); window.print() }
  var pendentes = [].slice.call(document.images).filter(function (i) { return !i.complete })
  var faltam = pendentes.length
  if (!faltam) return imprimir()
  pendentes.forEach(function (i) { i.addEventListener('load', fim); i.addEventListener('error', fim) })
  function fim() { faltam -= 1; if (faltam <= 0) imprimir() }
  setTimeout(imprimir, 8000)
})()</script>
</body></html>`
}

/** C-014: sem janela (pop-up bloqueado) → mensagem e nada mais acontece. */
export function abrirProposta(abrir: () => { document: { open(): void; write(html: string): void; close(): void } } | null, html: string): { ok: boolean; mensagem: string } {
  const janela = abrir()
  if (!janela) return { ok: false, mensagem: AVISO_POPUP }
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
  return { ok: true, mensagem: '' }
}
