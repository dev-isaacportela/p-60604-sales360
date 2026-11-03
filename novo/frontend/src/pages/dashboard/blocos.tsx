// Blocos do Dashboard (spec 005). Cada um recebe o estado do seu useBloco:
// falha de um não derruba os outros (RF-011, C-007 da 000). Visual calmo:
// cinza e um verde só, que marca progresso e o dia em destaque.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtData, fmtDataHora, moeda } from '@/lib/formato'
import { meta, rotuloOrigem, rotuloStatus } from '@/lib/agenda'
import { atrasada } from '@/lib/atividades'
import { MSG_FALHA_BLOCO, cardMensal, pct, resumoSemana, ritmoSemana, serieDiaria, textoMetaComposta, ultimasAtividades } from '@/lib/dashboard'
import { Dash, EmptyState, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Table, Td, TextLink, Th } from '@/components/page'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Estado<T> = { dados: T | null; erro: boolean }

const ddmm = (iso: string) => fmtData(iso).slice(0, 5)

/** Carregando, falha (mensagem padrão) ou conteúdo. */
function Conteudo<T>({ estado, children }: { estado: Estado<T>; children: (dados: T) => ReactNode }) {
  if (estado.erro) return <PanelBody><p className="text-[13px] text-destructive" role="alert">{MSG_FALHA_BLOCO}</p></PanelBody>
  if (estado.dados === null) return <PanelBody><span className="text-[13px] text-ink-secondary" aria-live="polite">Carregando…</span></PanelBody>
  return <>{children(estado.dados)}</>
}

/** Moldura de bloco com cabeçalho. */
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
      <Conteudo estado={estado}>{children}</Conteudo>
    </Panel>
  )
}

