// Aba Prospecção (RF-010…014): clientes da carteira com histórico de compra,
// ordenados por tendência de recompra. Não dispara a carga do ERP (RN-021):
// "Atualizar" só relê a SF.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, RefreshCw } from 'lucide-react'
import { acao } from '@/lib/mitra-api'
import { fmtData } from '@/lib/formato'
import { tomTemperatura } from '@/lib/carteira'
import { TENDENCIAS, VAZIO_PROSPECCAO, linkAgendarVisita, rotuloTendencia, subtituloProspeccao, tomTendencia } from '@/lib/alertas'
import {
  Button, Code, Dash, EmptyState, Field, Pagination, Panel, PanelBody, RowMeta, RowTitle, SearchInput, Stack,
  Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { cn } from '@/lib/utils'
import { BlocoFalhou } from '@/components/Confirmacao'
import { Cartao, Cresce, ListaCartoes, SoCelular, SoDesktop } from '../clientes/layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 20

export function AbaProspeccao({ escopo }: { escopo: Record<string, string> }) {
  const [tendencia, setTendencia] = useState('')
  const [textoBusca, setTextoBusca] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setBusca(textoBusca); setPagina(1) }, 400)
    return () => clearTimeout(t)
  }, [textoBusca])

  const bloco = useBloco(async () => {
    const r = await acao('prospeccaoListar', { ...escopo, tendencia, busca, pagina: String(pagina) })
    if (r.ok === false) throw new Error(r.error)
    return r
  }, [escopo, tendencia, busca, pagina, recarga])
  const r = bloco.dados
  const lista: Linha[] = r?.linhas ?? []
  const total = Number(r?.total) || 0
  const temFiltro = !!(tendencia || busca)

  const dias = (c: Linha) => (
    <span className={c.ATRASADO ? 'font-semibold text-destructive' : 'text-ink'} title={c.ATRASADO ? 'Passou do ciclo de compra' : undefined}>
      {c.DIAS_SEM_COMPRAR} {Number(c.DIAS_SEM_COMPRAR) === 1 ? 'dia' : 'dias'}
    </span>
  )
  const ciclo = (c: Linha) => (c.CICLO == null ? 'sem ciclo definido' : c.ATRASADO ? `passou do ciclo de ${c.CICLO} dias` : `ciclo de ${c.CICLO} dias`)
  const agendar = (c: Linha) => (
    <Button size="sm" asChild>
      <Link to={linkAgendarVisita(c.ID, c.NOME)} aria-label={`Agendar visita para ${c.NOME}`}>
        <CalendarPlus aria-hidden />Agendar
      </Link>
    </Button>
  )

  return (
    <Stack>
      <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule-table bg-rule-row sm:grid-cols-3">
        {[
          ['Semana', r?.semana ? `Semana ${r.semana}` : null, r?.mes ? `de ${r.mes}` : ''],
          ['Alta tendência de recompra', r ? String(r.altas ?? 0) : null, 'clientes para visitar primeiro'],
          ['Clientes na lista', r ? total.toLocaleString('pt-BR') : null, temFiltro ? 'no filtro aplicado' : 'da carteira com histórico de compra'],
        ].map(([rotulo, valor, nota]) => (
          <div key={rotulo} className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
            <span className="text-[12px] text-ink-secondary">{rotulo}</span>
            <span className="truncate font-title text-[24px] leading-tight font-bold text-ink tabular-nums">{valor ?? <Dash />}</span>
            <span className="truncate text-[12px] text-ink-secondary">{nota}</span>
          </div>
        ))}
      </section>
      <p className="sr-only" aria-live="polite">{subtituloProspeccao(r)}</p>
      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Cliente, fantasia, CNPJ ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <Field label="Tendência">
            <div role="group" aria-label="Tendência" className="inline-flex flex-wrap rounded-full border border-rule-table p-0.5">
              {TENDENCIAS.map(t => (
                <button key={t.value || 'todos'} type="button" aria-pressed={tendencia === t.value} onClick={() => { setTendencia(t.value); setPagina(1) }}
                  className={cn('min-h-8 rounded-full px-3 text-[13px] transition-colors', tendencia === t.value ? 'bg-primary font-semibold text-primary-foreground' : 'text-ink-secondary hover:text-ink')}>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <Button onClick={() => setRecarga(n => n + 1)}><RefreshCw aria-hidden />Atualizar</Button>
        </Toolbar>

        {bloco.erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : r && !lista.length ? (
          <EmptyState title={temFiltro ? 'Nenhum cliente neste filtro' : VAZIO_PROSPECCAO} hint={temFiltro ? 'Mude a busca ou a tendência.' : undefined} />
        ) : (
          <>
            <SoDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th className="text-center">Curva</Th>
                    <Th className="hidden lg:table-cell">Temperatura</Th>
                    <Th>Sem comprar</Th>
                    <Th className="hidden lg:table-cell">Última compra</Th>
                    <Th>Tendência</Th>
                    <Th><span className="sr-only">Ações</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(c => (
                    <Tr key={c.ID}>
                      <Td>
                        <RowTitle>{c.NOME}</RowTitle>
                        <RowMeta>
                          <span className="flex items-center gap-x-2 whitespace-nowrap">
                            <Code prefix="#">{c.ID}</Code>
                            {c.CIDADE ? <span>{c.CIDADE}{c.UF ? `/${c.UF}` : ''}</span> : null}
                            <span className="lg:hidden"><Status tone={tomTemperatura(c.TEMPERATURA)}>{c.TEMPERATURA}</Status></span>
                          </span>
                        </RowMeta>
                      </Td>
                      <Td className="text-center">
                        <span className="inline-flex size-7 items-center justify-center rounded-full border border-rule-table bg-secondary text-[12px] font-bold text-ink">{c.CURVA}</span>
                      </Td>
                      <Td className="hidden lg:table-cell"><Status tone={tomTemperatura(c.TEMPERATURA)}>{c.TEMPERATURA}</Status></Td>
                      <Td className="whitespace-nowrap tabular-nums">
                        {dias(c)}
                        <RowMeta><span className={c.ATRASADO ? 'text-destructive' : undefined}>{ciclo(c)}</span></RowMeta>
                      </Td>
                      <Td className="hidden whitespace-nowrap tabular-nums lg:table-cell">{c.ULTIMA_COMPRA ? fmtData(c.ULTIMA_COMPRA) : <Dash />}</Td>
                      <Td><Status tone={tomTendencia(c.TENDENCIA)}>{rotuloTendencia(c.TENDENCIA)}</Status></Td>
                      <Td className="text-right">{agendar(c)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </SoDesktop>
            <SoCelular>
              <ListaCartoes>
                {lista.map(c => (
                  <Cartao
                    key={c.ID}
                    lado={<RowTitle>{c.CURVA}</RowTitle>}
                    titulo={c.NOME}
                    meta={<><Status tone={tomTendencia(c.TENDENCIA)}>{rotuloTendencia(c.TENDENCIA)}</Status>{dias(c)}</>}
                    acoes={agendar(c)}
                  />
                ))}
              </ListaCartoes>
            </SoCelular>
          </>
        )}
        {total > 0 ? (
          <Pagination
            page={Number(r?.pagina) || pagina}
            lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
            total={total}
            unit="clientes"
            onPrevious={() => setPagina(p => p - 1)}
            onNext={() => setPagina(p => p + 1)}
          />
        ) : null}
      </Panel>
    </Stack>
  )
}
