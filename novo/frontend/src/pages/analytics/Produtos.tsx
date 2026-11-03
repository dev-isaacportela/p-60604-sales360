// Aba Produtos do Analytics (spec 007, RF-010, RN-008): destaques do período,
// produtos mais vendidos, departamentos e seções, ramo / segmento / fornecedor
// com %, top 3 por ramo (uma linha por ramo) e devoluções. Tudo do maior para o
// menor; o que não tem cadastro fica em cinza. Só o ranking de produtos filtra
// ao clicar (RF-023).

import { useState } from 'react'
import { moeda } from '@/lib/formato'
import { fmtPct, semCadastro } from '@/lib/analytics'
import { EmptyState, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { cn } from '@/lib/utils'
import type { Barra } from './graficos'
import { EstadoBloco } from './comum'
import { barrasDe, nomeProduto, type Blocos, type FiltrarPor } from './consulta'

type Linha = Record<string, unknown>
const n = (v: unknown) => Number(v || 0)
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const maiorPrimeiro = (itens: Barra[]) => [...itens].sort((a, b) => b.valor - a.valor)
const parte = (v: number, total: number) => (total ? v / total : 0)
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`
/** Tons de verde para as partes de um todo (maior = mais escuro). */
const TONS = ['bg-primary', 'bg-primary/60', 'bg-primary/30', 'bg-ink-muted/40']

export function Produtos({ blocos, filtrarPor }: { blocos: Blocos; filtrarPor: FiltrarPor }) {
  const { produtos } = blocos
  const rows = produtos.dados ?? []
  const [metrica, setMetrica] = useState<'VALOR' | 'QTD'>('VALOR')
  const estado = { erro: produtos.erro, carregando: !produtos.dados && !produtos.erro }

  const ramos = maiorPrimeiro(barrasDe(rows, 'RAMO', 'VALOR', 50))
  const total = ramos.reduce((s, r) => s + r.valor, 0)
  const porValor = barrasDe(rows, 'VALOR', 'VALOR', 10)
  const lista = metrica === 'VALOR' ? porValor : barrasDe(rows, 'QTD', 'QT', 10)
  const totalLista = metrica === 'VALOR' ? total : lista.reduce((s, i) => s + Math.max(0, i.valor), 0)
  const deptos = maiorPrimeiro(barrasDe(rows, 'DEPTO', 'VALOR', 20))
  const secoes = maiorPrimeiro(barrasDe(rows, 'SECAO', 'VALOR', 20))
  const negativas = secoes.filter(s => s.valor <= 0)
  const devolucoes = rows.filter(r => r.GRUPO === 'DEVOLUCAO')
  const devolvido = devolucoes.reduce((s, r) => s + n(r.DEVOLVIDO), 0)
  const top2 = porValor.slice(0, 2)

  const destaques: [string, string, string][] = [
    ['Faturamento líquido', moeda(total), `em ${plural(deptos.length, 'departamento', 'departamentos')} e ${plural(ramos.filter(r => !semCadastro(r.rotulo)).length, 'ramo cadastrado', 'ramos cadastrados')}`],
    ['Concentração', top2.length ? fmtPct(parte(top2.reduce((s, p) => s + p.valor, 0), total)) : '—', top2.length ? `${top2.map(p => p.rotulo).join(' e ')}${top2.length > 1 ? ', juntos' : ''}` : 'Sem venda no período'],
    ['Departamento líder', deptos[0]?.rotulo ?? '—', deptos[0] ? `${moeda(deptos[0].valor)} · ${fmtPct(parte(deptos[0].valor, total))} do período` : 'Sem venda no período'],
    ['Devolvido em produtos', moeda(devolvido), devolucoes.length ? `${plural(devolucoes.length, 'produto', 'produtos')} · maior: ${nomeProduto(devolucoes[0].NOME, devolucoes[0].CHAVE)}` : 'Nenhuma devolução'],
  ]

  return (
    <Stack>
      <EstadoBloco {...estado} nome="os produtos">
        <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule-table bg-rule-row sm:grid-cols-2 lg:grid-cols-4">
          {destaques.map(([rotulo, valor, nota]) => (
            <div key={rotulo} className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
              <span className="text-[12px] text-ink-secondary">{rotulo}</span>
              <span className="truncate font-title text-[24px] leading-tight font-bold text-ink tabular-nums">{valor}</span>
              <span className="truncate text-[12px] text-ink-secondary" title={nota}>{nota}</span>
            </div>
          ))}
        </section>
      </EstadoBloco>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel>
          <PanelHeader title="Produtos mais vendidos" hint="Participação no faturamento. Clique num produto para filtrar a análise.">
            <div role="group" aria-label="Ordenar por" className="inline-flex rounded-full border border-rule-table p-0.5">
              {([['VALOR', 'Valor'], ['QTD', 'Quantidade']] as const).map(([v, rotulo]) => (
                <button key={v} type="button" aria-pressed={metrica === v} onClick={() => setMetrica(v)}
                  className={cn('min-h-8 rounded-full px-3.5 text-[13px] transition-colors', metrica === v ? 'bg-primary font-semibold text-primary-foreground' : 'text-ink-secondary hover:text-ink')}>
                  {rotulo}
                </button>
              ))}
            </div>
          </PanelHeader>
          <EstadoBloco {...estado} nome="o ranking de produtos">
            {!lista.length ? <EmptyState title="Sem venda no período" /> : (
              <Table>
                <thead><tr><Th className="w-10">#</Th><Th>Produto</Th><Th numeric>{metrica === 'VALOR' ? 'Valor' : 'Qtd'}</Th><Th className="w-44">Participação</Th></tr></thead>
                <tbody>
                  {lista.map((p, i) => (
                    <Tr key={`${p.chave}-${i}`}>
                      <Td className="text-ink-secondary tabular-nums">{i + 1}</Td>
                      <Td className="max-w-72 truncate">
                        {p.chave ? (
                          <button type="button" title={`Filtrar por ${p.rotulo}`} onClick={() => filtrarPor('PRODUTO', { value: p.chave, label: p.rotulo })} className="text-left text-ink hover:underline">{p.rotulo}</button>
                        ) : <Nome nome={p.rotulo} />}
                      </Td>
                      <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{metrica === 'VALOR' ? moeda(p.valor) : `${qtd(p.valor)} un.`}</Td>
                      <Td><Participacao fracao={parte(p.valor, totalLista)} escala={parte(lista[0].valor, totalLista)} destaque={i < 2} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </EstadoBloco>
        </Panel>

        <Panel>
          <PanelHeader title="Departamentos e seções" hint={deptos[0] ? `${deptos[0].rotulo} responde por ${fmtPct(parte(deptos[0].valor, total))} do período.` : undefined} />
          <PanelBody>
            <EstadoBloco {...estado} nome="os departamentos">
              {!deptos.length ? <p className="text-[13px] text-ink-secondary">Sem venda no período.</p> : (
                <>
                  <span role="img" aria-label={deptos.map(d => `${d.rotulo} ${fmtPct(parte(d.valor, total))}`).join(', ')} className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
                    {deptos.filter(d => d.valor > 0).map((d, i) => <span key={d.chave || i} className={TONS[Math.min(i, TONS.length - 1)]} style={{ flex: d.valor }} />)}
                  </span>
                  <ul className="flex flex-col">
                    {deptos.map((d, i) => (
                      <li key={d.chave || i} className="grid min-h-10 grid-cols-[10px_minmax(0,1fr)_auto_3.5rem] items-center gap-2.5 border-t border-rule-row text-[13px] first:border-t-0">
                        <span aria-hidden className={cn('size-2.5 rounded-[3px]', TONS[Math.min(i, TONS.length - 1)])} />
                        <Nome nome={d.rotulo} />
                        <span className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(d.valor)}</span>
                        <span className="text-right text-[12px] text-ink-secondary tabular-nums">{fmtPct(parte(d.valor, total))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col">
                    <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">Seções</p>
                    {secoes.filter(s => s.valor > 0).map((s, i) => (
                      <p key={`${s.chave}-${i}`} className="flex min-h-9 items-center justify-between gap-3 border-t border-rule-row text-[13px]">
                        <Nome nome={s.rotulo} />
                        <span className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(s.valor)}</span>
                      </p>
                    ))}
                    {negativas.length ? (
                      <p className="pt-2 text-[12px] text-ink-secondary">
                        Mais {negativas.length} {negativas.length === 1 ? 'seção' : 'seções'} com saldo negativo (devoluções): {moeda(negativas.reduce((s, x) => s + x.valor, 0))}.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </EstadoBloco>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Dimensao titulo="Ramos" itens={ramos} total={total} {...estado} />
        <Dimensao titulo="Segmentos" itens={maiorPrimeiro(barrasDe(rows, 'SEGMENTO', 'VALOR', 50))} total={total} {...estado} />
        <Dimensao titulo="Fornecedores" itens={maiorPrimeiro(barrasDe(rows, 'FORNECEDOR', 'VALOR', 15))} total={total} {...estado} />
      </div>

      <Panel>
        <PanelHeader title="Top 3 produtos por ramo" hint="Uma linha por ramo, do maior para o menor." />
        <EstadoBloco {...estado} nome="os produtos por ramo">
          {!ramos.length ? <EmptyState title="Sem venda no período" /> : (
            <Table>
              <thead><tr><Th>Ramo</Th><Th>1º</Th><Th>2º</Th><Th>3º</Th></tr></thead>
              <tbody>
                {ramos.map(r => {
                  const tres = rows.filter(x => x.GRUPO === 'RAMO_TOP3' && String(x.RAMO) === r.chave).sort((a, b) => n(a.POS) - n(b.POS))
                  return (
                    <Tr key={r.chave}>
                      <Td><Nome nome={r.rotulo} forte /><RowMeta>{moeda(r.valor)}</RowMeta></Td>
                      {[0, 1, 2].map(i => <Td key={i}>{tres[i] ? <ProdutoDoRamo linha={tres[i]} /> : <span className="text-ink-muted">—</span>}</Td>)}
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </EstadoBloco>
      </Panel>

      <Panel>
        <PanelHeader title="Produtos com devolução" hint="Os 50 maiores; % devolvido sobre o bruto do produto, em vermelho acima de 10%." />
        <EstadoBloco {...estado} nome="as devoluções por produto">
          {!devolucoes.length ? <EmptyState title="Nenhuma devolução no período" /> : (
            <Table>
              <thead><tr><Th>Produto</Th><Th numeric>Bruto</Th><Th numeric>Devolvido</Th><Th className="w-56">% devolvido</Th></tr></thead>
              <tbody>
                {devolucoes.map((r, i) => {
                  const f = n(r.BRUTO) ? n(r.DEVOLVIDO) / n(r.BRUTO) : null
                  return (
                    <Tr key={`${String(r.CHAVE)}-${i}`}>
                      <Td>
                        <Nome nome={nomeProduto(r.NOME, r.CHAVE)} forte />
                        {r.CHAVE != null && r.CHAVE !== '' ? <RowMeta>Cód. {String(r.CHAVE)}</RowMeta> : null}
                      </Td>
                      <Td numeric className="whitespace-nowrap tabular-nums">{moeda(n(r.BRUTO))}</Td>
                      <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(n(r.DEVOLVIDO))}</Td>
                      <Td>{f === null ? <span className="text-[12px] text-ink-secondary">sem venda no período</span> : <Participacao fracao={f} escala={0.2} alerta={f > 0.1} />}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </EstadoBloco>
      </Panel>
    </Stack>
  )
}

/** Nome; sem cadastro (sem ramo, sem fornecedor…) em cinza e itálico. */
function Nome({ nome, forte }: { nome: string; forte?: boolean }) {
  if (semCadastro(nome)) return <span className="truncate text-ink-secondary italic">{nome}</span>
  return forte ? <RowTitle>{nome}</RowTitle> : <span className="truncate text-ink">{nome}</span>
}

/** Barra + %; `escala` = a fração que enche a barra. */
function Participacao({ fracao, escala, destaque, alerta }: { fracao: number; escala: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-1.5 flex-1 rounded-full bg-muted">
        <span className={cn('block h-1.5 rounded-full', alerta ? 'bg-destructive' : destaque ? 'bg-primary' : 'bg-ink-muted/50')} style={{ width: `${Math.max(0, Math.min(1, escala ? fracao / escala : 0)) * 100}%` }} />
      </span>
      <span className={cn('w-12 text-right text-[12px] tabular-nums', alerta ? 'font-semibold text-destructive' : 'text-ink-secondary')}>{fmtPct(fracao)}</span>
    </span>
  )
}

/** Ramo, segmento ou fornecedor: lista com valor, % do período e barra. */
function Dimensao({ titulo, itens, total, erro, carregando }: { titulo: string; itens: Barra[]; total: number; erro: boolean; carregando: boolean }) {
  const max = Math.max(0, ...itens.map(i => i.valor))
  const lider = itens.find(i => !semCadastro(i.rotulo))
  return (
    <Panel>
      <PanelHeader title={titulo} hint={`${itens.length} no período`} />
      <PanelBody>
        <EstadoBloco erro={erro} carregando={carregando} nome={titulo.toLowerCase()}>
          {!itens.length ? <p className="text-[13px] text-ink-secondary">Sem venda no período.</p> : (
            <ul className="flex flex-col gap-2.5">
              {itens.map((i, k) => (
                <li key={`${i.chave}-${k}`} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 text-[13px]">
                    <Nome nome={i.rotulo} />
                    <span className="whitespace-nowrap tabular-nums">
                      <span className="font-semibold text-ink">{moeda(i.valor)}</span>{' '}
                      <span className="text-[12px] text-ink-secondary">{fmtPct(parte(i.valor, total))}</span>
                    </span>
                  </span>
                  <span aria-hidden className="h-1.5 rounded-full bg-muted">
                    <span className={cn('block h-1.5 rounded-full', i === lider ? 'bg-primary' : 'bg-ink-muted/50')} style={{ width: `${max > 0 ? (Math.max(0, i.valor) / max) * 100 : 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </EstadoBloco>
      </PanelBody>
    </Panel>
  )
}

function ProdutoDoRamo({ linha }: { linha: Linha }) {
  const v = n(linha.VALOR)
  return (
    <>
      <span className="block truncate"><Nome nome={nomeProduto(linha.NOME, linha.CHAVE)} /></span>
      <span className={cn('block text-[12px] font-semibold tabular-nums', v < 0 ? 'text-destructive' : 'text-ink-secondary')}>{moeda(v)}</span>
    </>
  )
}
