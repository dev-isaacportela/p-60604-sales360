// Sessão do usuário (RN-001, RN-004, RN-010, RN-013, RN-017).
// Regra pura: sem React, sem SDK. É o que tests/sessao.test.mjs importa.

import { podeAbrir } from './menu.ts';

type ModoAgenda = 'DIA' | 'SEMANA' | 'MES';
type Exibicao = 'LISTA' | 'KANBAN';

interface Sessao {
  userId: number;
  email: string;
  nome: string;
  papeis: string[];
  coordenadorAtivo: boolean;
  bloqueado: boolean;
  configurado: boolean;
  modoAgenda: ModoAgenda;
  exibicaoAtividades: Exibicao;
  pagina: string;
}

const PAPEIS_VALIDOS = ['VENDEDOR', 'COORDENADOR', 'DIRETORIA', 'GESTOR', 'ADMIN'];

/** Papéis da lista "GESTOR,COORDENADOR"; sem papel = VENDEDOR (RNT-001). */
export function papeis(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : String(valor ?? '').split(',');
  const limpos = [...new Set(lista.map(p => String(p).trim().toUpperCase()).filter(p => PAPEIS_VALIDOS.includes(p)))];
  return limpos.length ? limpos : ['VENDEDOR'];
}

const um = (v: unknown) => Number(v) === 1;

/** Linha de `s360SessaoObter` → sessão imutável (a tela troca a exibição sem tocar nela, C-010). */
export function normalizarSessao(linha: Record<string, unknown> | null | undefined): Readonly<Sessao> | null {
  if (!linha || !Number(linha.USER_ID)) return null;
  const modo = String(linha.MODO_AGENDA ?? '').toUpperCase();
  const exibicao = String(linha.EXIBICAO_TAREFAS ?? '').toUpperCase();
  return Object.freeze({
    userId: Number(linha.USER_ID),
    email: String(linha.EMAIL ?? ''),
    nome: String(linha.NOME_EXIBICAO ?? '').trim() || String(linha.EMAIL ?? ''),
    papeis: Object.freeze(papeis(linha.PAPEIS)) as string[],
    coordenadorAtivo: um(linha.COORDENADOR_ATIVO),
    bloqueado: um(linha.BLOQUEADO),
    configurado: um(linha.CONFIGURADO),
    modoAgenda: (['DIA', 'SEMANA', 'MES'].includes(modo) ? modo : 'SEMANA') as ModoAgenda,
    exibicaoAtividades: (exibicao === 'KANBAN' ? 'KANBAN' : 'LISTA') as Exibicao,
    pagina: String(linha.PAGINA_INICIAL ?? '').trim() || '/',
  });
}

const ROTULO_PAPEL: Record<string, string> = {
  VENDEDOR: 'Vendedor',
  COORDENADOR: 'Coordenador',
  DIRETORIA: 'Diretoria',
  GESTOR: 'Gestor',
  ADMIN: 'TI',
};

/** Card `Papéis` (RN-013): ['COORDENADOR','GESTOR'] → "Coordenador, Gestor". */
export function rotuloPapeis(lista: string[]): string {
  return papeis(lista).map(p => ROTULO_PAPEL[p]).join(', ');
}

/** Destino após o login (RN-004): pedido permitido → página inicial permitida → Dashboard. */
export function destinoAposLogin(pedido: string | null | undefined, sessao: { pagina?: string; papeis: string[]; coordenadorAtivo?: boolean }): string {
  if (pedido && podeAbrir(pedido, sessao)) return pedido;
  if (sessao.pagina && podeAbrir(sessao.pagina, sessao)) return sessao.pagina;
  return '/';
}

/** Sem sessão (RN-001, C-002): vai para o login e guarda o caminho pedido, se houver um que valha a pena. */
export function destinoSemSessao(caminho: string): { destino: string; guardar: string | null } {
  const semLogin = /^\/(login|recuperar-senha)(\/|\?|$)/.test(caminho);
  return { destino: '/login', guardar: semLogin || caminho === '/' ? null : caminho };
}

/** Aviso da RN-017: só para quem é apenas vendedor e não tem RCA nem escopo. */
export function mostrarAvisoNaoConfigurado(sessao: { configurado: boolean; papeis: string[]; coordenadorAtivo?: boolean }): boolean {
  if (sessao.configurado || sessao.coordenadorAtivo) return false;
  return papeis(sessao.papeis).every(p => p === 'VENDEDOR');
}

export const AVISO_NAO_CONFIGURADO =
  'Seu acesso ainda não foi configurado. Peça à gestão o vínculo de RCA, escopo e carteira.';

/** sessionStorage: caminho pedido antes do login (C-002) e marca de "acabou de entrar" (RN-004). */
export const CHAVE_DESTINO = 's360:destino';
export const CHAVE_POS_LOGIN = 's360:pos-login';
