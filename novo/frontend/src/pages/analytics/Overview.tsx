// Overview do Analytics (spec 007, RF-003..006, RF-008): 4 cartões da meta,
// evolução, ranking de produtos em tabela, devoluções e visitas. Calmo: cinza
// e um verde para o que alcançou a meta; cores de dados só nos tipos de visita.

import { useState } from 'react'
import type * as React from 'react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, moeda } from '@/lib/formato'
import { cardsResumo, fmtPct, metaBatidaEm, moedaCurta, pontosEvolucao, porDia, projecao, visitas } from '@/lib/analytics'
import { Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { cn } from '@/lib/utils'
import { Evolucao, Progresso, type Barra } from './graficos'
import { EstadoBloco } from './comum'
import { barrasDe, nomeProduto, type Blocos, type Consulta, type FiltrarPor } from './consulta'

const n = (v: unknown) => Number(v || 0)
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
/** Uma cor por tipo, sempre a mesma (design.md §12). */
const COR_TIPO = ['bg-data-1', 'bg-data-2', 'bg-data-3', 'bg-data-4', 'bg-data-5', 'bg-data-6']

export function Overview({ consulta, params, hoje, blocos, filtrarPor }: {
  consulta: Consulta; params: Record<string, string>; hoje: string; blocos: Blocos; filtrarPor: FiltrarPor
}) {
  const { resumo, evolucao, produtos, visitas: vis } = blocos
  const c = cardsResumo(resumo.dados)
  const proj = projecao(c.liquido, consulta.de, consulta.ate, hoje)
  const pontos = pontosEvolucao(evolucao.dados ?? [], consulta.de, consulta.ate)
  const batida = metaBatidaEm(pontos, c.meta)
  const v = visitas(vis.dados ?? [], consulta.de, consulta.ate)
  const escolher = (b: Barra) => filtrarPor('PRODUTO', { value: b.chave, label: b.rotulo })

  const situacao = c.semMeta ? 'sem meta para comparar' : proj >= c.meta ? 'acima da meta' : 'abaixo da meta'
  const notaProjecao = consulta.ate < hoje ? `Período encerrado · ${situacao}` : situacao[0].toUpperCase() + situacao.slice(1)
  const notaFalta = c.semMeta ? 'Meta não distribuída' : c.falta > 0 ? `${fmtPct(c.atingimento)} da meta atingida` : batida ? `Meta batida em ${batida}` : 'Meta batida'

  return (
    <Stack>
      <EstadoBloco erro={resumo.erro} carregando={!resumo.dados && !resumo.erro} nome="o resumo do período">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao rotulo="Faturamento líquido" valor={moeda(c.liquido)}>
            {moeda(c.bruto)} bruto − {moeda(c.devolvido)} devolvido ({fmtPct(c.pctDevolvido)})
          </Cartao>
          <Cartao rotulo="Meta do período" valor={moeda(c.meta)}>
            {c.semMeta ? 'Meta não distribuída' : (
              <>
                <Progresso fracao={c.atingimento} rotulo={`${fmtPct(c.atingimento)} da meta`} />
                <span><span className="font-semibold text-primary">{fmtPct(c.atingimento)}</span> atingido</span>
              </>
            )}
          </Cartao>
          <Cartao rotulo="Falta para a meta" valor={moeda(c.falta)}>{notaFalta}</Cartao>
          <Cartao rotulo="Projeção por dias úteis" valor={moeda(proj)}>{notaProjecao}</Cartao>
        </div>
      </EstadoBloco>

      <Panel>
        <PanelHeader
          title={porDia(consulta.de, consulta.ate) ? 'Faturamento por dia' : 'Faturamento por mês'}
          hint={porDia(consulta.de, consulta.ate) ? 'Verde: dia que alcançou a meta do dia útil. Fim de semana não tem meta.' : 'Verde: mês que alcançou a meta do mês.'}
        />
        <PanelBody>
          <EstadoBloco erro={evolucao.erro} carregando={!evolucao.dados && !evolucao.erro} nome="a evolução">
            <Evolucao pontos={pontos} formato={moeda} compacto={moedaCurta} />
          </EstadoBloco>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Ranking titulo="Produtos por valor" coluna="Valor" bloco={produtos} itens={barrasDe(produtos.dados, 'VALOR', 'VALOR', 8)} formato={moeda} escolher={escolher} />
        <Ranking titulo="Produtos por quantidade" coluna="Qtd" bloco={produtos} itens={barrasDe(produtos.dados, 'QTD', 'QT', 8)} formato={x => `${qtd(x)} un.`} escolher={escolher} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Devolucoes params={params} />
        <Panel>
          <PanelHeader title="Tipos de visita" hint={`${v.total} visita(s) concluída(s) · média de ${v.media.toLocaleString('pt-BR')} por semana`} />
          <PanelBody>
            <EstadoBloco erro={vis.erro} carregando={!vis.dados && !vis.erro} nome="as visitas">
              {v.total > 0 ? (
                <span role="img" aria-label={v.tipos.filter(t => t.n).map(t => `${t.tipo} ${t.n}`).join(', ')} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                  {v.tipos.map((t, i) => (t.n ? <span key={t.tipo} className={COR_TIPO[i % COR_TIPO.length]} style={{ flex: t.n }} /> : null))}
                </span>
              ) : null}
              <ul className="flex flex-col">
                {v.tipos.map((t, i) => (
                  <li key={t.tipo} className="flex min-h-9 items-center justify-between gap-3 border-t border-rule-row text-[13px] first:border-t-0">
                    <span className={cn('inline-flex items-center gap-2', t.n ? 'text-ink' : 'text-ink-secondary')}>
                      <span aria-hidden className={cn('size-2 rounded-full', t.n ? COR_TIPO[i % COR_TIPO.length] : 'bg-rule-table')} />
                      {t.tipo}
                    </span>
                    <span className={cn('font-semibold tabular-nums', t.n ? 'text-ink' : 'text-ink-secondary')}>{t.n}</span>
                  </li>
                ))}
              </ul>
            </EstadoBloco>
          </PanelBody>
        </Panel>
      </div>
    </Stack>
  )
}

function Cartao({ rotulo, valor, children }: { rotulo: string; valor: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-rule-table bg-card px-5 py-4">
      <span className="text-[12px] text-ink-secondary">{rotulo}</span>
      <span className="font-title text-[24px] leading-tight font-bold tabular-nums text-ink">{valor}</span>
      <span className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">{children}</span>
    </section>
  )
}

/** RF-005: os 8 maiores, com a participação entre eles; clique filtra a análise (RF-023). */
function Ranking({ titulo, coluna, bloco, itens, formato, escolher }: {
  titulo: string
  coluna: string
  bloco: Blocos['produtos']
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
            <thead><tr><Th className="w-10">#</Th><Th>Produto</Th><Th numeric>{coluna}</Th><Th numeric>% do top 8</Th></tr></thead>
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

/** RF-006: totais e detalhamento de 50 por página, do maior valor para o menor. */
function Devolucoes({ params }: { params: Record<string, string> }) {
  const [pagina, setPagina] = useState(1)
  const [chave, setChave] = useState(params)
  if (chave !== params) { setChave(params); setPagina(1) }
  const bloco = useBloco(() => linhas('analyticsDevolucoes', { ...params, pagina: String(pagina) }), [params, pagina])
  const rows = bloco.dados ?? []
  const total = rows.find(r => r.PARTE === 'TOTAL')
  const registros = n(total?.REGISTROS)
  const valor = n(total?.VALOR_TOTAL)
  const lista = rows.filter(r => r.PARTE === 'LINHA')
  const numeros: [string, string][] = [
    ['Total devolvido', moeda(valor)],
    ['Registros', String(registros)],
    ['Média por devolução', moeda(registros ? valor / registros : 0)],
    ['Acima de 30 dias', String(n(total?.ACIMA_30))],
  ]
  return (
    <Panel>
      <PanelHeader title="Devoluções do período" />
      <EstadoBloco erro={bloco.erro} carregando={!bloco.dados && !bloco.erro} nome="as devoluções">
        <dl className="mx-4 mt-1 mb-2 grid grid-cols-2 gap-3 rounded-xl bg-secondary px-4 py-3 sm:grid-cols-4">
          {numeros.map(([rotulo, v]) => (
            <div key={rotulo}>
              <dt className="text-[12px] text-ink-secondary">{rotulo}</dt>
              <dd className="font-title text-[17px] font-bold text-ink tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {!lista.length ? <p className="px-4 py-6 text-[13px] text-ink-secondary">Nenhuma devolução no período.</p> : (
          <>
            <Table>
              <thead><tr><Th>Cliente · produto</Th><Th>Pedido</Th><Th>Devolução</Th><Th numeric>Dias</Th><Th numeric>Valor</Th></tr></thead>
              <tbody>
                {lista.map(r => (
                  <Tr key={`${r.ORDEM}`}>
                    <Td>
                      <RowTitle>{String(r.CLIENTE ?? r.CODCLI)}</RowTitle>
                      <RowMeta>{nomeProduto(r.PRODUTO, r.CODPROD)} · {qtd(n(r.QT))} un.</RowMeta>
                    </Td>
                    <Td>{r.NUMPED ? String(r.NUMPED) : '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtData(String(r.DIA ?? ''))}</Td>
                    <Td numeric className={n(r.DIAS) > 30 ? 'font-semibold text-ink' : 'text-ink-secondary'}>{r.DIAS === null || r.DIAS === undefined ? '—' : String(r.DIAS)}</Td>
                    <Td numeric className="font-semibold whitespace-nowrap text-ink">{moeda(n(r.VALOR))}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={pagina} lastPage={Math.max(1, Math.ceil(registros / 50))} total={registros} unit="devoluções" onPrevious={() => setPagina(p => p - 1)} onNext={() => setPagina(p => p + 1)} />
          </>
        )}
      </EstadoBloco>
    </Panel>
  )
}
