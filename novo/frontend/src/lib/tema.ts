// Tema claro/escuro sincronizado com o Meu painel do workspace (RN-009).
//
// Protocolo (docs/arquitetura.md, "Tema e estilos"), igual ao sistema antigo:
//  - o painel põe `?tema=light|dark` na URL da aba e manda
//    `{ tipo: 'mitra-tema', tema: 'light'|'dark' }` no onLoad e a cada troca;
//  - tema vindo do painel APLICA e NÃO grava nem é reenviado;
//  - o botão do sistema inverte o que está NA TELA, grava em
//    localStorage `sales360:tema` ('claro'|'escuro', compartilhado com o antigo)
//    e avisa o painel na mesma forma;
//  - sem escolha salva e sem o painel ter falado, segue o sistema operacional.
//
// As decisões (resolverTema, aoAvisoDoPainel, aoBotao, aoSistemaMudar) são
// puras e testadas em tests/tema.test.mjs. `iniciarTema` e `alternarTema` são
// o invólucro fino de DOM/localStorage/postMessage.
//
// Efeito no DOM = design system Benenutri (docs/design.md §2.1): classe `.dark`
// no <html>, que troca os tokens do index.css. O script inline do index.html
// repete `resolverTema` antes do React (sem piscar) e guarda a origem do
// painel; só mensagens dessa origem valem, e o aviso vai só para ela.

type Tema = 'claro' | 'escuro';
type Aviso = { tipo: 'mitra-tema'; tema: 'light' | 'dark' };

export const CHAVE_TEMA = 'sales360:tema';
const EVENTO_LOCAL = 's360:tema';
/** sessionStorage: origem do painel que abriu este iframe (gravada pelo index.html). */
const CHAVE_PAINEL = 'painel-origem';

/** 'dark'/'escuro' → escuro; 'light'/'claro' → claro; o resto → null. */
export function lerTema(valor: unknown): Tema | null {
  const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (v === 'dark' || v === 'escuro') return 'escuro';
  if (v === 'light' || v === 'claro') return 'claro';
  return null;
}

function avisoDe(tema: Tema): Aviso {
  return { tipo: 'mitra-tema', tema: tema === 'escuro' ? 'dark' : 'light' };
}

/** Abertura: `?tema=` da URL → escolha salva → sistema operacional. A URL é do painel: não grava. */
export function resolverTema({ url, salvo, sistema }: { url?: string; salvo?: string | null; sistema: Tema }): { tema: Tema; painelFalou: boolean } {
  const query = String(url ?? '').includes('?') ? String(url).slice(String(url).indexOf('?')) : String(url ?? '');
  const daUrl = lerTema(new URLSearchParams(query).get('tema'));
  if (daUrl) return { tema: daUrl, painelFalou: true };
  return { tema: lerTema(salvo) ?? sistema, painelFalou: false };
}

/** Mensagem recebida: se for o aviso do painel, o tema a aplicar (sem gravar, sem reenviar). */
export function aoAvisoDoPainel(dados: unknown): { aplicar: Tema; gravar: null; reenviar: null } | null {
  if (!dados || typeof dados !== 'object') return null;
  const msg = dados as Record<string, unknown>;
  if (msg.tipo !== 'mitra-tema') return null;
  const tema = lerTema(msg.tema);
  return tema ? { aplicar: tema, gravar: null, reenviar: null } : null;
}

/** Clique no botão: inverte o tema da tela, grava e avisa o painel. */
export function aoBotao(naTela: Tema): { aplicar: Tema; gravar: Tema; aviso: Aviso } {
  const proximo: Tema = naTela === 'escuro' ? 'claro' : 'escuro';
  return { aplicar: proximo, gravar: proximo, aviso: avisoDe(proximo) };
}

/** Troca no sistema operacional só vale enquanto ninguém escolheu e o painel não falou. */
export function aoSistemaMudar({ sistema, salvo, painelFalou }: { sistema: Tema; salvo?: string | null; painelFalou: boolean }): Tema | null {
  return painelFalou || lerTema(salvo) ? null : sistema;
}

// ── Invólucro de DOM ──

function lerSalvo(): string | null {
  try {
    return localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

/** Tema que está na tela (o ícone do botão lê este, nunca o salvo). */
export function temaAtual(): Tema {
  return document.documentElement.classList.contains('dark') ? 'escuro' : 'claro';
}

function aplicar(tema: Tema) {
  const escuro = tema === 'escuro';
  if (document.documentElement.classList.contains('dark') !== escuro) document.documentElement.classList.toggle('dark', escuro);
  window.dispatchEvent(new Event(EVENTO_LOCAL));
}

/** Fora do painel (aberto direto) não há origem: nenhuma mensagem vale e nenhum aviso sai. */
function origemDoPainel(): string | null {
  if (window.parent === window) return null;
  try {
    const guardada = sessionStorage.getItem(CHAVE_PAINEL);
    if (guardada) return guardada;
    if (document.referrer) {
      const origem = new URL(document.referrer).origin;
      sessionStorage.setItem(CHAVE_PAINEL, origem);
      return origem;
    }
  } catch {
    // sem storage ou referrer inválido
  }
  return null;
}

let painelFalou = false;

/** Chame uma vez em main.tsx, antes do React montar (RNF-003). */
export function iniciarTema(): void {
  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  const sistema = (): Tema => (consulta.matches ? 'escuro' : 'claro');
  const inicial = resolverTema({ url: window.location.search, salvo: lerSalvo(), sistema: sistema() });
  painelFalou = inicial.painelFalou;
  aplicar(inicial.tema);

  window.addEventListener('message', evento => {
    if (evento.origin !== origemDoPainel()) return;
    const decisao = aoAvisoDoPainel(evento.data);
    if (!decisao) return;
    painelFalou = true;
    aplicar(decisao.aplicar);
  });

  consulta.addEventListener('change', () => {
    const tema = aoSistemaMudar({ sistema: sistema(), salvo: lerSalvo(), painelFalou });
    if (tema) aplicar(tema);
  });
}

/** Botão da barra superior. */
export function alternarTema(): void {
  const decisao = aoBotao(temaAtual());
  aplicar(decisao.aplicar);
  try {
    localStorage.setItem(CHAVE_TEMA, decisao.gravar);
  } catch {
    // localStorage bloqueado no iframe: vale só nesta aba.
  }
  const origem = origemDoPainel();
  if (origem) window.parent.postMessage(decisao.aviso, origem);
}

/** Para o ícone acompanhar a troca, venha do painel, do sistema ou do botão. */
export function ouvirTema(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_LOCAL, aoMudar);
  return () => window.removeEventListener(EVENTO_LOCAL, aoMudar);
}
