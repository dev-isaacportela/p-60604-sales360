// Aba Metas do Analytics (spec 007): regra pura de tela. A meta recebida por
// Filial/BU vem pronta da s360MetasCarregar; aqui ficam o campo de valor, o
// que mudou, rateio rápido, status, ramo/UF (RN-012), mensagens e relatório.

import { FMT_MOEDA, FMT_PCT, type Planilha } from './semanal.ts';

export interface Bu { CODFILIAL: number; CODEPTO: number; UF: string; META: number; FILIAL?: string; DEPTO: string }
export interface Vendedor { VENDEDOR_ID: number; NOME: string; CODFILIAL: number; CODEPTO: number; UF: string; META: number; REALIZADO: number }
export interface Base { CODEPTO: number; UF: string; RAMO: string; RAMO_NOME: string; VALOR: number }
export interface UfVendedor { VENDEDOR_ID: number; CODEPTO: number; UF: string }
export interface Personalizada { VENDEDOR_ID: number; CODEPTO: number; RAMO_CODE: string; RAMO_NOME: string; UF: string; META_VALOR: number }
export interface RealizadoRamo { VENDEDOR_ID: number; CODEPTO: number; UF: string; RAMO: string; RAMO_NOME: string; LIQUIDO: number }

const centavos = (v: number) => Math.round(v * 100) / 100;

export const chaveBu = (b: { CODFILIAL: number; CODEPTO: number }) => `${b.CODFILIAL}|${b.CODEPTO}`;
export const chaveVendedor = (v: { VENDEDOR_ID: number; CODFILIAL: number; CODEPTO: number }) => `${v.VENDEDOR_ID}|${v.CODFILIAL}|${v.CODEPTO}`;

/** RF-015: "Filial N · UF · Departamento". */
export const rotuloBu = (b: { CODFILIAL: number; UF: string; DEPTO: string }) => `Filial ${b.CODFILIAL} · ${b.UF || '—'} · ${b.DEPTO}`;

/** RF-013: origem da meta mostrada. */
export function origem(bus: Bu[]): string {
  const ufs = [...new Set(bus.filter(b => b.META > 0).map(b => b.UF).filter(Boolean))].sort();
  return ufs.length ? `Planejamento estratégico · ${ufs.join(', ')}` : '';
}

/** RN-018: `1.500,50`, `1500.50`, `R$ 1.500,50` → 1500,5; `1,500` → 1500; vazio ou negativo → null. */
export function lerValor(texto: string | null | undefined): number | null {
  const t = String(texto ?? '').replace(/R\$/i, '').replace(/\s/g, '');
  if (!t || t.startsWith('-')) return null;
  const m = /^(.*)[.,](\d{1,2})$/.exec(t);
  const inteiro = (m ? m[1] : t).replace(/[.,]/g, '');
  const numero = m ? `${inteiro}.${m[2]}` : inteiro;
  return /^\d+(\.\d{1,2})?$/.test(numero) ? Number(numero) : null;
}

/** Valor para o campo: 1500.5 → "1.500,50". */
export const paraCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Gravacao { vendedorId: number; codFilial: number; codepto: number; valor: number }

/** RN-019: só o que difere do gravado (≥ R$ 0,005); campo inválido barra tudo. */
export function alteracoes(vendedores: Vendedor[], edicoes: Record<string, string>): { metas: Gravacao[]; invalidos: string[] } {
  const metas: Gravacao[] = [];
  const invalidos: string[] = [];
  for (const v of vendedores) {
    const texto = edicoes[chaveVendedor(v)];
    if (texto === undefined) continue;
    const valor = lerValor(texto);
    if (valor === null) { if (!invalidos.includes(v.NOME)) invalidos.push(v.NOME); continue; }
    if (Math.abs(valor - v.META) >= 0.005) metas.push({ vendedorId: v.VENDEDOR_ID, codFilial: v.CODFILIAL, codepto: v.CODEPTO, valor });
  }
  return { metas, invalidos };
}

