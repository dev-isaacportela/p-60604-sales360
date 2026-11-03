// Histórico do Cliente (RF-010, RN-017): ficha do cliente escolhido com o
// resumo do período e a linha do tempo por mês, pedidos faturados inclusos
// (filtro por tipo e período). O seletor de cliente usa a busca inteligente
// da carteira; sem cliente, vale a carteira inteira.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { acao, linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia, moeda } from '@/lib/formato'
import { somarDias } from '@/lib/agenda'
import {
  TIPOS_HISTORICO, haDias, porMes, rotuloPeriodoHistorico, rotuloStatus, rotuloTemperatura, rotuloTipoHistorico, ultimaPagina,
} from '@/lib/carteira'
import {
  Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  EmptyState, Field, Input, LabelledField, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Stack, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { RegistrarRelato } from './dialogos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 20
const FILTROS = { ramo: '', tipo: '', de: '', ate: '' }
const LIMITE_TEXTO = 140

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${String(de).slice(0, 10)}T12:00:00Z`)) / 86400000)

/** Carrega uma listagem paginada do histórico; `null` = falhou. `versao` recarrega. */
function usePaginado(chave: 'historicoLinhaTempo' | 'historicoPedidos', input: Record<string, string> | null, versao: number) {
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState<{ linhas: Linha[]; total: number } | null | 'carregando'>('carregando')
  const base = input ? JSON.stringify(input) : ''

  useEffect(() => { setPagina(1) }, [base])

  useEffect(() => {
    if (!base) return
    let vivo = true
    setEstado('carregando')
    linhas(chave, { ...JSON.parse(base), pagina: String(pagina) })
      .then(ls => { if (vivo) setEstado({ linhas: ls, total: Number(ls[0]?.TOTAL) || 0 }) })
      .catch(falha => {
        console.error(chave, falha)
        if (vivo) setEstado(null)
      })
    return () => { vivo = false }
  }, [chave, base, pagina, versao])

  return { pagina, setPagina, estado }
}

function Paginas({ pagina, setPagina, total, unit }: { pagina: number; setPagina: (p: number) => void; total: number; unit: string }) {
  if (total <= POR_PAGINA) return null
  return (
    <Pagination
      page={pagina}
      lastPage={ultimaPagina(total, POR_PAGINA)}
      total={total}
      unit={unit}
      busy={false}
      onPrevious={() => setPagina(pagina - 1)}
      onNext={() => setPagina(pagina + 1)}
    />
  )
}

function Itens({ titulo, descricao, carregar, fechar }: {
  titulo: string
  descricao?: string
  carregar: (() => Promise<Linha[]>) | null
  fechar: () => void
}) {
  const [itens, setItens] = useState<Linha[] | null | 'erro'>(null)
  useEffect(() => {
    if (!carregar) return
    setItens(null)
    carregar().then(setItens).catch(falha => {
      console.error(titulo, falha)
      setItens('erro')
    })
  }, [carregar, titulo])

  return (
    <Dialog open={!!carregar} onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          {itens === 'erro' ? (
            <Alert tone="error">Não foi possível carregar os itens.</Alert>
          ) : itens ? (
            <Table>
              <thead>
                <tr><Th>Produto</Th><Th numeric>Qtd.</Th><Th numeric>Preço</Th><Th numeric>Total</Th></tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <Tr key={n}>
                    <Td>{i.PRODUTO}</Td>
                    <Td numeric>{Number(i.QUANTIDADE).toLocaleString('pt-BR')}</Td>
                    <Td numeric>{moeda(i.PRECO_UNITARIO ?? i.PRECO_VENDA)}</Td>
                    <Td numeric>{moeda(i.TOTAL)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** Faixa de números no pé da ficha: rótulo, valor e uma explicação curta. */
function Resumo({ itens }: { itens: [string, ReactNode, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-b-2xl bg-secondary px-5 py-3.5 md:grid-cols-4">
      {itens.map(([rotulo, valor, dica]) => (
        <div key={rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12px] text-ink-secondary">{rotulo}</dt>
          <dd className="font-title text-[17px] font-bold whitespace-nowrap text-ink tabular-nums">{valor}</dd>
          <dd className="text-[12px] text-ink-secondary">{dica}</dd>
        </div>
      ))}
    </dl>
  )
}

function Periodo({ de, ate, hoje, mudar }: { de: string; ate: string; hoje: string; mudar: (campo: 'de' | 'ate', valor: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Período: ${rotuloPeriodoHistorico(de, ate)}. Alterar`}
          className="flex min-h-9 items-center gap-2 rounded-full border border-rule-table bg-card px-3.5 text-[13px] text-ink transition-colors hover:bg-secondary"
        >
          <CalendarDays aria-hidden className="size-3.5 text-ink-secondary" />
          {rotuloPeriodoHistorico(de, ate)}
          <ChevronDown aria-hidden className="size-3.5 text-ink-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3">
        <LabelledField label="De">
          <Input type="date" value={de} max={ate || hoje} onChange={e => mudar('de', e.target.value)} />
        </LabelledField>
        <LabelledField label="Até">
          <Input type="date" value={ate} min={de} max={hoje} onChange={e => mudar('ate', e.target.value)} />
        </LabelledField>
        {de || ate ? <Button size="sm" onClick={() => { mudar('de', ''); mudar('ate', '') }}>Todo o período</Button> : null}
      </PopoverContent>
    </Popover>
  )
}

