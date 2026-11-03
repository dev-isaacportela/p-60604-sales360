import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  align?: 'left' | 'right';
  width?: number;
  children: React.ReactNode;
}

const VIEWPORT_MARGIN = 8;

/**
 * Menu ancorado renderizado em portal no body.
 *
 * Motivo do portal: containers com `overflow-x-auto` (tabelas com rolagem lateral)
 * tambem recortam no eixo Y, entao um menu `absolute` dentro deles fica cortado nas
 * ultimas linhas. Em portal o menu escapa do recorte e ainda se reposiciona sozinho
 * quando nao cabe abaixo do gatilho.
 *
 * Fecha ao clicar fora e ao pressionar Escape.
 */
export default function DropdownMenu({
  open,
  onClose,
  anchorEl,
  align = 'right',
  width = 224,
  children,
}: DropdownMenuProps) {
  // O no vive num ref (nao em state): a posicao e uma medicao de layout escrita direto
  // no style, o que evita um render extra a cada scroll/resize.
  const menuRef = useRef<HTMLDivElement | null>(null);

  const posicionar = useCallback(() => {
    const menuEl = menuRef.current;
    if (!anchorEl || !menuEl) return;

    const rect = anchorEl.getBoundingClientRect();
    const menuHeight = menuEl.offsetHeight;

    let left = align === 'right' ? rect.right - width : rect.left;
    left = Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN);
    left = Math.max(VIEWPORT_MARGIN, left);

    // Abre para cima quando nao ha espaco suficiente abaixo do gatilho.
    const abaixo = rect.bottom + 4;
    const top = abaixo + menuHeight > window.innerHeight - VIEWPORT_MARGIN
      ? Math.max(VIEWPORT_MARGIN, rect.top - menuHeight - 4)
      : abaixo;

    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;
    menuEl.style.visibility = 'visible';
  }, [anchorEl, align, width]);

  const registrarMenu = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (node) posicionar();
  }, [posicionar]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorEl?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [open, onClose, posicionar, anchorEl]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={registrarMenu}
      role="menu"
      className="animate-scaleIn fixed z-[60] overflow-hidden rounded-xl py-1 shadow-xl"
      style={{
        top: 0,
        left: 0,
        width,
        visibility: 'hidden',
        backgroundColor: 'var(--color-surface-lowest)',
        border: '1px solid var(--color-border)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
