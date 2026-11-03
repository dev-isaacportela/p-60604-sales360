// Visão Semanal do vendedor (spec 006): regra pura de tela. Semanas, B/W e
// status já vêm calculados pela s360SemanalMatriz (lib/006-regras.mjs no
// backend); aqui ficam rótulo, filtro sem recarregar, cards, TOTAL e planilha.

import { fmtData, fmtDataHora, moeda } from './formato.ts';

export interface Semana { n: number; ini: string; fim: string }
export interface Celula { valor: number; anterior: number | null; bw: number | null }
export interface LinhaMatriz {
  CLIENTE_ID: number;
  CLIENTE: string;
  CURVA: string;
  SEGMENTO: string;
  RAMO: string;
  VENDEDOR_ID: number;
  VENDEDOR: string;
  DE_TITULAR: string | null;
  SEMANAS: Celula[];
  FECH_ANT: number;
  FECH: number;
  BW_FECH: number | null;
  STATUS: string;
  MES_2: number;
  MES_1: number;
  MES: number;
}
export interface Matriz {
  ok: boolean;
  error?: string;
  agregado: boolean;
  semanas: Semana[];
  semanaRef: number | null;
  mesEncerrado: boolean;
  linhas: LinhaMatriz[];
  ramos: string[];
}
export interface ItemProduto {
  CLIENTE_ID: number;
  semana: number;
  CODPROD: number | string;
  PRODUTO: string;
  qt: number;
  qtAnt: number;
  total: number;
  dif: number;
  vlUnit: number;
  movimento: string;
}

const ddmm = (iso: string) => fmtData(iso).slice(0, 5);

/** RF-001: "02/10 a 08/10". */
export const rotuloSemana = (s: Semana) => `${ddmm(s.ini)} a ${ddmm(s.fim)}`;
export const tituloSemana = (n: number) => `${n}ª sem`;

