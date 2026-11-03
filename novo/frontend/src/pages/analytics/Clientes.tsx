// Aba Clientes do Analytics (spec 007, RF-007, RF-009, RF-022/023): análise
// de carteira com lista de Inativos / Em risco, Top Clientes (tabela larga,
// com a participação em barra) e evolução dos clientes marcados no filtro.

import { useState } from 'react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, moeda } from '@/lib/formato'
import { fmtPct, ordenar } from '@/lib/analytics'
import { EmptyState, Pagination, Panel, PanelHeader, RowMeta, RowTitle, Stack, Table, Td, Th, Tr } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { cn } from '@/lib/utils'
import { FaixaIndicadores } from '../clientes/layout'
import { ValorCard } from './graficos'
import { EstadoBloco, ThOrdem, type Direcao } from './comum'
import type { Blocos, Consulta, FiltrarPor } from './consulta'

const n = (v: unknown) => Number(v || 0)
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (am: string) => `${MES_CURTO[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`

type Campo = 'CLIENTE' | 'BRUTO' | 'DEVOLVIDO' | 'LIQUIDO' | 'PEDIDOS' | 'TICKET' | 'PCT'

export function Clientes({ consulta, params, ant, blocos, filtrarPor }: {
  consulta: Consulta; params: Record<string, string>; ant: { deAnt: string; ateAnt: string }; blocos: Blocos; filtrarPor: FiltrarPor
}) {
  const { carteira, topClientes, evolucaoCliente } = blocos
  const [situacao, setSituacao] = useState<'' | 'INATIVO' | 'EM_RISCO'>('')
  const [ordem, setOrdem] = useState<{ campo: Campo; direcao: Direcao }>({ campo: 'LIQUIDO', direcao: 'desc' })
  const k = carteira.dados
  const ativos = n(k?.ATIVOS)
  const escolher = (s: 'INATIVO' | 'EM_RISCO') => ({ rotulo: 'Ver a lista', ativo: situacao === s, onClick: () => setSituacao(situacao === s ? '' : s) })

  const top = ordenar((topClientes.dados ?? []).map((r): Record<string, unknown> & { CLIENTE: string; TICKET: number; PCT: number } => ({
    ...r,
    CLIENTE: String(r.CLIENTE ?? r.CODCLI),
    TICKET: n(r.PEDIDOS) ? n(r.LIQUIDO) / n(r.PEDIDOS) : 0,
    PCT: n(r.TOTAL_LIQUIDO) ? n(r.LIQUIDO) / n(r.TOTAL_LIQUIDO) : 0,
  })), ordem.campo, ordem.direcao)
  // Barra da participação: o maior cliente enche a barra.
  const maxPct = Math.max(0.0001, ...top.map(r => r.PCT))
  const cliente = (r: Record<string, unknown>) => filtrarPor('CLIENTE', { value: String(r.CODCLI), label: String(r.CLIENTE ?? r.CODCLI) })

  return (
    <Stack>
      <EstadoBloco erro={carteira.erro} carregando={!k && !carteira.erro} nome="a análise de carteira">
        <FaixaIndicadores itens={[
          { rotulo: 'Carteira', valor: n(k?.CARTEIRA), nota: `Ativos ${ativos}` },
          { rotulo: 'Inativos', valor: n(k?.INATIVOS), nota: 'Sem pedido no período', acao: escolher('INATIVO') },
          { rotulo: 'Em risco', valor: n(k?.EM_RISCO), nota: `Compraram de ${fmtData(ant.deAnt)} a ${fmtData(ant.ateAnt)}`, acao: escolher('EM_RISCO') },
          { rotulo: 'Novos', valor: n(k?.NOVOS), nota: 'Primeira compra no período' },
          { rotulo: 'Ticket médio', valor: <ValorCard>{moeda(ativos ? n(k?.LIQUIDO) / ativos : 0)}</ValorCard>, nota: 'Líquido ÷ ativos' },
        ]} />
      </EstadoBloco>
      {situacao ? <ListaCarteira params={{ ...params, ...ant }} situacao={situacao} /> : null}

      <Panel>
          <PanelHeader title="Top clientes" hint="Os 10 maiores pelo líquido. Clique no cliente para filtrar a análise." />
          <EstadoBloco erro={topClientes.erro} carregando={!topClientes.dados && !topClientes.erro} nome="o ranking de clientes">
            {!top.length ? <EmptyState title="Sem faturamento no período" /> : (
              <Table>
                <thead>
                  <tr>
                    <ThOrdem campo="CLIENTE" ordem={ordem} mudar={setOrdem}>Cliente</ThOrdem>
                    <ThOrdem campo="BRUTO" ordem={ordem} mudar={setOrdem} numeric>Bruto</ThOrdem>
                    <ThOrdem campo="DEVOLVIDO" ordem={ordem} mudar={setOrdem} numeric>Devolvido</ThOrdem>
                    <ThOrdem campo="LIQUIDO" ordem={ordem} mudar={setOrdem} numeric>Líquido</ThOrdem>
                    <ThOrdem campo="PEDIDOS" ordem={ordem} mudar={setOrdem} numeric>Pedidos</ThOrdem>
                    <ThOrdem campo="TICKET" ordem={ordem} mudar={setOrdem} numeric>Ticket</ThOrdem>
                    <ThOrdem campo="PCT" ordem={ordem} mudar={setOrdem} numeric>% do total</ThOrdem>
                  </tr>
                </thead>
                <tbody>
                  {top.map(r => (
                    <Tr key={String(r.CODCLI)}>
                      <Td>
                        <button type="button" className="text-left hover:underline" onClick={() => cliente(r)} title="Filtrar a análise por este cliente">
                          <RowTitle>{r.CLIENTE}</RowTitle>
                        </button>
                        <RowMeta>Cód. {String(r.CODCLI)}</RowMeta>
                      </Td>
                      <Td numeric className="whitespace-nowrap tabular-nums">{moeda(n(r.BRUTO))}</Td>
                      <Td numeric className={cn('whitespace-nowrap tabular-nums', !n(r.DEVOLVIDO) && 'text-ink-secondary')}>{moeda(n(r.DEVOLVIDO))}</Td>
                      <Td numeric className="whitespace-nowrap tabular-nums"><RowTitle>{moeda(n(r.LIQUIDO))}</RowTitle></Td>
                      <Td numeric className="tabular-nums">{n(r.PEDIDOS)}</Td>
                      <Td numeric className="whitespace-nowrap tabular-nums">{moeda(r.TICKET)}</Td>
                      <Td numeric>
                        <span className="inline-flex items-center justify-end gap-2 tabular-nums">
                          <span aria-hidden className="h-1.5 w-20 rounded-full bg-muted">
                            <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(1, r.PCT / maxPct) * 100}%` }} />
                          </span>
                          <span className="w-12">{fmtPct(r.PCT)}</span>
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </EstadoBloco>
      </Panel>

      <Panel>
        <PanelHeader title="Evolução do cliente" hint="Líquido por mês dos clientes marcados no filtro." />
        {!consulta.clientes.length ? (
          <p className="px-4 py-6 text-[13px] text-ink-secondary">Selecione um ou mais clientes nos filtros para visualizar a evolução.</p>
        ) : (
          <EstadoBloco erro={evolucaoCliente.erro} carregando={!evolucaoCliente.dados && !evolucaoCliente.erro} nome="a evolução do cliente">
            <EvolucaoCliente rows={evolucaoCliente.dados ?? []} />
          </EstadoBloco>
        )}
      </Panel>
    </Stack>
  )
}

function EvolucaoCliente({ rows }: { rows: Record<string, unknown>[] }) {
  const meses = [...new Set(rows.map(r => String(r.MES)))].sort()
  const clientes = [...new Map(rows.map(r => [String(r.CODCLI), String(r.CLIENTE ?? r.CODCLI)])).entries()]
  if (!rows.length) return <EmptyState title="Sem faturamento para os clientes marcados" />
  const valor = (c: string, m: string) => n(rows.find(r => String(r.CODCLI) === c && String(r.MES) === m)?.LIQUIDO)
  return (
    <Table className="min-w-max">
      <thead><tr><Th className="sticky left-0 z-10">Cliente</Th>{meses.map(m => <Th key={m} numeric>{rotuloMes(m)}</Th>)}</tr></thead>
      <tbody>
        {clientes.map(([c, nome]) => (
          <Tr key={c} className="group">
            <Td className="sticky left-0 z-10 bg-card group-hover:bg-accent"><RowTitle>{nome}</RowTitle></Td>
            {meses.map(m => <Td key={m} numeric>{moeda(valor(c, m))}</Td>)}
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}

/** RF-007: Inativos ou Em risco, 20 por página. */
function ListaCarteira({ params, situacao }: { params: Record<string, string>; situacao: 'INATIVO' | 'EM_RISCO' }) {
  const [pagina, setPagina] = useState(1)
  const [chave, setChave] = useState(`${situacao}`)
  if (chave !== situacao) { setChave(situacao); setPagina(1) }
  const bloco = useBloco(() => linhas('analyticsCarteiraLista', { ...params, situacao, pagina: String(pagina) }), [params, situacao, pagina])
  const rows = bloco.dados ?? []
  const total = n(rows[0]?.TOTAL)
  return (
    <Panel>
      <PanelHeader title={situacao === 'INATIVO' ? 'Clientes inativos' : 'Clientes em risco'} />
      <EstadoBloco erro={bloco.erro} carregando={!bloco.dados && !bloco.erro} nome="a lista de clientes">
        {!rows.length ? <EmptyState title="Nenhum cliente nesta situação" /> : (
          <>
            <Table>
              <thead><tr><Th>Cliente</Th><Th>Ramo</Th><Th>Último pedido</Th><Th numeric>Dias sem compra</Th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <Tr key={String(r.CODCLI)}>
                    <Td><RowTitle>{String(r.CLIENTE ?? r.CODCLI)}</RowTitle><RowMeta>Cód. {String(r.CODCLI)}</RowMeta></Td>
                    <Td>{String(r.RAMO ?? '')}</Td>
                    <Td>{r.ULTIMO ? fmtData(String(r.ULTIMO)) : 'Sem pedido'}</Td>
                    <Td numeric>{r.DIAS_SEM_COMPRA === null || r.DIAS_SEM_COMPRA === undefined ? 'Sem pedido' : String(r.DIAS_SEM_COMPRA)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={pagina} lastPage={Math.max(1, Math.ceil(total / 20))} total={total} unit="clientes" onPrevious={() => setPagina(p => p - 1)} onNext={() => setPagina(p => p + 1)} />
          </>
        )}
      </EstadoBloco>
    </Panel>
  )
}
