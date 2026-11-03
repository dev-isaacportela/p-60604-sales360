// Papéis de Usuários (RNT-001, RN-016, D-010-2). Regra pura: tests/papeis.test.mjs.

/** Os únicos que esta tela marca e desmarca. GESTOR e ADMIN só aparecem. */
export const EDITAVEIS = ['DIRETORIA', 'COORDENADOR', 'VENDEDOR'] as const;

type Editavel = (typeof EDITAVEIS)[number];

export function editavel(papel: string): papel is Editavel {
  return (EDITAVEIS as readonly string[]).includes(papel);
}

/** Lista "COORDENADOR,GESTOR" → papéis em ordem; vazio = VENDEDOR (RNT-001). */
export function lerPapeis(valor: unknown): string[] {
  const lista = String(valor ?? '').split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
  return lista.length ? [...new Set(lista)].sort() : ['VENDEDOR'];
}

/** Entrada das SFs de papel: o conjunto inteiro dos editáveis, 0/1 (a tela salva tudo). */
export function marcacoes(marcados: string[]) {
  const tem = (p: Editavel) => (marcados.includes(p) ? 1 : 0);
  return { diretoria: tem('DIRETORIA'), coordenador: tem('COORDENADOR'), vendedor: tem('VENDEDOR') };
}

/** "<Nome>: papéis salvos (COORDENADOR, GESTOR)." — a partir da releitura. */
export function mensagemPapeis(nome: string, papeis: string[]): string {
  return `${nome}: papéis salvos (${[...papeis].sort().join(', ')}).`;
}

/** Usuários (RN-001 da 010): cada papel edita só a sua parte do painel do usuário. */
export function partesUsuarios(papeis: string[], coordenadorAtivo = false) {
  const tem = (...p: string[]) => p.some(x => papeis.includes(x));
  const global = tem('GESTOR', 'DIRETORIA', 'ADMIN');
  // Coordenador ativo sem papel global vê só a equipe e só o acesso das executivas.
  return { papeis: tem('DIRETORIA', 'ADMIN'), rcaEscopo: tem('GESTOR', 'ADMIN'), acesso: global || coordenadorAtivo, soEquipe: !global };
}
