// Blocos do Dashboard (spec 005). Cada um recebe o estado do seu useBloco:
// falha de um não derruba os outros (RF-011, C-007 da 000).

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtData, fmtDataHora, moeda } from '@/lib/formato'
import { meta, rotuloOrigem, rotuloStatus } from '@/lib/agenda'
import { atrasada } from '@/lib/atividades'
import { MSG_FALHA_BLOCO, cardMensal, pct, resumoSemana, serieDiaria, textoMetaComposta, ultimasAtividades } from '@/lib/dashboard'
import { Badge, Dash, EmptyState, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Status, Table, Td, TextLink, Th, Tr } from '@/components/page'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Estado<T> = { dados: T | null; erro: boolean }

/** Moldura de bloco: carregando, falha (mensagem padrão) ou conteúdo. */
export function Bloco<T>({ titulo, hint, acao, estado, children, className }: {
  titulo: string
  hint?: ReactNode
  acao?: ReactNode
  estado: Estado<T>
  children: (dados: T) => ReactNode
  className?: string
}) {
  return (
    <Panel className={cn('flex min-w-0 flex-col', className)}>
      <PanelHeader title={titulo} hint={hint}>{acao}</PanelHeader>
      {estado.erro ? (
        <PanelBody><p className="text-[13px] text-destructive" role="alert">{MSG_FALHA_BLOCO}</p></PanelBody>
      ) : estado.dados === null ? (
        <PanelBody><span className="text-[13px] text-ink-secondary" aria-live="polite">Carregando…</span></PanelBody>
      ) : (
        children(estado.dados)
      )}
    </Panel>
  )
}

/** Círculo de progresso (limitado a 100%) com o texto no meio. */
function Circulo({ fracao, children, rotulo }: { fracao: number; children: ReactNode; rotulo: string }) {
  const r = 34
  const volta = 2 * Math.PI * r
  const cheio = Math.max(0, Math.min(1, fracao || 0))
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={rotulo}>
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-border" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary"
          strokeDasharray={volta} strokeDashoffset={volta * (1 - cheio)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-title text-[15px] font-bold text-ink tabular-nums">{children}</span>
    </div>
  )
}

function Par({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 text-ink-secondary">{rotulo}</span>
      <span className="font-semibold text-ink tabular-nums">{valor}</span>
    </li>
  )
}

/* ─────────────── meta semanal (RF-003, RN-003 a RN-005) ─────────────── */

