// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ModuloTema = typeof import('./theme');

const CHAVE = 'sales360:tema';

/** Carrega o modulo limpo (ele guarda o estado de "ja iniciei" por import). */
async function carregar(): Promise<ModuloTema> {
  vi.resetModules();
  return import('./theme');
}

/** Finge um painel do lado de fora e devolve os avisos que chegam nele. */
function fingirPainel() {
  const avisos: unknown[] = [];
  const painel = { postMessage: (dados: unknown) => avisos.push(dados) };
  Object.defineProperty(window, 'parent', { value: painel, configurable: true });
  return avisos;
}

/** Ouvintes do matchMedia, para o teste poder fingir uma troca no sistema. */
let ouvintesDoSistema: Array<(e: { matches: boolean }) => void> = [];

function prefereEscuro(escuro: boolean) {
  ouvintesDoSistema = [];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (consulta: string) => ({
      matches: escuro && consulta.includes('dark'),
      media: consulta,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
        if (consulta.includes('dark')) ouvintesDoSistema.push(fn);
      },
      removeEventListener: () => {},
    }),
  });
}

/** O sistema operacional trocou de tema. */
function sistemaTrocouPara(escuro: boolean) {
  for (const fn of ouvintesDoSistema) fn({ matches: escuro });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-tema');
  document.documentElement.className = '';
  window.history.replaceState({}, '', '/');
  prefereEscuro(false);
});

describe('tema: aplicar o salvo ao abrir', () => {
  it('abre no tema escuro que ficou salvo', async () => {
    localStorage.setItem(CHAVE, 'escuro');
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');
    expect(document.documentElement.classList.contains('tema-escuro')).toBe(true);
  });

  it('sem nada salvo, segue o tema do sistema', async () => {
    prefereEscuro(true);
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');
  });

  it('o ?tema= que o painel poe na aba vence o salvo, mas NAO grava', async () => {
    // Forma real: o painel faz searchParams.set('tema', 'light' | 'dark').
    localStorage.setItem(CHAVE, 'claro');
    window.history.replaceState({}, '', '/?tema=dark');
    const { iniciarTema, temaAtual, lerTemaSalvo } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');
    // A escolha dela continua sendo 'claro' fora do painel.
    expect(lerTemaSalvo()).toBe('claro');
  });

  it('o ?tema= nao inventa escolha para quem nunca escolheu nada', async () => {
    window.history.replaceState({}, '', '/?tema=dark');
    const { iniciarTema, temaAtual, lerTemaSalvo } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');
    // Quem seguia o sistema continua seguindo o sistema fora do painel.
    expect(lerTemaSalvo()).toBeNull();
  });

  it('aceita o ?tema=light do painel e o ?theme= por tolerancia', async () => {
    localStorage.setItem(CHAVE, 'escuro');
    window.history.replaceState({}, '', '/?tema=light');
    const claro = await carregar();
    claro.iniciarTema();
    expect(claro.temaAtual()).toBe('claro');

    localStorage.clear();
    document.documentElement.removeAttribute('data-tema');
    window.history.replaceState({}, '', '/?theme=dark');
    const escuro = await carregar();
    escuro.iniciarTema();
    expect(escuro.temaAtual()).toBe('escuro');
  });
});

