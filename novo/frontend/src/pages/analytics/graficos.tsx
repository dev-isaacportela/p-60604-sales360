// Gráficos do Analytics (spec 007, D-707): barras horizontais em CSS e
// evolução em barras SVG, sem biblioteca. Barras cinza, a maior em verde.
// Evolução: barra cinza, verde quando alcança a meta do ponto; a meta é uma
// marca tracejada sobre cada barra (fim de semana sem meta fica sem marca).

import * as React from 'react'
import { cn } from '@/lib/utils'
import { fmtPct } from '@/lib/analytics'
import { Panel, PanelHeader, Table, Td, Th, Tr } from '@/components/page'
import { EstadoBloco } from './comum'

export interface Barra { chave: string; rotulo: string; valor: number; nota?: string }

/**
 * Ranking em barras horizontais. Com `escolher`, cada barra é um botão
 * (RF-023: filtra a análise pelo item); sem, é só leitura.
 */
export function BarrasH({ itens, formato, escolher, acao }: {
  itens: Barra[]
  formato: (v: number) => string
  escolher?: (chave: string) => void
  acao?: string
}) {
  const max = Math.max(0, ...itens.map(i => i.valor))
  if (!itens.length) return <p className="text-[12px] text-ink-secondary">Sem dados no período.</p>
  return (
    <ul className="flex flex-col gap-0.5">
      {itens.map((i, n) => {
        const conteudo = (
          <>
            <span className="truncate text-ink-secondary" title={i.rotulo}>{i.rotulo}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className={cn('block h-2 rounded-r-[4px] rounded-l-full', n === 0 ? 'bg-primary' : 'bg-ink-muted/50')} style={{ width: `${max > 0 ? (Math.max(0, i.valor) / max) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-semibold whitespace-nowrap text-ink">
              {formato(i.valor)}
              {i.nota ? <span className="ml-1 font-normal text-ink-secondary">{i.nota}</span> : null}
            </span>
          </>
        )
        const classe = 'grid w-full grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-left text-[12px]'
        return (
          <li key={i.chave}>
            {escolher ? (
              <button
                type="button"
                title={`${acao ?? 'Filtrar por'} ${i.rotulo}`}
                onClick={() => escolher(i.chave)}
                className={cn(classe, 'transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none')}
              >
                {conteudo}
              </button>
            ) : (
              <div className={classe} title={`${i.rotulo}: ${formato(i.valor)}`}>{conteudo}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export interface PontoEvolucao { chave: string; rotulo: string; valor: number; meta: number }

const ALTURA = 180
const TOPO = 8
const BASE = 24
const ESQ = 56

/** RF-004: líquido em barras × meta de cada ponto em marca tracejada, um eixo só (os dois em R$). */
export function Evolucao({ pontos, formato, compacto }: { pontos: PontoEvolucao[]; formato: (v: number) => string; compacto: (v: number) => string }) {
  const [foco, setFoco] = React.useState<number | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const [largura, setLargura] = React.useState(640)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const max = Math.max(1, ...pontos.flatMap(p => [p.valor, p.meta]))
  const alto = ALTURA - TOPO - BASE
  const y = (v: number) => TOPO + alto - (Math.max(0, v) / max) * alto
  const passo = (largura - ESQ) / Math.max(1, pontos.length)
  const barra = Math.max(2, Math.min(28, passo - 2))
  const cx = (i: number) => ESQ + passo * i + passo / 2
  const grade = [0, 0.5, 1].map(f => f * max)
  const cadaRotulo = Math.ceil(pontos.length / Math.max(1, Math.floor((largura - ESQ) / 44)))
  const p = foco === null ? null : pontos[foco]

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-ink-muted/50" aria-hidden />Faturamento líquido</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-primary" aria-hidden />Alcançou a meta</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-ink-secondary" aria-hidden />Meta</span>
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setFoco(null)}>
        <svg width={largura} height={ALTURA} role="img" aria-label="Evolução do faturamento líquido e da meta" className="block">
          {grade.map(v => (
            <g key={v}>
              <line x1={ESQ} x2={largura} y1={y(v)} y2={y(v)} className="stroke-rule-row" strokeWidth={1} />
              <text x={ESQ - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-muted text-[10px]">{compacto(v)}</text>
            </g>
          ))}
          {pontos.map((pt, i) => (
            <g key={pt.chave}>
              {pt.valor > 0 ? (
                <path
                  d={`M${cx(i) - barra / 2},${y(0)} V${y(pt.valor) + Math.min(4, (y(0) - y(pt.valor)) / 2)} q0,-4 4,-4 H${cx(i) + barra / 2 - 4} q4,0 4,4 V${y(0)} Z`}
                  className={cn(
                    'transition-opacity',
                    pt.meta > 0 && pt.valor >= pt.meta ? 'fill-primary' : pt.meta > 0 ? 'fill-ink-muted/50' : 'fill-ink-muted/25',
                    foco !== null && foco !== i && 'opacity-50',
                  )}
                />
              ) : null}
              {pt.meta > 0 ? (
                <line x1={cx(i) - passo / 2 + 1} x2={cx(i) + passo / 2 - 1} y1={y(pt.meta)} y2={y(pt.meta)} className="stroke-ink-secondary" strokeWidth={1.5} strokeDasharray="3 2" />
              ) : null}
              {i % cadaRotulo === 0 ? (
                <text x={cx(i)} y={ALTURA - 6} textAnchor="middle" className="fill-ink-muted text-[10px]">{pt.rotulo}</text>
              ) : null}
            </g>
          ))}
          {p && foco !== null ? (
            <line x1={cx(foco)} x2={cx(foco)} y1={TOPO} y2={y(0)} className="stroke-ink-muted" strokeWidth={1} strokeDasharray="3 3" />
          ) : null}
          {pontos.map((pt, i) => (
            <rect key={pt.chave} x={ESQ + passo * i} y={TOPO} width={passo} height={alto} fill="transparent" onMouseEnter={() => setFoco(i)} />
          ))}
        </svg>
        {p && foco !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-rule-table bg-card px-3 py-2 text-[12px] shadow-sm"
            style={{ left: Math.min(largura - 180, Math.max(0, cx(foco) + 8)) }}
          >
            <p className="font-semibold text-ink">{p.rotulo}</p>
            <p className="text-ink-secondary">Líquido: <span className="text-ink">{formato(p.valor)}</span></p>
            <p className="text-ink-secondary">Meta: <span className="text-ink">{p.meta > 0 ? formato(p.meta) : 'sem meta'}</span></p>
          </div>
        ) : null}
      </div>
      {/* Tabela não encolhe a 1px: o sr-only vai num div, senão ela estica a página (2ª barra de rolagem). */}
      <div className="sr-only">
        <table>
          <caption>Evolução</caption>
          <thead><tr><th>Período</th><th>Líquido</th><th>Meta</th></tr></thead>
          <tbody>{pontos.map(pt => <tr key={pt.chave}><td>{pt.rotulo}</td><td>{formato(pt.valor)}</td><td>{formato(pt.meta)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

/** Barra de progresso da meta (0..1+). */
export function Progresso({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  return (
    <span className="block h-2 rounded-full bg-muted" role="img" aria-label={rotulo}>
      <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%` }} />
    </span>
  )
}

/** Valor em R$ dentro da faixa de indicadores: menor que o número puro para caber em 5 colunas. */
export function ValorCard({ children }: { children: React.ReactNode }) {
  return <span className="text-[20px]">{children}</span>
}

/** RF-005: ranking em tabela, com a participação entre os itens; clique filtra a análise (RF-023). */
export function Ranking({ titulo, coluna, bloco, itens, formato, escolher }: {
  titulo: string
  coluna: string
  bloco: { erro: boolean; dados: unknown }
  itens: Barra[]
  formato: (v: number) => string
  escolher: (b: Barra) => void
}) {
  const total = itens.reduce((s, i) => s + Math.max(0, i.valor), 0)
  return (
    <Panel>
      <PanelHeader title={titulo} hint="Clique num produto para filtrar a análise." />
      <EstadoBloco erro={bloco.erro} carregando={!bloco.dados && !bloco.erro} nome="o ranking de produtos">
        {!itens.length ? <p className="px-4 py-6 text-[13px] text-ink-secondary">Sem dados no período.</p> : (
          <Table>
            <thead><tr><Th className="w-10">#</Th><Th>Produto</Th><Th numeric>{coluna}</Th><Th numeric>% do top {itens.length}</Th></tr></thead>
            <tbody>
              {itens.map((i, p) => (
                <Tr key={`${i.chave}-${p}`}>
                  <Td className="text-ink-secondary tabular-nums">{p + 1}</Td>
                  <Td>
                    {i.chave ? (
                      <button type="button" title={`Filtrar por ${i.rotulo}`} onClick={() => escolher(i)} className="text-left text-ink hover:underline">{i.rotulo}</button>
                    ) : <span className="text-ink-secondary">{i.rotulo}</span>}
                  </Td>
                  <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{formato(i.valor)}</Td>
                  <Td numeric className="text-ink-secondary tabular-nums">{fmtPct(total ? Math.max(0, i.valor) / total : 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </EstadoBloco>
    </Panel>
  )
}