/** Círculo de progresso (limitado a 100%), com arco de projeção e marca de ritmo opcionais. */
function Circulo({ fracao, projecao, marca, children, rotulo }: { fracao: number; projecao?: number; marca?: number; children: ReactNode; rotulo: string }) {
  const r = 34
  const volta = 2 * Math.PI * r
  const limita = (f?: number) => Math.max(0, Math.min(1, f || 0))
  const arco = (f?: number) => ({ strokeDasharray: volta, strokeDashoffset: volta * (1 - limita(f)) })
  const angulo = limita(marca) * 2 * Math.PI
  return (
    <div className="relative size-28 shrink-0" role="img" aria-label={rotulo}>
      <svg viewBox="0 0 80 80" className="size-28 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-border" />
        {projecao == null ? null : <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-primary/30" {...arco(projecao)} />}
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary" {...arco(fracao)} />
        {marca == null ? null : (
          <line x1={40 + 28 * Math.cos(angulo)} y1={40 + 28 * Math.sin(angulo)} x2={40 + 39 * Math.cos(angulo)} y2={40 + 39 * Math.sin(angulo)}
            strokeWidth="2" strokeLinecap="round" className="stroke-ink-secondary" />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-title text-[18px] font-bold text-ink tabular-nums">{children}</span>
    </div>
  )
}

/** Faixa de números no pé do card: rótulo, valor e uma explicação curta. */
function Rodape({ itens }: { itens: [string, ReactNode, string][] }) {
  return (
    <dl className="mt-auto grid grid-cols-3 gap-3 rounded-b-2xl bg-secondary px-5 py-3.5">
      {itens.map(([rotulo, valor, dica]) => (
        <div key={rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12px] text-ink-secondary">{rotulo}</dt>
          <dd className="font-title text-[17px] font-bold whitespace-nowrap text-ink tabular-nums">{valor}</dd>
          <dd className="text-[12px] text-ink-secondary">{dica}</dd>
        </div>
      ))}
    </dl>
  )
}

function Indicador({ circulo, titulo, valor, children }: { circulo: ReactNode; titulo: string; valor: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-6 p-5">
      {circulo}
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <h2 className="text-[13px] text-ink-secondary">{titulo}</h2>
        <p className="font-title text-[26px] leading-tight font-bold text-ink tabular-nums">{valor}</p>
        {children}
      </div>
    </div>
  )
}

/* ─────────────── meta semanal (RF-003, RN-003 a RN-005) ─────────────── */

export function MetaSemanal({ estado, modo, segunda, sexta, hoje }: { estado: Estado<[Linha | null, Linha | null]>; modo: string; segunda: string; sexta: string; hoje: string }) {
  return (
    <Panel className="flex min-w-0 flex-col">
      <Conteudo estado={estado}>
        {([resumo, valores]) => {
          const m = meta(resumo)
          const ritmo = ritmoSemana(m.meta, m.realizadas, segunda, hoje)
          const composta = textoMetaComposta(modo, valores, Number(resumo?.PESSOAS ?? 0))
          return (
            <>
              <Indicador
                titulo="Meta semanal de visitas"
                valor={<>{m.realizadas} <span className="text-[15px] font-medium text-ink-secondary">de {m.meta}</span></>}
                circulo={
                  <Circulo fracao={m.meta ? m.realizadas / m.meta : 0} marca={m.meta ? ritmo.fracao : undefined}
                    rotulo={`${m.realizadas} de ${m.meta} visitas, ${m.percentual}%. Esperado até hoje: ${ritmo.esperado}.`}>
                    {m.percentual}%
                  </Circulo>
                }
              >
                <p className="text-[12px] text-ink-secondary">Concluídas de segunda a sexta ({ddmm(segunda)} a {ddmm(sexta)})</p>
                {composta ? <p className="text-[12px] text-ink-secondary">{composta}</p> : null}
              </Indicador>
              <Rodape itens={[
                ['Restantes', m.restantes, 'visitas até sexta'],
                ['Para fechar', ritmo.porDia == null ? <Dash /> : `${ritmo.porDia} / dia`, ritmo.porDia == null ? 'semana encerrada' : ritmo.dias === 1 ? 'hoje, último dia útil' : `nos ${ritmo.dias} dias úteis`],
                ['Esperado até hoje', ritmo.esperado, 'marca no anel'],
              ]} />
            </>
          )
        }}
      </Conteudo>
    </Panel>
  )
}

/* ─────────────── meta mensal (RF-005, RN-006 a RN-008) ─────────────── */

export function Atualizacao({ quando }: { quando: unknown }) {
  if (!quando) return null
  return <>Vendas atualizadas em {fmtDataHora(String(quando).replace(' ', 'T'))}</>
}

export function MetaMensal({ estado, inicio, fim, hoje }: { estado: Estado<Linha | null>; inicio: string; fim: string; hoje: string }) {
  return (
    <Panel className="flex min-w-0 flex-col">
      <Conteudo estado={estado}>
        {linha => {
          const liquido = Number(linha?.LIQUIDO ?? 0)
          const alvo = Number(linha?.META ?? 0)
          const c = cardMensal({ liquido, meta: linha?.META == null ? null : alvo, inicio, fim, hoje })
          const devolvido = Number(linha?.DEVOLVIDO ?? 0)
          return (
            <>
              <Indicador
                titulo="Meta mensal de faturamento"
                valor={<>{moeda(liquido)}{c.distribuida ? <span className="text-[15px] font-medium text-ink-secondary"> de {moeda(alvo)}</span> : null}</>}
                circulo={
                  <Circulo fracao={c.circulo / 100} projecao={c.distribuida ? c.projecao / alvo : undefined}
                    rotulo={c.distribuida ? `${pct(c.percentual)} da meta; projeção ${pct((c.projecao / alvo) * 100)}` : 'Meta não distribuída'}>
                    {c.distribuida ? pct(c.percentual) : <Dash />}
                  </Circulo>
                }
              >
                <p className="text-[12px] text-ink-secondary">Faturamento líquido do mês (vendas − devoluções)</p>
                {c.distribuida ? (
                  <p className="text-[13px] text-ink-secondary">
                    Projeção <span className="font-semibold text-ink">{moeda(c.projecao)}</span> ({pct((c.projecao / alvo) * 100)}) · <span className="font-semibold text-ink">{c.selo}</span>
                  </p>
                ) : (
                  <p className="text-[13px] font-semibold text-ink">Meta não distribuída</p>
                )}
              </Indicador>
              <Rodape itens={[
                ['Falta para a meta', c.distribuida ? moeda(Math.max(0, alvo - liquido)) : <Dash />, c.distribuida ? `de ${moeda(alvo)}` : 'sem meta'],
                ['Vendas brutas', moeda(linha?.BRUTO ?? 0), 'no mês'],
                ['Devoluções', devolvido ? `− ${moeda(devolvido)}` : moeda(0), 'no mês'],
              ]} />
            </>
          )
        }}
      </Conteudo>
    </Panel>
  )
}

/* ─────────────── vendas diárias (RF-006, RF-010, RN-009) ─────────────── */

export function VendasDiarias({ estado, mes, hoje, className }: { estado: Estado<Linha[]>; mes: Linha | null; hoje: string; className?: string }) {
  const [marcado, setMarcado] = useState<string | null>(null)
  const atualizacao = mes?.ATUALIZADO_EM ? <> · <Atualizacao quando={mes.ATUALIZADO_EM} /></> : null
  return (
    <Bloco titulo="Vendas líquidas diárias" hint={<>Últimos 7 dias úteis · toque em uma barra{atualizacao}</>} estado={estado} className={className}>
      {linhas => {
        const serie = serieDiaria(linhas, hoje)
        const destaque = serie.find(d => d.dia === marcado) ?? serie[serie.length - 1]
        const maior = Math.max(1, ...serie.map(d => d.valor))
        return (
          <PanelBody>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[12px] text-ink-secondary">{fmtData(destaque.dia)}</span>
              <span className="font-title text-[20px] font-bold text-ink tabular-nums">{moeda(destaque.valor)}</span>
              <span className="text-[13px] text-ink-secondary">{destaque.variacao === '—' ? '—' : `${destaque.variacao} vs dia anterior`}</span>
            </p>
            <div className="mt-3 flex h-36 items-end gap-3">
              {serie.map(d => (
                <button
                  key={d.dia}
                  type="button"
                  onClick={() => setMarcado(m => (m === d.dia ? null : d.dia))}
                  aria-pressed={d.dia === destaque.dia}
                  aria-label={`${fmtData(d.dia)}: ${moeda(d.valor)}`}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span
                    className={cn('w-full max-w-12 rounded-t-md transition-colors', d.dia === destaque.dia ? 'bg-primary' : 'bg-ink-secondary/30 hover:bg-ink-secondary/50')}
                    style={{ height: `${Math.max(2, (Math.max(0, d.valor) / maior) * 100)}%` }}
                  />
                  <span className={cn('text-[12px] tabular-nums', d.dia === hoje ? 'font-semibold text-ink' : 'text-ink-secondary')}>{d.dia === hoje ? 'hoje' : ddmm(d.dia)}</span>
                </button>
              ))}
            </div>
          </PanelBody>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── alertas (RF-007, RN-010) ─────────────── */

function LinhaLista({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const classe = 'flex w-full min-w-0 flex-col border-b border-rule-row px-4 py-2.5 text-left text-[13px] last:border-b-0'
  return onClick ? <button type="button" onClick={onClick} className={cn(classe, 'transition-colors hover:bg-secondary')}>{children}</button> : <div className={classe}>{children}</div>
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
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate"><RowTitle>{a.CLIENTE || a.TITULO}</RowTitle></span>
                <span className="shrink-0 text-[12px] text-ink-secondary tabular-nums">{ddmm(a.DATA_GERACAO)}</span>
              </span>
              <RowMeta>{[a.CLIENTE ? a.TITULO : '', a.VENDEDOR].filter(Boolean).join(' · ')}</RowMeta>
            </LinhaLista>
          ))}
        </div>
      )}
    </Bloco>
  )
}

/* ─────────────── últimas atividades (RF-008, RN-011) ─────────────── */

export function UltimasAtividades({ estado, hoje, className }: { estado: Estado<Linha[]>; hoje: string; className?: string }) {
  const navegar = useNavigate()
  return (
    <Bloco
      titulo="Últimas Atividades"
      hint="Pendentes com prazo mais próximo."
      estado={estado}
      className={className}
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
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate"><RowTitle>{a.TITULO}</RowTitle></span>
                  <span className={cn('shrink-0 text-[12px] tabular-nums', a.DATA_LIMITE && atrasada(a, hoje) ? 'font-semibold text-ink' : 'text-ink-secondary')}>
                    {!a.DATA_LIMITE ? 'Sem prazo' : atrasada(a, hoje) ? `venceu ${ddmm(a.DATA_LIMITE)}` : `prazo ${ddmm(a.DATA_LIMITE)}`}
                  </span>
                </span>
                <RowMeta>{a.DESCRICAO}</RowMeta>
              </LinhaLista>
            ))}
            <div className="mt-auto border-t border-rule-row px-4 py-2.5">
              <TextLink onClick={() => navegar(`/agenda?modo=DIA&data=${hoje}`)}>Abrir agenda do dia</TextLink>
            </div>
          </>
        )
      }}
    </Bloco>
  )
}