/** RN-004: "+20,0%", "−100,0%", "Sem base". */
export function fmtBw(bw: number | null | undefined): string {
  if (bw === null || bw === undefined) return 'Sem base';
  const pct = Math.round(bw * 1000) / 10;
  const sinal = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sinal}${Math.abs(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Cor do B/W na célula: queda em vermelho, alta em verde, sem base apagado. */
export function corBw(bw: number | null | undefined): string {
  if (bw === null || bw === undefined) return 'text-ink-muted';
  const pct = Math.round(bw * 1000) / 10;
  return pct < 0 ? 'text-destructive' : pct > 0 ? 'text-primary' : 'text-ink-secondary';
}

/** Tom do selo de status (RN-008). */
export function tomStatus(status: string): 'live' | 'attention' | 'alert' | 'off' {
  return status === 'Alerta' ? 'alert' : status === 'Fora do padrão' ? 'attention' : status === 'No padrão' ? 'live' : 'off';
}

/** RN-005: semana N com B/W ≤ −15,0% (inclui −100,0%), sem "Sem base". Ramo vazio = todos. */
export function filtrar(linhas: LinhaMatriz[], filtro: { ramo: string; abaixo: number }): LinhaMatriz[] {
  return linhas.filter(l => {
    if (filtro.ramo && l.RAMO !== filtro.ramo) return false;
    if (!filtro.abaixo) return true;
    const bw = l.SEMANAS[filtro.abaixo - 1]?.bw;
    return bw !== null && bw !== undefined && Math.round(bw * 1000) / 10 <= -15;
  });
}

/** RF-005: cards sobre as linhas visíveis. */
export function cards(linhas: LinhaMatriz[]) {
  return {
    carteira: linhas.length,
    comCompra: linhas.filter(l => l.FECH > 0).length,
    fechamento: centavos(linhas.reduce((t, l) => t + l.FECH, 0)),
    alerta: linhas.filter(l => l.STATUS === 'Alerta').length,
  };
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const bwDe = (atual: number, anterior: number | null) => (anterior !== null && anterior > 0 ? (atual - anterior) / anterior : null);

/** RF-003: TOTAL = soma das linhas visíveis, B/W recalculado sobre as somas. */
export function totalLinha(linhas: LinhaMatriz[], semanas: Semana[]) {
  const SEMANAS = semanas.map((_, i) => {
    const valor = centavos(linhas.reduce((t, l) => t + (l.SEMANAS[i]?.valor ?? 0), 0));
    const comBase = linhas.filter(l => l.SEMANAS[i]?.anterior !== null && l.SEMANAS[i]?.anterior !== undefined);
    const anterior = comBase.length ? centavos(comBase.reduce((t, l) => t + Number(l.SEMANAS[i].anterior), 0)) : null;
    return { valor, anterior, bw: bwDe(valor, anterior) };
  });
  const FECH = centavos(linhas.reduce((t, l) => t + l.FECH, 0));
  const FECH_ANT = centavos(linhas.reduce((t, l) => t + l.FECH_ANT, 0));
  return { SEMANAS, FECH, FECH_ANT, BW_FECH: bwDe(FECH, FECH_ANT) };
}

/** Ano corrente −1 a +1 (RF-004). */
export const anos = (hoje: string) => [-1, 0, 1].map(d => Number(hoje.slice(0, 4)) + d);

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** RN-016: status da carga em português. */
export function rotuloStatusCarga(status: string | null | undefined): string {
  return ({ RUNNING: 'Em andamento', SUCCESS: 'Concluída', FAILED: 'Com falha' } as Record<string, string>)[String(status ?? '')] ?? '';
}

/** RF-010: "Vendas atualizadas em dd/mm/aaaa hh:mm"; sem execução, nada. */
export function textoAtualizacao(fimEm: string | null | undefined): string {
  return fimEm ? `Vendas atualizadas em ${fmtDataHora(String(fimEm).replace(' ', 'T'))}` : '';
}

/** RN-011: seletor e cabeçalho da semana no detalhe. */
export const rotuloSemanaDetalhe = (s: Semana) => `Semana ${s.n} - ${fmtData(s.ini)} a ${fmtData(s.fim)}`;
export const cabecalhoSemana = (s: { pedidos: number; valor: number }) => `${s.pedidos} pedido(s) • ${moeda(s.valor)}`;

/* ─────────────── planilha (RN-012) ─────────────── */

export const FMT_MOEDA = '"R$" #,##0.00';
export const FMT_PCT = '0.0%';
export const MSG_SEM_DADOS = 'Não há dados semanais para exportar.';

export interface Aba {
  nome: string;
  colunas: string[];
  /** Formato numérico do Excel por coluna; vazio = texto/número cru. */
  formatos: string[];
  linhas: (string | number | null)[][];
  fixas: number;
}
export interface Planilha { arquivo: string; abas: Aba[] }

/** Exporta o que a tela mostra (linhas já filtradas). Sem linhas, null. */
export function planilha(m: Pick<Matriz, 'semanas'>, linhas: LinhaMatriz[], itens: ItemProduto[], ano: number, mes: number): Planilha | null {
  if (!linhas.length) return null;
  const s = m.semanas;
  const colunas = ['Cliente ID', 'Cliente', 'Curva', 'Segmento', 'Ramo', 'Vendedor ID', 'Vendedor',
    ...s.flatMap(x => [`${tituloSemana(x.n)} (${rotuloSemana(x)})`, `B/W ${tituloSemana(x.n)}`]),
    'Fechamento mês anterior', 'Fechamento do mês', 'B/W fechamento', 'Status'];
  const formatos = ['', '', '', '', '', '', '', ...s.flatMap(() => [FMT_MOEDA, FMT_PCT]), FMT_MOEDA, FMT_MOEDA, FMT_PCT, ''];
  const dados = linhas.map(l => [
    l.CLIENTE_ID, l.CLIENTE, l.CURVA, l.SEGMENTO, l.RAMO, l.VENDEDOR_ID || null, l.VENDEDOR,
    ...l.SEMANAS.flatMap(c => [c.valor, c.bw]),
    l.FECH_ANT, l.FECH, l.BW_FECH, l.STATUS,
  ]);
  const t = totalLinha(linhas, s);
  dados.push(['TOTAL', '', '', '', '', null, '', ...t.SEMANAS.flatMap(c => [c.valor, c.bw]), t.FECH_ANT, t.FECH, t.BW_FECH, '']);

  const visiveis = new Map(linhas.map(l => [Number(l.CLIENTE_ID), l.CLIENTE]));
  const produtos = itens
    .filter(i => visiveis.has(Number(i.CLIENTE_ID)))
    .map(i => [i.CLIENTE_ID, visiveis.get(Number(i.CLIENTE_ID)) ?? '', tituloSemana(i.semana), i.CODPROD, i.PRODUTO,
      i.qt, i.qtAnt, i.dif, i.vlUnit, i.total, i.movimento]);

  return {
    arquivo: `analytics-semanal-${ano}-${String(mes).padStart(2, '0')}.xlsx`,
    abas: [
      { nome: 'Dados semanais', colunas, formatos, linhas: dados, fixas: 2 },
      {
        nome: 'Produtos',
        colunas: ['Cliente ID', 'Cliente', 'Semana', 'Cód. produto', 'Produto', 'QTD semana', 'QTD mesma semana mês anterior', 'Diferença QTD', 'Valor unitário', 'Total', 'Movimento'],
        formatos: ['', '', '', '', '', '', '', '', FMT_MOEDA, FMT_MOEDA, ''],
        linhas: produtos,
        fixas: 2,
      },
    ],
  };
}