export function AbaHistorico({ escopo, clienteInicial }: { escopo: Record<string, string>; clienteInicial: string }) {
  const hoje = hojeBrasilia()
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(clienteInicial ? { id: clienteInicial, nome: `Cliente ${clienteInicial}` } : null)
  const [ficha, setFicha] = useState<Linha | null>(null)
  const [textoBusca, setTextoBusca] = useState('')
  const [achados, setAchados] = useState<Linha[]>([])
  const [filtros, setFiltros] = useState(FILTROS)
  const [ramos, setRamos] = useState<{ value: string; label: string }[]>([])
  const [visita, setVisita] = useState<Linha | null>(null)
  const [itens, setItens] = useState<{ titulo: string; descricao?: string; carregar: () => Promise<Linha[]> } | null>(null)
  const [relato, setRelato] = useState<Linha | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    linhas('clientesRamos')
      .then(rs => setRamos(rs.map(r => ({ value: String(r.RAMO), label: String(r.RAMO) }))))
      .catch(falha => console.error('s360ClientesRamos', falha))
  }, [])

  // Seletor: busca inteligente na carteira exibida, 10 resultados.
  useEffect(() => {
    if (!textoBusca.trim()) { setAchados([]); return }
    const t = setTimeout(() => {
      acao('carteiraCarregar', { ...escopo, busca: textoBusca, ramo: '', status: '', ordem: 'NOME_AZ', pendentes: '0', pagina: '1', porPagina: '10' })
        .then(r => setAchados(r.linhas ?? []))
        .catch(falha => console.error('s360CarteiraCarregar (seletor)', falha))
    }, 400)
    return () => clearTimeout(t)
  }, [textoBusca, escopo])

  // Ficha: a linha da carteira do cliente escolhido (curva, temperatura, status, dias sem visita).
  const clienteId = cliente?.id ?? ''
  useEffect(() => {
    setFicha(null)
    if (!clienteId) return
    let vivo = true
    acao('carteiraCarregar', { ...escopo, busca: clienteId, ramo: '', status: '', ordem: 'NOME_AZ', pendentes: '0', pagina: '1', porPagina: '10' })
      .then(r => { if (vivo) setFicha((r.linhas ?? []).find((l: Linha) => String(l.ID) === clienteId) ?? null) })
      .catch(falha => console.error('s360CarteiraCarregar (ficha)', falha))
    return () => { vivo = false }
  }, [clienteId, escopo])

  const input = { ...escopo, clienteId, ramo: cliente ? '' : filtros.ramo, de: filtros.de, ate: filtros.ate }
  const tempo = usePaginado('historicoLinhaTempo', { ...input, tipo: filtros.tipo }, versao)
  // Os pedidos entram na linha do tempo; esta consulta só dá o resumo da ficha (total do filtro e o mais recente).
  const pedidos = usePaginado('historicoPedidos', cliente ? input : null, versao)

  // O nome do cliente que veio pelo endereço chega na ficha ou na primeira linha.
  const primeira = tempo.estado && tempo.estado !== 'carregando' ? tempo.estado.linhas[0] : null
  const nome = ficha?.NOME ?? (cliente?.nome.startsWith('Cliente ') && String(primeira?.CLIENTE_ID) === clienteId ? primeira?.CLIENTE : cliente?.nome)

  const mudar = (campo: keyof typeof FILTROS, valor: string) => setFiltros(f => ({ ...f, [campo]: valor }))

  function abrirPedido(p: Linha) {
    setItens({
      titulo: `Pedido ${p.NUMPED}`,
      descricao: `${p.CLIENTE} · ${fmtData(p.DATA)}. Desconto não informado pelo ERP.`,
      carregar: () => linhas('historicoPedidoItens', { ...escopo, clienteId: String(p.CLIENTE_ID), numped: String(p.NUMPED) }),
    })
  }

  function abrirEvento(e: Linha) {
    if (e.TIPO === 'PEDIDO') {
      abrirPedido({ NUMPED: e.REF_ID, CLIENTE_ID: e.CLIENTE_ID, CLIENTE: e.CLIENTE, DATA: e.DATA })
    } else if (e.TIPO === 'MIX') {
      setItens({
        titulo: e.TITULO || 'Mix de produtos',
        descricao: `${e.CLIENTE} · ${fmtData(e.DATA)} · ${moeda(e.VALOR)}`,
        carregar: () => linhas('historicoMixItens', { ...escopo, mixId: String(e.REF_ID) }),
      })
    } else {
      setVisita(e)
    }
  }

  const estTempo = tempo.estado
  const estPedidos = pedidos.estado
  const listaPedidos = estPedidos && estPedidos !== 'carregando' ? estPedidos : null
  const totalPedidos = listaPedidos?.total ?? 0
  const valorTotal = Number(listaPedidos?.linhas[0]?.VALOR_TOTAL ?? 0)
  const ultimoPedido = listaPedidos?.linhas[0] ?? null
  const diasVisita = ficha?.DIAS_SEM_VISITA
  const lugar = ficha?.CIDADE ? `${ficha.CIDADE}${ficha.UF ? `/${ficha.UF}` : ''}` : ''

  return (
    <Stack>
      {aviso ? <Alert tone="success">{aviso}</Alert> : null}

      {cliente ? (
        <Panel className="flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="font-title text-[22px] font-bold text-ink">{nome}</h2>
              <p className="text-[13px] text-ink-secondary">
                {[`#${cliente.id}`, lugar, ficha?.RAMO, ficha?.CURVA ? `Curva ${ficha.CURVA}` : '', ficha?.TEMPERATURA ? rotuloTemperatura(ficha.TEMPERATURA) : '', ficha?.STATUS ? rotuloStatus(ficha.STATUS) : '']
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setCliente(null); setFiltros(FILTROS) }}>Trocar cliente</Button>
              {ficha ? <Button variant="primary" onClick={() => { setAviso(null); setRelato(ficha) }}>Registrar relato</Button> : null}
            </div>
          </div>
          <Resumo itens={[
            ['Última visita', diasVisita == null ? <Dash /> : fmtData(somarDias(hoje, -Number(diasVisita))), haDias(diasVisita) || 'sem visita registrada'],
            ['Último pedido', ultimoPedido ? fmtData(ultimoPedido.DATA) : <Dash />, ultimoPedido ? haDias(diasEntre(ultimoPedido.DATA, hoje)) : 'nenhum no período'],
            ['Faturado no período', listaPedidos ? moeda(valorTotal) : <Dash />, `em ${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'}`],
            ['Ticket médio', totalPedidos ? moeda(valorTotal / totalPedidos) : <Dash />, 'por pedido no período'],
          ]} />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Cliente" hint="Sem cliente escolhido, o histórico mostra a carteira exibida inteira." />
          <Toolbar>
            <Field label="Buscar cliente">
              <SearchInput placeholder="Nome, CNPJ ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
            <Field label="Ramo">
              <SelectMenu label="Ramo" value={filtros.ramo} options={[{ value: '', label: 'Todos os ramos' }, ...ramos]} onChange={v => mudar('ramo', v)} />
            </Field>
          </Toolbar>
          {achados.length ? (
            <div className="border-t border-rule-row">
              {achados.map(a => (
                <button
                  key={a.ID}
                  type="button"
                  onClick={() => { setCliente({ id: String(a.ID), nome: a.NOME }); setTextoBusca('') }}
                  className="flex w-full items-center justify-between gap-3 border-b border-rule-row px-4 py-2.5 text-left text-[13px] transition-colors last:border-b-0 hover:bg-secondary"
                >
                  <span className="truncate"><RowTitle>{a.NOME}</RowTitle> <Code prefix="#">{a.ID}</Code></span>
                  <span className="shrink-0 text-[12px] text-ink-secondary">{[a.CIDADE, a.RAMO].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          ) : null}
        </Panel>
      )}

        <Panel>
          <div className="flex flex-col gap-2.5 border-b border-rule-row px-5 pt-4 pb-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-title text-[15px] font-bold text-ink">Linha do tempo</h3>
              {estTempo && estTempo !== 'carregando' ? (
                <span className="text-[12px] text-ink-secondary">{estTempo.total === 1 ? '1 registro' : `${estTempo.total} registros`}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div role="group" aria-label="Tipo de registro" className="flex flex-wrap gap-1.5">
                {TIPOS_HISTORICO.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={filtros.tipo === t.value}
                    onClick={() => mudar('tipo', t.value)}
                    className={cn(
                      'min-h-9 rounded-full border px-3.5 text-[13px] transition-colors',
                      filtros.tipo === t.value ? 'border-ink bg-ink font-semibold text-card' : 'border-rule-table bg-card text-ink hover:bg-secondary',
                    )}
                  >
                    {t.value ? t.label : 'Tudo'}
                  </button>
                ))}
              </div>
              <Periodo de={filtros.de} ate={filtros.ate} hoje={hoje} mudar={mudar} />
            </div>
          </div>
          {estTempo === null ? (
            <PanelBody><Alert tone="error">Não foi possível carregar a linha do tempo.</Alert></PanelBody>
          ) : estTempo === 'carregando' ? (
            <PanelBody><span className="text-[13px] text-ink-secondary" aria-live="polite">Carregando…</span></PanelBody>
          ) : !estTempo.linhas.length ? (
            <EmptyState title="Nada no histórico" hint="Mude o cliente, o tipo ou o período." />
          ) : (
            <div className="px-5 pb-3">
              {porMes(estTempo.linhas).map((g, gi) => (
                <section key={g.mes}>
                  <h4 className="pt-3 pb-0.5 pl-[88px] text-[12px] font-semibold text-ink-secondary">{g.mes}</h4>
                  <ol>
                    {g.itens.map((e, i) => {
                      const texto = String(e.TEXTO ?? '')
                      const pedido = e.TIPO === 'PEDIDO'
                      const link = pedido ? 'Ver detalhes' : e.TIPO === 'MIX' ? 'Ver mix' : e.TIPO === 'VISITA' || texto.length > LIMITE_TEXTO ? 'Ver relato completo' : ''
                      const resumo = pedido ? `${e.ITENS} ${Number(e.ITENS) === 1 ? 'item' : 'itens'}` : texto.length > LIMITE_TEXTO ? `${texto.slice(0, LIMITE_TEXTO)}…` : texto
                      const tipo = rotuloTipoHistorico(e.TIPO)
                      // Título que já diz o tipo ("Visita", "Pedido #…") não repete o tipo ao lado.
                      const extra = [e.TITULO && e.TITULO !== tipo && !pedido ? tipo : '', cliente ? '' : e.CLIENTE].filter(Boolean).join(' · ')
                      return (
                        <li key={`${e.TIPO}-${e.REF_ID}`} className="grid grid-cols-[64px_12px_minmax(0,1fr)] gap-x-3">
                          <div className="flex flex-col gap-0.5 pt-3.5">
                            <span className="font-semibold text-ink tabular-nums">{fmtData(e.DATA).slice(0, 5)}</span>
                            {e.HORA ? <span className="text-[12px] text-ink-secondary tabular-nums">{String(e.HORA).slice(0, 5)}</span> : null}
                          </div>
                          <div aria-hidden className="flex flex-col items-center">
                            <span className={cn('h-[19px] w-px', i === 0 ? 'bg-transparent' : 'bg-rule-table')} />
                            <span className={cn('size-2.5 rounded-full', gi === 0 && i === 0 ? 'bg-primary' : 'bg-ink-muted')} />
                            <span className={cn('w-px flex-1', i === g.itens.length - 1 ? 'bg-transparent' : 'bg-rule-table')} />
                          </div>
                          <div className={cn('flex flex-wrap justify-between gap-x-4 gap-y-1 py-3', i < g.itens.length - 1 && 'border-b border-rule-row')}>
                            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5 text-[13px]">
                              <span>
                                <RowTitle>{e.TITULO || tipo}</RowTitle>
                                {extra ? <span className="text-ink-secondary"> · {extra}</span> : null}
                              </span>
                              {resumo ? <span className="text-ink-secondary">{resumo}</span> : null}
                            </div>
                            {link ? (
                              <span className="flex flex-col items-end gap-0.5 self-start">
                                {pedido ? <span className="text-[13px] font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(e.VALOR)}</span> : null}
                                <TextLink className="text-[13px] whitespace-nowrap" onClick={() => abrirEvento(e)}>{link}</TextLink>
                              </span>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
          {estTempo && estTempo !== 'carregando' ? <Paginas pagina={tempo.pagina} setPagina={tempo.setPagina} total={estTempo.total} unit="registros" /> : null}
        </Panel>

      <Dialog open={!!visita} onOpenChange={a => { if (!a) setVisita(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{visita ? rotuloTipoHistorico(visita.TIPO) : ''}</DialogTitle>
            <DialogDescription>{visita ? `${visita.CLIENTE} · ${fmtData(visita.DATA)}` : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Stack>
              {visita?.TITULO && visita.TIPO !== 'VISITA' ? <RowTitle>{visita.TITULO}</RowTitle> : null}
              {visita?.PLANEJAMENTO ? <div><RowTitle>Planejamento</RowTitle><RowMeta>{visita.PLANEJAMENTO}</RowMeta></div> : null}
              <div><RowTitle>Relato</RowTitle><RowMeta>{visita?.TEXTO || <Dash />}</RowMeta></div>
            </Stack>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Itens titulo={itens?.titulo ?? ''} descricao={itens?.descricao} carregar={itens?.carregar ?? null} fechar={() => setItens(null)} />
      <RegistrarRelato cliente={relato} fechar={() => setRelato(null)} salvo={texto => { setRelato(null); setAviso(texto); setVersao(v => v + 1) }} />
    </Stack>
  )
}
