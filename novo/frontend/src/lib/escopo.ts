// Filtro de escopo de visualização (RNT-003/004), comum a todas as telas que
// recortam dados pela carteira. Regra pura: sem React, sem SDK; é o que
// tests/escopo.test.mjs importa. O servidor confere de novo cada modo
// (escopoAlvo em novo/backend/lib/002-carteira.mjs): pedir o que não pode
// devolve zero linhas.

type Visao = 'ME' | 'TEAM' | 'ALL' | 'COORD';

interface Escopo {
  visao: Visao;
  coordenador: string;
  vendedor: string;
  filial: string;
  depto: string;
  secao: string;
}

interface SessaoEscopo {
  papeis: string[];
  coordenadorAtivo?: boolean;
}

// Linha de s360EscopoOpcoes (colunas em maiúsculas, como a plataforma devolve).
type LinhaEscopo = Record<string, unknown>;

interface Opcao {
  value: string;
  label: string;
}

const VAZIO = { coordenador: '', vendedor: '', filial: '', depto: '', secao: '' };
const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function ehDiretoria(sessao: SessaoEscopo): boolean {
  return sessao.papeis.includes('DIRETORIA') || sessao.papeis.includes('ADMIN');
}

/** Padrão do perfil: Meu painel (vendedor), Time inteiro (coordenador), Todos os coordenadores (diretoria). */
export function escopoPadrao(sessao: SessaoEscopo): Escopo {
  const visao: Visao = ehDiretoria(sessao) ? 'ALL' : sessao.coordenadorAtivo ? 'TEAM' : 'ME';
  return { visao, ...VAZIO };
}

/** Valor do seletor "Visão": ME, TEAM, ALL ou COORD:<código do supervisor>. */
export function valorVisao(escopo: Escopo): string {
  return escopo.visao === 'COORD' ? `COORD:${escopo.coordenador}` : escopo.visao;
}

