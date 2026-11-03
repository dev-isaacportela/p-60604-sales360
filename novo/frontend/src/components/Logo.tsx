import { cn } from '@/lib/utils';
import logoBenenutri from '@/assets/logo-benenutri.png';

/**
 * Marca oficial — design.md §11.
 *
 * O verde da marca NÃO é o --primary. São papéis diferentes: um é identidade,
 * o outro é interface. Por isso a cor da marca fica explícita aqui (e no token
 * --brand-mark do index.css, para uso em classe), nunca herdada do tema, e a
 * marca nunca é recolorida para o verde da interface.
 */
export const BRAND_GREEN = '#45963d';

/**
 * Monograma BN. Inline (e não <img>) para o `currentColor` valer: assim a
 * marca herda a cor de onde é usada — verde no menu, branca sobre o verde —
 * sem duplicar arquivo por cor.
 *
 * `animar` (design.md §11.1) vale em dois lugares e só neles:
 * - `"monta"`: uma vez, ao montar — o B brota de baixo e o N cai e quica.
 *   É o monograma do menu recolhido (`AdminLayout`).
 * - `"carrega"`: em ciclo, enquanto a tela espera dado. Use pelo
 *   `MonogramLoader`, não direto.
 * O B e o N saem do quadro do próprio SVG (que corta o que passa da borda),
 * por isso não há clipPath. A animação mora no index.css (`.bn-*`).
 */
export function Monogram({
  className,
  animar,
}: {
  className?: string;
  animar?: 'monta' | 'carrega';
}) {
  return (
    <svg
      viewBox="0 0 757.5 663.06"
      fill="currentColor"
      role="img"
      aria-label="BENENUTRI"
      className={cn('h-5 w-auto', animar && `bn-${animar}`, className)}
    >
      <path d="M332.36,271.85c0,30.66-22.37,53.87-52.21,58.84v1.66c29.84,4.97,52.21,28.18,52.21,58.84v152.5c0,77.91-42.27,119.35-120.18,119.35H13.26c-8.29,0-13.26-4.97-13.26-13.26V13.26C0,4.14,4.97,0,13.26,0h198.91c77.91,0,120.18,41.44,120.18,119.35v152.51ZM222.13,142.56c0-21.55-10.77-33.15-33.15-33.15h-75.42v167.42h75.42c21.55,0,33.15-11.61,33.15-32.33v-101.94ZM222.13,419.38c0-21.55-10.77-33.15-33.15-33.15h-75.42v167.42h75.42c21.55,0,33.15-10.77,33.15-33.15v-101.12Z" className="bn-b" />
      <path d="M744.24,0c8.29,0,13.26,4.97,13.26,13.26v636.53c0,8.29-4.97,13.26-13.26,13.26h-82.05c-7.46,0-12.43-3.32-14.92-10.77l-126.81-353.91h-4.15v351.42c0,8.29-4.14,13.26-13.26,13.26h-86.2c-8.29,0-13.26-4.97-13.26-13.26V13.26c0-8.28,4.97-13.26,13.26-13.26h82.05c7.46,0,12.43,3.32,14.92,10.77l125.98,352.25h4.97V13.26c0-8.28,4.14-13.26,13.26-13.26h86.2Z" className="bn-n" />
    </svg>
  );
}

/**
 * Carregamento da tela (design.md §11.1): monograma em ciclo no verde da marca
 * e o que está sendo carregado, por escrito. Só aparece depois de 400 ms
 * (atraso no CSS, `.bn-carregando`), então pode ser montado no instante em que
 * a busca começa: resposta rápida troca a tela sem piscar a marca.
 *
 * É para a área de conteúdo inteira (primeira carga, troca de rota). Dentro de
 * painel e gráfico o carregando continua sendo esqueleto na altura final (§9.7).
 */
export function MonogramLoader({
  rotulo = 'Carregando',
  className,
}: {
  rotulo?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'bn-carregando flex flex-col items-center justify-center gap-3 py-16 text-[12px] text-ink-secondary',
        className,
      )}
    >
      <span className="text-brand-mark" aria-hidden>
        <Monogram animar="carrega" className="h-10" />
      </span>
      {rotulo}
    </div>
  );
}

/**
 * Quadrado do login (design.md §10.1): monograma sobre `bg-accent`.
 *
 * No claro o monograma fica no verde da marca (4,1:1 sobre #eef7ec). No escuro
 * esse verde some sobre o accent (#1f3120, 2,6:1), então o monograma toma a
 * cor do par tonal do quadrado, `accent-foreground` (9,2:1) — o mesmo
 * mecanismo de "branca sobre o verde" do §11: a marca não é recolorida, o
 * lugar dita a cor. Use este componente em vez de montar o quadrado na tela.
 */
export function MonogramTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-12 items-center justify-center rounded-2xl bg-accent text-brand-mark dark:text-accent-foreground',
        className,
      )}
    >
      <Monogram className="h-6" />
    </div>
  );
}

/**
 * Assinatura completa. PNG a 3× a largura exibida, na cor da marca.
 *
 * `w-fit`, e não `w-auto`: dentro de um container `flex-col` o
 * `align-items: stretch` só age sobre largura `auto`, e esticava a assinatura
 * para a coluna inteira — na tela de login ela saía 347px de largura por 32 de
 * altura, o dobro do largo que a marca tem. `fit-content` não é `auto`, então
 * o stretch não a alcança, e em `flex-row` nada muda.
 */
export function Wordmark({ className }: { className?: string }) {
  return <img src={logoBenenutri} alt="BENENUTRI" className={cn('h-5 w-fit', className)} />;
}
