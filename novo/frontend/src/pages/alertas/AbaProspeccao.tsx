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
  Button, Code, Dash, EmptyState, Field, Pagination, Panel, PanelBody, RowMeta, RowTitle, SearchInput, SelectMenu, Stack,
  Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { useBloco } from '@/components/use-bloco'
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
    <span className={c.ATRASADO ? 'font-semibold text-destructive' : undefined} title={c.ATRASADO ? 'Passou do ciclo de compra' : undefined}>
      {c.DIAS_SEM_COMPRAR} d sem comprar
    </span>
  )
  const agendar = (c: Linha) => (
    <Button size="sm" asChild>
      <Link to={linkAgendarVisita(c.ID, c.NOME)} aria-label={`Agendar visita para ${c.NOME}`}>
        <CalendarPlus aria-hidden />Agendar
      </Link>
    </Button>
  )

  return (
    <Stack>
      <p className="text-[13px] text-ink-secondary">{subtituloProspeccao(r)}</p>
      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Cliente, fantasia, CNPJ ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <Field label="Tendência" className="w-40">
            <SelectMenu label="Tendência" value={tendencia} options={TENDENCIAS} onChange={v => { setTendencia(v); setPagina(1) }} />
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
                    <Th className="hidden xl:table-cell">Curva</Th>
                    <Th>Cliente</Th>
                    <Th>Compra</Th>
                    <Th>Tendência</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(c => (
                    <Tr key={c.ID}>
                      <Td className="hidden xl:table-cell"><RowTitle>{c.CURVA}</RowTitle></Td>
                      <Td>
                        <RowTitle>{c.NOME}</RowTitle>
                        <RowMeta>
                          <span className="flex items-center gap-x-2 whitespace-nowrap">
                            <span className="xl:hidden">Curva {c.CURVA}</span>
                            <Code prefix="#">{c.ID}</Code>
                            {c.CIDADE ? <span>{c.CIDADE}{c.UF ? `/${c.UF}` : ''}</span> : null}
                            <Status tone={tomTemperatura(c.TEMPERATURA)}>{c.TEMPERATURA}</Status>
                          </span>
                        </RowMeta>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {dias(c)}
                        <RowMeta>Última {fmtData(c.ULTIMA_COMPRA)} · ciclo {c.CICLO != null ? `${c.CICLO} d` : <Dash />}</RowMeta>
                      </Td>
                      <Td><Status tone={tomTendencia(c.TENDENCIA)}>{rotuloTendencia(c.TENDENCIA)}</Status></Td>
                      <Td>{agendar(c)}</Td>
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
