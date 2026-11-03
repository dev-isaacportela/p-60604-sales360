// Tema claro/escuro do Sales 360.
//
// O app roda dentro do workspace (Meu painel), num iframe. A regra do tema esta
// fechada para os 9 sistemas do workspace em TRES itens, e todos passam por aqui:
//
// 1. TEMA DO PAINEL APLICA, MAS NAO GRAVA. O que vem do painel -- o `?tema=` da
//    URL da aba e a mensagem `mitra-tema` -- muda a tela e nao toca no
//    armazenamento. Na partida a URL vence o tema salvo (ela e o tema do painel
//    no instante em que ele abriu o iframe), so nao escreve. Assim a escolha
//    salva da pessoa fica intacta para quando ela abrir o app fora do painel --
//    inclusive "seguir o sistema", que e a ausencia de escolha e seria perdida
//    se gravassemos.
//
// 2. O BOTAO E O ICONE LEEM O TEMA QUE ESTA NA TELA (`temaAtual`), nunca o valor
//    salvo: dentro do painel os dois podem ser diferentes, e era ai que o icone
//    nascia invertido (tela escura com o icone de escurecer). Ele le a tela na
//    partida, confere de novo quando monta -- o aviso do painel vem no onLoad do
//    iframe e pode cair entre o render e o efeito -- e acompanha qualquer troca
//    depois, venha do painel ou do botao. Quem faz isso e o hook
//    `useTema` (frontend/src/hooks/useTema.ts), sobre `temaAtual` e `ouvirTema`.
//
// 3. O CLIQUE NO BOTAO inverte o que esta na tela (pela mesma leitura do item 2),
//    GRAVA a preferencia e avisa o painel com
//    `{ tipo: 'mitra-tema', tema: 'light' | 'dark' }`. E o unico caminho que
//    grava a escolha.
//
// O protocolo com o Meu painel (projeto 61812), nos dois sentidos, e exatamente:
//
//   postMessage({ tipo: 'mitra-tema', tema: 'light' | 'dark' }, '*')
//
// O campo e `tipo` (nao `type`) e o tema ja vem resolvido: nunca chega 'system'.
// O painel manda no onLoad do iframe e a cada troca nele.
//
// Alem disso, o painel poe `?tema=light|dark` na URL do iframe ao abrir a aba
// (`comTema` em frontend/src/lib/abas.tsx, projeto 61812). Por isso a URL vence
// o tema salvo no boot: ela e o tema do painel AGORA.

export type Tema = 'claro' | 'escuro';

const CHAVE = 'sales360:tema';
const EVENTO_LOCAL = 'sales360:tema-mudou';

/** Nome da mensagem do protocolo, igual nos dois sentidos. */
const AVISO = 'mitra-tema';

/**
 * Nomes de mensagem que aceitamos do painel. O workspace pode avisar com
 * qualquer um deles; preferimos ser liberais na leitura para nao depender de um
 * nome unico do lado de fora.
 */
const AVISOS_ENTRADA = new Set([
  AVISO, // o do protocolo real
  'mitra-theme',
  'mitra-theme-changed',
  'mitra:theme',
  'workspace-theme',
  'panel-theme',
  'set-theme',
  'theme',
  'tema',
]);

/** Campos onde o valor do tema pode vir. */
const CAMPOS_TEMA = ['theme', 'tema', 'mode', 'modo', 'colorScheme', 'appearance', 'value'];

function temaDoTexto(valor: unknown): Tema | 'sistema' | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase();
  if (v === 'dark' || v === 'escuro' || v === 'escura' || v === 'noite' || v === 'night') return 'escuro';
  if (v === 'light' || v === 'claro' || v === 'clara' || v === 'dia' || v === 'day') return 'claro';
  if (v === 'system' || v === 'sistema' || v === 'auto') return 'sistema';
  return null;
}

function temaDoSistema(): Tema {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  } catch {
    return 'claro';
  }
}

function resolver(valor: unknown): Tema | null {
  const lido = temaDoTexto(valor);
  if (lido === 'sistema') return temaDoSistema();
  return lido;
}

/** Procura o tema dentro do corpo de uma mensagem, inclusive um nivel abaixo. */
function temaDaMensagem(dados: Record<string, unknown>): Tema | null {
  for (const campo of CAMPOS_TEMA) {
    const achado = resolver(dados[campo]);
    if (achado) return achado;
  }
  for (const dentro of ['payload', 'data', 'detail', 'params']) {
    const sub = dados[dentro];
    if (sub && typeof sub === 'object') {
      for (const campo of CAMPOS_TEMA) {
        const achado = resolver((sub as Record<string, unknown>)[campo]);
        if (achado) return achado;
      }
    }
  }
  return null;
}

// --- leitura e gravacao ------------------------------------------------------

export function lerTemaSalvo(): Tema | null {
  try {
    const lido = temaDoTexto(localStorage.getItem(CHAVE));
    return lido === 'escuro' || lido === 'claro' ? lido : null;
  } catch {
    // localStorage bloqueado no iframe: ninguem escolheu nada.
    return null;
  }
}

function salvar(tema: Tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // localStorage bloqueado no iframe: o tema vale so para esta sessao.
  }
}