describe('tema: ouvir o aviso do Meu painel', () => {
  it('segue o aviso do painel sem gravar a escolha dela', async () => {
    localStorage.setItem(CHAVE, 'claro');
    const { iniciarTema, temaAtual, lerTemaSalvo } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('claro');

    // A forma real do Meu painel: campo `tipo`, nome `mitra-tema`.
    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-tema', tema: 'dark' } }));
    expect(temaAtual()).toBe('escuro');
    expect(lerTemaSalvo()).toBe('claro');

    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-tema', tema: 'light' } }));
    expect(temaAtual()).toBe('claro');
    expect(lerTemaSalvo()).toBe('claro');
  });

  it('depois do painel falar, o tema do sistema nao atropela o do painel', async () => {
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();

    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-tema', tema: 'dark' } }));
    expect(temaAtual()).toBe('escuro');

    sistemaTrocouPara(false);
    expect(temaAtual()).toBe('escuro');
  });

  it('sem painel e sem escolha, acompanha a troca do sistema', async () => {
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('claro');

    sistemaTrocouPara(true);
    expect(temaAtual()).toBe('escuro');
  });

  it('aceita os outros nomes e formatos de aviso do painel', async () => {
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();

    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'workspace-theme', payload: { tema: 'escuro' } } }));
    expect(temaAtual()).toBe('escuro');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mitra:theme', mode: 'light' } }));
    expect(temaAtual()).toBe('claro');
  });

  it('nao devolve o aviso para o painel (sem eco)', async () => {
    const avisos = fingirPainel();
    const { iniciarTema } = await carregar();
    iniciarTema();
    avisos.length = 0;

    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-tema', tema: 'dark' } }));
    expect(avisos).toHaveLength(0);
  });

  it('ignora mensagem de outro assunto', async () => {
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();
    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-auth', tema: 'dark' } }));
    expect(temaAtual()).toBe('claro');
  });
});

describe('tema: avisar o painel na troca', () => {
  it('avisa o painel quando a pessoa troca o tema aqui dentro', async () => {
    const avisos = fingirPainel();
    const { iniciarTema, alternarTema } = await carregar();
    iniciarTema();
    avisos.length = 0;

    expect(alternarTema()).toBe('escuro');
    expect(avisos).toEqual([{ tipo: 'mitra-tema', tema: 'dark' }]);

    expect(alternarTema()).toBe('claro');
    expect(avisos[1]).toEqual({ tipo: 'mitra-tema', tema: 'light' });
  });

  it('nao avisa nada na carga: o painel e quem manda o tema no onLoad', async () => {
    const avisos = fingirPainel();
    localStorage.setItem(CHAVE, 'escuro');
    const { iniciarTema } = await carregar();
    iniciarTema();
    expect(avisos).toHaveLength(0);
  });

  it('o aviso do painel no onLoad manda mais que o tema salvo', async () => {
    const avisos = fingirPainel();
    localStorage.setItem(CHAVE, 'escuro');
    const { iniciarTema, temaAtual } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');

    // O painel carregou o iframe e avisou que ele esta no claro.
    window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'mitra-tema', tema: 'light' } }));
    expect(temaAtual()).toBe('claro');
    expect(avisos).toHaveLength(0);
  });

  it('o botao inverte o tema da TELA, nao o salvo, e grava a escolha', async () => {
    const avisos = fingirPainel();
    // A pessoa escolheu claro; o painel abriu a aba no escuro (aplicado, nao salvo).
    localStorage.setItem(CHAVE, 'claro');
    window.history.replaceState({}, '', '/?tema=dark');
    const { iniciarTema, temaAtual, alternarTema, lerTemaSalvo } = await carregar();
    iniciarTema();
    expect(temaAtual()).toBe('escuro');
    expect(lerTemaSalvo()).toBe('claro');
    avisos.length = 0;

    // Um clique vai para o claro (o inverso da TELA). Se lesse o salvo, iria
    // para o escuro e nada mudaria na tela.
    expect(alternarTema()).toBe('claro');
    expect(temaAtual()).toBe('claro');
    expect(lerTemaSalvo()).toBe('claro');
    expect(avisos).toEqual([{ tipo: 'mitra-tema', tema: 'light' }]);

    // E o proximo clique grava a escolha nova.
    expect(alternarTema()).toBe('escuro');
    expect(lerTemaSalvo()).toBe('escuro');
    expect(avisos[1]).toEqual({ tipo: 'mitra-tema', tema: 'dark' });
  });

  it('a troca chega aos componentes da tela', async () => {
    const { iniciarTema, alternarTema, ouvirTema } = await carregar();
    iniciarTema();
    const vistos: string[] = [];
    const parar = ouvirTema(t => vistos.push(t));
    alternarTema();
    parar();
    alternarTema();
    expect(vistos).toEqual(['escuro']);
  });
});
