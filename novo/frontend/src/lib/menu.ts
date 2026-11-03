// Rotas, menu e permissão de tela (RN-005, RN-006, RN-011, RN-015).
// Regra pura: sem React, sem SDK. É o que tests/menu.test.mjs importa.
//
// Acesso por papel ou por cadastro, nunca por pessoa (RNT-002). "TI" como
// perfil = papel ADMIN (RNT-001). A tela confere aqui antes de montar; o
// servidor confere de novo em cada SF.

type Perfil = 'TODOS' | 'COORDENADOR_ATIVO' | 'DIRETORIA' | 'GESTOR' | 'ADMIN';

interface SessaoAcesso {
  papeis: string[];
  coordenadorAtivo?: boolean;
}

interface Rota {
  caminho: string;
  titulo: string;
  perfis: Perfil[];
}

interface ItemMenu {
  caminho: string;
  rotulo: string;
  contador?: 'atividades' | 'alertas';
}

interface SecaoMenu {
  id: 'principal' | 'coordenador' | 'diretoria' | 'gestao' | 'final';
  titulo: string;
  itens: ItemMenu[];
}

const TODOS: Perfil[] = ['TODOS'];
const COORD: Perfil[] = ['COORDENADOR_ATIVO'];
const DIRETORIA: Perfil[] = ['DIRETORIA', 'ADMIN'];
const COORD_DIRETORIA: Perfil[] = ['COORDENADOR_ATIVO', 'DIRETORIA', 'ADMIN'];
const USUARIOS: Perfil[] = ['COORDENADOR_ATIVO', 'DIRETORIA', 'GESTOR', 'ADMIN'];

/**
 * Todas as telas do sistema novo. Telas canceladas não existem aqui: Ajuda, Suporte,
 * Painel Dev, Notas de versão, Solicitações (2026-10-30) e Agenda dos Vendedores,
 * Análise Diretoria, Faturamento e Gestão de Metas (2026-11-03).
 */
export const ROTAS: Rota[] = [
  { caminho: '/', titulo: 'Dashboard', perfis: TODOS },
  { caminho: '/agenda', titulo: 'Agenda', perfis: TODOS },
  { caminho: '/clientes', titulo: 'Clientes', perfis: TODOS },
  { caminho: '/clientes/:clienteId', titulo: 'Histórico do cliente', perfis: TODOS },
  { caminho: '/tarefas', titulo: 'Atividades', perfis: TODOS },
  { caminho: '/simulacao', titulo: 'Mix Builder', perfis: TODOS },
  { caminho: '/analytics', titulo: 'Analytics', perfis: TODOS },
  { caminho: '/comparativo', titulo: 'Comparativo', perfis: TODOS },
  { caminho: '/alertas', titulo: 'Alertas', perfis: TODOS },
  { caminho: '/direcionamento-semanal', titulo: 'Direcionamento Semanal', perfis: COORD_DIRETORIA },
  { caminho: '/gestao-carteira', titulo: 'Gestão de Carteira', perfis: COORD },
  { caminho: '/gestao-titulares', titulo: 'Titulares de Clientes', perfis: COORD_DIRETORIA },
  { caminho: '/ferias-vendedor', titulo: 'Férias de Vendedores', perfis: COORD_DIRETORIA },
  { caminho: '/gestao-coordenadores', titulo: 'Gestão Coordenadores', perfis: DIRETORIA },
  { caminho: '/governanca-rca', titulo: 'Usuários', perfis: USUARIOS },
  { caminho: '/configuracoes', titulo: 'Configurações', perfis: TODOS },
];

