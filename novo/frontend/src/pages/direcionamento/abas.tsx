// Abas do Direcionamento (RN-026…029). Cada uma tem a sua consulta e o seu
// botão Exportar; as regras de resumo e planilha ficam em lib/direcionamento.

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { acao, linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia, moeda } from '@/lib/formato'
import { rotuloDia } from '@/lib/agenda'
import { cn } from '@/lib/utils'
import {
  AVISO_EXEMPLO, FAIXAS, VAZIO_AGENDA, VAZIO_TODOS_CONCLUIRAM, comCliente, comOcorrencia, corExecucao, dadosExemplo, exportar,
  pctExecucao, planilhaAgenda, planilhaCriticos, planilhaSemVisita, resumoAgenda, rotuloFaixa, tomFaixa, totaisFaixa,
} from '@/lib/direcionamento'
import type { Planilha } from '@/lib/direcionamento'
import {
  Actions, Alert, Button, Dash, EmptyState, Field, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput, Stack,
  Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { BlocoFalhou, Marcador } from '@/components/Confirmacao'
import { Cresce, FaixaIndicadores } from '../clientes/layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Escopo = Record<string, string>

function Exportar({ planilha, disabled }: { planilha: () => Promise<Planilha> | Planilha; disabled?: boolean }) {
  const [gerando, setGerando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  async function baixar() {
    setGerando(true)
    setFalhou(false)
    try {
      await exportar(await planilha())
    } catch (falha) {
      console.error('exportação', falha)
      setFalhou(true)
    } finally {
      setGerando(false)
    }
  }
  return (
    <Button size="sm" onClick={baixar} disabled={disabled || gerando} title={falhou ? 'Não foi possível gerar a planilha. Tente de novo.' : undefined}>
      <Download aria-hidden />{falhou ? 'Tentar exportar de novo' : 'Exportar'}
    </Button>
  )
}

/** Faixa de números do topo da aba (mesmo desenho da aba Produtos do Analytics). */
function Destaques({ itens }: { itens: { rotulo: string; valor: string; nota: string; alerta?: boolean }[] }) {
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule-table bg-rule-row lg:grid-cols-4">
      {itens.map(d => (
        <div key={d.rotulo} className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
          <span className="text-[12px] text-ink-secondary">{d.rotulo}</span>
          <span className={cn('truncate font-title text-[24px] leading-tight font-bold tabular-nums', d.alerta ? 'text-destructive' : 'text-ink')}>{d.valor}</span>
          <span className="truncate text-[12px] text-ink-secondary" title={d.nota}>{d.nota}</span>
        </div>
      ))}
    </section>
  )
}

/** Número da tabela: zero fica apagado para as ocorrências saltarem. */
const Num = ({ n, forte }: { n: number; forte?: boolean }) => (
  <span className={cn('tabular-nums', !n ? 'text-ink-muted' : forte ? 'font-semibold text-ink' : 'text-ink')}>{n}</span>
)

/* ─────────────── Controle de Agenda e Visitas (RN-026, RF-020) ─────────────── */

// Abaixo de xl só Não concluídas tem coluna; o resto vai para a linha de baixo (linha compacta).
const COLUNAS_AGENDA = [
  ['agendadas', 'Agendadas', 'xl', false], ['concluidas', 'Concluídas', 'xl', false], ['naoConcluidas', 'Não concluídas', 'sm', true],
  ['semRelato', 'Sem relato', 'xl', true], ['reagendadas', 'Reagendadas', 'xl', false], ['canceladas', 'Canceladas', 'xl', false],
] as const
const COLUNA = { sm: 'hidden sm:table-cell', xl: 'hidden xl:table-cell' }
const qtd = (n: number, palavra: string) => `${n} ${palavra}${n === 1 ? '' : 's'}`
const BARRA = { live: 'bg-primary', attention: 'bg-ink-muted/60', alert: 'bg-destructive/70', off: 'bg-muted' }

export function ControleAgenda({ escopo, semana }: { escopo: Escopo; semana: string }) {
  const [exemplo, setExemplo] = useState(false)
  const [todos, setTodos] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const bloco = useBloco(() => (exemplo ? Promise.resolve(dadosExemplo(semana)) : linhas('direcionamentoAgenda', { ...escopo, semana })), [escopo, semana, exemplo])
  const resumo = resumoAgenda(bloco.dados ?? [])
  const visiveis = todos ? resumo : resumo.filter(comOcorrencia)
  const soma = (c: 'agendadas' | 'concluidas' | 'naoConcluidas' | 'semRelato' | 'vencidas' | 'reagendadas' | 'canceladas') => resumo.reduce((t, r) => t + r[c], 0)
  const equipe = soma('agendadas') ? soma('concluidas') / soma('agendadas') : null

  return (
    <Stack>
      {exemplo ? <Alert tone="warn">{AVISO_EXEMPLO} Nada foi gravado.</Alert> : null}
      {bloco.dados && resumo.length ? (
        <Destaques itens={[
          { rotulo: 'Execução da equipe', valor: pctExecucao(equipe), nota: `${soma('concluidas')} de ${qtd(soma('agendadas'), 'visita')} concluídas` },
          { rotulo: 'Não concluídas', valor: String(soma('naoConcluidas')), nota: soma('vencidas') ? `${qtd(soma('vencidas'), 'vencida')}, com data já passada` : 'nenhuma vencida', alerta: soma('vencidas') > 0 },
          { rotulo: 'Sem relato', valor: String(soma('semRelato')), nota: 'visitas sem relato registrado' },
          { rotulo: 'Reagendadas e canceladas', valor: String(soma('reagendadas') + soma('canceladas')), nota: `${qtd(soma('reagendadas'), 'reagendada')} · ${qtd(soma('canceladas'), 'cancelada')}` },
        ]} />
      ) : null}
      <Panel>
        <PanelHeader title="Execução da agenda por executivo" hint="Visitas a clientes e de prospecção, de segunda a sexta. Clique no executivo para ver os compromissos.">
          <div className="flex flex-wrap items-center gap-2">
            <Marcador rotulo="Mostrar todos" marcado={todos} onMudar={setTodos} />
            <Button size="sm" variant="ghost" onClick={() => setExemplo(e => !e)}>{exemplo ? 'Voltar aos dados reais' : 'Ver dados de exemplo'}</Button>
            <Exportar planilha={() => planilhaAgenda(resumo, hojeBrasilia(), exemplo)} disabled={!resumo.length} />
          </div>
        </PanelHeader>
        {bloco.erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : bloco.dados && !visiveis.length ? (
          <EmptyState title={resumo.length ? VAZIO_TODOS_CONCLUIRAM : VAZIO_AGENDA} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Executivo</Th>
                <Th>Execução</Th>
                {COLUNAS_AGENDA.map(([, t, b]) => <Th key={t} numeric className={COLUNA[b]}>{t}</Th>)}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(r => {
                const expandido = aberto === r.id
                const tom = corExecucao(r.execucao)
                return (
                  <Fragment key={r.id}>
                    <Tr className={expandido ? 'bg-accent/60' : undefined}>
                      <Td>
                        <button type="button" aria-expanded={expandido} onClick={() => setAberto(a => (a === r.id ? null : r.id))}
                          className="flex items-start gap-2 text-left whitespace-nowrap hover:text-primary">
                          {expandido ? <ChevronDown aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" /> : <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" />}
                          <span>
                            <RowTitle>{r.nome}</RowTitle>
                            <RowMeta>
                              {r.vencidas ? <span className="font-semibold text-destructive">{qtd(r.vencidas, 'vencida')}</span> : null}
                              <span className="whitespace-nowrap sm:hidden">{r.vencidas ? ' · ' : ''}{qtd(r.naoConcluidas, 'não concluída')}</span>
                              <span className="hidden whitespace-nowrap sm:inline xl:hidden">{r.vencidas ? ' · ' : ''}{r.semRelato} sem relato · {qtd(r.reagendadas, 'reagendada')} · {qtd(r.canceladas, 'cancelada')}</span>
                            </RowMeta>
                          </span>
                        </button>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-3">
                          <span className="hidden h-2 w-24 rounded-full bg-muted md:block" role="img" aria-label={`Execução ${pctExecucao(r.execucao)}`}>
                            <span className={cn('block h-2 rounded-full', BARRA[tom])} style={{ width: `${(r.execucao ?? 0) * 100}%` }} />
                          </span>
                          <Status tone={tom}>{pctExecucao(r.execucao)}</Status>
                        </span>
                        <span className="mt-0.5 block text-[12px] whitespace-nowrap text-ink-secondary">{r.concluidas} de {r.agendadas}</span>
                      </Td>
                      {COLUNAS_AGENDA.map(([c, , b, forte]) => <Td key={c} numeric className={COLUNA[b]}><Num n={r[c]} forte={forte} /></Td>)}
                    </Tr>
                    {expandido ? (
                      <tr>
                        <td colSpan={COLUNAS_AGENDA.length + 2} className="border-b border-rule-row bg-secondary/50 px-4 py-3">
                          <ul className="overflow-hidden rounded-xl border border-rule-table bg-card">
                            {[...r.compromissos].sort((a, b) => `${a.DATA} ${a.HORA}`.localeCompare(`${b.DATA} ${b.HORA}`)).map(c => (
                              <li key={`${c.ORIGEM}-${c.ID}`} className="grid grid-cols-[8.5rem_1fr] items-center gap-x-3 gap-y-1 border-b border-rule-row px-3 py-2 text-[13px] last:border-b-0 sm:grid-cols-[8.5rem_1fr_auto]">
                                <span className="whitespace-nowrap text-ink-secondary tabular-nums">{rotuloDia(String(c.DATA).slice(0, 10))} · {c.HORA}</span>
                                <span className="min-w-0 truncate font-semibold text-ink">
                                  {c.CLIENTE}{c.ORIGEM === 'PROSPECCAO' ? <span className="ml-2 font-normal text-ink-secondary">prospecção</span> : null}
                                </span>
                                <span className="col-start-2 sm:col-start-auto">
                                  <Status tone={Number(c.CONCLUIDA) ? 'live' : Number(c.CANCELADA) ? 'off' : Number(c.VENCIDA) ? 'alert' : 'attention'}>
                                    {c.SITUACAO}{Number(c.REAGENDADA) ? ' · reagendada' : ''}
                                  </Status>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </Stack>
  )
}

/* ─────────────── Clientes Críticos sem Compra (RN-027) ─────────────── */

const tomSituacao = (s: string) => (s === 'Comprou' ? 'live' : s === 'Ainda no prazo' ? 'attention' : 'alert')
const diasDesde = (iso: string, hoje: string) => Math.round((Date.parse(hoje) - Date.parse(String(iso).slice(0, 10))) / 864e5)

export function ClientesCriticos({ escopo, semana }: { escopo: Escopo; semana: string }) {
  const bloco = useBloco(async () => {
    const r = await acao('direcionamentoCriticos', { ...escopo, semana })
    if (r.ok === false) throw new Error(r.error)
    return (r.executivos ?? []) as Linha[]
  }, [escopo, semana])
  const executivos = bloco.dados ?? []
  const hoje = hojeBrasilia()
  const total = (c: string) => executivos.reduce((t, e) => t + (Number(e[c]) || 0), 0)

  return (
    <Stack>
      {bloco.dados && executivos.length ? (
        <Destaques itens={[
          { rotulo: 'Ticket médio em risco', valor: moeda(total('EM_RISCO')), nota: 'soma dos que não compraram', alerta: total('EM_RISCO') > 0 },
          { rotulo: 'Não compraram', valor: String(total('NAO_COMPRARAM')), nota: 'compra prevista já passou' },
          { rotulo: 'Ainda no prazo', valor: String(total('NO_PRAZO')), nota: 'compra prevista até domingo' },
          { rotulo: 'Executivos', valor: String(executivos.length), nota: 'com cliente importante sem compra' },
        ]} />
      ) : null}
      <Panel>
        <PanelHeader title="Clientes importantes com compra prevista na semana" hint="Curva A ou 20% maiores da carteira, pelo ciclo de compra. Executivos com mais valor em risco primeiro.">
          <Exportar planilha={() => planilhaCriticos(executivos, hoje)} disabled={!executivos.length} />
        </PanelHeader>
        {bloco.erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : bloco.dados && !executivos.length ? (
          <EmptyState title="Nenhum cliente importante sem compra nesta semana" hint="Curva A ou 20% maiores da carteira com compra prevista até domingo." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="hidden sm:table-cell">Última compra</Th>
                <Th className="hidden sm:table-cell">Compra prevista</Th>
                <Th>Situação</Th>
                <Th numeric>Ticket médio</Th>
              </tr>
            </thead>
            <tbody>
              {executivos.map(e => (
                <Fragment key={e.VENDEDOR_ID}>
                  <tr>
                    <td colSpan={5} className="border-b border-rule-row bg-secondary/60 px-4 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-title text-[14px] font-bold text-ink">{e.EXECUTIVO}</span>
                        <span className="text-[12px] text-ink-secondary">
                          <strong className="text-destructive tabular-nums">{moeda(e.EM_RISCO)}</strong> em risco · {e.NAO_COMPRARAM} não {Number(e.NAO_COMPRARAM) === 1 ? 'comprou' : 'compraram'} · {e.NO_PRAZO} no prazo
                        </span>
                      </div>
                    </td>
                  </tr>
                  {(e.clientes as Linha[]).map(c => {
                    const atraso = c.SITUACAO === 'Não comprou' ? diasDesde(c.PREVISTA, hoje) : 0
                    return (
                      <Tr key={`${e.VENDEDOR_ID}-${c.ID_CLIENTE}`}>
                        <Td>
                          <RowTitle>{c.NOME}</RowTitle>
                          <RowMeta>Curva {c.CURVA} · compra a cada {c.CICLO} dias<span className="sm:hidden"> · prevista {fmtData(c.PREVISTA)}</span></RowMeta>
                        </Td>
                        <Td className="hidden whitespace-nowrap tabular-nums sm:table-cell">{fmtData(c.ULTIMA)}</Td>
                        <Td className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                          {fmtData(c.PREVISTA)}
                          {atraso > 0 ? <RowMeta><span className="text-destructive">{qtd(atraso, 'dia')} de atraso</span></RowMeta> : null}
                        </Td>
                        <Td><Status tone={tomSituacao(c.SITUACAO)}>{c.SITUACAO}</Status></Td>
                        <Td numeric className="font-semibold whitespace-nowrap text-ink tabular-nums">{moeda(c.TICKET)}</Td>
                      </Tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Stack>
  )
}

/* ─────────────── Carteira sem Visitação (RN-028) ─────────────── */

const POR_PAGINA = 30

export function SemVisitacao({ escopo }: { escopo: Escopo }) {
  const [faixa, setFaixa] = useState('')
  const [textoBusca, setTextoBusca] = useState('')
  const [busca, setBusca] = useState('')
  const [paginas, setPaginas] = useState<Linha[][]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setBusca(textoBusca), 400)
    return () => clearTimeout(t)
  }, [textoBusca])

  const consulta = (pagina: number) => linhas('direcionamentoSemVisita', { ...escopo, faixa, busca, pagina: String(pagina) })

  // Filtro novo recomeça da página 1; "Ver mais" acrescenta a próxima.
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(false)
    consulta(1)
      .then(l => vivo && setPaginas([l]))
      .catch(falha => { console.error('s360DirecionamentoSemVisita', falha); if (vivo) setErro(true) })
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [escopo, faixa, busca]) // eslint-disable-line react-hooks/exhaustive-deps

  async function verMais() {
    setCarregando(true)
    try {
      const l = await consulta(paginas.length + 1)
      setPaginas(p => [...p, l])
    } catch (falha) {
      console.error('s360DirecionamentoSemVisita', falha)
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }

  // Exporta o filtro inteiro, não só o que já foi aberto na tela.
  async function tudo() {
    const total = Number(paginas[0]?.[0]?.TOTAL) || 0
    const resto = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / POR_PAGINA) - 1) }, (_, i) => consulta(i + 2)))
    return planilhaSemVisita([...(paginas[0] ?? []), ...resto.flat()], hojeBrasilia())
  }

  const primeira = paginas[0] ?? []
  const totais = totaisFaixa(primeira)
  const lista = comCliente(paginas.flat())
  const total = Number(primeira[0]?.TOTAL) || 0
  const itens = FAIXAS.filter(f => f.value).map(f => ({
    rotulo: f.label,
    valor: totais[f.value].toLocaleString('pt-BR'),
    acao: { rotulo: `Filtrar ${f.label}`, ativo: faixa === f.value, onClick: () => setFaixa(a => (a === f.value ? '' : f.value)) },
  }))

  return (
    <Stack>
      {paginas.length ? <FaixaIndicadores itens={itens} /> : null}
      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Cliente ou cidade" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <Actions>
            {faixa ? <Button size="sm" variant="ghost" onClick={() => setFaixa('')}>Todas as faixas</Button> : null}
            <Exportar planilha={tudo} disabled={!lista.length} />
          </Actions>
        </Toolbar>
        {erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : paginas.length && !lista.length ? (
          <EmptyState title="Nenhum cliente sem visita neste filtro" hint="Todos os clientes da carteira tiveram visita concluída nos últimos 30 dias." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="hidden sm:table-cell">Executivo</Th>
                <Th>Faixa</Th>
                <Th className="hidden sm:table-cell">Última visita</Th>
                <Th className="hidden sm:table-cell">Próxima visita</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map(l => (
                <Tr key={`${l.VENDEDOR_ID}-${l.ID_CLIENTE}`}>
                  <Td>
                    <RowTitle>{l.CLIENTE}</RowTitle>
                    <RowMeta>{l.CIDADE ? `${l.CIDADE}${l.UF ? `/${l.UF}` : ''}` : ''}<span className="sm:hidden"> · {l.EXECUTIVO}</span></RowMeta>
                  </Td>
                  <Td className="hidden sm:table-cell">{l.EXECUTIVO}</Td>
                  <Td>
                    <Status tone={tomFaixa(l.FAIXA)}>{rotuloFaixa(l.FAIXA)}</Status>
                    {l.DIAS != null ? <RowMeta>{l.DIAS} dias</RowMeta> : null}
                  </Td>
                  <Td className="hidden sm:table-cell">{l.ULTIMA ? fmtData(l.ULTIMA) : <Dash />}</Td>
                  <Td className="hidden sm:table-cell">{l.PROXIMA ? fmtData(l.PROXIMA) : <Dash />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {lista.length ? (
          <div className="flex items-center justify-between border-t border-rule-row px-4 py-3 text-[12px] text-ink-secondary">
            <span aria-live="polite">{lista.length} de {total.toLocaleString('pt-BR')} clientes</span>
            {lista.length < total ? <Button size="sm" onClick={verMais} disabled={carregando}>Ver mais</Button> : null}
          </div>
        ) : null}
      </Panel>
    </Stack>
  )
}
