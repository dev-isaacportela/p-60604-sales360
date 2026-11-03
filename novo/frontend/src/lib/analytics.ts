// Analytics (spec 007): regra pura de tela. Os blocos vêm somados pelas SFs
// s360Analytics* (novo/backend/add-007-analytics.mjs); aqui ficam período,
// projeção, evolução, cards, ordenação e o clique no ranking.

import { fmtData } from './formato.ts';

export type TipoPeriodo = 'MES' | 'TRIMESTRE' | 'ANO' | 'PERSONALIZADO';

export const PERIODOS: { value: TipoPeriodo; label: string }[] = [
  { value: 'MES', label: 'Mês atual' },
  { value: 'TRIMESTRE', label: 'Último trimestre' },
  { value: 'ANO', label: 'Último ano' },
  { value: 'PERSONALIZADO', label: 'Intervalo personalizado' },
];

export const MSG_BUSCAR = 'Alterações nos filtros só afetam os blocos após clicar em Buscar.';
export const MSG_ORDEM = 'A data inicial deve ser anterior à final.';
export const MSG_24_MESES = 'O intervalo pode ter no máximo 24 meses.';

const dois = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
const data = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const somarDias = (s: string, n: number) => iso(new Date(data(s).getTime() + n * 86400000));
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const inicioMes = (ano: number, mes: number) => iso(new Date(Date.UTC(ano, mes - 1, 1)));
const fimMes = (ano: number, mes: number) => `${ano}-${dois(mes)}-${dois(ultimoDia(ano, mes))}`;

/** Meses de calendário que o intervalo toca (contando os dois extremos). */
const mesesEntre = (de: string, ate: string) =>
  (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) + 1;

/** RN-001 / C-017: null = válido. */
export function validarIntervalo(de: string, ate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) return MSG_ORDEM;
  return mesesEntre(de, ate) > 24 ? MSG_24_MESES : null;
}

/** RN-001: datas do período escolhido. */
export function periodo(tipo: TipoPeriodo, hoje: string, de = '', ate = ''): { de: string; ate: string } | { erro: string } {
  if (tipo === 'PERSONALIZADO') {
    const erro = validarIntervalo(de, ate);
    return erro ? { erro } : { de, ate };
  }
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const voltar = tipo === 'TRIMESTRE' ? 2 : tipo === 'ANO' ? 11 : 0;
  const ini = new Date(Date.UTC(ano, mes - 1 - voltar, 1));
  return { de: iso(ini), ate: fimMes(ano, mes) };
}

/** RN-007: período imediatamente anterior de mesmo tamanho (em meses, se o período for de meses inteiros). */
export function periodoAnterior(de: string, ate: string): { deAnt: string; ateAnt: string } {
  const [a, m] = [Number(ate.slice(0, 4)), Number(ate.slice(5, 7))];
  if (de.slice(8) === '01' && ate === fimMes(a, m)) {
    const n = mesesEntre(de, ate);
    const ini = new Date(Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1 - n, 1));
    return { deAnt: iso(ini), ateAnt: somarDias(de, -1) };
  }
  const dias = Math.round((data(ate).getTime() - data(de).getTime()) / 86400000) + 1;
  return { deAnt: somarDias(de, -dias), ateAnt: somarDias(de, -1) };
}

export const ehUtil = (s: string) => { const d = data(s).getUTCDay(); return d >= 1 && d <= 5; };

/** RNT-016: segunda a sexta, sem descontar feriados. */
export function diasUteis(de: string, ate: string): number {
  let n = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) if (ehUtil(d)) n += 1;
  return n;
}

/** RN-005: líquido ÷ dias úteis decorridos (mín. 1) × dias úteis do período; encerrado = líquido. */
export function projecao(liquido: number, de: string, ate: string, hoje: string): number {
  if (ate < hoje) return liquido;
  const decorridos = Math.max(1, diasUteis(de, hoje < de ? de : hoje));
  return Math.round((liquido / decorridos) * diasUteis(de, ate) * 100) / 100;
}

/** RN-006: até 31 dias = um ponto por dia. */
export const porDia = (de: string, ate: string) => Math.round((data(ate).getTime() - data(de).getTime()) / 86400000) + 1 <= 31;

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface Ponto { chave: string; rotulo: string; valor: number; meta: number }

/**
 * RN-006: pontos da Evolução Histórica. `linhas` = s360AnalyticsEvolucao
 * (TIPO 'L': líquido por CHAVE dia ou mês; 'M': meta por mês 'AAAA-MM').
 * Meta diária = meta do mês ÷ dias úteis do mês, zero no fim de semana.
 */
export function pontosEvolucao(linhas: Record<string, unknown>[], de: string, ate: string): Ponto[] {
  const liquido = new Map<string, number>();
  const metaMes = new Map<string, number>();
  for (const l of linhas) {
    const alvo = l.TIPO === 'M' ? metaMes : liquido;
    alvo.set(String(l.CHAVE), (alvo.get(String(l.CHAVE)) ?? 0) + Number(l.VALOR || 0));
  }
  const pontos: Ponto[] = [];
  if (porDia(de, ate)) {
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const [a, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
      const util = diasUteis(inicioMes(a, m), fimMes(a, m));
      const meta = ehUtil(d) && util ? Math.round(((metaMes.get(d.slice(0, 7)) ?? 0) / util) * 100) / 100 : 0;
      pontos.push({ chave: d, rotulo: fmtData(d).slice(0, 5), valor: liquido.get(d) ?? 0, meta });
    }
    return pontos;
  }
  for (let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7)); `${a}-${dois(m)}` <= ate.slice(0, 7); m === 12 ? (a += 1, m = 1) : (m += 1)) {
    const chave = `${a}-${dois(m)}`;
    pontos.push({ chave, rotulo: `${MES_CURTO[m - 1]}/${String(a).slice(2)}`, valor: liquido.get(chave) ?? 0, meta: metaMes.get(chave) ?? 0 });
  }
  return pontos;
}

