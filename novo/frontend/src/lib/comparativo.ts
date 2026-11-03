// Comparativo modular (aba Modular do Analytics) e Comparativo mensal
// (/comparativo → Mensal), spec 007: regra pura de tela.

import { FMT_MOEDA, FMT_PCT, type LinhaMatriz, type Planilha } from './semanal.ts';
import { fmtData } from './formato.ts';

export type Categoria = 'CLIENTE' | 'RAMO' | 'SECAO' | 'PRODUTO' | 'DEPTO';
export type Metrica = 'FATURAMENTO' | 'PEDIDOS' | 'QUANTIDADE';

export const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'CLIENTE', label: 'Cliente' },
  { value: 'RAMO', label: 'Ramo' },
  { value: 'SECAO', label: 'Seção' },
  { value: 'PRODUTO', label: 'Produto' },
  { value: 'DEPTO', label: 'Departamento' },
];

const ROTULO_METRICA: Record<Metrica, string> = { FATURAMENTO: 'Faturamento', PEDIDOS: 'Pedidos', QUANTIDADE: 'Quantidade' };

/** RN-016: Faturamento em todas; Pedidos em Cliente e Ramo; Quantidade em Produto. */
export function METRICAS(categoria: Categoria): { value: Metrica; label: string }[] {
  const lista: Metrica[] = ['FATURAMENTO'];
  if (categoria === 'CLIENTE' || categoria === 'RAMO') lista.push('PEDIDOS');
  if (categoria === 'PRODUTO') lista.push('QUANTIDADE');
  return lista.map(value => ({ value, label: ROTULO_METRICA[value] }));
}

export const MAX_BLOCOS = 4;
export const MAX_ITENS = 8;
export const NO_GRAFICO = 6;

export interface Bloco { id: number; categoria: Categoria; metrica: Metrica; de: string; ate: string; itens: string[] }
export interface ItemBloco { CHAVE: string; NOME: string; VALOR: number }

const dois = (n: number) => String(n).padStart(2, '0');
const trimestre = (ano: number, t: number) => ({
  de: `${ano}-${dois(t * 3 - 2)}-01`,
  ate: `${ano}-${dois(t * 3)}-${t === 1 || t === 4 ? 31 : 30}`,
});

/**
 * RN-016: abre com 2 blocos, Cliente · Faturamento, trimestre de referência e
 * o mesmo trimestre do ano anterior. Referência = último trimestre fechado
 * (15/10/2026 → 3º tri/2026), como o plano da 007 fixou.
 */
export function blocosPadrao(hoje: string): Bloco[] {
  const ano = Number(hoje.slice(0, 4));
  const t = Math.ceil(Number(hoje.slice(5, 7)) / 3) - 1;
  const [a, q] = t === 0 ? [ano - 1, 4] : [ano, t];
  return [
    { id: 1, categoria: 'CLIENTE', metrica: 'FATURAMENTO', ...trimestre(a, q), itens: [] },
    { id: 2, categoria: 'CLIENTE', metrica: 'FATURAMENTO', ...trimestre(a - 1, q), itens: [] },
  ];
}

/** RN-016: Dif. e Dif. % contra o bloco 1; base zero → % vazio. */
export function diferenca(base: number, valor: number): { dif: number; pct: number | null } {
  const dif = Math.round((valor - base) * 100) / 100;
  return { dif, pct: base ? dif / Math.abs(base) : null };
}

/** Itens do bloco: os escolhidos ou, sem escolha, os 6 maiores. */
export function itensVisiveis(bloco: Bloco, dados: ItemBloco[]): ItemBloco[] {
  if (bloco.itens.length) return bloco.itens.map(k => dados.find(d => String(d.CHAVE) === k) ?? { CHAVE: k, NOME: k, VALOR: 0 });
  return [...dados].sort((a, b) => Number(b.VALOR) - Number(a.VALOR)).slice(0, NO_GRAFICO);
}

/** Busca de itens: até 8 sugestões. */
export function sugestoes(dados: ItemBloco[], busca: string, escolhidos: string[]): ItemBloco[] {
  const t = busca.trim().toLocaleLowerCase('pt-BR');
  return dados.filter(d => !escolhidos.includes(String(d.CHAVE)) && (!t || `${d.NOME} ${d.CHAVE}`.toLocaleLowerCase('pt-BR').includes(t))).slice(0, MAX_ITENS);
}

const rotuloCategoria = (c: Categoria) => CATEGORIAS.find(x => x.value === c)?.label ?? c;
const rotuloBloco = (b: Bloco) => `Bloco ${b.id}`;

