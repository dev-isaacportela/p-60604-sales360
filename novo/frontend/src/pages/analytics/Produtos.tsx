// Aba Produtos do Analytics (spec 007, RF-010, RN-008): rankings, devoluções,
// fornecedores, ramo, segmento, top 3 por ramo e departamentos/seções. Só os
// rankings de produto filtram ao clicar (RF-023).

import type * as React from 'react'
import { moeda } from '@/lib/formato'
import { fmtPct } from '@/lib/analytics'
import { EmptyState, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { BarrasH } from './graficos'
import { EstadoBloco } from './comum'
import { barrasDe, type Blocos, type FiltrarPor } from './consulta'

const n = (v: unknown) => Number(v || 0)
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function Bloco({ titulo, hint, children, erro, carregando }: { titulo: string; hint?: string; children: React.ReactNode; erro: boolean; carregando: boolean }) {
  return (
    <Panel>
      <PanelHeader title={titulo} hint={hint} />
      <PanelBody>
        <EstadoBloco erro={erro} carregando={carregando} nome="os produtos">{children}</EstadoBloco>
      </PanelBody>
    </Panel>
  )
}

export function Produtos({ blocos, filtrarPor }: { blocos: Blocos; filtrarPor: FiltrarPor }) {
  const { produtos } = blocos
  const rows = produtos.dados ?? []
  const grupo = (g: string) => rows.filter(r => r.GRUPO === g)
  const porValor = barrasDe(rows, 'VALOR', 'VALOR', 10)
  const porQtd = barrasDe(rows, 'QTD', 'QT', 10)
  const escolher = (lista: typeof porValor) => (chave: string) =>
    filtrarPor('PRODUTO', { value: chave, label: lista.find(l => l.chave === chave)?.rotulo ?? chave })
  const ramosTop3 = [...new Set(grupo('RAMO_TOP3').map(r => String(r.RAMO)))]

  const estado = { erro: produtos.erro, carregando: !produtos.dados && !produtos.erro }

  return (
    <Stack>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bloco {...estado} titulo="Top produtos por valor" hint="Clique num produto para filtrar a análise.">
          <BarrasH itens={porValor} formato={moeda} escolher={escolher(porValor)} />
        </Bloco>
        <Bloco {...estado} titulo="Top produtos por quantidade" hint="Clique num produto para filtrar a análise.">
          <BarrasH itens={porQtd} formato={qtd} escolher={escolher(porQtd)} />
        </Bloco>
        <Bloco {...estado} titulo="Faturamento por ramo" hint="Todos os clientes do recorte.">
          <BarrasH itens={barrasDe(rows, 'RAMO', 'VALOR', 50)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Faturamento por segmento">
          <BarrasH itens={barrasDe(rows, 'SEGMENTO', 'VALOR', 50)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Distribuição por fornecedores">
          <BarrasH itens={barrasDe(rows, 'FORNECEDOR', 'VALOR', 15)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Top 3 produtos por ramo">
          {!ramosTop3.length ? <p className="text-[12px] text-ink-secondary">Sem dados no período.</p> : (
            <div className="flex flex-col gap-3">
              {ramosTop3.map(ramo => (
                <div key={ramo}>
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{ramo}</p>
                  <BarrasH itens={grupo('RAMO_TOP3').filter(r => String(r.RAMO) === ramo).map(r => ({ chave: String(r.CHAVE), rotulo: String(r.NOME), valor: n(r.VALOR) }))} formato={moeda} />
                </div>
              ))}
            </div>
          )}
        </Bloco>
        <Bloco {...estado} titulo="Departamentos">
          <BarrasH itens={barrasDe(rows, 'DEPTO', 'VALOR', 20)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Seções">
          <BarrasH itens={barrasDe(rows, 'SECAO', 'VALOR', 20)} formato={moeda} />
        </Bloco>
      </div>
      <Panel>
        <PanelHeader title="Produtos com devolução" hint="Os 50 maiores; % devolvido sobre o bruto do produto." />
        <EstadoBloco erro={produtos.erro} carregando={!produtos.dados && !produtos.erro} nome="as devoluções por produto">
          {!grupo('DEVOLUCAO').length ? <EmptyState title="Nenhuma devolução no período" /> : (
            <Table>
              <thead><tr><Th>Produto</Th><Th numeric>Bruto</Th><Th numeric>Devolvido</Th><Th numeric>% devolvido</Th></tr></thead>
              <tbody>
                {grupo('DEVOLUCAO').map(r => (
                  <Tr key={String(r.CHAVE)}>
                    <Td><RowTitle>{String(r.NOME ?? r.CHAVE)}</RowTitle><RowMeta>Cód. {String(r.CHAVE)}</RowMeta></Td>
                    <Td numeric>{moeda(n(r.BRUTO))}</Td>
                    <Td numeric>{moeda(n(r.DEVOLVIDO))}</Td>
                    <Td numeric>{n(r.BRUTO) ? fmtPct(n(r.DEVOLVIDO) / n(r.BRUTO)) : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </EstadoBloco>
      </Panel>
    </Stack>
  )
}
