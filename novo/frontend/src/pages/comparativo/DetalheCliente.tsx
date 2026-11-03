// Detalhe do cliente na visão Semanal (spec 006, RF-006, RN-011), aberto logo
// abaixo da linha do cliente, sem janela: semanas do mês em lista que abre e
// fecha, itens da semana contra a mesma semana do mês anterior (com as últimas
// 8 semanas em minigráfico), pedidos e sazonalidade de 12 meses (gráfico do
// cliente por mês e uma linha por produto com as 12 barrinhas). Uma chamada
// (s360SemanalDetalhe) ao abrir.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { acao } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { MESES, rotuloSemana, tituloSemana, type LinhaMatriz, type Semana } from '@/lib/semanal'
import { Alert, RowMeta, RowTitle, Status, Table, Td, Th, Tr } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { cn } from '@/lib/utils'

interface SemanaHist { ano: number; mes: number; n: number; qt: number }
interface Item { CODPROD: string | number; PRODUTO: string; qt: number; qtAnt: number; total: number; dif: number; vlUnit: number; movimento: string; ultimas8: SemanaHist[]; pico: number }
interface SemanaDetalhe extends Semana { pedidos: number; valor: number; listaPedidos: { NUMPED: string; valor: number }[]; itens: Item[] }
interface Detalhe { ok: boolean; semanas: SemanaDetalhe[]; sazonalidade: { CODPROD: string; PRODUTO: string; meses: { ano: number; mes: number; qt: number; valor: number }[] }[] }

const TOM_MOVIMENTO: Record<string, 'alert' | 'attention' | 'live' | 'off'> = {
  'Deixou de comprar': 'alert', Queda: 'attention', 'Comprou a mais': 'live', 'Novo na semana': 'live', 'Estável': 'off',
}
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const mesCurto = (x: { ano: number; mes: number }) => `${MESES[x.mes - 1].slice(0, 3).toLowerCase()}/${String(x.ano).slice(2)}`

