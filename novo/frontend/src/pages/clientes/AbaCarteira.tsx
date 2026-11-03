// Minha Carteira (RF-001..008, RF-011, RF-016, RF-017). Curva, temperatura,
// indicadores e busca vêm prontos do s360CarteiraCarregar; a tela só filtra,
// pagina e abre os diálogos. Linha compacta: tudo de um cliente em duas
// linhas de texto, ações secundárias no menu ⋯; no celular, cartões.

import { useEffect, useState } from 'react'
import { Bell, CalendarCheck, FileText, History, MessageSquarePlus, Pencil, ShoppingCart, Trash2 } from 'lucide-react'
import { acao, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, moeda } from '@/lib/formato'
import {
  FILTROS_PADRAO, LEGENDA, MSG_REMOVIDO, OPCOES_STATUS, ORDENS, alertaDias, aoMudarFiltro, rotuloStatus,
  rotuloTemperatura, tomStatus, tomTemperatura, ultimaPagina,
} from '@/lib/carteira'
import {
  Actions, Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, EmptyState, Field,
  FilterChip, IconButton, MoreFilters, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput,
  SelectMenu, Stack, Status, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page'
import { ConfirmarRemocao, CurvaManual, DetalheTemperatura, FichaCliente, RegistrarRelato } from './dialogos'
import {
  BarrasRamo, Cartao, Cresce, FaixaIndicadores, GradeResumo, ListaCartoes, MenuAcoes, Recolhivel, SoCelular, SoDesktop,
} from './layout'

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

/** "13 d", em vermelho acima do limite da RN-011; sem data = traço. */
function Dias({ tipo, dias }: { tipo: 'visita' | 'compra'; dias: number | null }) {
  if (dias === null || dias === undefined) return <Dash />
  return alertaDias(tipo, dias) ? <Status tone="alert">{dias} d</Status> : <>{dias} d</>
}

/** Visita e compra numa linha só; com curta, troca as palavras por ícones (cartão do celular). */
function Atividade({ c, curta }: { c: Linha; curta?: boolean }) {
  if (curta) {
    return (
      <>
        <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Dias sem visita">
          <CalendarCheck aria-label="Dias sem visita" className="size-3" /><Dias tipo="visita" dias={c.DIAS_SEM_VISITA} />
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Dias desde a última compra">
          <ShoppingCart aria-label="Dias desde a última compra" className="size-3" /><Dias tipo="compra" dias={c.DIAS_ULTIMA_COMPRA} />
        </span>
      </>
    )
  }
  return (
    <span className="whitespace-nowrap">
      Visita <Dias tipo="visita" dias={c.DIAS_SEM_VISITA} /> · Compra <Dias tipo="compra" dias={c.DIAS_ULTIMA_COMPRA} />
    </span>
  )
}

/** Sino, Queda e cobertura, na mesma linha do código do cliente. */
function Selos({ c }: { c: Linha }) {
  return (
    <>
      {c.ALERTA ? <Status tone="alert"><Bell aria-label="Alerta não lido" className="size-3" />Alerta</Status> : null}
      {c.QUEDA ? <Status tone="attention">Queda</Status> : null}
      {c.COBERTURA ? <Status tone="off">Cobertura</Status> : null}
    </>
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

  const acoesDe = (c: Linha, comHistorico: boolean) => [
    ...(comHistorico ? [{ rotulo: 'Histórico do cliente', icone: <History aria-hidden />, onClick: () => abrirHistorico(c.ID) }] : []),
    { rotulo: 'Ficha do cliente', icone: <FileText aria-hidden />, onClick: () => setFicha(c.ID) },
    { rotulo: 'Registrar contato', icone: <MessageSquarePlus aria-hidden />, onClick: () => setRelato(c) },
    { rotulo: 'Fixar curva', icone: <Pencil aria-hidden />, onClick: () => setCurva(c) },
    ...(c.PODE_REMOVER ? [{ rotulo: 'Remover da carteira', icone: <Trash2 aria-hidden />, onClick: () => setRemover(c), perigo: true }] : []),
  ]

  const ind = dados?.indicadores
  const lista: Linha[] = dados?.linhas ?? []
  const total = Number(dados?.total) || 0
  const nomeStatus = OPCOES_STATUS.find(o => o.value === filtros.status)?.label ?? filtros.status
  const filtrosNaLinha = [filtros.ramo, filtros.status].filter(Boolean).length + (filtros.ordem !== 'RANK_AD' ? 1 : 0)
  const temFiltro = !!(filtros.busca || filtros.ramo || filtros.status || filtros.pendentes || filtros.ordem !== 'RANK_AD')

  const graficoRamo = (
    <BarrasRamo ramos={dados?.ramos ?? []} total={total} ativo={filtros.ramo} escolher={v => mudar('ramo', v)} />
  )
  const seletorRamo = (
    <Field label="Ramo">
      <SelectMenu label="Ramo" value={filtros.ramo} options={[{ value: '', label: 'Todos os ramos' }, ...ramos]} onChange={v => mudar('ramo', v)} />
    </Field>
  )
  const seletorStatus = (
    <Field label="Status">
      <SelectMenu label="Status" value={filtros.status} options={OPCOES_STATUS} onChange={v => mudar('status', v)} />
    </Field>
  )
  const seletorOrdem = (
    <Field label="Ordenar por">
      <SelectMenu label="Ordenar por" value={filtros.ordem} options={ORDENS} onChange={v => mudar('ordem', v)} />
    </Field>
  )

  return (
    <Stack>
      <GradeResumo>
        <FaixaIndicadores itens={[
          { rotulo: 'Clientes', valor: ind ? ind.total : <Dash /> },
          { rotulo: 'Ativos', valor: ind ? ind.ativos : <Dash /> },
          { rotulo: 'Receita do mês', valor: ind ? moeda(ind.receita) : <Dash /> },
          { rotulo: 'Ticket médio', valor: ind?.ticket != null ? moeda(ind.ticket) : <Dash /> },
          { rotulo: 'Temperatura média', valor: ind?.score != null ? `${ind.classe} (${ind.score})` : <Dash /> },
        ]} />
        <SoDesktop>
          <Panel>
            <PanelHeader title="Por ramo · clique para filtrar">
              <TextLink onClick={() => setLegenda(true)}>Legenda</TextLink>
            </PanelHeader>
            <PanelBody>{dados?.ramos?.length ? graficoRamo : <RowMeta>Sem clientes para distribuir.</RowMeta>}</PanelBody>
          </Panel>
        </SoDesktop>
      </GradeResumo>
      <SoCelular>
        <Recolhivel titulo="Distribuição por ramo">
          {graficoRamo}
          <TextLink onClick={() => setLegenda(true)}>Legenda</TextLink>
        </Recolhivel>
      </SoCelular>

      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}

      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Nome, CNPJ, código ou cidade" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <SoDesktop>
            {seletorRamo}
            {seletorStatus}
          </SoDesktop>
          <Button variant={filtros.pendentes ? 'primary' : 'secondary'} aria-pressed={!!filtros.pendentes} onClick={() => mudar('pendentes', filtros.pendentes ? 0 : 1)}>
            Visitas pendentes{ind ? ` · ${ind.pendentes}` : ''}
          </Button>
          <SoDesktop>{seletorOrdem}</SoDesktop>
          <SoCelular>
            <MoreFilters label="Filtros" count={filtrosNaLinha} onClear={() => setFiltros(f => ({ ...aoMudarFiltro(f, 'ramo', ''), status: '', ordem: 'RANK_AD' }))}>
              {seletorRamo}
              {seletorStatus}
              {seletorOrdem}
            </MoreFilters>
          </SoCelular>
        </Toolbar>
        {temFiltro ? (
          <Toolbar>
            {filtros.ramo ? <FilterChip label="Ramo" value={filtros.ramo} onClear={() => mudar('ramo', '')} /> : null}
            {filtros.status ? <FilterChip label="Status" value={nomeStatus} onClear={() => mudar('status', '')} /> : null}
            {filtros.pendentes ? <FilterChip label="Visitas" value="pendentes" onClear={() => mudar('pendentes', 0)} /> : null}
            <TextLink onClick={limpar}>Limpar filtros</TextLink>
          </Toolbar>
        ) : null}

        {falhou ? (
          <PanelBody><Alert tone="error">Não foi possível carregar a carteira. Tente de novo.</Alert></PanelBody>
        ) : !carregando && !lista.length ? (
          <EmptyState
            title={temFiltro ? 'Nenhum cliente neste filtro' : 'Sua carteira está vazia'}
            hint={temFiltro ? 'Mude a busca ou limpe os filtros.' : 'Adicione clientes pela aba Clientes disponíveis.'}
            action={temFiltro ? <Button onClick={limpar}>Limpar filtros</Button> : undefined}
          />
        ) : (
          <>
            <SoDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Curva</Th>
                    <Th>Cliente</Th>
                    <Th>Ramo</Th>
                    <Th>Atividade</Th>
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
                          {c.CURVA_MANUAL ? <Code>manual</Code> : null}
                          <IconButton label={`Fixar curva de ${c.NOME}`} onClick={() => setCurva(c)}><Pencil aria-hidden /></IconButton>
                        </Actions>
                      </Td>
                      <Td>
                        <RowTitle>{c.NOME}</RowTitle>
                        <RowMeta>
                          <Actions>
                            <Code prefix="#">{c.ID}</Code>
                            {c.CIDADE ? <span>{c.CIDADE}{c.UF ? `/${c.UF}` : ''}</span> : null}
                            <Selos c={c} />
                          </Actions>
                        </RowMeta>
                      </Td>
                      <Td>{c.RAMO}</Td>
                      <Td><Atividade c={c} /></Td>
                      <Td>
                        <TextLink onClick={() => setTemperatura(c)}>
                          <Status tone={tomTemperatura(c.TEMPERATURA.classe)}>{rotuloTemperatura(c.TEMPERATURA)}</Status>
                        </TextLink>
                      </Td>
                      <Td><Status tone={tomStatus(c.STATUS)}>{rotuloStatus(c.STATUS)}</Status></Td>
                      <Td>
                        <Actions>
                          <Button size="sm" onClick={() => abrirHistorico(c.ID)}>Histórico</Button>
                          <MenuAcoes label={`Mais ações para ${c.NOME}`} acoes={acoesDe(c, false)} />
                        </Actions>
                      </Td>
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
                    meta={
                      <>
                        <TextLink onClick={() => setTemperatura(c)}>
                          <Status tone={tomTemperatura(c.TEMPERATURA.classe)}>{rotuloTemperatura(c.TEMPERATURA)}</Status>
                        </TextLink>
                        <Atividade c={c} curta />
                        <Selos c={c} />
                      </>
                    }
                    acoes={<MenuAcoes label={`Ações para ${c.NOME}`} acoes={acoesDe(c, true)} />}
                  />
                ))}
              </ListaCartoes>
            </SoCelular>
          </>
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
