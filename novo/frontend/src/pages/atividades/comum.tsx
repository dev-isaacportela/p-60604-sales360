// Peças comuns da Lista e do Kanban (spec 004): seletor de status, lixeira,
// prioridade e prazo. Atividade de outro (SOMENTE_LEITURA) não ganha seletor
// nem lixeira (RN-001/002).

import type * as React from 'react'
import { Trash2 } from 'lucide-react'
import { fmtData } from '@/lib/formato'
import { STATUS, TOM_PRIORIDADE, atrasada, rotuloPrioridade, rotuloStatus } from '@/lib/atividades'
import { Dash, IconButton, SelectMenu, Status } from '@/components/page'

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