export function DetalheCliente({ cliente, input }: { cliente: LinhaMatriz; input: Record<string, string> }) {
  const detalhe = useBloco(() => acao('semanalDetalhe', { ...input, clienteId: String(cliente.CLIENTE_ID) }) as Promise<Detalhe>, [cliente.CLIENTE_ID, input])
  const d = detalhe.dados?.ok ? detalhe.dados : null
  const [aba, setAba] = useState<'SEMANAL' | 'SAZONALIDADE'>('SEMANAL')
  // undefined = ainda não mexeu: abre a primeira semana com compra; null = todas fechadas.
  const [aberta, setAberta] = useState<number | null | undefined>(undefined)
  const semanaAberta = aberta === undefined ? (d?.semanas.find(s => s.pedidos > 0)?.n ?? null) : aberta

  return (
    <div className="flex flex-col gap-3 border-y border-rule-row bg-secondary/50 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-title text-[15px] font-bold text-ink">{cliente.CLIENTE}</p>
          <p className="text-[12px] text-ink-secondary">Cód. {cliente.CLIENTE_ID} · Curva {cliente.CURVA} · {cliente.RAMO} · {MESES[Number(input.mes) - 1]} de {input.ano}</p>
        </div>
        <div role="group" aria-label="Visão do detalhe" className="inline-flex rounded-full border border-rule-table bg-card p-0.5">
          {([['SEMANAL', 'Semanal'], ['SAZONALIDADE', 'Sazonalidade']] as const).map(([v, rotulo]) => (
            <button key={v} type="button" aria-pressed={aba === v} onClick={() => setAba(v)}
              className={cn('min-h-8 rounded-full px-3.5 text-[13px] transition-colors', aba === v ? 'bg-primary font-semibold text-primary-foreground' : 'text-ink-secondary hover:text-ink')}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {detalhe.erro || (detalhe.dados && !detalhe.dados.ok) ? <Alert tone="error">Não foi possível carregar o detalhe do cliente.</Alert> : !d ? (
        <p className="text-[13px] text-ink-secondary">Carregando…</p>
      ) : aba === 'SEMANAL' ? (
        <ul className="flex flex-col gap-2">
          {d.semanas.map(s => {
            const aberto = s.n === semanaAberta
            return (
              <li key={s.n} className="overflow-hidden rounded-xl border border-rule-table bg-card">
                <button type="button" aria-expanded={aberto} onClick={() => setAberta(aberto ? null : s.n)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent">
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
                    {aberto ? <ChevronDown aria-hidden className="size-4 text-ink-secondary" /> : <ChevronRight aria-hidden className="size-4 text-ink-secondary" />}
                    {tituloSemana(s.n)} <span className="font-normal text-ink-secondary">· {rotuloSemana(s)}</span>
                  </span>
                  <span className={cn('text-[12px] tabular-nums', s.pedidos ? 'text-ink' : 'text-ink-secondary')}>
                    {s.pedidos ? `${s.pedidos} ${s.pedidos === 1 ? 'pedido' : 'pedidos'} · ${moeda(s.valor)}` : 'Sem compra'}
                  </span>
                </button>
                {aberto ? <ItensDaSemana semana={s} /> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <Sazonalidade linhas={d.sazonalidade} />
      )}
    </div>
  )
}

function ItensDaSemana({ semana }: { semana: SemanaDetalhe }) {
  if (!semana.itens.length) {
    return <p className="border-t border-rule-row px-3 py-3 text-[13px] text-ink-secondary">Nenhum item nesta semana nem na mesma semana do mês anterior.</p>
  }
  return (
    <div className="border-t border-rule-row">
      <Table className="min-w-max">
        <thead>
          <tr>
            <Th>Produto</Th><Th>Movimento</Th><Th numeric>Qtd semana</Th><Th numeric>Mesma semana mês ant.</Th><Th numeric>Diferença</Th>
            <Th>Últimas 8 semanas</Th><Th numeric>Vl. unit.</Th><Th numeric>Total</Th>
          </tr>
        </thead>
        <tbody>
          {semana.itens.map(i => (
            <Tr key={String(i.CODPROD)} className={i.movimento === 'Deixou de comprar' ? 'bg-destructive/5' : undefined}>
              <Td><RowTitle>{i.PRODUTO}</RowTitle><RowMeta>Cód. {i.CODPROD}</RowMeta></Td>
              <Td><Status tone={TOM_MOVIMENTO[i.movimento] ?? 'off'}>{i.movimento}</Status></Td>
              <Td numeric className="font-semibold text-ink tabular-nums">{qtd(i.qt)}</Td>
              <Td numeric className="text-ink-secondary tabular-nums">{qtd(i.qtAnt)}</Td>
              <Td numeric className={cn('font-semibold tabular-nums', i.dif > 0 ? 'text-primary' : i.dif < 0 ? 'text-destructive' : 'text-ink-secondary')}>
                {i.dif > 0 ? `+${qtd(i.dif)}` : qtd(i.dif)}
              </Td>
              <Td><MiniSemanas semanas={i.ultimas8 ?? []} pico={i.pico ?? 0} /></Td>
              <Td numeric className="whitespace-nowrap tabular-nums">{moeda(i.vlUnit)}</Td>
              <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(i.total)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <div className="flex flex-col gap-2 border-t border-rule-row px-3 py-2.5 text-[12px] text-ink-secondary">
        <p>Comparação com a mesma semana do mês anterior. Em vermelho, o que deixou de comprar ou caiu; em verde, o que subiu.</p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-ink">Pedidos:</span>
          {semana.listaPedidos.length ? semana.listaPedidos.map(p => (
            <span key={p.NUMPED} className="rounded-full border border-rule-table bg-secondary px-2 py-0.5 tabular-nums text-ink">{p.NUMPED} · {moeda(p.valor)}</span>
          )) : 'nenhum nesta semana'}
        </p>
      </div>
    </div>
  )
}

/** RN-011: últimas 8 semanas com compra do produto, a altura pelo pico. */
function MiniSemanas({ semanas, pico }: { semanas: SemanaHist[]; pico: number }) {
  if (!semanas.length) return <span className="text-[12px] text-ink-muted">sem histórico</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span role="img" aria-label={`Últimas ${semanas.length} semanas com compra: ${semanas.map(s => qtd(s.qt)).join(', ')}; pico ${qtd(pico)}`} className="flex h-6 items-end gap-0.5">
        {semanas.map((s, k) => (
          <span key={`${s.ano}-${s.mes}-${s.n}`} title={`${tituloSemana(s.n)} de ${MESES[s.mes - 1].slice(0, 3).toLowerCase()}/${String(s.ano).slice(2)}: ${qtd(s.qt)}`}
            className={cn('w-1.5 rounded-t-sm', k === semanas.length - 1 ? 'bg-primary' : 'bg-ink-muted/50')}
            style={{ height: `${pico > 0 ? Math.max(12, (s.qt / pico) * 100) : 12}%` }} />
        ))}
      </span>
      <span className="text-[11px] text-ink-secondary tabular-nums">pico {qtd(pico)}</span>
    </span>
  )
}

type MesSaz = Detalhe['sazonalidade'][number]['meses'][number]

/** RN-011: 12 meses até o mês aberto (o último, em verde). */
function Sazonalidade({ linhas }: { linhas: Detalhe['sazonalidade'] }) {
  if (!linhas.length) return <p className="text-[13px] text-ink-secondary">Sem compras nos últimos 12 meses.</p>
  const meses = linhas[0].meses.map((m, k) => ({ ...m, valor: linhas.reduce((t, p) => t + (p.meses[k]?.valor ?? 0), 0) }))
  const total = meses.reduce((t, m) => t + m.valor, 0)
  const comCompra = meses.filter(m => m.valor > 0).length
  const melhor = meses.reduce((a, b) => (b.valor > a.valor ? b : a))
  const maxValor = Math.max(0, ...meses.map(m => m.valor))
  const produtos = linhas
    .map(p => {
      const anteriores = p.meses.slice(0, -1)
      const media = anteriores.reduce((t, m) => t + m.qt, 0) / Math.max(1, anteriores.length)
      const atual = p.meses.at(-1)?.qt ?? 0
      return { ...p, atual, media, vsMedia: atual - media, comCompra: p.meses.filter(m => m.qt > 0).length, total: p.meses.reduce((t, m) => t + m.valor, 0) }
    })
    .sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-rule-table bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="text-[13px] font-semibold text-ink">Compras do cliente nos últimos 12 meses</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-secondary">
            <div className="flex gap-1.5"><dt>Total</dt><dd className="font-semibold text-ink tabular-nums">{moeda(total)}</dd></div>
            <div className="flex gap-1.5"><dt>Média/mês</dt><dd className="font-semibold text-ink tabular-nums">{moeda(total / meses.length)}</dd></div>
            <div className="flex gap-1.5"><dt>Comprou em</dt><dd className="font-semibold text-ink tabular-nums">{comCompra} de {meses.length} meses</dd></div>
            {melhor.valor > 0 ? <div className="flex gap-1.5"><dt>Melhor mês</dt><dd className="font-semibold text-ink">{mesCurto(melhor)}</dd></div> : null}
          </dl>
        </div>
        <div role="img" aria-label={`Valor por mês: ${meses.map(m => `${mesCurto(m)} ${moeda(m.valor)}`).join('; ')}`} className="mt-4 grid grid-cols-12 items-end gap-1.5 sm:gap-2">
          {meses.map((m, k) => {
            const aberto = k === meses.length - 1
            return (
              <div key={`${m.ano}-${m.mes}`} className="flex flex-col items-center gap-1" title={`${mesCurto(m)}: ${moeda(m.valor)}`}>
                <span className={cn('hidden text-[10px] tabular-nums sm:block', aberto ? 'font-semibold text-primary' : 'text-ink-muted')}>
                  {m.valor > 0 ? compacto(m.valor) : ''}
                </span>
                <div className="flex h-28 w-full items-end">
                  <div className={cn('w-full rounded-t-md', m.valor <= 0 ? 'h-0.5 bg-rule-row' : aberto ? 'bg-primary' : 'bg-ink-muted/40')}
                    style={m.valor > 0 ? { height: `${Math.max(4, (m.valor / maxValor) * 100)}%` } : undefined} />
                </div>
                <span className={cn('text-[11px]', aberto ? 'font-semibold text-ink' : 'text-ink-secondary')}>{mesCurto(m)}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-rule-table bg-card">
        <Table className="min-w-max">
          <thead>
            <tr>
              <Th>Produto</Th><Th>Quantidade nos 12 meses</Th><Th numeric>Comprou em</Th><Th numeric>Média/mês</Th>
              <Th numeric>Mês aberto</Th><Th numeric>vs. média</Th><Th numeric>Total 12 meses</Th>
            </tr>
          </thead>
          <tbody>
            {produtos.map(p => (
              <Tr key={p.CODPROD}>
                <Td className="max-w-72"><span className="block truncate" title={p.PRODUTO}><RowTitle>{p.PRODUTO}</RowTitle></span><RowMeta>Cód. {p.CODPROD}</RowMeta></Td>
                <Td><Barrinhas meses={p.meses} /></Td>
                <Td numeric className="text-ink-secondary tabular-nums">{p.comCompra}/{p.meses.length}</Td>
                <Td numeric className="tabular-nums">{qtd(Math.round(p.media * 10) / 10)}</Td>
                <Td numeric className="font-semibold text-ink tabular-nums">{qtd(p.atual)}</Td>
                <Td numeric className={cn('font-semibold tabular-nums', Math.abs(p.vsMedia) < 0.05 ? 'text-ink-secondary' : p.vsMedia > 0 ? 'text-primary' : 'text-destructive')}>
                  {Math.abs(p.vsMedia) < 0.05 ? '=' : `${p.vsMedia > 0 ? '+' : ''}${qtd(Math.round(p.vsMedia * 10) / 10)}`}
                </Td>
                <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(p.total)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-rule-row px-3 py-2.5 text-[12px] text-ink-secondary">
          Média dos 11 meses anteriores ao mês aberto. Em verde, o mês aberto; passe o mouse nas barras para ver a quantidade e o valor de cada mês.
        </p>
      </section>
    </div>
  )
}

/** 12 barrinhas de quantidade do produto, a altura pelo maior mês dele. */
function Barrinhas({ meses }: { meses: MesSaz[] }) {
  const max = Math.max(0, ...meses.map(m => m.qt))
  return (
    <span role="img" aria-label={meses.map(m => `${mesCurto(m)} ${qtd(m.qt)}`).join(', ')} className="flex h-7 items-end gap-[3px]">
      {meses.map((m, k) => (
        <span key={`${m.ano}-${m.mes}`} title={`${mesCurto(m)}: ${qtd(m.qt)} un. · ${moeda(m.valor)}`}
          className={cn('w-2 rounded-t-sm', m.qt <= 0 ? 'bg-rule-row' : k === meses.length - 1 ? 'bg-primary' : 'bg-ink-muted/50')}
          style={{ height: m.qt > 0 && max > 0 ? `${Math.max(14, (m.qt / max) * 100)}%` : '2px' }} />
      ))}
    </span>
  )
}

/** R$ curto para o rótulo das colunas: 1,2 mil / 3,4 mi. */
const compacto = (v: number) => v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
