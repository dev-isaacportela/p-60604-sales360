// Histórico do Cliente (RF-010, RN-017): linha do tempo e pedidos, cada um
// com a sua página, detalhe de visita, pedido e mix, e as visitas da última
// semana. O seletor de cliente usa a busca inteligente da carteira.

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { acao, linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia, moeda } from '@/lib/formato'
import { TIPOS_HISTORICO, rotuloTipoHistorico, ultimaPagina } from '@/lib/carteira'
import {
  Actions, Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  EmptyState, Field, IconButton, Input, LabelledField, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Stack, Status, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 20
const FILTROS = { ramo: '', tipo: '', de: '', ate: '' }

function seteDiasAntes(hoje: string) {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/** Carrega uma listagem paginada do histórico; `null` = falhou. */
function usePaginado(chave: 'historicoLinhaTempo' | 'historicoPedidos', input: Record<string, string> | null) {
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
  }, [chave, base, pagina])

  return { pagina, setPagina, estado }
}

function Paginas({ pagina, setPagina, total, unit, busy }: { pagina: number; setPagina: (p: number) => void; total: number; unit: string; busy: boolean }) {
  if (!total) return null
  return (
    <Pagination
      page={pagina}
      lastPage={ultimaPagina(total, POR_PAGINA)}
      total={total}
      unit={unit}
      busy={busy}
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

export function AbaHistorico({ escopo, clienteInicial }: { escopo: Record<string, string>; clienteInicial: string }) {
  const hoje = hojeBrasilia()
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(clienteInicial ? { id: clienteInicial, nome: `Cliente ${clienteInicial}` } : null)
  const [textoBusca, setTextoBusca] = useState('')
  const [achados, setAchados] = useState<Linha[]>([])
  const [filtros, setFiltros] = useState(FILTROS)
  const [ramos, setRamos] = useState<{ value: string; label: string }[]>([])
  const [semana, setSemana] = useState<Linha[] | null>(null)
  const [visita, setVisita] = useState<Linha | null>(null)
  const [itens, setItens] = useState<{ titulo: string; descricao?: string; carregar: () => Promise<Linha[]> } | null>(null)

  useEffect(() => {
    linhas('clientesRamos')
      .then(rs => setRamos(rs.map(r => ({ value: String(r.RAMO), label: String(r.RAMO) }))))
      .catch(falha => console.error('s360ClientesRamos', falha))
    linhas('historicoVisitasSemana', { desde: seteDiasAntes(hoje), hoje })
      .then(setSemana)
      .catch(falha => console.error('s360HistoricoVisitasSemana', falha))
  }, [hoje])

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

  const input = { ...escopo, clienteId: cliente?.id ?? '', ramo: filtros.ramo, de: filtros.de, ate: filtros.ate }
  const tempo = usePaginado('historicoLinhaTempo', { ...input, tipo: filtros.tipo })
  const pedidos = usePaginado('historicoPedidos', input)

  // O nome do cliente que veio pelo endereço chega na primeira linha.
  const primeira = tempo.estado && tempo.estado !== 'carregando' ? tempo.estado.linhas[0] : null
  useEffect(() => {
    if (cliente && primeira?.CLIENTE && cliente.nome.startsWith('Cliente ') && String(primeira.CLIENTE_ID) === cliente.id) {
      setCliente({ id: cliente.id, nome: primeira.CLIENTE })
    }
  }, [primeira, cliente])

  const mudar = (campo: keyof typeof FILTROS, valor: string) => setFiltros(f => ({ ...f, [campo]: valor }))

  function abrirPedido(p: Linha) {
    setItens({
      titulo: `Pedido ${p.NUMPED}`,
      descricao: `${p.CLIENTE} · ${fmtData(p.DATA)}. Desconto não informado pelo ERP.`,
      carregar: () => linhas('historicoPedidoItens', { ...escopo, clienteId: String(p.CLIENTE_ID), numped: String(p.NUMPED) }),
    })
  }

  function abrirEvento(e: Linha) {
    if (e.TIPO === 'MIX') {
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

  return (
    <Stack>
      <Panel>
        <PanelHeader title="Cliente" hint="Sem cliente escolhido, o histórico mostra a carteira exibida inteira." />
        <Toolbar>
          {cliente ? (
            <Actions>
              <RowTitle>{cliente.nome}</RowTitle>
              <Code prefix="#">{cliente.id}</Code>
              <IconButton label="Trocar cliente" onClick={() => setCliente(null)}><X aria-hidden /></IconButton>
            </Actions>
          ) : (
            <Field label="Buscar cliente">
              <SearchInput placeholder="Nome, CNPJ ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          )}
        </Toolbar>
        {!cliente && achados.length ? (
          <PanelBody>
            {achados.map(a => (
              <TextLink key={a.ID} onClick={() => { setCliente({ id: String(a.ID), nome: a.NOME }); setTextoBusca('') }}>
                {a.NOME} <Code prefix="#">{a.ID}</Code>
              </TextLink>
            ))}
          </PanelBody>
        ) : null}
        <Toolbar>
          <Field label="Ramo">
            <SelectMenu label="Ramo" value={filtros.ramo} options={[{ value: '', label: 'Todos os ramos' }, ...ramos]} onChange={v => mudar('ramo', v)} />
          </Field>
          <Field label="Tipo">
            <SelectMenu label="Tipo" value={filtros.tipo} options={TIPOS_HISTORICO} onChange={v => mudar('tipo', v)} />
          </Field>
          <LabelledField label="De">
            <Input type="date" value={filtros.de} max={filtros.ate || hoje} onChange={e => mudar('de', e.target.value)} />
          </LabelledField>
          <LabelledField label="Até">
            <Input type="date" value={filtros.ate} min={filtros.de} max={hoje} onChange={e => mudar('ate', e.target.value)} />
          </LabelledField>
          {filtros.ramo || filtros.tipo || filtros.de || filtros.ate ? <Button onClick={() => setFiltros(FILTROS)}>Limpar filtros</Button> : null}
        </Toolbar>
      </Panel>

      <Panel>
        <PanelHeader title="Linha do tempo" hint="Visitas e atividades concluídas, relatos avulsos e mixes enviados." />
        {estTempo === null ? (
          <PanelBody><Alert tone="error">Não foi possível carregar a linha do tempo.</Alert></PanelBody>
        ) : estTempo !== 'carregando' && !estTempo.linhas.length ? (
          <EmptyState title="Nada no histórico" hint="Mude o cliente, o tipo ou o período." />
        ) : estTempo !== 'carregando' ? (
          <Table>
            <thead><tr><Th>Data</Th><Th>Tipo</Th><Th>Cliente</Th><Th>Registro</Th></tr></thead>
            <tbody>
              {estTempo.linhas.map(e => (
                <Tr key={`${e.TIPO}-${e.REF_ID}`}>
                  <Td>{fmtData(e.DATA)}{e.HORA ? <RowMeta>{String(e.HORA).slice(0, 5)}</RowMeta> : null}</Td>
                  <Td>{rotuloTipoHistorico(e.TIPO)}</Td>
                  <Td>{e.CLIENTE}</Td>
                  <Td>
                    <TextLink onClick={() => abrirEvento(e)}>{e.TITULO || rotuloTipoHistorico(e.TIPO)}</TextLink>
                    {e.TEXTO ? <RowMeta>{String(e.TEXTO).slice(0, 140)}</RowMeta> : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {estTempo && estTempo !== 'carregando' ? (
          <Paginas pagina={tempo.pagina} setPagina={tempo.setPagina} total={estTempo.total} unit="registros" busy={false} />
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Pedidos faturados" />
        {estPedidos === null ? (
          <PanelBody><Alert tone="error">Não foi possível carregar os pedidos.</Alert></PanelBody>
        ) : estPedidos !== 'carregando' && !estPedidos.linhas.length ? (
          <EmptyState title="Nenhum pedido no período" />
        ) : estPedidos !== 'carregando' ? (
          <Table>
            <thead><tr><Th>Pedido</Th><Th>Data</Th><Th>Cliente</Th><Th numeric>Itens</Th><Th numeric>Valor</Th></tr></thead>
            <tbody>
              {estPedidos.linhas.map(p => (
                <Tr key={`${p.NUMPED}-${p.CLIENTE_ID}`}>
                  <Td><TextLink onClick={() => abrirPedido(p)}>{p.NUMPED}</TextLink></Td>
                  <Td>{fmtData(p.DATA)}</Td>
                  <Td>{p.CLIENTE}</Td>
                  <Td numeric>{p.ITENS}</Td>
                  <Td numeric>{moeda(p.VALOR)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {estPedidos && estPedidos !== 'carregando' ? (
          <Paginas pagina={pedidos.pagina} setPagina={pedidos.setPagina} total={estPedidos.total} unit="pedidos" busy={false} />
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Suas visitas da última semana" />
        {semana && semana.length ? (
          <Table>
            <thead><tr><Th>Data</Th><Th>Cliente</Th><Th>Relato</Th></tr></thead>
            <tbody>
              {semana.map(v => (
                <Tr key={v.ID}>
                  <Td>{fmtData(v.DATA)}</Td>
                  <Td>{v.CLIENTE}</Td>
                  <Td>{Number(v.RELATO_OK) === 1 ? <Status tone="live">Registrado</Status> : <Status tone="attention">Pendente</Status>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma visita nos últimos 7 dias" />
        )}
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
    </Stack>
  )
}