/** Meta na tela (editada ou gravada). */
export function metaNaTela(v: Vendedor, edicoes: Record<string, string>): number {
  const texto = edicoes[chaveVendedor(v)];
  return texto === undefined ? v.META : lerValor(texto) ?? 0;
}

/** RN-013. */
export function statusRateio(s: { carregando?: boolean; semEquipe?: boolean; pendente?: boolean; meta: number; distribuido: number }): string {
  if (s.carregando) return 'carregando';
  if (s.semEquipe) return 'sem equipe no escopo';
  if (s.pendente) return 'alterações não salvas';
  if (Math.abs(s.meta - s.distribuido) < 0.01) return 'rateio fechado';
  if (s.distribuido === 0) return 'não distribuído';
  return 'em aberto';
}

/** RN-014. */
export function statusVendedor(meta: number, realizado: number): 'sem meta' | 'acima' | 'atenção' | 'risco' {
  if (!(meta > 0)) return 'sem meta';
  const a = realizado / meta;
  return a >= 1 ? 'acima' : a >= 0.8 ? 'atenção' : 'risco';
}

export const tomVendedor = (s: string) => (s === 'acima' ? 'live' : s === 'atenção' ? 'attention' : s === 'risco' ? 'alert' : 'off') as 'live' | 'attention' | 'alert' | 'off';

export type TipoRateio = 'IGUAL' | 'REALIZADO' | 'PROPORCAO';

/**
 * RN-015: reparte a meta da BU entre os vendedores dela. Peso negativo conta
 * zero; peso total zero = partes iguais.
 * ponytail: arredonda cada parte a centavos; o resíduo de 1 centavo fica no saldo.
 */
export function ratear(tipo: TipoRateio, metaBu: number, vendedores: { realizado: number; meta: number }[]): number[] {
  if (!vendedores.length) return [];
  const pesos = vendedores.map(v => (tipo === 'IGUAL' ? 1 : Math.max(0, tipo === 'REALIZADO' ? v.realizado : v.meta)));
  const total = pesos.reduce((t, p) => t + p, 0);
  return pesos.map(p => centavos(total > 0 ? (metaBu * p) / total : metaBu / vendedores.length));
}

export const MSG_NADA = 'Nenhuma alteração para salvar.';
export const MSG_SEM_META = 'Nenhuma meta da diretoria encontrada para o período.';
export const mensagemInvalido = (nomes: string[]) => `Valor de meta inválido em: ${nomes.join(', ')}. Nada foi gravado.`;
export const mensagemRamosAcima = (nomes: string[]) => `Os ramos ajustados passam da meta total de: ${nomes.join(', ')}. Reduza os valores. Nada foi gravado.`;

/** RN-019: sucesso. */
export function mensagemSalvar(vendedores: number, ramos: number): string {
  if (!ramos) return `Metas salvas: ${vendedores} vendedor(es).`;
  return vendedores ? `Metas salvas: ${vendedores} vendedor(es) e ${ramos} ajuste(s) por ramo/UF.` : `Metas salvas: ${ramos} ajuste(s) por ramo/UF.`;
}

/** RF-019: confirmação de descarte. */
export function perguntaDescartar(n: number): string {
  return n === 1
    ? 'Existe 1 alteração de meta ainda não salva. Recarregar os dados vai descartar essa alteração. Deseja continuar?'
    : `Existem ${n} alterações de meta ainda não salvas. Recarregar os dados vai descartar essas alterações. Deseja continuar?`;
}

/** RNT-013: motivo da recusa (s360MetasMotivo). */
export function mensagemMotivo(m: Record<string, unknown> | null): string {
  const bu = m?.CODFILIAL ? `Filial ${m.CODFILIAL} · ${m?.DEPTO ?? ''}` : String(m?.DEPTO ?? '');
  switch (m?.MOTIVO) {
    case 'SOMENTE_LEITURA': return 'Nada foi alterado: a diretoria acompanha as metas só em leitura.';
    case 'MES_INVALIDO': return 'Nada foi alterado: mês inválido.';
    case 'BU_NAO_COORDENADA': return `Nada foi alterado: você não coordena a BU ${bu}.`;
    case 'SEM_ESCOPO': return `Nada foi alterado: ${m.VENDEDOR} não tem escopo ativo na BU ${bu}.`;
    case 'VENDEDOR_COORDENADOR': return `Nada foi alterado: ${m.VENDEDOR} é coordenador e não recebe meta.`;
    case 'VALOR_INVALIDO': return 'Nada foi alterado: valor de meta inválido.';
    default: return 'Nada foi alterado. Tente de novo.';
  }
}

