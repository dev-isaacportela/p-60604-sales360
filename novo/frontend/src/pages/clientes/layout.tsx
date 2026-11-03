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

/** Indicadores em faixa larga e o gráfico embaixo: lado a lado, a faixa esticava até a altura do gráfico e cortava os valores. */
export function GradeResumo({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}

const TOM_MEDIDOR = { live: 'bg-primary', neutro: 'bg-ink-secondary/45', attention: 'bg-attention', alert: 'bg-destructive' } as const

export interface Indicador {
  rotulo: string
  valor: React.ReactNode
  /** Contexto do número, ao pé da ficha. */
  nota?: React.ReactNode
  /** Barra de proporção (0..1). */
  medidor?: { fracao: number; tom: keyof typeof TOM_MEDIDOR; rotulo: string }
  /** Nota 0–100 sobre as faixas Frio / Morno / Quente (RN-008). */
  termometro?: number | null
  /** Ficha clicável (liga um filtro). */
  acao?: { rotulo: string; ativo: boolean; onClick: () => void }
}

function Medidor({ fracao, tom, rotulo }: NonNullable<Indicador['medidor']>) {
  const pct = Math.max(0, Math.min(1, fracao || 0)) * 100
  return (
    <span className="block h-1.5 rounded-full bg-muted" role="img" aria-label={rotulo}>
      <span className={cn('block h-1.5 rounded-full', TOM_MEDIDOR[tom])} style={{ width: `${pct}%` }} />
    </span>
  )
}

function Termometro({ nota }: { nota: number }) {
  const pos = Math.max(0, Math.min(100, nota))
  return (
    <span className="relative block pt-1" role="img" aria-label={`Nota ${nota} de 100: Frio abaixo de 40, Morno de 40 a 69, Quente a partir de 70`}>
      <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <span className="w-[40%] bg-destructive/35" />
        <span className="w-[30%] bg-attention/35" />
        <span className="w-[30%] bg-primary/35" />
      </span>
      <span className="absolute top-0 h-3.5 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pos}%` }} />
    </span>
  )
}

/**
 * Faixa de indicadores separados por filete (2 colunas no celular, 5 no
 * desktop). Cada ficha preenche a altura com número em cima e contexto
 * (medidor e nota) embaixo.
 */
export function FaixaIndicadores({ itens }: { itens: Indicador[] }) {
  return (
    <section className="grid grid-cols-2 rounded-2xl border border-rule-table bg-card sm:grid-cols-5">
      {itens.map((i, n) => {
        const classe = cn(
          '@container flex min-w-0 flex-col justify-between gap-3 px-4 py-4 text-left',
          n > 0 && 'sm:border-l sm:border-rule-row',
          n % 2 === 1 && 'border-l border-rule-row',
          n >= 2 && 'border-t border-rule-row sm:border-t-0',
          n === itens.length - 1 && itens.length % 2 === 1 && 'col-span-2 sm:col-span-1',
          i.acao && 'transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
          i.acao?.ativo && 'bg-accent',
          n === 0 && 'rounded-l-2xl',
        )
        const conteudo = (
          <>
            <span className="block">
              <span className="block text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{i.rotulo}</span>
              <span className="mt-1.5 block truncate font-title text-[clamp(18px,14cqi,26px)] leading-tight tabular-nums font-bold text-ink">{i.valor}</span>
            </span>
            <span className="flex flex-col gap-2">
              {i.medidor ? <Medidor {...i.medidor} /> : null}
              {i.termometro != null ? <Termometro nota={i.termometro} /> : null}
              {i.nota ? <span className="block text-[12px] text-ink-secondary">{i.nota}</span> : null}
            </span>
          </>
        )
        return i.acao ? (
          <button key={i.rotulo} type="button" aria-pressed={i.acao.ativo} title={i.acao.rotulo} onClick={i.acao.onClick} className={classe}>
            {conteudo}
          </button>
        ) : (
          <div key={i.rotulo} className={classe}>{conteudo}</div>
        )
      })}
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
    // Duas colunas no desktop (em ordem de cima para baixo) para o gráfico largo não empurrar a tabela.
    <ul className="lg:columns-2 lg:gap-x-8">
      {ramos.map(r => (
        <li key={r.ramo} className="mb-1 break-inside-avoid">
          <button
            type="button"
            aria-pressed={ativo === r.ramo}
            onClick={() => escolher(ativo === r.ramo ? '' : r.ramo)}
            className={cn(
              'grid w-full grid-cols-[9rem_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-1 text-left text-[12px] transition-colors hover:bg-accent',
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
