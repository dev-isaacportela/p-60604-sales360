// Botão claro/escuro — design.md §2.1, RN-009. Mora no rodapé do menu, ao lado
// das iniciais; no celular vem dentro da gaveta. Neutro, não verde: os vizinhos
// de rodapé são cinza, e um sol verde lia como ação primária.
//
// A regra é a de lib/tema.ts (chave sales360:tema, protocolo do painel); o
// ícone lê o tema da TELA, nunca o salvo.
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/page';
import { alternarTema, ouvirTema, temaAtual } from '@/lib/tema';

export function ThemeToggle() {
  const escuro = useSyncExternalStore(ouvirTema, temaAtual) === 'escuro';
  return (
    <IconButton label={escuro ? 'Tema claro' : 'Tema escuro'} className="text-ink-secondary hover:text-ink" onClick={alternarTema}>
      {escuro ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </IconButton>
  );
}
