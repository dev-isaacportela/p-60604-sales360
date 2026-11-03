// Conteúdo das notas de versão: HTML do editor (ou texto simples das notas antigas),
// limpo para exibir no popup e no cadastro.

const TAGS_PERMITIDAS = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG']);
const TROCA_DE_TAG: Record<string, string> = { B: 'STRONG', I: 'EM', STRIKE: 'S', DEL: 'S', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3', DIV: 'P' };

function escapar(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pareceHtml(texto: string) {
  return /<(p|h[1-6]|ul|ol|li|strong|b|i|em|u|s|br|div|span|a|img|blockquote)\b/i.test(texto) || /&(nbsp|amp|lt|gt|quot);/.test(texto);
}

/** Texto simples (notas antigas): "## " e "### " viram títulos, "- " vira tópico e o resto, parágrafo. */
function textoParaHtml(texto: string) {
  const partes: string[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) partes.push(`<ul>${lista.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    lista = [];
  };
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    if (/^[-*•]\s+/.test(linha)) { lista.push(escapar(linha.replace(/^[-*•]\s+/, ''))); continue; }
    fecharLista();
    if (/^###\s+/.test(linha)) partes.push(`<h3>${escapar(linha.replace(/^###\s+/, ''))}</h3>`);
    else if (/^#{1,2}\s+/.test(linha)) partes.push(`<h2>${escapar(linha.replace(/^#{1,2}\s+/, ''))}</h2>`);
    else partes.push(`<p>${escapar(linha)}</p>`);
  }
  fecharLista();
  return partes.join('');
}

/**
 * Limpa o HTML da nota: só as tags de texto (títulos, parágrafos, listas, negrito, itálico,
 * links e imagens), sem estilo nem script. O negrito e o itálico que o Google Docs e o Word
 * mandam por estilo viram <strong>/<em>.
 */
export function limparHtmlNota(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const saida = document.createElement('div');

  function copiar(origem: Node, destino: Node) {
    origem.childNodes.forEach((no) => {
      if (no.nodeType === Node.TEXT_NODE) {
        destino.appendChild(document.createTextNode(no.textContent || ''));
        return;
      }
      if (no.nodeType !== Node.ELEMENT_NODE) return;
      const el = no as HTMLElement;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT'].includes(el.tagName)) return;

      const estilo = (el.getAttribute('style') || '').toLowerCase();
      const pesoNormal = /font-weight\s*:\s*(normal|[1-5]00)/.test(estilo);
      if (el.tagName === 'DIV' && el.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol, blockquote')) {
        copiar(el, destino);
        return;
      }
      let tag = TROCA_DE_TAG[el.tagName] || el.tagName;
      if (tag === 'STRONG' && pesoNormal) tag = 'SPAN';
      if (tag === 'SPAN' && /font-weight\s*:\s*(bold|[6-9]00)/.test(estilo)) tag = 'STRONG';
      else if (tag === 'SPAN' && /font-style\s*:\s*italic/.test(estilo)) tag = 'EM';

      if (!TAGS_PERMITIDAS.has(tag)) {
        copiar(el, destino);
        return;
      }
      const novo = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const href = el.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) { copiar(el, destino); return; }
        novo.setAttribute('href', href);
        novo.setAttribute('target', '_blank');
        novo.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!/^https:\/\//i.test(src)) return;
        novo.setAttribute('src', src);
        novo.setAttribute('alt', el.getAttribute('alt') || '');
      }
      copiar(el, novo);
      destino.appendChild(novo);
    });
  }

  copiar(doc.body.firstChild || doc.body, saida);
  // Tira parágrafos e títulos vazios que a colagem deixa
  saida.querySelectorAll('p, h2, h3, li').forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector('img')) el.remove();
  });
  return saida.innerHTML.trim();
}

export function htmlDaNota(conteudo: string) {
  return pareceHtml(conteudo) ? limparHtmlNota(conteudo) : textoParaHtml(conteudo);
}
