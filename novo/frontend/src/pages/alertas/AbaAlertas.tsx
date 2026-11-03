// Aba Alertas (RF-002…008): painel (pendentes, ramos, oportunidades) +
// lista paginada agrupada por cliente; filtros no endereço da página (RN-010).
// Abre com 3 consultas (escopo, painel, lista); gráfico e sugestões só ao
// expandir (RNF-003). Depois de marcar, o menu relê o contador (C-008).

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChartColumn, Check, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, moeda } from '@/lib/formato'
import { avisarContadores } from '@/lib/contadores'
import {
  COM_HISTORICO, DICA_SO_DONO, PRIORIDADES, SITUACOES, TIPOS, agruparPorCliente, filtrosDaUrl, mensagemMarcar, mudarFiltro,
  oportunidades, paraEntrada, ramos, rotuloTipo, urlDosFiltros,
} from '@/lib/alertas'
import type { FiltrosAlertas } from '@/lib/alertas'
import {
  Alert, Button, Code, Dash, EmptyState, Field, FilterChip, Input, MoreFilters, Pagination, Panel, PanelBody, PanelHeader,
  RowMeta, SearchInput, SelectMenu, Stack, Status, TextLink, Toolbar,
} from '@/components/page'
import { cn } from '@/lib/utils'
import { gravar, useBloco } from '@/components/use-bloco'
import { BlocoFalhou } from '@/components/Confirmacao'
import { Cresce, MenuAcoes, SoCelular, SoDesktop } from '../clientes/layout'
import type { AcaoMenu } from '../clientes/layout'
import { Historico } from './Historico'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 50
/** Faixa à esquerda do alerta: só a prioridade alta ganha cor. */
const BARRA_PRIORIDADE: Record<string, string> = { ALTA: 'bg-destructive', MEDIA: 'bg-ink-muted/60', BAIXA: 'bg-ink-muted/25' }
const TODOS = { value: '', label: 'Todos' }

