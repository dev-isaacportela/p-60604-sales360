// Minha Carteira (RF-001..008, RF-011, RF-012, RF-016, RF-017). Curva,
// temperatura, indicadores e busca vêm prontos do s360CarteiraCarregar; a
// tela só filtra, pagina e abre os diálogos.

import { useEffect, useState } from 'react'
import { Bell, FileText, History, MessageSquarePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { acao, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, moeda } from '@/lib/formato'
import {
  FILTROS_PADRAO, LEGENDA, MSG_REMOVIDO, OPCOES_STATUS, ORDENS, alertaDias, aoMudarFiltro, rotuloStatus,
  rotuloTemperatura, tomStatus, tomTemperatura, ultimaPagina,
} from '@/lib/carteira'
import {
  Actions, Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, EmptyState, Field,
  IconButton, InfoGrid, InfoTile, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu,
  Stack, Status, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page'
import { ConfirmarRemocao, CurvaManual, DetalheTemperatura, FichaCliente, NovoProspect, RegistrarRelato } from './dialogos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 10

/** Recalcula os titulares do cliente depois de entrar ou sair da carteira (RN-003). */
export async function recalcularTitulares(clienteId: number) {
  try {
    await acao('titularesLimpar', { clienteId: String(clienteId) })
    await acao('titularesInserir', { clienteId: String(clienteId), agora: agoraBrasilia() })
  } catch (falha) {
    // A rotina diária refaz o cálculo; a ação do usuário já foi gravada.
    console.error('s360Titulares (recálculo)', falha)
  }
}

function Dias({ tipo, dias }: { tipo: 'visita' | 'compra'; dias: number | null }) {
  if (dias === null || dias === undefined) return <Dash />
  const texto = `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  return alertaDias(tipo, dias) ? <Status tone="alert">{texto}</Status> : <>{texto}</>
}

/* RF-017: soma das barras = total da carteira filtrada. */
function BarrasRamo({ ramos, total }: { ramos: { ramo: string; n: number }[]; total: number }) {
  if (!ramos.length) return null
  return (
    <ul className="flex flex-col gap-2">
      {ramos.map(r => (
        <li key={r.ramo} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-[12px]">
          <span className="truncate text-ink-secondary">{r.ramo}</span>
          <span className="h-2 rounded-full bg-muted">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} />
          </span>
          <span className="text-right font-semibold text-ink">{r.n}</span>
        </li>
      ))}
    </ul>
  )
}

export function AbaCarteira({ escopo, buscaInicial, aoTotal, abrirHistorico }: {
  escopo: Record<string, string>
  buscaInicial: string
  aoTotal: (n: number) => void
  abrirHistorico: (clienteId: number) => void
}) {
  const [filtros, setFiltros] = useState({ ...FILTROS_PADRAO, busca: buscaInicial })
  const [textoBusca, setTextoBusca] = useState(buscaInicial)
  const [ramos, setRamos] = useState<{ value: string; label: string }[]>([])
  const [dados, setDados] = useState<Linha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [recarga, setRecarga] = useState(0)

  const [temperatura, setTemperatura] = useState<Linha | null>(null)
  const [ficha, setFicha] = useState<number | null>(null)
  const [curva, setCurva] = useState<Linha | null>(null)
  const [remover, setRemover] = useState<Linha | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [relato, setRelato] = useState<Linha | null>(null)
  const [prospect, setProspect] = useState(false)
  const [legenda, setLegenda] = useState(false)

  useEffect(() => {
    linhas('clientesRamos')
      .then(rs => setRamos(rs.map(r => ({ value: String(r.RAMO), label: String(r.RAMO) }))))
      .catch(falha => console.error('s360ClientesRamos', falha))
  }, [])

  // Busca espera 400 ms parada (plan, Fluxo 2).
  useEffect(() => {
    if (textoBusca === filtros.busca) return
    const t = setTimeout(() => setFiltros(f => aoMudarFiltro(f, 'busca', textoBusca)), 400)
    return () => clearTimeout(t)
  }, [textoBusca, filtros.busca])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    acao('carteiraCarregar', {
      ...escopo,
      busca: filtros.busca, ramo: filtros.ramo, status: filtros.status, ordem: filtros.ordem,
      pendentes: String(filtros.pendentes), pagina: String(filtros.pagina), porPagina: String(POR_PAGINA),
    })
      .then(r => {
        if (!vivo) return
        if (r.ok === false) throw new Error(r.error)
        setDados(r)
        setFalhou(false)
        // O número da aba é a carteira do escopo, sem os filtros da lista.
        if (!filtros.busca && !filtros.ramo && !filtros.status && !filtros.pendentes) aoTotal(Number(r.total) || 0)
      })
      .catch(falha => {
        console.error('s360CarteiraCarregar', falha)
        if (vivo) setFalhou(true)
      })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [escopo, filtros, recarga, aoTotal])

  // Mudou o escopo: a lista volta à página 1.
  useEffect(() => { setFiltros(f => (f.pagina === 1 ? f : { ...f, pagina: 1 })) }, [escopo])

  const mudar = <K extends keyof typeof FILTROS_PADRAO>(campo: K, valor: (typeof FILTROS_PADRAO)[K]) =>
    setFiltros(f => aoMudarFiltro(f, campo, valor))

  function limpar() {
    setTextoBusca('')
    setFiltros(FILTROS_PADRAO)
  }

  function concluido(texto: string) {
    setCurva(null)
    setRelato(null)
    setProspect(false)
    setAviso({ tom: 'success', texto })
    setRecarga(n => n + 1)
  }

  async function confirmarRemocao() {
    if (!remover) return
    setRemovendo(true)
    try {
      const n = linhasAfetadas(await acao('carteiraRemover', { clienteId: String(remover.ID) }))
      if (n < 1) throw new Error('s360CarteiraRemover: 0 linhas')
      await recalcularTitulares(remover.ID)
      setRemover(null)
      concluido(MSG_REMOVIDO)
    } catch (falha) {
      console.error('s360CarteiraRemover', falha)
      setRemover(null)
      setAviso({ tom: 'error', texto: 'Não foi possível remover o cliente da sua carteira.' })
    } finally {
      setRemovendo(false)
    }
  }

  const ind = dados?.indicadores
  const lista: Linha[] = dados?.linhas ?? []
  const total = Number(dados?.total) || 0
  const temFiltro = !!(filtros.busca || filtros.ramo || filtros.status || filtros.pendentes || filtros.ordem !== 'RANK_AD')

  return (
    <Stack>
      <InfoGrid>
        <InfoTile label="Clientes">{ind ? ind.total : <Dash />}</InfoTile>
        <InfoTile label="Ativos">{ind ? ind.ativos : <Dash />}</InfoTile>
        <InfoTile label="Receita do mês">{ind ? moeda(ind.receita) : <Dash />}</InfoTile>
        <InfoTile label="Ticket médio">{ind?.ticket != null ? moeda(ind.ticket) : <Dash />}</InfoTile>
        <InfoTile label="Temperatura média">{ind?.score != null ? `${ind.classe} (${ind.score})` : <Dash />}</InfoTile>
      </InfoGrid>

      <Panel>
        <PanelHeader title="Distribuição por ramo de segmento">
          <TextLink onClick={() => setLegenda(true)}>Legenda</TextLink>
        </PanelHeader>
        <PanelBody>
          <BarrasRamo ramos={dados?.ramos ?? []} total={total} />
          {!dados?.ramos?.length ? <RowMeta>Sem clientes para distribuir.</RowMeta> : null}
        </PanelBody>
      </Panel>

      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}

      <Panel>
        <PanelHeader title="Minha carteira" hint={`${total.toLocaleString('pt-BR')} clientes no filtro`}>
          <Button variant={filtros.pendentes ? 'primary' : 'secondary'} onClick={() => mudar('pendentes', filtros.pendentes ? 0 : 1)}>
            Visitas pendentes{ind ? ` (${ind.pendentes})` : ''}
          </Button>
          <Button variant="primary" onClick={() => setProspect(true)}><Plus aria-hidden />Novo cliente prospecto</Button>
        </PanelHeader>
        <Toolbar>
          <Field label="Buscar">
            <SearchInput placeholder="Nome, CNPJ, código ou cidade" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
          </Field>
          <Field label="Ramo">
            <SelectMenu label="Ramo" value={filtros.ramo} options={[{ value: '', label: 'Todos os ramos' }, ...ramos]} onChange={v => mudar('ramo', v)} />
          </Field>
          <Field label="Status">
            <SelectMenu label="Status" value={filtros.status} options={OPCOES_STATUS} onChange={v => mudar('status', v)} />
          </Field>
          <Field label="Ordenar por">
            <SelectMenu label="Ordenar por" value={filtros.ordem} options={ORDENS} onChange={v => mudar('ordem', v)} />
          </Field>
          {temFiltro ? <Button onClick={limpar}>Limpar filtros</Button> : null}
        </Toolbar>

        {falhou ? (
          <PanelBody><Alert tone="error">Não foi possível carregar a carteira. Tente de novo.</Alert></PanelBody>
        ) : !carregando && !lista.length ? (
          <EmptyState
            title={temFiltro ? 'Nenhum cliente neste filtro' : 'Sua carteira está vazia'}
            hint={temFiltro ? 'Mude a busca ou limpe os filtros.' : 'Adicione clientes pela aba Clientes disponíveis.'}
            action={temFiltro ? <Button onClick={limpar}>Limpar filtros</Button> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Curva</Th>
                <Th>Cliente</Th>
                <Th>Ramo</Th>
                <Th>Sem visita</Th>
                <Th>Última compra</Th>
                <Th>Temperatura</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map(c => (
                <Tr key={c.ID}>
                  <Td>
                    <Actions>
                      <RowTitle>{c.CURVA}</RowTitle>
                      <IconButton label={`Fixar curva de ${c.NOME}`} onClick={() => setCurva(c)}><Pencil aria-hidden /></IconButton>
                    </Actions>
                    {c.CURVA_MANUAL ? <RowMeta>manual</RowMeta> : null}
                  </Td>
                  <Td>
                    <RowTitle>{c.NOME}</RowTitle>
                    <RowMeta>
                      <Code prefix="#">{c.ID}</Code>
                      {c.CIDADE ? ` · ${c.CIDADE}${c.UF ? `/${c.UF}` : ''}` : ''}
                    </RowMeta>
                    <Actions>
                      {c.ALERTA ? <Status tone="alert"><Bell aria-label="Alerta não lido" className="size-3" />Alerta</Status> : null}
                      {c.QUEDA ? <Status tone="attention">Queda</Status> : null}
                      {c.COBERTURA ? <Status tone="off">Cobertura de férias</Status> : null}
                    </Actions>
                  </Td>
                  <Td>{c.RAMO}</Td>
                  <Td><Dias tipo="visita" dias={c.DIAS_SEM_VISITA} /></Td>
                  <Td><Dias tipo="compra" dias={c.DIAS_ULTIMA_COMPRA} /></Td>
                  <Td>
                    <TextLink onClick={() => setTemperatura(c)}>
                      <Status tone={tomTemperatura(c.TEMPERATURA.classe)}>{rotuloTemperatura(c.TEMPERATURA)}</Status>
                    </TextLink>
                  </Td>
                  <Td><Status tone={tomStatus(c.STATUS)}>{rotuloStatus(c.STATUS)}</Status></Td>
                  <Td>
                    <Actions>
                      <IconButton label="Ficha do cliente" onClick={() => setFicha(c.ID)}><FileText aria-hidden /></IconButton>
                      <IconButton label="Histórico do cliente" onClick={() => abrirHistorico(c.ID)}><History aria-hidden /></IconButton>
                      <IconButton label="Registrar contato" onClick={() => setRelato(c)}><MessageSquarePlus aria-hidden /></IconButton>
                      {c.PODE_REMOVER ? (
                        <IconButton label="Remover da carteira" tone="danger" onClick={() => setRemover(c)}><Trash2 aria-hidden /></IconButton>
                      ) : null}
                    </Actions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {total > 0 ? (
          <Pagination
            page={filtros.pagina}
            lastPage={ultimaPagina(total, POR_PAGINA)}
            total={total}
            unit="clientes"
            busy={carregando}
            onPrevious={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}
            onNext={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}
          />
        ) : null}
      </Panel>

      <DetalheTemperatura cliente={temperatura} fechar={() => setTemperatura(null)} />
      <FichaCliente clienteId={ficha} escopo={escopo} fechar={() => setFicha(null)} />
      <CurvaManual cliente={curva} fechar={() => setCurva(null)} salvo={concluido} />
      <ConfirmarRemocao cliente={remover} fechar={() => setRemover(null)} confirmar={confirmarRemocao} removendo={removendo} />
      <RegistrarRelato cliente={relato} fechar={() => setRelato(null)} salvo={concluido} />
      <NovoProspect aberto={prospect} fechar={() => setProspect(false)} salvo={concluido} />

      <Dialog open={legenda} onOpenChange={setLegenda}>
        <DialogContent>
          <DialogHeader><DialogTitle>Legenda</DialogTitle></DialogHeader>
          <DialogBody>
            <Stack>
              {LEGENDA.map(l => (
                <div key={l.titulo}>
                  <RowTitle>{l.titulo}</RowTitle>
                  <RowMeta>{l.texto}</RowMeta>
                </div>
              ))}
            </Stack>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}