function unicos(lista: Opcao[]): Opcao[] {
  const vistos = new Map<string, Opcao>();
  for (const o of lista) if (o.value && !vistos.has(o.value)) vistos.set(o.value, o);
  return [...vistos.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Visões que a pessoa pode pedir. */
export function visoes(sessao: SessaoEscopo, linhas: LinhaEscopo[]): Opcao[] {
  const lista: Opcao[] = [{ value: 'ME', label: 'Meu painel' }];
  if (sessao.coordenadorAtivo) lista.push({ value: 'TEAM', label: 'Time inteiro' });
  if (ehDiretoria(sessao)) {
    lista.push({ value: 'ALL', label: 'Todos os coordenadores' });
    lista.push(...unicos(linhas
      .filter(l => texto(l.COD_SUPERVISOR))
      .map(l => ({ value: `COORD:${texto(l.COD_SUPERVISOR)}`, label: `Coordenador: ${texto(l.COORDENADOR)}` }))));
  }
  return lista;
}

function daVisao(linhas: LinhaEscopo[], escopo: Escopo): LinhaEscopo[] {
  switch (escopo.visao) {
    case 'TEAM': return linhas.filter(l => Number(l.MEU_TIME) === 1);
    case 'ALL': return linhas.filter(l => texto(l.COD_SUPERVISOR));
    case 'COORD': return linhas.filter(l => texto(l.COD_SUPERVISOR) === escopo.coordenador);
    default: return linhas.filter(l => Number(l.PROPRIO) === 1);
  }
}

/** Opções dos seletores em cascata; a lista de vendedores sempre respeita a visão (coordenador) escolhida. */
export function opcoesEscopo(linhas: LinhaEscopo[], escopo: Escopo) {
  const base = daVisao(linhas, escopo);
  const doVendedor = escopo.vendedor ? base.filter(l => texto(l.VENDEDOR_ID) === escopo.vendedor) : base;
  const daFilial = escopo.filial ? doVendedor.filter(l => texto(l.CODFILIAL) === escopo.filial) : doVendedor;
  const doDepto = escopo.depto ? daFilial.filter(l => texto(l.CODEPTO) === escopo.depto) : daFilial;
  return {
    vendedores: escopo.visao === 'ME' ? [] : unicos(base.map(l => ({ value: texto(l.VENDEDOR_ID), label: texto(l.VENDEDOR) }))),
    filiais: unicos(doVendedor.map(l => ({ value: texto(l.CODFILIAL), label: texto(l.FILIAL) }))),
    deptos: unicos(daFilial.map(l => ({ value: texto(l.CODEPTO), label: texto(l.DEPTO) }))),
    secoes: unicos(doDepto.map(l => ({ value: texto(l.ID_SECAO), label: texto(l.SECAO) }))),
  };
}

/**
 * Cascata da RNT-003: trocar a visão (coordenador) limpa vendedor, filial,
 * departamento e seção; trocar o vendedor ou a filial limpa o que vem abaixo;
 * trocar o departamento limpa a seção.
 */
export function trocar(escopo: Escopo, campo: 'visao' | 'vendedor' | 'filial' | 'depto' | 'secao', valor: string): Escopo {
  if (campo === 'visao') {
    const [visao, coordenador = ''] = valor.split(':');
    const v = (['ME', 'TEAM', 'ALL', 'COORD'].includes(visao) ? visao : 'ME') as Visao;
    return { ...VAZIO, visao: v, coordenador: v === 'COORD' ? coordenador : '' };
  }
  if (campo === 'vendedor') return { ...escopo, vendedor: valor, filial: '', depto: '', secao: '' };
  if (campo === 'filial') return { ...escopo, filial: valor, depto: '', secao: '' };
  if (campo === 'depto') return { ...escopo, depto: valor, secao: '' };
  return { ...escopo, secao: valor };
}

/** Coordenador e diretoria sempre veem o filtro; vendedor só com mais de um escopo. */
export function mostraFiltro(sessao: SessaoEscopo, linhas: LinhaEscopo[]): boolean {
  if (sessao.coordenadorAtivo || ehDiretoria(sessao)) return true;
  const proprios = new Set(linhas.filter(l => Number(l.PROPRIO) === 1)
    .map(l => `${texto(l.CODFILIAL)}|${texto(l.CODEPTO)}|${texto(l.ID_SECAO)}`));
  return proprios.size > 1;
}

/** Parâmetros de escopo das SFs (todos texto, '' = sem recorte). */
export function paraInput(escopo: Escopo, hoje: string): Record<string, string> {
  return {
    modo: escopo.vendedor ? 'SELLER' : escopo.visao,
    coordenador: escopo.visao === 'COORD' ? escopo.coordenador : '',
    vendedor: escopo.vendedor,
    filial: escopo.filial,
    depto: escopo.depto,
    secao: escopo.secao,
    hoje,
  };
}

// Lembrado entre telas até sair (RNT-003): a chave carrega um pedaço do token
// da sessão, então um login novo volta ao padrão do perfil.
const CHAVE = 's360:escopo';

interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export function lembrar(escopo: Escopo, marcaSessao: string, armazenamento: Armazenamento): void {
  try {
    armazenamento.setItem(CHAVE, JSON.stringify({ marca: marcaSessao, escopo }));
  } catch {
    // armazenamento bloqueado: o filtro só não é lembrado.
  }
}

export function recuperar(sessao: SessaoEscopo, marcaSessao: string, armazenamento: Armazenamento): Escopo {
  try {
    const salvo = JSON.parse(armazenamento.getItem(CHAVE) || 'null');
    const e = salvo?.marca === marcaSessao ? salvo.escopo : null;
    if (e && ['ME', 'TEAM', 'ALL', 'COORD'].includes(e.visao)) {
      return { ...VAZIO, ...Object.fromEntries(Object.keys(VAZIO).map(k => [k, texto(e[k])])), visao: e.visao };
    }
  } catch {
    // valor corrompido: volta ao padrão.
  }
  return escopoPadrao(sessao);
}
