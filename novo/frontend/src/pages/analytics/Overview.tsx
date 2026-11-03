// Overview do Analytics (spec 007, RF-003..006, RF-008): cards da meta,
// progresso e projeção, evolução, ranking de produtos, devoluções e visitas.

import { useState } from 'react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, moeda } from '@/lib/formato'
import { cardsResumo, fmtPct, moedaCurta, pontosEvolucao, projecao, visitas } from '@/lib/analytics'
import { Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { FaixaIndicadores } from '../clientes/layout'
import { BarrasH, Evolucao, Progresso, ValorCard } from './graficos'
import { EstadoBloco } from './comum'
import { barrasDe, type Blocos, type Consulta, type FiltrarPor } from './consulta'

const n = (v: unknown) => Number(v || 0)
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export function Overview({ consulta, params, hoje, blocos, filtrarPor }: {
  consulta: Consulta; params: Record<string, string>; hoje: string; blocos: Blocos; filtrarPor: FiltrarPor
}) {
  const { resumo, evolucao, produtos, visitas: vis } = blocos
  const c = cardsResumo(resumo.dados)
  const proj = projecao(c.liquido, consulta.de, consulta.ate, hoje)
  const v = visitas(vis.dados ?? [], consulta.de, consulta.ate)
  const produto = (chave: string, rotulo: string) => filtrarPor('PRODUTO', { value: chave, label: rotulo })
  const porRotulo = (rows: ReturnType<typeof barrasDe>) => (chave: string) => produto(chave, rows.find(r => r.chave === chave)?.rotulo ?? chave)
  const porValor = barrasDe(produtos.dados, 'VALOR', 'VALOR', 8)
  const porQtd = barrasDe(produtos.dados, 'QTD', 'QT', 8)

  return (
    <Stack>
      <EstadoBloco erro={resumo.erro} carregando={!resumo.dados && !resumo.erro} nome="o resumo do período">
        <FaixaIndicadores itens={[
          { rotulo: 'Meta do período', valor: <ValorCard>{moeda(c.meta)}</ValorCard>, nota: c.semMeta ? 'Meta não distribuída' : undefined },
          { rotulo: 'Faturamento líquido', valor: <ValorCard>{moeda(c.liquido)}</ValorCard>, nota: `${moeda(c.bruto)} bruto menos devoluções` },
          { rotulo: 'Falta para meta', valor: <ValorCard>{moeda(c.falta)}</ValorCard>, nota: `${fmtPct(c.atingimento)} da meta atingida`, medidor: { fracao: c.atingimento, tom: c.atingimento >= 1 ? 'live' : c.atingimento >= 0.8 ? 'attention' : 'alert', rotulo: `${fmtPct(c.atingimento)} da meta` } },
          { rotulo: 'Total devolvido', valor: <ValorCard>{moeda(c.devolvido)}</ValorCard>, nota: `${fmtPct(c.pctDevolvido)} do faturamento bruto` },
          { rotulo: 'Projeção por dias úteis', valor: <ValorCard>{moeda(proj)}</ValorCard>, nota: c.semMeta ? 'Sem meta para comparar' : proj >= c.meta ? 'Acima da meta' : 'Abaixo da meta' },
        ]} />
        <Panel>
          <PanelBody>
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-ink-secondary">Progresso da meta: <span className="font-semibold text-ink">{fmtPct(c.atingimento)}</span></p>
              <Progresso fracao={c.atingimento} rotulo={`${fmtPct(c.atingimento)} da meta`} />
            </div>
          </PanelBody>
        </Panel>
      </EstadoBloco>

      <Panel>
        <PanelHeader title="Evolução histórica" hint="Faturamento líquido × meta distribuída." />
        <PanelBody>
          <EstadoBloco erro={evolucao.erro} carregando={!evolucao.dados && !evolucao.erro} nome="a evolução">
            <Evolucao pontos={pontosEvolucao(evolucao.dados ?? [], consulta.de, consulta.ate)} formato={moeda} compacto={moedaCurta} />
          </EstadoBloco>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Ranking de produtos por valor" hint="Clique num produto para filtrar a análise." />
          <PanelBody>
            <EstadoBloco erro={produtos.erro} carregando={!produtos.dados && !produtos.erro} nome="o ranking de produtos">
              <BarrasH itens={porValor} formato={moeda} escolher={porRotulo(porValor)} />
            </EstadoBloco>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Ranking de produtos por quantidade" hint="Clique num produto para filtrar a análise." />
          <PanelBody>
            <EstadoBloco erro={produtos.erro} carregando={!produtos.dados && !produtos.erro} nome="o ranking de produtos">
              <BarrasH itens={porQtd} formato={qtd} escolher={porRotulo(porQtd)} />
            </EstadoBloco>
          </PanelBody>
        </Panel>
      </div>

      <Devolucoes params={params} />

      <Panel>
        <PanelHeader title="Tipos de visita" hint={`${v.total} visita(s) concluída(s) · média de ${v.media.toLocaleString('pt-BR')} por semana`} />
        <PanelBody>
          <EstadoBloco erro={vis.erro} carregando={!vis.dados && !vis.erro} nome="as visitas">
            <BarrasH itens={v.tipos.map(t => ({ chave: t.tipo, rotulo: t.tipo, valor: t.n }))} formato={x => String(x)} />
          </EstadoBloco>
        </PanelBody>
      </Panel>
    </Stack>
  )
}

/** RF-006: totais, 4 maiores e detalhamento de 50 por página. */
function Devolucoes({ params }: { params: Record<string, string> }) {
  const [pagina, setPagina] = useState(1)
  const [chave, setChave] = useState(params)
  if (chave !== params) { setChave(params); setPagina(1) }
  const bloco = useBloco(() => linhas('analyticsDevolucoes', { ...params, pagina: String(pagina) }), [params, pagina])
  const rows = bloco.dados ?? []
  const total = rows.find(r => r.PARTE === 'TOTAL')
  const registros = n(total?.REGISTROS)
  const valor = n(total?.VALOR_TOTAL)
  const top = rows.filter(r => r.PARTE === 'TOP')
  const lista = rows.filter(r => r.PARTE === 'LINHA')
  return (
    <Panel>
      <PanelHeader title="Devoluções do período" />
      <EstadoBloco erro={bloco.erro} carregando={!bloco.dados && !bloco.erro} nome="as devoluções">
        <div className="grid grid-cols-2 gap-4 border-b border-rule-row px-4 py-3 text-[12px] sm:grid-cols-4">
          <p className="text-ink-secondary">Total devolvido<span className="block font-title text-[18px] font-bold text-ink">{moeda(valor)}</span></p>
          <p className="text-ink-secondary">Registros<span className="block font-title text-[18px] font-bold text-ink">{registros}</span></p>
          <p className="text-ink-secondary">Média por devolução<span className="block font-title text-[18px] font-bold text-ink">{moeda(registros ? valor / registros : 0)}</span></p>
          <p className="text-ink-secondary">Casos acima de 30 dias<span className="block font-title text-[18px] font-bold text-ink">{n(total?.ACIMA_30)}</span></p>
        </div>
        {top.length ? (
          <div className="border-b border-rule-row px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">Maiores devoluções</p>
            <BarrasH itens={top.map(r => ({ chave: `${r.NUMPED}-${r.CODPROD}-${r.ORDEM}`, rotulo: `${r.CLIENTE} · ${r.PRODUTO}`, valor: n(r.VALOR) }))} formato={moeda} />
          </div>
        ) : null}
        {!lista.length ? <p className="px-4 py-6 text-[13px] text-ink-secondary">Nenhuma devolução no período.</p> : (
          <>
            <Table>
              <thead><tr><Th>Cliente</Th><Th>Produto</Th><Th>Pedido</Th><Th>Devolução</Th><Th numeric>Dias</Th><Th numeric>Qtd</Th><Th numeric>Valor</Th></tr></thead>
              <tbody>
                {lista.map(r => (
                  <Tr key={`${r.ORDEM}`}>
                    <Td><RowTitle>{String(r.CLIENTE ?? r.CODCLI)}</RowTitle></Td>
                    <Td><RowTitle>{String(r.PRODUTO ?? '')}</RowTitle><RowMeta>Cód. {String(r.CODPROD)}</RowMeta></Td>
                    <Td>{String(r.NUMPED ?? '')}</Td>
                    <Td>{fmtData(String(r.DIA ?? ''))}</Td>
                    <Td numeric>{r.DIAS === null || r.DIAS === undefined ? '—' : String(r.DIAS)}</Td>
                    <Td numeric>{qtd(n(r.QT))}</Td>
                    <Td numeric>{moeda(n(r.VALOR))}</Td>
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
