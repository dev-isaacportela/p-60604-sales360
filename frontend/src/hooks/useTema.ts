import { useSyncExternalStore } from 'react';
import { alternarTema, definirTema, ouvirTema, temaAtual, type Tema } from '../lib/theme';

/** Assina a troca de tema; o React so quer saber QUE mudou, nao para qual. */
function assinar(aoMudar: () => void) {
  return ouvirTema(aoMudar);
}

/**
 * Tema atual do app, ja acompanhando as tres origens: a escolha da pessoa aqui
 * dentro, o aviso do Meu painel e o tema do sistema.
 *
 * O valor vem do tema APLICADO na tela (`temaAtual`), nunca do que esta salvo:
 * o tema que o painel manda e aplicado e nao gravado, entao o salvo pode ser
 * outro. O botao e o icone do header se orientam por este valor.
 *
 * A tela e a fonte da verdade, e quem a le e o `useSyncExternalStore`: ele le na
 * partida, CONFERE DE NOVO ao assinar no mount e segue ouvindo. A reconferencia
 * e o que importa aqui -- o aviso do painel vem no `onLoad` do iframe e pode
 * cair entre o primeiro render e a assinatura; sem ela o icone nascia invertido
 * dentro do painel (tela escura com o icone de escurecer).
 */
export function useTema() {
  const tema = useSyncExternalStore<Tema>(assinar, temaAtual, temaAtual);

  return {
    tema,
    escuro: tema === 'escuro',
    alternar: alternarTema,
    definir: definirTema,
  };
}