/* ─────────────── ramo/UF (RN-012) ─────────────── */

export interface LinhaRamo {
  ramo: string;
  ramoNome: string;
  uf: string;
  base: number;
  valor: number;
  personalizada: boolean;
  editavel: boolean;
  realizado: number;
}

/** Valores fixados pelo coordenador: chave `ramo|uf` → valor (null = volta a automática). */
export type Fixados = Record<string, number | null>;
export const chaveRamo = (ramo: string, uf: string) => `${ramo}|${uf}`;

/**
 * RN-012: meta do vendedor na BU repartida pelos ramos/UF da base, só nas UFs
 * dele; personalizada mantém o valor e as automáticas dividem a sobra. Ramo
 * com venda e sem planejamento aparece pelo realizado, sem meta.
 */
export function ramosDoVendedor(p: {
  vendedorId: number; codepto: number; metaBu: number;
  base: Base[]; ufs: UfVendedor[]; personalizadas: Personalizada[]; realizado: RealizadoRamo[]; fixados?: Fixados;
}): LinhaRamo[] {
  const suas = new Set(p.ufs.filter(u => u.VENDEDOR_ID === p.vendedorId && u.CODEPTO === p.codepto).map(u => u.UF));
  const planejadas = new Map<string, LinhaRamo>();
  for (const b of p.base) {
    if (b.CODEPTO !== p.codepto || !suas.has(b.UF)) continue;
    const k = chaveRamo(b.RAMO, b.UF);
    const atual = planejadas.get(k) ?? { ramo: b.RAMO, ramoNome: b.RAMO_NOME, uf: b.UF, base: 0, valor: 0, personalizada: false, editavel: true, realizado: 0 };
    atual.base += Number(b.VALOR) || 0;
    planejadas.set(k, atual);
  }
  const gravadas = new Map(p.personalizadas
    .filter(x => x.VENDEDOR_ID === p.vendedorId && x.CODEPTO === p.codepto)
    .map(x => [chaveRamo(x.RAMO_CODE, x.UF), x.META_VALOR]));
  const linhas = [...planejadas.values()];
  for (const l of linhas) {
    const k = chaveRamo(l.ramo, l.uf);
    const fixado = p.fixados && k in p.fixados ? p.fixados[k] : gravadas.get(k);
    if (fixado !== null && fixado !== undefined) { l.personalizada = true; l.valor = fixado; }
  }
  const auto = linhas.filter(l => !l.personalizada);
  const sobra = Math.max(0, p.metaBu - linhas.filter(l => l.personalizada).reduce((t, l) => t + l.valor, 0));
  ratear('PROPORCAO', sobra, auto.map(l => ({ realizado: 0, meta: l.base }))).forEach((v, i) => { auto[i].valor = v; });

  for (const r of p.realizado) {
    if (r.VENDEDOR_ID !== p.vendedorId || r.CODEPTO !== p.codepto) continue;
    const k = chaveRamo(r.RAMO, r.UF);
    const alvo = planejadas.get(k);
    if (alvo) alvo.realizado = centavos(alvo.realizado + r.LIQUIDO);
    else linhas.push({ ramo: r.RAMO, ramoNome: r.RAMO_NOME, uf: r.UF, base: 0, valor: 0, personalizada: false, editavel: false, realizado: r.LIQUIDO });
  }
  return linhas.sort((a, b) => a.uf.localeCompare(b.uf) || a.ramoNome.localeCompare(b.ramoNome, 'pt-BR'));
}

/** RN-012: personalizadas não passam da meta do vendedor na BU. */
export const validarRamos = (linhas: LinhaRamo[], metaBu: number) =>
  linhas.filter(l => l.personalizada).reduce((t, l) => t + l.valor, 0) <= metaBu + 0.005;

