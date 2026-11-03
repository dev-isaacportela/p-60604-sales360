// Peças de layout da Agenda (spec 003) que o vocabulário de components/page.tsx
// não tem: grade da semana e do mês, linha compacta do compromisso, faixa de
// status. Ficam aqui para não disputar page.tsx com outras specs.

import * as React from 'react'
import { cn } from '@/lib/utils'

/** Agenda + painel lateral; no celular o painel desce para baixo da agenda. */
export function ComPainel({ children, painel }: { children: React.ReactNode; painel: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
      {/* As duas colunas terminam na mesma linha: o calendário estica até o fim do
          painel lateral, e o último bloco do painel estica até o fim do calendário. */}
      <div className="min-w-0 xl:[&>*]:h-full">{children}</div>
      <aside className="flex flex-col gap-4 xl:[&>*:last-child]:flex-1">{painel}</aside>
    </div>
  )
}

/** Barra de navegação do período: setas, Hoje, rótulo e visão. Quebra no celular. */
export function BarraPeriodo({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-rule-row px-4 py-3">{children}</div>
}

export function RotuloPeriodo({ children }: { children: React.ReactNode }) {
  return <span className="mr-auto font-title text-[15px] font-bold text-ink first-letter:uppercase">{children}</span>
}

/** Faixa de cor do status (RF-002), à esquerda do compromisso. */
export function FaixaStatus({ cor }: { cor: string }) {
  return <span className={cn('w-1 shrink-0 self-stretch rounded-full', cor)} aria-hidden />
}

export function Ponto({ cor }: { cor: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', cor)} aria-hidden />
}

/** Linha compacta de um compromisso (visão Dia e Semana no celular). */
export function LinhaItem({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-rule-row px-4 py-2 text-[13px] last:border-b-0">{children}</div>
}

export function ColunaHora({ children }: { children: React.ReactNode }) {
  return <span className="w-20 shrink-0 text-[12px] text-ink-secondary tabular-nums">{children}</span>
}

export function Miolo({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col">{children}</div>
}

export function UmaLinha({ children }: { children: React.ReactNode }) {
  return <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
}

export function Discreto({ children }: { children: React.ReactNode }) {
  return <span className="truncate text-[12px] text-ink-secondary">{children}</span>
}

/** Nome do cliente que abre o histórico (RF-015). */
export function NomeLink({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  if (!onClick) return <span className="truncate font-semibold text-ink">{children}</span>
  return (
    <button type="button" onClick={onClick} className="truncate text-left font-semibold text-ink underline decoration-ink-muted underline-offset-2 hover:text-primary">
      {children}
    </button>
  )
}

/** Sete colunas (seg–dom) da visão Semana no desktop. */
export function GradeSemana({ children }: { children: React.ReactNode }) {
  // Altura fixa com rolagem interna; o cabeçalho de cada dia fica grudado no topo.
  return <div className="grid h-[560px] grid-cols-7 divide-x divide-rule-row overflow-y-auto">{children}</div>
}

export function ColunaDia({ titulo, hoje, children }: { titulo: string; hoje: boolean; children: React.ReactNode }) {
  return (
    <section className="flex min-h-64 min-w-0 flex-col">
      <header className={cn('sticky top-0 z-10 border-b border-rule-row bg-card px-2 py-2 text-center text-[12px] font-semibold', hoje ? 'text-primary' : 'text-ink-secondary')}>
        {titulo}
      </header>
      <div className="flex flex-col gap-1.5 p-1.5">{children}</div>
    </section>
  )
}

/** Compromisso na grade (Semana/Mês): toque abre o detalhe. */
export function Bloco({ cor, hora, titulo, extra, onClick, rotulo }: {
  cor: string
  hora: string
  titulo: string
  extra?: string
  onClick: () => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="flex w-full min-w-0 gap-1.5 rounded-lg border border-rule-table bg-card px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-accent"
    >
      <FaixaStatus cor={cor} />
      <span className="flex min-w-0 flex-col">
        <span className="text-ink-secondary tabular-nums">{hora}</span>
        <span className="truncate font-semibold text-ink">{titulo}</span>
        {extra ? <span className="truncate text-ink-secondary">{extra}</span> : null}
      </span>
    </button>
  )
}

/** Dias da semana como abas (visão Semana no celular). */
export function AbasDias({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1 overflow-x-auto border-b border-rule-row px-2 py-2">{children}</div>
}

export function AbaDia({ ativo, children, onClick }: { ativo: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors', ativo ? 'bg-primary text-primary-foreground' : 'text-ink-secondary hover:bg-accent')}
    >
      {children}
    </button>
  )
}

/** Calendário do Mês: cabeçalho seg–dom e células por dia. */
export function GradeMes({ cabecalho, children }: { cabecalho: string[]; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-7">
      {cabecalho.map(d => (
        <span key={d} className="border-b border-rule-row py-1.5 text-center text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{d}</span>
      ))}
      {children}
    </div>
  )
}

export function CelulaMes({ dia, foraDoMes, hoje, children, onClick }: { dia: string; foraDoMes: boolean; hoje: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex min-h-20 min-w-0 flex-col gap-0.5 border-r border-b border-rule-row p-1 text-left align-top transition-colors hover:bg-accent [&:nth-child(7n)]:border-r-0', foraDoMes && 'bg-paper-sunken')}
    >
      <span className={cn('text-[12px] font-semibold', hoje ? 'text-primary' : foraDoMes ? 'text-ink-muted' : 'text-ink')}>{dia}</span>
      {children}
    </button>
  )
}

export function EntradaMes({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink">
      <Ponto cor={cor} />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Barra de progresso da meta (círculo limitado a 100%, spec 005 RN-005). */
export function Progresso({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  const pct = Math.max(0, Math.min(1, fracao || 0)) * 100
  return (
    <span className="block h-2 rounded-full bg-muted" role="img" aria-label={rotulo}>
      <span className="block h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </span>
  )
}

/** Lista de pares rótulo/valor do painel lateral. */
export function ListaPainel({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-2 text-[13px]">{children}</ul>
}

export function ItemPainel({ cor, rotulo, valor }: { cor?: string; rotulo: string; valor?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {cor ? <Ponto cor={cor} /> : null}
      <span className="flex-1 text-ink-secondary">{rotulo}</span>
      {valor !== undefined ? <span className="font-semibold text-ink tabular-nums">{valor}</span> : null}
    </li>
  )
}

/** Resultado da busca de cliente: lista de opções clicáveis, compacta. */
export function ListaOpcoes({ children }: { children: React.ReactNode }) {
  return <div className="flex max-h-56 flex-col overflow-y-auto rounded-xl border border-rule-table">{children}</div>
}

export function Opcao({ ativo, children, onClick }: { ativo: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn('flex flex-col border-b border-rule-row px-3 py-1.5 text-left text-[13px] last:border-b-0 transition-colors hover:bg-accent', ativo && 'bg-accent')}
    >
      {children}
    </button>
  )
}

/** Texto longo com quebras de linha preservadas (relato, planejamento). */
export function TextoLongo({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] whitespace-pre-wrap text-ink">{children}</p>
}

/** Fichas (vendedores, participantes) com espaço entre si. */
export function Fichas({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

/** Atividade do check-out: um quadro por atividade. */
export function CaixaAtividade({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-xl border border-rule-table p-3">{children}</div>
}
