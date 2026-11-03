// Peças de layout da tela Clientes (spec 002) que o vocabulário de
// components/page.tsx ainda não tem. Ficam aqui, e não em page.tsx, para não
// disputar o arquivo compartilhado com outras specs; se outra tela precisar,
// sobem para lá. Linha sempre compacta: nada de terceira linha por registro.

import * as React from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { IconButton } from '@/components/page'

/** Só a partir de `sm` (tabela, seletores na linha). */
export function SoDesktop({ children }: { children: React.ReactNode }) {
  return <div className="hidden sm:contents">{children}</div>
}

/** Só abaixo de `sm` (cartões, botão Filtros). */
export function SoCelular({ children }: { children: React.ReactNode }) {
  return <div className="contents sm:hidden">{children}</div>
}

/** Campo que ocupa o espaço que sobra numa Toolbar (a busca). */
export function Cresce({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 flex-1 basis-64">{children}</div>
}

/** Indicadores e gráfico lado a lado no desktop; empilhados no celular. */
export function GradeResumo({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:[&>*:first-child]:col-span-2">{children}</div>
}

/** Faixa de números separados por filete (2 colunas no celular, 5 no desktop). */
export function FaixaIndicadores({ itens }: { itens: { rotulo: string; valor: React.ReactNode }[] }) {
  return (
    <section className="grid grid-cols-2 rounded-2xl border border-rule-table bg-card sm:grid-cols-5">
      {itens.map((i, n) => (
        <div
          key={i.rotulo}
          className={cn(
            'min-w-0 px-4 py-3',
            n > 0 && 'sm:border-l sm:border-rule-row',
            n % 2 === 1 && 'border-l border-rule-row',
            n >= 2 && 'border-t border-rule-row sm:border-t-0',
            n === itens.length - 1 && itens.length % 2 === 1 && 'col-span-2 sm:col-span-1',
          )}
        >
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{i.rotulo}</p>
          <p className="mt-1 truncate font-title text-[18px] font-bold text-ink">{i.valor}</p>
        </div>
      ))}
    </section>
  )
}

/** RF-017: barras por ramo; cada barra é um botão que filtra o ramo. */
export function BarrasRamo({ ramos, total, ativo, escolher }: {
  ramos: { ramo: string; n: number }[]
  total: number
  ativo: string
  escolher: (ramo: string) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {ramos.map(r => (
        <li key={r.ramo}>
          <button
            type="button"
            aria-pressed={ativo === r.ramo}
            onClick={() => escolher(ativo === r.ramo ? '' : r.ramo)}
            className={cn(
              'grid w-full grid-cols-[7rem_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-1 text-left text-[12px] transition-colors hover:bg-accent',
              'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
              ativo === r.ramo && 'bg-accent',
            )}
          >
            <span className="truncate text-ink-secondary">{r.ramo}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className="block h-2 rounded-full bg-primary" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-semibold text-ink">{r.n}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Bloco recolhível (o gráfico por ramo no celular). */
export function Recolhivel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-rule-table bg-card px-4 py-3">
      <summary className="cursor-pointer font-title text-[13px] font-bold text-ink">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

export interface AcaoMenu {
  rotulo: string
  icone: React.ReactNode
  onClick: () => void
  perigo?: boolean
}

/** Ações secundárias da linha atrás de um ⋯. */
export function MenuAcoes({ label, acoes }: { label: string; acoes: AcaoMenu[] }) {
  const [aberto, setAberto] = React.useState(false)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <IconButton label={label}><MoreHorizontal aria-hidden /></IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {acoes.map(a => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => { setAberto(false); a.onClick() }}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors [&_svg]:size-4',
              a.perigo ? 'text-destructive hover:bg-destructive-bg' : 'text-ink hover:bg-accent',
            )}
          >
            {a.icone}
            {a.rotulo}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Lista de cartões compactos (a tabela no celular). */
export function ListaCartoes({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>
}

export function Cartao({ titulo, lado, meta, acoes }: {
  titulo: React.ReactNode
  lado?: React.ReactNode
  meta?: React.ReactNode
  acoes?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 border-b border-rule-row px-4 py-2.5 last:border-b-0">
      {lado ? <div className="shrink-0">{lado}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{titulo}</p>
        {meta ? <p className="flex items-center gap-x-2 overflow-hidden text-[12px] whitespace-nowrap text-ink-secondary">{meta}</p> : null}
      </div>
      {acoes ? <div className="shrink-0">{acoes}</div> : null}
    </li>
  )
}
