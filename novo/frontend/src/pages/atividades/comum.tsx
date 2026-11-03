// Peças comuns da Lista e do Kanban (spec 004): seletor de status, lixeira,
// prioridade e prazo. Atividade de outro (SOMENTE_LEITURA) não ganha seletor
// nem lixeira (RN-001/002).

import { useState } from 'react'
import type * as React from 'react'
import { CalendarDays, Check, ChevronDown, Trash2 } from 'lucide-react'
import { fmtData } from '@/lib/formato'
import { STATUS, TOM_PRIORIDADE, atrasada, rotuloPrioridade, rotuloStatus } from '@/lib/atividades'
import { Button, Dash, IconButton, Input, LabelledField, SelectMenu, Status } from '@/components/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Ponto da prioridade: Alta vermelho, Média amarelo, Baixa verde (spec 004). */
export const PONTO_PRIORIDADE: Record<string, string> = { ALTA: 'bg-destructive', MEDIA: 'bg-attention', BAIXA: 'bg-primary' }

const PILULA = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors'
const pilula = (ativa: boolean) => cn(PILULA, ativa ? 'border-ink bg-ink font-semibold text-card' : 'border-rule-table bg-card text-ink hover:bg-secondary')

/**
 * Filtro de uma escolha num botão só ("Status: Todos ▾") que abre a lista.
 * A primeira opção é a de "sem filtro"; com filtro, o botão fica escuro.
 * `ponto` = classe da bolinha da opção.
 */
export function MenuFiltro({ rotulo, opcoes, valor, mudar }: {
  rotulo: string
  opcoes: { value: string; label: string; ponto?: string }[]
  valor: string
  mudar: (v: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const atual = opcoes.find(o => o.value === valor) ?? opcoes[0]
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${rotulo}: ${atual.label}. Alterar`} className={pilula(!!valor)}>
          {atual.ponto ? <span aria-hidden className={cn('size-2 rounded-full', atual.ponto)} /> : null}
          <span className={valor ? '' : 'text-ink-secondary'}>{rotulo}:</span> {atual.label}
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {opcoes.map(o => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === valor}
            onClick={() => { setAberto(false); mudar(o.value) }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-secondary"
          >
            <span aria-hidden className={cn('size-2 rounded-full', o.ponto ?? 'bg-transparent')} />
            <span className="flex-1">{o.label}</span>
            {o.value === valor ? <Check aria-hidden className="size-3.5 text-primary" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Prazo exato num botão só, que abre a data. */
export function FiltroPrazo({ valor, mudar }: { valor: string; mudar: (v: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={valor ? `Prazo: ${fmtData(valor)}. Alterar` : 'Prazo: qualquer. Alterar'} className={pilula(!!valor)}>
          <CalendarDays aria-hidden className="size-3.5" />
          <span className={valor ? '' : 'text-ink-secondary'}>Prazo:</span> {valor ? fmtData(valor) : 'Qualquer'}
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-60 flex-col gap-3">
        <LabelledField label="Prazo exato">
          <Input type="date" value={valor} onChange={e => mudar(e.target.value)} />
        </LabelledField>
        {valor ? <Button size="sm" onClick={() => mudar('')}>Qualquer prazo</Button> : null}
      </PopoverContent>
    </Popover>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = Record<string, any>

export interface AcoesAtividade {
  hoje: string
  mostrarResponsavel: boolean
  abrir: (a: Linha) => void
  trocarStatus: (a: Linha, status: string) => void
  excluir: (a: Linha) => void
}

const TOM_STATUS: Record<string, 'off' | 'attention' | 'live'> = { PENDENTE: 'off', EM_ANDAMENTO: 'attention', CONCLUIDA: 'live' }

/** Os 4 cards: 2 por linha no celular (o InfoGrid empilha 1 por linha), 4 no desktop. */
export function GradeCards({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}

export function Prioridade({ a }: { a: Linha }) {
  return <Status tone={TOM_PRIORIDADE[a.PRIORIDADE] ?? 'off'}>{rotuloPrioridade(a.PRIORIDADE)}</Status>
}

/** Prazo em vermelho quando atrasada (RN-006); sem prazo = traço. */
export function Prazo({ a, hoje }: { a: Linha; hoje: string }) {
  if (!a.DATA_LIMITE) return <Dash />
  return atrasada(a, hoje) ? <Status tone="alert">{fmtData(a.DATA_LIMITE)}</Status> : <span className="whitespace-nowrap">{fmtData(a.DATA_LIMITE)}</span>
}

export function SeletorStatus({ a, acoes }: { a: Linha; acoes: AcoesAtividade }) {
  if (a.SOMENTE_LEITURA) return <span className="text-[13px]"><Status tone={TOM_STATUS[a.STATUS] ?? 'off'}>{rotuloStatus(a.STATUS)}</Status></span>
  return (
    <div className="w-40">
      <SelectMenu label={`Status de ${a.TITULO}`} value={a.STATUS} options={STATUS} onChange={v => v !== a.STATUS && acoes.trocarStatus(a, v)} />
    </div>
  )
}

export function Lixeira({ a, acoes }: { a: Linha; acoes: AcoesAtividade }) {
  if (a.SOMENTE_LEITURA) return null
  return (
    <IconButton label={`Excluir ${a.TITULO}`} tone="danger" onClick={() => acoes.excluir(a)}>
      <Trash2 aria-hidden />
    </IconButton>
  )
}