/** RN-004: rótulo do primeiro ponto em que o líquido acumulado alcança a meta; null se não alcançou. */
export function metaBatidaEm(pontos: Ponto[], meta: number): string | null {
  if (meta <= 0) return null;
  let acumulado = 0;
  return pontos.find(p => (acumulado += p.valor) >= meta)?.rotulo ?? null;
}

/** RF-010: item sem cadastro (sem ramo, sem segmento, sem fornecedor, produto sem descrição) aparece em cinza. */
export const semCadastro = (nome: string) => /^sem /i.test(nome) || nome === 'Produto sem descrição';

/** "80,0%" a partir de uma fração. */
export const fmtPct = (fracao: number) =>
  `${(Math.round(fracao * 1000) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** RN-004: cards do Overview a partir de s360AnalyticsResumo. */
export function cardsResumo(r: Record<string, unknown> | null) {
  const meta = Number(r?.META || 0);
  const bruto = Number(r?.BRUTO || 0);
  const devolvido = Number(r?.DEVOLVIDO || 0);
  const liquido = Number(r?.LIQUIDO || 0);
  return {
    meta, bruto, devolvido, liquido,
    falta: Math.max(meta - liquido, 0),
    atingimento: meta > 0 ? liquido / meta : 0,
    semMeta: meta <= 0,
    pctDevolvido: bruto > 0 ? devolvido / bruto : 0,
  };
}

/** RF-022: ordena pelo número quando os dois lados são números. */
export function ordenar<T extends Record<string, unknown>>(linhas: T[], campo: keyof T, direcao: 'asc' | 'desc'): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const [x, y] = [a[campo], b[campo]];
    const [nx, ny] = [Number(x), Number(y)];
    const numeros = x !== null && x !== '' && y !== null && y !== '' && Number.isFinite(nx) && Number.isFinite(ny);
    return sinal * (numeros ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR'));
  });
}

/** Lista para o parâmetro da SF: ',1,2,' (clientes/produtos) ou '|A|B|' (ramos); vazio = sem filtro. */
export const listaParam = (itens: string[], sep: ',' | '|') => (itens.length ? `${sep}${itens.join(sep)}${sep}` : '');

export interface Filtros { tipo: TipoPeriodo; de: string; ate: string; ramos: string[]; clientes: string[]; produtos: string[] }

/** RF-023: só os rankings de cliente e de produto filtram. */
export function filtroDoClique<F extends { clientes: unknown[]; produtos: unknown[] }>(filtros: F, grafico: string, item: F['clientes'][number]): F {
  if (grafico === 'CLIENTE') return { ...filtros, clientes: [item] };
  if (grafico === 'PRODUTO') return { ...filtros, produtos: [item] };
  return filtros;
}

/** Parâmetros comuns dos blocos (além do escopo). */
export function paramsRecorte(de: string, ate: string, f: Pick<Filtros, 'ramos' | 'clientes' | 'produtos'>) {
  return { de, ate, ramos: listaParam(f.ramos, '|'), clientes: listaParam(f.clientes, ','), produtos: listaParam(f.produtos, ',') };
}

/** RF-001: vendedor não vê a aba Metas. */
export function abas(sessao: { papeis: string[]; coordenadorAtivo?: boolean }): string[] {
  const gestao = sessao.coordenadorAtivo || sessao.papeis.includes('DIRETORIA') || sessao.papeis.includes('ADMIN');
  return gestao ? ['Overview', 'Clientes', 'Produtos', 'Metas', 'Modular'] : ['Overview', 'Clientes', 'Produtos', 'Modular'];
}

export const TIPOS_VISITA = ['Aumento de mix', 'Padronização de produto', 'Positivação', 'Renegociação', 'Manutenção'];

/** RN-009: total, média semanal (mín. 1 semana) e os 5 tipos; o resto vai em "Outros tipos". */
export function visitas(linhas: Record<string, unknown>[], de: string, ate: string) {
  const dias = Math.round((data(ate).getTime() - data(de).getTime()) / 86400000) + 1;
  const tipos = new Map([...TIPOS_VISITA, 'Outros tipos'].map(t => [t, 0]));
  let total = 0;
  for (const l of linhas) {
    const n = Number(l.N || 0);
    total += n;
    const tipo = TIPOS_VISITA.find(t => String(l.TIPO ?? '').startsWith(t)) ?? 'Outros tipos';
    tipos.set(tipo, (tipos.get(tipo) ?? 0) + n);
  }
  return {
    total,
    media: Math.round((total / Math.max(1, dias / 7)) * 10) / 10,
    tipos: [...tipos].filter(([t, n]) => t !== 'Outros tipos' || n > 0).map(([tipo, n]) => ({ tipo, n })),
  };
}

/** R$ curto para eixo: 12,5 mil · 1,2 mi. */
export function moedaCurta(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
