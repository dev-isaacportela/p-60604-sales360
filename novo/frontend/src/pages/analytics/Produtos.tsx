// Aba Produtos do Analytics (spec 007, RF-010, RN-008): rankings de produto em
// tabela, ramo, segmento, fornecedores, top 3 por ramo, departamentos/seções e
// devoluções. Barras sempre do maior para o menor. Só os rankings de produto
// filtram ao clicar (RF-023).

import type * as React from 'react'
import { moeda } from '@/lib/formato'
import { fmtPct } from '@/lib/analytics'
import { EmptyState, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { BarrasH, Ranking, type Barra } from './graficos'
import { EstadoBloco } from './comum'
import { barrasDe, nomeProduto, type Blocos, type FiltrarPor } from './consulta'

const n = (v: unknown) => Number(v || 0)
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const maiorPrimeiro = (itens: Barra[]) => [...itens].sort((a, b) => b.valor - a.valor)

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
  const escolher = (b: Barra) => filtrarPor('PRODUTO', { value: b.chave, label: b.rotulo })
  const barras = (g: string, limite: number) => maiorPrimeiro(barrasDe(rows, g, 'VALOR', limite))
  const top3 = grupo('RAMO_TOP3')
  const ramosTop3 = [...new Set(top3.map(r => String(r.RAMO)))]

  const estado = { erro: produtos.erro, carregando: !produtos.dados && !produtos.erro }

  return (
    <Stack>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Ranking titulo="Produtos por valor" coluna="Valor" bloco={produtos} itens={barrasDe(rows, 'VALOR', 'VALOR', 10)} formato={moeda} escolher={escolher} />
        <Ranking titulo="Produtos por quantidade" coluna="Qtd" bloco={produtos} itens={barrasDe(rows, 'QTD', 'QT', 10)} formato={x => `${qtd(x)} un.`} escolher={escolher} />
        <Bloco {...estado} titulo="Faturamento por ramo" hint="Todos os clientes do recorte.">
          <BarrasH itens={barras('RAMO', 50)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Faturamento por segmento">
          <BarrasH itens={barras('SEGMENTO', 50)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Fornecedores" hint="Os 15 maiores.">
          <BarrasH itens={barras('FORNECEDOR', 15)} formato={moeda} />
        </Bloco>
        <Panel>
          <PanelHeader title="Top 3 produtos por ramo" />
          <EstadoBloco {...estado} nome="os produtos">
            {!ramosTop3.length ? <p className="px-4 py-6 text-[13px] text-ink-secondary">Sem dados no período.</p> : (
              <Table>
                <thead><tr><Th>Ramo</Th><Th>Produto</Th><Th numeric>Valor</Th></tr></thead>
                <tbody>
                  {ramosTop3.flatMap(ramo => {
                    const doRamo = top3.filter(r => String(r.RAMO) === ramo)
                    // Linha divisória só entre ramos: o ramo aparece uma vez, no primeiro produto.
                    return doRamo.map((r, i) => {
                      const meio = i < doRamo.length - 1 ? 'border-b-0' : ''
                      return (
                        <Tr key={`${ramo}-${String(r.CHAVE)}-${i}`}>
                          <Td className={meio}>{i === 0 ? <RowTitle>{ramo}</RowTitle> : null}</Td>
                          <Td className={meio}>{nomeProduto(r.NOME, r.CHAVE)}</Td>
                          <Td numeric className={`${meio} whitespace-nowrap tabular-nums`}>{moeda(n(r.VALOR))}</Td>
                        </Tr>
                      )
                    })
                  })}
                </tbody>
              </Table>
            )}
          </EstadoBloco>
        </Panel>
        <Bloco {...estado} titulo="Departamentos">
          <BarrasH itens={barras('DEPTO', 20)} formato={moeda} />
        </Bloco>
        <Bloco {...estado} titulo="Seções">
          <BarrasH itens={barras('SECAO', 20)} formato={moeda} />
        </Bloco>
      </div>
      <Panel>
        <PanelHeader title="Produtos com devolução" hint="Os 50 maiores; % devolvido sobre o bruto do produto." />
        <EstadoBloco {...estado} nome="as devoluções por produto">
          {!grupo('DEVOLUCAO').length ? <EmptyState title="Nenhuma devolução no período" /> : (
            <Table>
              <thead><tr><Th>Produto</Th><Th numeric>Bruto</Th><Th numeric>Devolvido</Th><Th numeric>% devolvido</Th></tr></thead>
              <tbody>
                {grupo('DEVOLUCAO').map((r, i) => (
                  <Tr key={`${String(r.CHAVE)}-${i}`}>
                    <Td>
                      <RowTitle>{nomeProduto(r.NOME, r.CHAVE)}</RowTitle>
                      {r.CHAVE != null && r.CHAVE !== '' ? <RowMeta>Cód. {String(r.CHAVE)}</RowMeta> : null}
                    </Td>
                    <Td numeric className="whitespace-nowrap tabular-nums">{moeda(n(r.BRUTO))}</Td>
                    <Td numeric className="whitespace-nowrap tabular-nums">{moeda(n(r.DEVOLVIDO))}</Td>
                    <Td numeric className="tabular-nums">{n(r.BRUTO) ? fmtPct(n(r.DEVOLVIDO) / n(r.BRUTO)) : '—'}</Td>
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