/* ─────────────── resumo da semana (RF-009, RN-012) ─────────────── */

const PLURAL: Record<string, [string, string]> = {
  AGENDADA: ['agendada', 'agendadas'], EM_ANDAMENTO: ['em andamento', 'em andamento'], CONCLUIDA: ['concluída', 'concluídas'], CANCELADA: ['cancelada', 'canceladas'],
}

/** "11 agendadas · 1 em andamento · …", sem os status zerados. */
function totaisSemana(itens: Linha[]): string {
  const visitas = itens.filter(i => i.ORIGEM === 'VISITA' || i.ORIGEM === 'PROSPECCAO')
  return Object.entries(PLURAL)
    .map(([status, [um, varios]]) => [visitas.filter(i => i.STATUS === status).length, um, varios] as const)
    .filter(([n]) => n > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`)
    .join(' · ')
}

const diaSemana = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })

export function ResumoSemana({ estado, hoje }: { estado: Estado<Linha[]>; hoje: string }) {
  const navegar = useNavigate()
  return (
    <Bloco titulo="Resumo da Semana" hint="Visitas e prospecções de segunda a domingo." estado={estado} acao={<TextLink className="whitespace-nowrap" onClick={() => navegar('/agenda')}>Ver agenda completa</TextLink>}>
      {itens => {
        const lista = resumoSemana(itens, hoje)
        if (lista.length === 0) return <EmptyState title="Nenhuma visita registrada nesta semana." />
        const dias = [...new Set(lista.map(i => String(i.DATA)))]
        return (
          <>
            <p className="px-4 pt-3 text-[13px] text-ink-secondary">{totaisSemana(itens)}</p>
            <Table>
              <thead>
                <tr><Th>Cliente</Th><Th className="w-40">Status da visita</Th><Th className="w-36">Relato</Th></tr>
              </thead>
              {dias.map(dia => (
                <tbody key={dia}>
                  <tr>
                    <th scope="rowgroup" colSpan={3} className="px-4 pt-4 pb-1.5 text-left text-[12px] font-semibold text-ink-secondary first-letter:uppercase">
                      {dia === hoje ? 'Hoje · ' : ''}{diaSemana(dia)}, {ddmm(dia)}
                    </th>
                  </tr>
                  {lista.filter(i => i.DATA === dia).map(i => (
                    <tr key={`${i.ORIGEM}-${i.ID}`}>
                      <Td className={cn('py-2.5', i.STATUS === 'EM_ANDAMENTO' && 'font-semibold', i.STATUS === 'CANCELADA' && 'text-ink-secondary line-through')}>
                        {i.TITULO}{i.ORIGEM === 'PROSPECCAO' ? <span className="text-[12px] font-normal text-ink-secondary"> · Prospecção</span> : null}
                      </Td>
                      <Td className="py-2.5 whitespace-nowrap text-ink-secondary">{rotuloStatus(i.STATUS)}</Td>
                      <Td className={cn('py-2.5 whitespace-nowrap', i.relato === 'Relato pendente' ? 'font-semibold text-ink' : 'text-ink-secondary')}>
                        {i.relato}{i.relato === 'Ok' && i.dataRelato ? ` · ${ddmm(i.dataRelato)}` : ''}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </Table>
          </>
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
