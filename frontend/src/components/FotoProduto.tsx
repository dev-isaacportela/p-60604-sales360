import { useState } from 'react';
import { createPortal } from 'react-dom';

const TAMANHOS = { sm: 40, md: 48 } as const;
const AMPLIADA = 280;

interface FotoProdutoProps {
  /** Endereço da foto; `null` = sem foto; `undefined` = ainda carregando. */
  url: string | null | undefined;
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
  /** Toque abre a foto maior. Desligue quando a miniatura mora dentro de um botão. */
  tocavel?: boolean;
}

/**
 * Miniatura da foto do produto, como no Pricing Hub: quadro fixo, foto inteira (sem corte),
 * "Sem foto" quando não há ou quando a imagem falha. Ponteiro por cima (ou toque) abre a foto
 * maior com o nome embaixo.
 */
export default function FotoProduto({ url, nome, tamanho = 'sm', tocavel = true }: FotoProdutoProps) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<DOMRect | null>(null);
  const lado = TAMANHOS[tamanho];
  const valida = url && url !== falhou ? url : null;

  function abrir(alvo: HTMLElement) {
    setAmpliada(alvo.getBoundingClientRect());
  }

  const quadro = {
    width: lado,
    height: lado,
    backgroundColor: 'var(--color-surface-lowest)',
    border: '1px solid var(--color-border)',
  };

  if (url === undefined) {
    return <span aria-hidden className="block shrink-0 animate-pulse rounded-lg" style={quadro} />;
  }

  if (!valida) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg text-center text-[9px] font-semibold leading-tight"
        style={{ ...quadro, color: 'var(--color-text-secondary)' }}
      >
        Sem foto
      </span>
    );
  }

  // A foto maior fica acima da miniatura quando não cabe embaixo, e nunca sai da tela.
  const posicao = ampliada
    ? {
        left: Math.max(8, Math.min(ampliada.left, window.innerWidth - AMPLIADA - 40)),
        top: ampliada.bottom + AMPLIADA + 56 > window.innerHeight
          ? Math.max(8, ampliada.top - AMPLIADA - 56)
          : ampliada.bottom + 8,
      }
    : null;

  return (
    <>
      <span
        role={tocavel ? 'button' : undefined}
        tabIndex={tocavel ? 0 : undefined}
        aria-label={tocavel ? `Ver foto de ${nome}` : undefined}
        className="block shrink-0 overflow-hidden rounded-lg"
        style={{ ...quadro, backgroundColor: '#ffffff', cursor: 'zoom-in' }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') abrir(e.currentTarget); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAmpliada(null); }}
        onClick={(e) => {
          if (!tocavel) return;
          e.stopPropagation();
          if (ampliada) setAmpliada(null);
          else abrir(e.currentTarget);
        }}
        onBlur={() => setAmpliada(null)}
      >
        <img
          src={valida}
          alt={nome}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFalhou(valida)}
        />
      </span>

      {posicao
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] rounded-2xl p-3 shadow-xl"
              style={{ ...posicao, width: AMPLIADA + 24, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-center overflow-hidden rounded-xl" style={{ width: AMPLIADA, height: AMPLIADA, backgroundColor: '#ffffff' }}>
                <img src={valida} alt="" decoding="async" className="h-full w-full object-contain" />
              </div>
              <p className="mt-2 text-xs font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{nome}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