/** RN-016: planilha `comparativo-analytics-AAAA-MM-DD.xlsx`. */
export function planilhaModular(hoje: string, blocos: Bloco[], dados: ItemBloco[][], filtros: string): Planilha {
  const grupos = new Map<string, number[]>();
  blocos.forEach((b, i) => {
    const k = `${b.categoria}|${b.metrica}`;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  });
  const abas = [...grupos.values()].map(indices => {
    const primeiro = blocos[indices[0]];
    const formatoValor = primeiro.metrica === 'FATURAMENTO' ? FMT_MOEDA : '';
    const totais = indices.map(i => dados[i].reduce((t, d) => t + Number(d.VALOR || 0), 0));
    const chaves = new Map<string, string>();
    for (const i of indices) {
      const lista = blocos[i].itens.length ? dados[i].filter(d => blocos[i].itens.includes(String(d.CHAVE))) : dados[i];
      for (const d of lista) if (!chaves.has(String(d.CHAVE))) chaves.set(String(d.CHAVE), d.NOME);
    }
    const colunas = ['Chave', 'Item'];
    const formatos = ['', ''];
    indices.forEach((i, n) => {
      colunas.push(`${rotuloBloco(blocos[i])} valor`, `${rotuloBloco(blocos[i])} % do total`);
      formatos.push(formatoValor, FMT_PCT);
      if (n > 0) { colunas.push(`Dif. ${rotuloBloco(blocos[i])}`, `Dif. % ${rotuloBloco(blocos[i])}`); formatos.push(formatoValor, FMT_PCT); }
    });
    const linhas = [...chaves].map(([chave, nome]) => {
      const valores = indices.map(i => Number(dados[i].find(d => String(d.CHAVE) === chave)?.VALOR || 0));
      const linha: (string | number | null)[] = [chave, nome];
      valores.forEach((v, n) => {
        linha.push(v, totais[n] ? v / totais[n] : null);
        if (n > 0) { const d = diferenca(valores[0], v); linha.push(d.dif, d.pct); }
      });
      return linha;
    });
    return { nome: `${rotuloCategoria(primeiro.categoria)} · ${ROTULO_METRICA[primeiro.metrica]}`, colunas, formatos, linhas, fixas: 2 };
  });
  abas.push({
    nome: 'Base de dados',
    colunas: ['Bloco', 'Categoria', 'Métrica', 'De', 'Até', 'Chave', 'Item', 'Valor'],
    formatos: ['', '', '', '', '', '', '', ''],
    linhas: blocos.flatMap((b, i) => dados[i].map(d => [b.id, rotuloCategoria(b.categoria), ROTULO_METRICA[b.metrica], fmtData(b.de), fmtData(b.ate), d.CHAVE, d.NOME, Number(d.VALOR || 0)])),
    fixas: 1,
  });
  abas.push({
    nome: 'Parametros',
    colunas: ['Bloco', 'Categoria', 'Métrica', 'De', 'Até', 'Itens', 'Filtros'],
    formatos: ['', '', '', '', '', '', ''],
    linhas: blocos.map(b => [b.id, rotuloCategoria(b.categoria), ROTULO_METRICA[b.metrica], fmtData(b.de), fmtData(b.ate), b.itens.join(', ') || 'Todos', filtros]),
    fixas: 1,
  });
  return { arquivo: `comparativo-analytics-${hoje}.xlsx`, abas };
}

/* ─────────────── Comparativo mensal (RN-017) ─────────────── */

export type Recorte = 'TODOS' | 'QUEDA' | 'ALTA' | 'SEM_COMPRA' | 'NOVOS';

export const RECORTES: { value: Recorte; label: string }[] = [
  { value: 'TODOS', label: 'Todos os clientes' },
  { value: 'QUEDA', label: 'Em queda' },
  { value: 'ALTA', label: 'Em alta' },
  { value: 'SEM_COMPRA', label: 'Não compraram no mês' },
  { value: 'NOVOS', label: 'Novos no mês' },
];

export interface LinhaMensal {
  CLIENTE_ID: number; CLIENTE: string; RAMO: string;
  MES_2: number; MES_1: number; MES: number;
  variacao: number; pct: number | null; selo: 'SEM COMPRA' | 'NOVO' | null;
}

/** RN-017: variação, % vazio sem base, selos, recorte e ordem pelo mês anterior. */
export function mensal(linhas: LinhaMatriz[], recorte: Recorte) {
  const todas: LinhaMensal[] = linhas
    .filter(l => l.MES_2 || l.MES_1 || l.MES)
    .map(l => {
      const { dif, pct } = diferenca(l.MES_1, l.MES);
      const selo = l.MES_1 > 0 && l.MES === 0 ? 'SEM COMPRA' : l.MES > 0 && l.MES_1 <= 0 && l.MES_2 <= 0 ? 'NOVO' : null;
      return { CLIENTE_ID: l.CLIENTE_ID, CLIENTE: l.CLIENTE, RAMO: l.RAMO, MES_2: l.MES_2, MES_1: l.MES_1, MES: l.MES, variacao: dif, pct: l.MES_1 > 0 ? pct : null, selo } as LinhaMensal;
    });
  const filtradas = todas.filter(l => {
    switch (recorte) {
      case 'QUEDA': return l.variacao < 0;
      case 'ALTA': return l.variacao > 0;
      case 'SEM_COMPRA': return l.MES_1 > 0 && l.MES === 0;
      case 'NOVOS': return l.selo === 'NOVO';
      default: return true;
    }
  }).sort((a, b) => b.MES_1 - a.MES_1 || a.CLIENTE.localeCompare(b.CLIENTE, 'pt-BR'));
  const soma = (k: 'MES_2' | 'MES_1' | 'MES') => Math.round(filtradas.reduce((t, l) => t + l[k], 0) * 100) / 100;
  const totais = { MES_2: soma('MES_2'), MES_1: soma('MES_1'), MES: soma('MES') };
  const d = diferenca(totais.MES_1, totais.MES);
  return { linhas: filtradas, totais, variacao: d.dif, pct: totais.MES_1 > 0 ? d.pct : null };
}

/** Mês escolhido no Mensal: ano atual ou anterior. */
export function mesesMensal(hoje: string): { ano: number; mes: number }[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const lista: { ano: number; mes: number }[] = [];
  for (let a = ano, m = mes; a >= ano - 1; m === 1 ? (a -= 1, m = 12) : (m -= 1)) lista.push({ ano: a, mes: m });
  return lista;
}