export function AbaAlertas({ escopo }: { escopo: Record<string, string> }) {
  const local = useLocation()
  const navegar = useNavigate()
  const filtros = useMemo(() => filtrosDaUrl(local.search), [local.search])
  const [textoBusca, setTextoBusca] = useState(filtros.busca)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [todasOportunidades, setTodasOportunidades] = useState(false)
  const [abertos, setAbertos] = useState<Record<number, boolean>>({})
  const [expandido, setExpandido] = useState<number | null>(null)
  const [marcando, setMarcando] = useState(false)

  const aplicar = (f: FiltrosAlertas) => navegar({ search: urlDosFiltros(f) }, { replace: true })
  const mudar = (campo: keyof FiltrosAlertas, valor: string) => aplicar(mudarFiltro(filtros, campo, valor))

  // Busca: 400 ms parada.
  useEffect(() => {
    if (textoBusca === filtros.busca) return
    const t = setTimeout(() => aplicar(mudarFiltro(filtros, 'busca', textoBusca)), 400)
    return () => clearTimeout(t)
  }, [textoBusca]) // eslint-disable-line react-hooks/exhaustive-deps

  const painel = useBloco(() => linhas('alertasPainel', escopo), [escopo, recarga])
  const lista = useBloco(() => linhas('alertasListar', { ...escopo, ...paraEntrada(filtros) }), [escopo, filtros, recarga])
  const resumo = painel.dados?.find(l => l.TIPO_LINHA === 'RESUMO')
  const linhasLista = lista.dados ?? []
  const total = Number(linhasLista[0]?.TOTAL) || 0
  const potencial = Number(linhasLista[0]?.POTENCIAL) || 0
  const grupos = agruparPorCliente(linhasLista)
  const marcaveis = Number(resumo?.MARCAVEIS) || 0
  const temFiltro = !!(filtros.busca || filtros.ramo || filtros.tipo || filtros.valorMin || filtros.clienteId || filtros.produto || filtros.situacao !== 'NAO_LIDOS')

  function feito(n: number, podeMarcar: boolean, todos = false) {
    setAviso(mensagemMarcar(n, { podeMarcar, todos }))
    if (n > 0) {
      setRecarga(r => r + 1)
      avisarContadores()
    }
  }

  async function marcar(a: Linha) {
    setAviso(null)
    try {
      feito(await gravar('alertaMarcarLido', { id: String(a.ID) }), Number(a.PODE_MARCAR) === 1)
    } catch (falha) {
      console.error('s360AlertaMarcarLido', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível marcar o alerta. Tente de novo.' })
    }
  }

  async function marcarTodos() {
    setAviso(null)
    setMarcando(true)
    try {
      feito(await gravar('alertasMarcarTodos', { filial: escopo.filial, depto: escopo.depto, secao: escopo.secao }), true, true)
    } catch (falha) {
      console.error('s360AlertasMarcarTodos', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível marcar os alertas. Tente de novo.' })
    } finally {
      setMarcando(false)
    }
  }

  const ops = oportunidades(painel.dados ?? [], todasOportunidades)
  const maiorOp = Math.max(0, ...ops.map(o => o.potencial))
  const opcoesRamo = [TODOS, ...ramos(painel.dados ?? []).map(r => ({ value: r, label: r }))]
  const seletores = (
    <>
      <Field label="Ramo" className="w-44"><SelectMenu label="Ramo" value={filtros.ramo} options={opcoesRamo} onChange={v => mudar('ramo', v)} /></Field>
      <Field label="Tipo" className="w-44"><SelectMenu label="Tipo" value={filtros.tipo} options={[TODOS, ...TIPOS]} onChange={v => mudar('tipo', v)} /></Field>
      <Field label="Valor mínimo (R$)" className="w-36">
        <Input inputMode="decimal" placeholder="0,00" defaultValue={filtros.valorMin} key={filtros.valorMin}
          onBlur={e => { if (e.target.value !== filtros.valorMin) mudar('valorMin', e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') mudar('valorMin', (e.target as HTMLInputElement).value) }} />
      </Field>
      <Field label="Situação" className="w-36"><SelectMenu label="Situação" value={filtros.situacao} options={SITUACOES} onChange={v => mudar('situacao', v)} /></Field>
    </>
  )

  return (
    <Stack>
      <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule-table bg-rule-row sm:grid-cols-3">
        {[
          ['Alertas pendentes', resumo ? Number(resumo.PENDENTES).toLocaleString('pt-BR') : null, 'não lidos no escopo'],
          ['Potencial no filtro', lista.dados ? moeda(potencial) : null, 'soma do valor dos alertas listados'],
          ['Alertas no filtro', lista.dados ? total.toLocaleString('pt-BR') : null, lista.dados ? `${grupos.length} ${grupos.length === 1 ? 'cliente' : 'clientes'} nesta página` : ''],
        ].map(([rotulo, valor, nota]) => (
          <div key={rotulo} className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
            <span className="text-[12px] text-ink-secondary">{rotulo}</span>
            <span className="truncate font-title text-[24px] leading-tight font-bold text-ink tabular-nums">{valor ?? <Dash />}</span>
            <span className="truncate text-[12px] text-ink-secondary">{nota}</span>
          </div>
        ))}
      </section>

      {ops.length ? (
        <Panel>
          <PanelHeader title="Oportunidades e Vendas Perdidas" hint="Produtos com mais avisos de Produto Perdido e Não Explorado, por potencial.">
            <TextLink onClick={() => setTodasOportunidades(t => !t)}>{todasOportunidades ? 'Ver só as 3 maiores' : 'Ver todas'}</TextLink>
          </PanelHeader>
          <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {ops.map(o => {
              const ativo = filtros.produto === o.produto
              return (
                <li key={o.produto}>
                  <button type="button" aria-pressed={ativo} onClick={() => aplicar({ ...mudarFiltro(filtros, 'produto', ativo ? '' : o.produto), situacao: 'NAO_LIDOS' })}
                    className={cn('flex h-full w-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors', ativo ? 'border-primary bg-accent' : 'border-rule-table hover:bg-accent/60')}>
                    <span className="truncate text-[13px] font-semibold text-ink" title={o.produto}>{o.produto}</span>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-title text-[18px] font-bold text-ink tabular-nums">{moeda(o.potencial)}</span>
                      <span className="text-[12px] text-ink-secondary">{o.n} {o.n === 1 ? 'aviso' : 'avisos'}</span>
                    </span>
                    <span className="block h-1.5 rounded-full bg-muted" aria-hidden>
                      <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${maiorOp > 0 ? (o.potencial / maiorOp) * 100 : 0}%` }} />
                    </span>
                    <span className="text-[12px] font-semibold text-primary">{ativo ? 'Filtrando a lista · clique para tirar' : 'Ver alertas deste produto'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      ) : null}

      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}

      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Cliente, fantasia, CNPJ ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <SoDesktop>{seletores}</SoDesktop>
          <SoCelular>
            <MoreFilters label="Filtros" count={[filtros.ramo, filtros.tipo, filtros.valorMin].filter(Boolean).length} onClear={() => aplicar({ ...filtros, ramo: '', tipo: '', valorMin: '', pagina: 1 })}>
              {seletores}
            </MoreFilters>
          </SoCelular>
          <span title={marcaveis ? undefined : DICA_SO_DONO}>
            <Button onClick={marcarTodos} disabled={!marcaveis || marcando}><CheckCheck aria-hidden />Marcar tudo como lido</Button>
          </span>
        </Toolbar>
        {temFiltro ? (
          <Toolbar>
            {filtros.clienteId ? <FilterChip label="Cliente" value={grupos[0]?.nome ?? filtros.clienteId} onClear={() => mudar('clienteId', '')} /> : null}
            {filtros.produto ? <FilterChip label="Produto" value={filtros.produto} onClear={() => mudar('produto', '')} /> : null}
            {filtros.ramo ? <FilterChip label="Ramo" value={filtros.ramo} onClear={() => mudar('ramo', '')} /> : null}
            {filtros.tipo ? <FilterChip label="Tipo" value={rotuloTipo(filtros.tipo)} onClear={() => mudar('tipo', '')} /> : null}
            <TextLink onClick={() => { setTextoBusca(''); aplicar({ ...filtrosDaUrl(''), pagina: 1 }) }}>Limpar filtros</TextLink>
          </Toolbar>
        ) : null}

        {lista.erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : lista.dados && !grupos.length ? (
          <EmptyState
            title={temFiltro ? 'Nenhum alerta neste filtro' : 'Nenhum alerta pendente'}
            hint={temFiltro ? 'Mude a busca ou limpe os filtros.' : 'Os alertas novos chegam pela rotina diária, das 6h às 20h.'}
          />
        ) : (
          <ul>
            {grupos.map(g => {
              const aberto = abertos[g.id] ?? (g.aberto || !!filtros.clienteId)
              return (
                <li key={g.id} className="border-b border-rule-row last:border-b-0">
                  <div className="flex items-center gap-x-3 bg-secondary/60 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-title text-[14px] font-bold text-ink">{g.nome}</p>
                      <RowMeta><span className="block truncate"><Code prefix="#">{g.id}</Code> · {g.n} {g.n === 1 ? 'alerta' : 'alertas'}</span></RowMeta>
                    </div>
                    <span className={cn('hidden shrink-0 text-right text-[13px] tabular-nums sm:block', g.potencial > 0 ? 'font-semibold text-ink' : 'text-ink-muted')}>
                      {g.potencial > 0 ? <>{moeda(g.potencial)}<span className="block text-[11px] font-normal text-ink-secondary">potencial</span></> : 'sem valor'}
                    </span>
                    <div className="flex shrink-0 items-center justify-end gap-2 sm:w-[19rem]">
                      {!aberto ? (
                        <Button size="sm" onClick={() => (g.n > g.alertas.length ? mudar('clienteId', String(g.id)) : setAbertos(a => ({ ...a, [g.id]: true })))}>
                          Ver alertas ({g.n})
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" asChild><Link to={`/clientes?clienteId=${g.id}`}>Cliente</Link></Button>
                    </div>
                  </div>
                  {aberto ? (
                    <ul>
                      {g.alertas.map(a => (
                        <LinhaAlerta key={a.ID} a={a} equipe={escopo.modo !== 'ME'} expandido={expandido === a.ID}
                          alternar={() => setExpandido(e => (e === a.ID ? null : a.ID))} marcar={() => marcar(a)} escopo={escopo} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        {total > 0 ? (
          <Pagination
            page={filtros.pagina}
            lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
            total={total}
            unit="alertas"
            busy={!lista.dados}
            onPrevious={() => aplicar({ ...filtros, pagina: filtros.pagina - 1 })}
            onNext={() => aplicar({ ...filtros, pagina: filtros.pagina + 1 })}
          />
        ) : null}
      </Panel>
    </Stack>
  )
}

function LinhaAlerta({ a, equipe, expandido, alternar, marcar, escopo }: {
  a: Linha; equipe: boolean; expandido: boolean; alternar: () => void; marcar: () => void; escopo: Record<string, string>
}) {
  const prioridade = PRIORIDADES[a.PRIORIDADE] ?? PRIORIDADES.MEDIA
  const historico = COM_HISTORICO.has(a.TIPO_ALERTA)
  const lido = Number(a.LIDO) === 1
  const podeMarcar = !lido && Number(a.PODE_MARCAR) === 1
  const acoes: AcaoMenu[] = [
    ...(historico ? [{ rotulo: expandido ? 'Ocultar gráfico' : 'Ver padrão histórico', icone: <ChartColumn aria-hidden />, onClick: alternar }] : []),
    ...(podeMarcar ? [{ rotulo: 'Marcar como lido', icone: <Check aria-hidden />, onClick: marcar }] : []),
  ]
  return (
    <li className={cn('border-t border-rule-row px-4 py-2.5', lido && 'opacity-70')}>
      <div className="flex items-center gap-x-3">
        <span aria-hidden className={cn('w-1 self-stretch rounded-full', BARRA_PRIORIDADE[a.PRIORIDADE] ?? BARRA_PRIORIDADE.MEDIA)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink" title={a.TITULO}>{a.TITULO}</p>
          <p className="flex items-center gap-x-2 overflow-hidden text-[12px] whitespace-nowrap text-ink-secondary" title={a.ESCOPO}>
            <Status tone={prioridade.tom}>{prioridade.rotulo}</Status>
            <span>{rotuloTipo(a.TIPO_ALERTA)}</span>
            <span aria-hidden>·</span>
            <span>{fmtData(a.DATA_GERACAO)}</span>
            {equipe && a.VENDEDOR ? <><span aria-hidden className="hidden sm:inline">·</span><span className="hidden sm:inline">{a.VENDEDOR}</span></> : null}
            {lido ? <Status tone="off">Lido</Status> : null}
          </p>
        </div>
        <span className={cn('shrink-0 text-right text-[13px] tabular-nums', Number(a.VALOR) > 0 ? 'font-semibold text-ink' : 'text-ink-muted')}>
          {Number(a.VALOR) > 0 ? moeda(a.VALOR) : 'sem valor'}
        </span>
        <SoDesktop>
          <div className="flex w-[19rem] shrink-0 items-center justify-end gap-2">
            {historico ? (
              <Button size="sm" variant="ghost" aria-expanded={expandido} onClick={alternar}>
                {expandido ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}{expandido ? 'Ocultar gráfico' : 'Ver padrão histórico'}
              </Button>
            ) : null}
            {podeMarcar ? <Button size="sm" onClick={marcar}>Marcar como lido</Button> : null}
          </div>
        </SoDesktop>
        {acoes.length ? <SoCelular><MenuAcoes label={`Ações do alerta ${a.TITULO}`} acoes={acoes} /></SoCelular> : null}
      </div>
      {expandido ? <Historico alerta={a} escopo={escopo} /> : null}
    </li>
  )
}
