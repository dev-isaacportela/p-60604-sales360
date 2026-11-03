// Detalhe do cliente na visão Semanal (spec 006, RF-006, RN-011): semanas do
// mês, itens da semana contra a mesma semana do mês anterior, pedidos e
// sazonalidade de 12 meses. Uma chamada (s360SemanalDetalhe) ao abrir.

import { useState } from 'react'
import { acao } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { MESES, cabecalhoSemana, rotuloSemana, rotuloSemanaDetalhe, tituloSemana, type LinhaMatriz, type Semana } from '@/lib/semanal'
import {
  Alert, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, Field, RowMeta, RowTitle,
  SelectMenu, Status, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr,
} from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { cn } from '@/lib/utils'

interface Item { CODPROD: string | number; PRODUTO: string; qt: number; qtAnt: number; total: number; dif: number; vlUnit: number; movimento: string }
interface SemanaDetalhe extends Semana { pedidos: number; valor: number; listaPedidos: { NUMPED: string; valor: number }[]; itens: Item[] }
interface Detalhe { ok: boolean; semanas: SemanaDetalhe[]; sazonalidade: { CODPROD: string; PRODUTO: string; meses: { ano: number; mes: number; qt: number; valor: number }[] }[] }

const TOM_MOVIMENTO: Record<string, 'alert' | 'attention' | 'live' | 'off'> = {
  'Deixou de comprar': 'alert', Queda: 'attention', 'Comprou a mais': 'live', 'Novo na semana': 'live', 'Estável': 'off',
}

export function DetalheCliente({ cliente, input, fechar }: { cliente: LinhaMatriz; input: Record<string, string>; fechar: () => void }) {
  const detalhe = useBloco(() => acao('semanalDetalhe', { ...input, clienteId: String(cliente.CLIENTE_ID) }) as Promise<Detalhe>, [cliente.CLIENTE_ID, input])
  const d = detalhe.dados?.ok ? detalhe.dados : null
  const comCompra = d?.semanas.find(s => s.pedidos > 0)?.n ?? 1
  const [escolhida, setEscolhida] = useState<number | null>(null)
  const n = escolhida ?? comCompra
  const semana = d?.semanas.find(s => s.n === n)

  return (
    <Dialog open onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{cliente.CLIENTE}</DialogTitle>
          <DialogDescription>Curva {cliente.CURVA} · {cliente.RAMO} · {MESES[Number(input.mes) - 1]} de {input.ano}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {detalhe.erro || (detalhe.dados && !detalhe.dados.ok) ? <Alert tone="error">Não foi possível carregar o detalhe do cliente.</Alert> : !d ? (
            <p className="text-[13px] text-ink-secondary">Carregando…</p>
          ) : (
            <Tabs defaultValue="semanas">
              <TabsList>
                <TabsTrigger value="semanas">Semanas</TabsTrigger>
                <TabsTrigger value="sazonalidade">Sazonalidade</TabsTrigger>
              </TabsList>
              <TabsContent value="semanas" className="flex flex-col gap-4">
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {d.semanas.map(s => (
                    <li key={s.n}>
                      <button
                        type="button"
                        aria-pressed={s.n === n}
                        onClick={() => setEscolhida(s.n)}
                        className={cn('w-full rounded-xl border border-rule-table px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent', s.n === n && 'bg-accent')}
                      >
                        <span className="block font-semibold text-ink">{tituloSemana(s.n)}</span>
                        <span className="block text-ink-secondary">{rotuloSemana(s)}</span>
                        <span className="block text-ink">{s.pedidos} ped. · {moeda(s.valor)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <Field label="Semana">
                    <SelectMenu label="Semana" value={String(n)} onChange={v => setEscolhida(Number(v))} options={d.semanas.map(s => ({ value: String(s.n), label: rotuloSemanaDetalhe(s) }))} />
                  </Field>
                  {semana ? <p className="font-title text-[15px] font-bold text-ink">{cabecalhoSemana(semana)}</p> : null}
                </div>
                {!semana?.itens.length ? <EmptyState title="Nenhum item nesta semana nem na mesma semana do mês anterior" /> : (
                  <Table>
                    <thead>
                      <tr><Th>Produto</Th><Th numeric>Qtd</Th><Th numeric>Qtd mês ant.</Th><Th numeric>Diferença</Th><Th numeric>Vl. unit.</Th><Th numeric>Total</Th><Th>Movimento</Th></tr>
                    </thead>
                    <tbody>
                      {semana.itens.map(i => (
                        <Tr key={String(i.CODPROD)}>
                          <Td><RowTitle>{i.PRODUTO}</RowTitle><RowMeta>Cód. {i.CODPROD}</RowMeta></Td>
                          <Td numeric>{i.qt}</Td>
                          <Td numeric>{i.qtAnt}</Td>
                          <Td numeric>{i.dif > 0 ? `+${i.dif}` : i.dif}</Td>
                          <Td numeric>{moeda(i.vlUnit)}</Td>
                          <Td numeric>{moeda(i.total)}</Td>
                          <Td><Status tone={TOM_MOVIMENTO[i.movimento] ?? 'off'}>{i.movimento}</Status></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {semana?.listaPedidos.length ? (
                  <p className="text-[12px] text-ink-secondary">
                    Pedidos da semana: {semana.listaPedidos.map(p => `${p.NUMPED} (${moeda(p.valor)})`).join(' · ')}
                  </p>
                ) : null}
              </TabsContent>
              <TabsContent value="sazonalidade">
                {!d.sazonalidade.length ? <EmptyState title="Sem compras nos últimos 12 meses" /> : (
                  <Table className="min-w-max">
                    <thead>
                      <tr>
                        <Th className="sticky left-0 z-10">Produto</Th>
                        {d.sazonalidade[0].meses.map(x => <Th key={`${x.ano}-${x.mes}`} numeric>{MESES[x.mes - 1].slice(0, 3)}/{String(x.ano).slice(2)}</Th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.sazonalidade.map(p => (
                        <Tr key={p.CODPROD} className="group">
                          <Td className="sticky left-0 z-10 max-w-64 truncate bg-card group-hover:bg-accent" title={p.PRODUTO}>{p.PRODUTO}</Td>
                          {p.meses.map(x => <Td key={`${x.ano}-${x.mes}`} numeric className={x.qt ? 'text-ink' : 'text-ink-muted'} title={moeda(x.valor)}>{x.qt || '—'}</Td>)}
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