export function MetaSemanal({ estado, modo, segunda, sexta }: { estado: Estado<[Linha | null, Linha | null]>; modo: string; segunda: string; sexta: string }) {
  return (
    <Bloco titulo="Meta semanal de visitas" hint={`Concluídas de segunda a sexta (${fmtData(segunda).slice(0, 5)} a ${fmtData(sexta).slice(0, 5)}).`} estado={estado}>
      {([resumo, valores]) => {
        const m = meta(resumo)
        const composta = textoMetaComposta(modo, valores, Number(resumo?.PESSOAS ?? 0))
        return (
          <PanelBody>
            <div className="flex flex-wrap items-center gap-4">
              <Circulo fracao={m.meta ? m.realizadas / m.meta : 0} rotulo={`${m.realizadas} de ${m.meta} visitas, ${m.percentual}%`}>{m.percentual}%</Circulo>
              <ul className="flex flex-1 flex-col gap-1.5 text-[13px]">
                <Par rotulo="Realizadas" valor={m.realizadas} />
                <Par rotulo="Meta" valor={m.meta} />
                <Par rotulo="Restantes" valor={m.restantes} />
              </ul>
            </div>
            {composta ? <p className="mt-3 text-[12px] text-ink-secondary">{composta}</p> : null}
          </PanelBody>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── meta mensal (RF-005, RF-010, RN-006 a RN-008) ─────────────── */

const TOM_SELO = { 'Acima da meta': 'accent', 'No ritmo': 'attention', 'Abaixo da meta': 'alert' } as const

export function Atualizacao({ quando }: { quando: unknown }) {
  if (!quando) return null
  return <p className="text-[12px] text-ink-secondary">Vendas atualizadas em {fmtDataHora(String(quando).replace(' ', 'T'))}</p>
}

export function MetaMensal({ estado, inicio, fim, hoje }: { estado: Estado<Linha | null>; inicio: string; fim: string; hoje: string }) {
  return (
    <Bloco titulo="Meta mensal de faturamento" hint="Faturamento líquido do mês (vendas − devoluções)." estado={estado}>
      {linha => {
        const liquido = Number(linha?.LIQUIDO ?? 0)
        const c = cardMensal({ liquido, meta: linha?.META == null ? null : Number(linha.META), inicio, fim, hoje })
        return (
          <PanelBody>
            <div className="flex flex-wrap items-center gap-4">
              <Circulo fracao={c.circulo / 100} rotulo={c.distribuida ? `${pct(c.percentual)} da meta` : 'Meta não distribuída'}>
                {c.distribuida ? pct(c.percentual) : <Dash />}
              </Circulo>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-title text-[20px] font-bold text-ink tabular-nums">{moeda(liquido)}</span>
                {c.distribuida ? (
                  <>
                    <span className="text-[13px] text-ink-secondary">{pct(c.percentual)} de {moeda(linha?.META)}</span>
                    <span className="text-[13px] text-ink-secondary">Projeção de fechamento: <span className="font-semibold text-ink">{moeda(c.projecao)}</span></span>
                    <span><Badge tone={TOM_SELO[c.selo]}>{c.selo}</Badge></span>
                  </>
                ) : (
                  <span className="text-[13px] font-semibold text-attention">Meta não distribuída</span>
                )}
              </div>
            </div>
            <div className="mt-3"><Atualizacao quando={linha?.ATUALIZADO_EM} /></div>
          </PanelBody>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── vendas diárias (RF-006, RN-009) ─────────────── */

export function VendasDiarias({ estado, mes, hoje, className }: { estado: Estado<Linha[]>; mes: Linha | null; hoje: string; className?: string }) {
  const [marcado, setMarcado] = useState<string | null>(null)
  return (
    <Bloco titulo="Vendas líquidas diárias" hint="Últimos 7 dias úteis · Toque em uma barra" estado={estado} className={className}>
      {linhas => {
        const serie = serieDiaria(linhas, hoje)
        const destaque = serie.find(d => d.dia === marcado) ?? serie[serie.length - 1]
        const maior = Math.max(1, ...serie.map(d => d.valor))
        return (
          <PanelBody>
            <p className="text-[12px] text-ink-secondary">{fmtData(destaque.dia)}</p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-title text-[20px] font-bold text-ink tabular-nums">{moeda(destaque.valor)}</span>
              <span className="text-[13px] text-ink-secondary">{destaque.variacao === '—' ? '—' : `${destaque.variacao} vs dia anterior`}</span>
            </p>
            <div className="mt-3 flex h-36 items-end gap-2">
              {serie.map(d => (
                <button
                  key={d.dia}
                  type="button"
                  onClick={() => setMarcado(m => (m === d.dia ? null : d.dia))}
                  aria-pressed={d.dia === destaque.dia}
                  aria-label={`${fmtData(d.dia)}: ${moeda(d.valor)}`}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span
                    className={cn('w-full max-w-10 rounded-t-md transition-colors', d.dia === destaque.dia ? 'bg-primary' : 'bg-primary/35 hover:bg-primary/60')}
                    style={{ height: `${Math.max(2, (Math.max(0, d.valor) / maior) * 100)}%` }}
                  />
                  <span className="text-[11px] text-ink-secondary tabular-nums">{fmtData(d.dia).slice(0, 5)}</span>
                </button>
              ))}
            </div>
            {mes ? (
              <p className="mt-3 text-[12px] text-ink-secondary">
                Bruto {moeda(mes.BRUTO)} − devoluções {moeda(mes.DEVOLUCOES)} no mês = líquido {moeda(mes.LIQUIDO)}
              </p>
            ) : null}
            <div className="mt-1"><Atualizacao quando={mes?.ATUALIZADO_EM} /></div>
          </PanelBody>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── alertas (RF-007, RN-010) ─────────────── */

function LinhaLista({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const classe = 'flex w-full min-w-0 flex-col border-b border-rule-row px-4 py-2 text-left text-[13px] last:border-b-0'
  return onClick ? <button type="button" onClick={onClick} className={cn(classe, 'transition-colors hover:bg-accent')}>{children}</button> : <div className={classe}>{children}</div>
}

export function Alertas({ estado, className }: { estado: Estado<Linha[]>; className?: string }) {
  const navegar = useNavigate()
  return (
    <Bloco titulo="Alertas não lidos" hint="Prioridade alta." estado={estado} className={className} acao={<TextLink className="whitespace-nowrap" onClick={() => navegar('/alertas')}>Ver todos</TextLink>}>
      {lista => lista.length === 0 ? (
        <PanelBody><p className="text-[13px] text-ink-secondary">Nenhum alerta de alta prioridade pendente.</p></PanelBody>
      ) : (
        <div>
          {lista.map(a => (
            <LinhaLista key={a.ID} onClick={() => navegar(`/alertas?alertaId=${a.ID}`)}>
              <span className="truncate"><RowTitle>{a.TITULO}</RowTitle></span>
              <RowMeta>{[a.CLIENTE, a.VENDEDOR, fmtData(a.DATA_GERACAO)].filter(Boolean).join(' · ')}</RowMeta>
            </LinhaLista>
          ))}
        </div>
      )}
    </Bloco>
  )
}

/* ─────────────── últimas atividades (RF-008, RN-011) ─────────────── */

export function UltimasAtividades({ estado, hoje }: { estado: Estado<Linha[]>; hoje: string }) {
  const navegar = useNavigate()
  return (
    <Bloco
      titulo="Últimas Atividades"
      hint="Pendentes com prazo mais próximo."
      estado={estado}
      acao={<TextLink className="whitespace-nowrap" onClick={() => navegar('/tarefas')}>Ver histórico completo</TextLink>}
    >
      {abertas => {
        const lista = ultimasAtividades(abertas)
        return (
          <>
            {lista.length === 0 ? (
              <PanelBody><p className="text-[13px] text-ink-secondary">Nenhuma atividade recente.</p></PanelBody>
            ) : lista.map(a => (
              <LinhaLista key={a.ID}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate"><RowTitle>{a.TITULO}</RowTitle></span>
                  {a.DATA_LIMITE ? (
                    <Status tone={atrasada(a, hoje) ? 'alert' : 'off'}>{fmtData(a.DATA_LIMITE)}</Status>
                  ) : <span className="text-[12px] text-ink-secondary">Sem prazo</span>}
                </span>
                <RowMeta>{a.DESCRICAO}</RowMeta>
              </LinhaLista>
            ))}
            <div className="mt-auto border-t border-rule-row px-4 py-2">
              <TextLink onClick={() => navegar(`/agenda?modo=DIA&data=${hoje}`)}>Abrir agenda do dia</TextLink>
            </div>
          </>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── resumo da semana (RF-009, RN-012) ─────────────── */

const TOM_RELATO: Record<string, 'live' | 'attention' | 'off'> = { Ok: 'live', 'Relato pendente': 'attention', Cancelada: 'off' }

export function ResumoSemana({ estado, hoje }: { estado: Estado<Linha[]>; hoje: string }) {
  const navegar = useNavigate()
  return (
    <Bloco titulo="Resumo da Semana" hint="Visitas e prospecções de segunda a domingo." estado={estado} acao={<TextLink className="whitespace-nowrap" onClick={() => navegar('/agenda')}>Ver agenda completa</TextLink>}>
      {itens => {
        const lista = resumoSemana(itens, hoje)
        if (lista.length === 0) return <EmptyState title="Nenhuma visita registrada nesta semana." />
        return (
          <Table>
            <thead>
              <tr><Th>Data da visita</Th><Th>Data do relato</Th><Th>Cliente</Th><Th>Status da visita</Th><Th>Relato</Th></tr>
            </thead>
            <tbody>
              {lista.map(i => (
                <Tr key={`${i.ORIGEM}-${i.ID}`}>
                  <Td className="py-2 whitespace-nowrap tabular-nums">{fmtData(i.DATA)}</Td>
                  <Td className="py-2 whitespace-nowrap tabular-nums">{i.dataRelato ? fmtData(i.dataRelato) : <Dash />}</Td>
                  <Td className="py-2 whitespace-nowrap"><RowTitle>{i.TITULO}</RowTitle>{i.ORIGEM === 'PROSPECCAO' ? <span className="text-[12px] text-ink-secondary"> · Prospecção</span> : null}</Td>
                  <Td className="py-2 whitespace-nowrap">{rotuloStatus(i.STATUS)}</Td>
                  <Td className="py-2 whitespace-nowrap">{TOM_RELATO[i.relato] ? <Status tone={TOM_RELATO[i.relato]}>{i.relato}</Status> : <Dash />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── compromissos de hoje (RN-002) ─────────────── */

export function ListaCompromissos({ itens }: { itens: Linha[] }) {
  if (itens.length === 0) return <p className="text-[13px] text-ink-secondary">Nenhum compromisso para hoje.</p>
  return (
    <div className="rounded-xl border border-rule-table">
      {itens.map(i => {
        const pessoas = String(i.PARTICIPANTES ?? '').split('|').filter(Boolean).map(p => p.split(':').slice(1).join(':'))
        return (
          <LinhaLista key={`${i.ORIGEM}-${i.ID}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate"><span className="mr-2 text-ink-secondary tabular-nums">{i.HORA_INICIO}–{i.HORA_FIM}</span><RowTitle>{i.TITULO}</RowTitle></span>
              <span className="shrink-0 text-[12px] text-ink-secondary">{rotuloStatus(i.STATUS)}</span>
            </span>
            <RowMeta>{[rotuloOrigem(i), i.DONO, pessoas.length ? `Convidados: ${pessoas.join(', ')}` : ''].filter(Boolean).join(' · ')}</RowMeta>
          </LinhaLista>
        )
      })}
    </div>
  )
}