/**
 * RN-012: sem nenhuma automática, a meta do vendedor na BU vira a soma das
 * personalizadas, repartida entre as filiais na proporção atual. Devolve as
 * novas metas por filial (mesma ordem de `filiais`) ou null se nada muda.
 */
export function aplicarRamos(linhas: LinhaRamo[], filiais: { meta: number }[]): number[] | null {
  const planejadas = linhas.filter(l => l.editavel);
  if (!planejadas.length || planejadas.some(l => !l.personalizada)) return null;
  const total = planejadas.reduce((t, l) => t + l.valor, 0);
  return ratear('PROPORCAO', total, filiais.map(f => ({ realizado: 0, meta: f.meta })));
}

/* ─────────────── insights e relatório (RF-021) ─────────────── */

export function insights(bus: Bu[], vendedores: Vendedor[], realizado: RealizadoRamo[]) {
  const porUf = new Map<string, { uf: string; meta: number; realizado: number }>();
  const uf = (u: string) => porUf.get(u) ?? porUf.set(u, { uf: u, meta: 0, realizado: 0 }).get(u)!;
  for (const b of bus) uf(b.UF).meta += b.META;
  for (const v of vendedores) uf(v.UF).realizado += v.REALIZADO;
  const estados = [...porUf.values()].map(e => ({ ...e, atingimento: e.meta > 0 ? e.realizado / e.meta : 0 }))
    .sort((a, b) => b.meta - a.meta || a.uf.localeCompare(b.uf));
  const ramos = new Map<string, number>();
  for (const r of realizado) ramos.set(r.RAMO_NOME, (ramos.get(r.RAMO_NOME) ?? 0) + r.LIQUIDO);
  const lider = [...ramos].sort((a, b) => b[1] - a[1])[0];
  const destaque = [...estados].filter(e => e.meta > 0).sort((a, b) => b.atingimento - a.atingimento)[0];
  return {
    ocupacao: estados.slice(0, 3),
    destaque: destaque ?? null,
    ramoLider: lider ? { ramo: lider[0], realizado: centavos(lider[1]) } : null,
    estados,
  };
}

export function planilhaMetas(ano: number, mes: number, bus: Bu[], vendedores: Vendedor[], ramos: { vendedor: Vendedor; linhas: LinhaRamo[] }[]): Planilha {
  const depto = new Map(bus.map(b => [b.CODEPTO, b.DEPTO]));
  const rotulo = new Map(bus.map(b => [chaveBu(b), rotuloBu(b)]));
  return {
    arquivo: `metas-${ano}-${String(mes).padStart(2, '0')}.xlsx`,
    abas: [
      {
        nome: 'Vendedores',
        colunas: ['Vendedor ID', 'Vendedor', 'Filial / BU', 'Meta', 'Realizado', 'Atingimento', 'Status'],
        formatos: ['', '', '', FMT_MOEDA, FMT_MOEDA, FMT_PCT, ''],
        linhas: vendedores.map(v => [v.VENDEDOR_ID, v.NOME, rotulo.get(chaveBu(v)) ?? '', v.META, v.REALIZADO,
          v.META > 0 ? v.REALIZADO / v.META : null, statusVendedor(v.META, v.REALIZADO)]),
        fixas: 2,
      },
      {
        nome: 'Ramos por UF',
        colunas: ['Vendedor ID', 'Vendedor', 'Departamento', 'UF', 'Ramo', 'Meta', 'Realizado', 'Personalizada'],
        formatos: ['', '', '', '', '', FMT_MOEDA, FMT_MOEDA, ''],
        linhas: ramos.flatMap(r => r.linhas.map(l => [r.vendedor.VENDEDOR_ID, r.vendedor.NOME, depto.get(r.vendedor.CODEPTO) ?? '',
          l.uf, l.ramoNome, l.editavel ? l.valor : null, l.realizado, l.personalizada ? 'Sim' : 'Não'])),
        fixas: 2,
      },
    ],
  };
}