/**
 * Tema que o painel poe na URL da aba: `?tema=light|dark`. Aceita tambem
 * `?theme=` e os valores em portugues, que nao custam nada.
 */
function temaDaUrl(): Tema | null {
  try {
    const q = new URLSearchParams(window.location.search);
    for (const campo of ['tema', 'theme', 'mode']) {
      const achado = resolver(q.get(campo));
      if (achado) return achado;
    }
  } catch {
    // URL estranha: ignora.
  }
  return null;
}

// --- aplicar -----------------------------------------------------------------

export function temaAtual(): Tema {
  return document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro';
}

/** Poe o tema no <html>. O CSS cuida do resto. */
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  raiz.classList.toggle('tema-escuro', tema === 'escuro');
  raiz.style.colorScheme = tema === 'escuro' ? 'dark' : 'light';
}

// --- avisar o painel ---------------------------------------------------------

/**
 * Avisa o Meu painel que o tema mudou aqui dentro. Mandamos os dois nomes de
 * campo (theme/tema) no mesmo aviso, para servir ao painel de qualquer lado.
 */
export function avisarPainel(tema: Tema) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ tipo: AVISO, tema: tema === 'escuro' ? 'dark' : 'light' }, '*');
    }
  } catch {
    // Sem painel do outro lado: segue sozinho.
  }
}

// --- trocar ------------------------------------------------------------------

/**
 * Troca o tema por decisao de dentro do app (o botao do header): aplica, GRAVA,
 * avisa o painel e avisa os componentes desta janela. E o unico caminho que
 * grava a escolha.
 */
export function definirTema(tema: Tema) {
  aplicarTema(tema);
  salvar(tema);
  avisarPainel(tema);
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_LOCAL, { detail: tema }));
}

/** Clique no botao: inverte o tema APLICADO na tela (nao o salvo), grava e avisa. */
export function alternarTema(): Tema {
  const proximo: Tema = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  definirTema(proximo);
  return proximo;
}

/**
 * Ja falou alguem de fora (a URL da aba ou uma mensagem do painel)? Enquanto
 * ninguem falou e nada esta salvo, acompanhamos o tema do sistema; depois do
 * painel falar, nao: o painel manda mais que o sistema operacional.
 */
let painelFalou = false;

/**
 * Aplica um tema que NAO veio do botao daqui (painel ou sistema): muda a tela e
 * avisa os componentes, sem gravar e sem devolver o aviso. Como o painel
 * repassa o tema aos outros sistemas abertos, o nosso proprio aviso pode
 * voltar; a saida cedo aqui corta o vai-e-vem.
 */
function aplicarDeFora(tema: Tema) {
  if (temaAtual() === tema) return;
  aplicarTema(tema);
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_LOCAL, { detail: tema }));
}

/** Tema que veio do painel: aplica, nao grava, nao devolve o aviso. */
function aceitarDoPainel(tema: Tema) {
  painelFalou = true;
  aplicarDeFora(tema);
}

/** Para os componentes React acompanharem a troca. */
export function ouvirTema(aoMudar: (tema: Tema) => void): () => void {
  const ouvinte = (e: Event) => aoMudar((e as CustomEvent<Tema>).detail ?? temaAtual());
  window.addEventListener(EVENTO_LOCAL, ouvinte);
  return () => window.removeEventListener(EVENTO_LOCAL, ouvinte);
}

// --- inicio ------------------------------------------------------------------

let iniciado = false;

/**
 * Liga o tema. Chame uma vez, antes de montar o React:
 * - aplica o ?tema= da URL da aba (o tema do painel na hora em que ele abriu o
 *   iframe, que nao e gravado) ou, na falta dele, o tema salvo -- para a aba nao
 *   piscar antes do aviso do painel chegar;
 * - passa a ouvir o aviso do Meu painel, que vem no onLoad do iframe e manda
 *   mais que o salvo (nao anunciamos nada na carga: quem abre o assunto e ele);
 * - acompanha o tema do sistema enquanto ninguem escolheu nada.
 */
export function iniciarTema() {
  if (iniciado) return;
  iniciado = true;

  const daUrl = temaDaUrl();
  const salvo = lerTemaSalvo();
  const inicial = daUrl ?? salvo ?? temaDoSistema();
  aplicarTema(inicial);
  // O ?tema= e tema do painel, nao escolha da pessoa: aplica e nao grava.
  if (daUrl) painelFalou = true;

  window.addEventListener('message', (evento: MessageEvent) => {
    const dados = evento.data;
    if (!dados || typeof dados !== 'object') return;
    const registro = dados as Record<string, unknown>;
    const nome = String(registro.type ?? registro.tipo ?? registro.event ?? registro.evento ?? '').toLowerCase();
    if (nome && !AVISOS_ENTRADA.has(nome)) return;
    const tema = temaDaMensagem(registro);
    if (!tema) return;
    aceitarDoPainel(tema);
  });

  // Sem escolha propria e sem painel no assunto, acompanha o sistema.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (painelFalou || lerTemaSalvo()) return;
      aplicarDeFora(e.matches ? 'escuro' : 'claro');
    });
  } catch {
    // Navegador antigo: fica no tema inicial.
  }
}
