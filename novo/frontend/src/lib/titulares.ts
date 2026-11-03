// Regras de tela de Titulares de Clientes (RN-020 da spec 002). Regra pura;
// é o que tests/titulares.test.mjs importa.

export const SITUACOES = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'AUTO', label: 'Automático' },
  { value: 'MISTO', label: 'Titulares diferentes por seção' },
  { value: 'SEM_TITULAR', label: 'Sem titular' },
  { value: '', label: 'Todas' },
];

export function rotuloSituacao(situacao: string): string {
  return SITUACOES.find(s => s.value === situacao)?.label ?? situacao;
}

export function tomSituacao(situacao: string): 'attention' | 'live' | 'off' {
  return situacao === 'PENDENTE' ? 'attention' : situacao === 'MANUAL' || situacao === 'AUTO' ? 'live' : 'off';
}

/** "2:Ana Souza|3:Bruno Lima" → candidatos em ordem de nome. */
export function candidatos(texto: string | null | undefined): { id: string; nome: string }[] {
  return String(texto ?? '')
    .split('|')
    .map(parte => {
      const i = parte.indexOf(':');
      return { id: parte.slice(0, i).trim(), nome: parte.slice(i + 1).trim() };
    })
    .filter(c => c.id && c.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const FILTROS_PADRAO = { situacao: 'PENDENTE', filial: '', depto: '', busca: '', pagina: 1 };

type Filtros = typeof FILTROS_PADRAO;

/** Trocar a filial limpa o departamento (cascata); qualquer troca volta à página 1. */
export function trocarFiltro<K extends keyof Filtros>(filtros: Filtros, campo: K, valor: Filtros[K]): Filtros {
  const novo = { ...filtros, [campo]: valor, pagina: 1 };
  if (campo === 'filial') novo.depto = '';
  return novo;
}

export const MSG_NAO_SALVO =
  'Titular não salvo: o vendedor precisa ter o cliente na carteira e esta seção no escopo, e a combinação precisa estar sob sua gestão.';

/** RNT-013: linhas afetadas decidem a mensagem. */
export function mensagemTitular(linha: Record<string, unknown>, nome: string, afetadas: number): { ok: boolean; texto: string } {
  if (!(afetadas > 0)) return { ok: false, texto: MSG_NAO_SALVO };
  return { ok: true, texto: `${String(linha.CLIENTE)} · ${String(linha.DEPTO)} / ${String(linha.SECAO)}: titular definido para ${nome}.` };
}

export const EXPLICACAO_REGRA =
  'Fora de Enfermagem, o titular é decidido por cliente, filial e departamento e vale para todas as seções. Em Enfermagem, cada seção tem o seu titular. Só aparecem como opção os vendedores que têm o cliente na carteira e a seção no escopo.';
