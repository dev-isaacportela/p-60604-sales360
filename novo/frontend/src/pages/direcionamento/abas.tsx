// Abas do Direcionamento (RN-026…029). Cada uma tem a sua consulta e o seu
// botão Exportar; as regras de resumo e planilha ficam em lib/direcionamento.

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import { acao, linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia, moeda } from '@/lib/formato'
import {
  AVISO_EXEMPLO, FAIXAS, VAZIO_AGENDA, VAZIO_TODOS_CONCLUIRAM, comCliente, comOcorrencia, corExecucao, dadosExemplo, exportar,
  pctExecucao, planilhaAgenda, planilhaCriticos, planilhaSemVisita, resumoAgenda, rotuloFaixa, tomFaixa, totaisFaixa,
} from '@/lib/direcionamento'
import type { Planilha } from '@/lib/direcionamento'
import {
  Actions, Alert, Button, Dash, EmptyState, Field, IconButton, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput, Stack,
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

/* ─────────────── Controle de Agenda e Visitas (RN-026, RF-020) ─────────────── */

// Abaixo de xl só Não concluídas tem coluna; o resto vai para a linha de baixo (linha compacta).
const COLUNAS_AGENDA = [
  ['agendadas', 'Agendadas', 'xl'], ['concluidas', 'Concluídas', 'xl'], ['naoConcluidas', 'Não concluídas', 'sm'], ['semRelato', 'Sem relato', 'xl'],
  ['reagendadas', 'Reagendadas', 'xl'], ['canceladas', 'Canceladas', 'xl'],
] as const
const COLUNA = { sm: 'hidden sm:table-cell', xl: 'hidden xl:table-cell' }
const qtd = (n: number, palavra: string) => `${n} ${palavra}${n === 1 ? '' : 's'}`

export function ControleAgenda({ escopo, semana }: { escopo: Escopo; semana: string }) {
  const [exemplo, setExemplo] = useState(false)
  const [todos, setTodos] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const bloco = useBloco(() => (exemplo ? Promise.resolve(dadosExemplo(semana)) : linhas('direcionamentoAgenda', { ...escopo, semana })), [escopo, semana, exemplo])
  const resumo = resumoAgenda(bloco.dados ?? [])
  const visiveis = todos ? resumo : resumo.filter(comOcorrencia)

  return (
    <Stack>
      {exemplo ? <Alert tone="warn">{AVISO_EXEMPLO} Nada foi gravado.</Alert> : null}
      <Panel>
        <PanelHeader title="Execução da agenda por executivo" hint="Visitas a clientes e de prospecção, de segunda a sexta.">
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
                {COLUNAS_AGENDA.map(([, t, b]) => <Th key={t} numeric className={COLUNA[b]}>{t}</Th>)}
                <Th numeric>Execução</Th>
                <Th><span className="sr-only">Compromissos</span></Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(r => (
                <Fragment key={r.id}>
                  <Tr>
                    <Td>
                      <RowTitle>{r.nome}</RowTitle>
                      <RowMeta>
                        <span className="whitespace-nowrap sm:hidden">{qtd(r.naoConcluidas, 'não concluída')} · {r.semRelato} sem relato</span>
                        <span className="hidden whitespace-nowrap sm:inline">
                          <span className="xl:hidden">{r.semRelato} sem relato · </span>
                          {qtd(r.vencidas, 'vencida')}
                          <span className="xl:hidden"> · {qtd(r.reagendadas, 'reagendada')} · {qtd(r.canceladas, 'cancelada')}</span>
                        </span>
                      </RowMeta>
                    </Td>
                    {COLUNAS_AGENDA.map(([c, , b]) => <Td key={c} numeric className={COLUNA[b]}>{r[c]}</Td>)}
                    <Td numeric>
                      <Status tone={corExecucao(r.execucao)}>{pctExecucao(r.execucao)}</Status>
                      <span className="block text-[12px] whitespace-nowrap text-ink-secondary xl:hidden">{r.concluidas} de {r.agendadas}</span>
                    </Td>
                    <Td>
                      <IconButton label={aberto === r.id ? `Fechar compromissos de ${r.nome}` : `Ver compromissos de ${r.nome}`} onClick={() => setAberto(a => (a === r.id ? null : r.id))}>
                        {aberto === r.id ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                      </IconButton>
                    </Td>
                  </Tr>
                  {aberto === r.id ? (
                    <tr>
                      <td colSpan={COLUNAS_AGENDA.length + 3} className="border-b border-rule-row bg-muted/40 px-4 py-2">
                        <ul>
                          {r.compromissos.map(c => (
                            <li key={`${c.ORIGEM}-${c.ID}`} className="flex flex-wrap gap-x-3 py-1 text-[12px]">
                              <span className="w-24 text-ink-secondary">{fmtData(c.DATA)} {c.HORA}</span>
                              <span className="min-w-0 flex-1 truncate text-ink">{c.CLIENTE}{c.ORIGEM === 'PROSPECCAO' ? ' · prospecção' : ''}</span>
                              <Status tone={Number(c.CONCLUIDA) ? 'live' : Number(c.CANCELADA) ? 'off' : Number(c.VENCIDA) ? 'alert' : 'attention'}>
                                {c.SITUACAO}{Number(c.REAGENDADA) ? ' · reagendada' : ''}
                              </Status>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Stack>
  )
}

/* ─────────────── Clientes Críticos sem Compra (RN-027) ─────────────── */

const tomSituacao = (s: string) => (s === 'Comprou' ? 'live' : s === 'Ainda no prazo' ? 'attention' : 'alert')

export function ClientesCriticos({ escopo, semana }: { escopo: Escopo; semana: string }) {
  const bloco = useBloco(async () => {
    const r = await acao('direcionamentoCriticos', { ...escopo, semana })
    if (r.ok === false) throw new Error(r.error)
    return (r.executivos ?? []) as Linha[]
  }, [escopo, semana])
  const executivos = bloco.dados ?? []
  const emRisco = executivos.reduce((t, e) => t + (Number(e.EM_RISCO) || 0), 0)

  return (
    <Panel>
      <PanelHeader
        title="Clientes importantes com compra prevista na semana"
        hint={bloco.dados ? <>Ticket médio em risco: <strong className="text-ink">{moeda(emRisco)}</strong></> : null}
      >
        <Exportar planilha={() => planilhaCriticos(executivos, hojeBrasilia())} disabled={!executivos.length} />
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
              <Th className="hidden sm:table-cell">Prevista</Th>
              <Th>Situação</Th>
              <Th numeric>Ticket médio</Th>
            </tr>
          </thead>
          <tbody>
            {executivos.map(e => (
              <Fragment key={e.VENDEDOR_ID}>
                <tr>
                  <td colSpan={5} className="border-b border-rule-row bg-muted/40 px-4 py-2">
                    <RowTitle>{e.EXECUTIVO}</RowTitle>
                    <span className="ml-2 text-[12px] text-ink-secondary">
                      {moeda(e.EM_RISCO)} em risco · {e.NAO_COMPRARAM} não compraram · {e.NO_PRAZO} no prazo
                    </span>
                  </td>
                </tr>
                {(e.clientes as Linha[]).map(c => (
                  <Tr key={`${e.VENDEDOR_ID}-${c.ID_CLIENTE}`}>
                    <Td>
                      <RowTitle>{c.NOME}</RowTitle>
                      <RowMeta>Curva {c.CURVA} · ciclo {c.CICLO} d<span className="sm:hidden"> · prevista {fmtData(c.PREVISTA)}</span></RowMeta>
                    </Td>
                    <Td className="hidden sm:table-cell">{fmtData(c.ULTIMA)}</Td>
                    <Td className="hidden sm:table-cell">{fmtData(c.PREVISTA)}</Td>
                    <Td><Status tone={tomSituacao(c.SITUACAO)}>{c.SITUACAO}</Status></Td>
                    <Td numeric>{moeda(c.TICKET)}</Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
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