function semConsulta(caminho: string): string {
  const limpo = String(caminho ?? '').split(/[?#]/)[0].replace(/\/+$/, '');
  return limpo || '/';
}

function casa(padrao: string, caminho: string): boolean {
  const a = padrao.split('/');
  const b = semConsulta(caminho).split('/');
  return a.length === b.length && a.every((parte, i) => (parte.startsWith(':') ? b[i] !== '' : parte === b[i]));
}

function rotaDe(caminho: string): Rota | null {
  return ROTAS.find(r => casa(r.caminho, caminho)) ?? null;
}

function temPerfil(sessao: SessaoAcesso, perfil: Perfil): boolean {
  if (perfil === 'TODOS') return true;
  if (perfil === 'COORDENADOR_ATIVO') return sessao.coordenadorAtivo === true;
  return sessao.papeis.includes(perfil);
}

/** A rota existe no sistema novo e o usuário pode abri-la. Rota desconhecida ou cancelada = não. */
export function podeAbrir(caminho: string | null | undefined, sessao: SessaoAcesso): boolean {
  const rota = caminho ? rotaDe(caminho) : null;
  return !!rota && rota.perfis.some(p => temPerfil(sessao, p));
}

const NOME_PERFIL: Record<Perfil, string> = {
  TODOS: 'todos',
  COORDENADOR_ATIVO: 'Coordenador',
  DIRETORIA: 'Diretoria',
  GESTOR: 'Gestão',
  ADMIN: 'TI',
};

/** Texto da RN-015: "Esta tela está disponível apenas para <perfis>." */
export function perfisPermitidos(caminho: string): string {
  const nomes = (rotaDe(caminho)?.perfis ?? []).map(p => NOME_PERFIL[p]);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? '');
}

/** Título da tela, para o placeholder e o cabeçalho. */
export function tituloDaRota(caminho: string): string {
  return rotaDe(caminho)?.titulo ?? '';
}

function item(caminho: string, contador?: ItemMenu['contador']): ItemMenu {
  return { caminho, rotulo: tituloDaRota(caminho), ...(contador ? { contador } : {}) };
}

/** Menu da RN-005: só itens que o usuário pode abrir, sem duplicata, sem seção vazia. */
export function montarMenu(sessao: SessaoAcesso): SecaoMenu[] {
  const pode = (caminho: string) => podeAbrir(caminho, sessao);
  const filtrar = (caminhos: Array<string | ItemMenu>) =>
    caminhos.map(c => (typeof c === 'string' ? item(c) : c)).filter(i => pode(i.caminho));

  // Seção Coordenador é de quem tem cadastro ativo (RN-005/RN-006); Titulares e
  // Férias (RN-001 da 010) também abrem para Diretoria/TI, e aí vão na seção Diretoria.
  const coordenador = sessao.coordenadorAtivo
    ? filtrar(['/gestao-carteira', '/gestao-titulares', '/ferias-vendedor'])
    : [];
  const noCoordenador = (caminho: string) => coordenador.some(i => i.caminho === caminho);

  const secoes: SecaoMenu[] = [
    {
      id: 'principal',
      titulo: 'Principal',
      itens: filtrar([
        '/', '/agenda', '/clientes', item('/tarefas', 'atividades'), '/simulacao', '/analytics',
        '/comparativo', item('/alertas', 'alertas'), '/direcionamento-semanal',
      ]),
    },
    { id: 'coordenador', titulo: 'Coordenador', itens: coordenador },
    {
      id: 'diretoria',
      titulo: 'Diretoria',
      itens: filtrar([
        '/gestao-coordenadores',
        ...['/gestao-titulares', '/ferias-vendedor'].filter(c => !noCoordenador(c)),
      ]),
    },
    {
      id: 'gestao',
      titulo: 'Gestão',
      itens: filtrar([
        '/governanca-rca',
      ]),
    },
    { id: 'final', titulo: '', itens: filtrar(['/configuracoes']) },
  ];
  return secoes.filter(s => s.itens.length > 0);
}

/** Rodapé do menu: só Sair (RN-005). */
export const RODAPE_MENU = ['Sair'];

const PAGINAS_INICIAIS = ['/', '/agenda', '/clientes', '/tarefas', '/simulacao', '/analytics'];

/** Opções de `Página inicial` (RN-011): só telas que o usuário pode abrir. */
export function opcoesPaginaInicial(sessao: SessaoAcesso): Array<{ valor: string; rotulo: string }> {
  return PAGINAS_INICIAIS.filter(c => podeAbrir(c, sessao)).map(c => ({ valor: c, rotulo: tituloDaRota(c) }));
}
