// Visão Semanal do vendedor (spec 006, RF-001..007, RF-010, RF-017): matriz
// cliente × semana operacional do mês. Mês, ano e escopo recarregam a
// s360SemanalMatriz; Ramo e "Abaixo da expectativa" filtram na tela.

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { acao, linha, linhas } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import {
  MESES, MSG_SEM_DADOS, anos, cards, corBw, filtrar, fmtBw, planilha, rotuloSemana, textoAtualizacao, tituloSemana, tomStatus, totalLinha,
  type ItemProduto, type LinhaMatriz, type Matriz,
} from '@/lib/semanal'
import {
  Alert, Button, EmptyState, Field, FilterChip, Pagination, Panel, PanelHeader, RowMeta, RowTitle, SelectMenu, Stack, Status,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { useSessao } from '@/components/sessao-contexto'
import { baixarPlanilha } from '@/components/baixar-planilha'
import { FaixaIndicadores } from '../clientes/layout'
import { ValorCard } from '../analytics/graficos'
import { DetalheCliente } from './DetalheCliente'
import { cn } from '@/lib/utils'

export function Semanal({ escopo, hoje }: { escopo: Record<string, string>; hoje: string }) {
  const { sessao } = useSessao()
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)))
  const [ramo, setRamo] = useState('')
  const [abaixo, setAbaixo] = useState(0)
  // RF-006: um cliente aberto por vez, com o detalhe logo abaixo da linha.
  const [aberto, setAberto] = useState<LinhaMatriz['CLIENTE_ID'] | null>(null)
  // O detalhe acompanha a largura visível da tabela, não a largura rolável.
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const [aviso, setAviso] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  const input = useMemo(() => ({ ...escopo, ano: String(ano), mes: String(mes) }), [escopo, ano, mes])
  const matriz = useBloco(() => acao('semanalMatriz', input) as Promise<Matriz>, [input])
  const atualizacao = useBloco(() => linha('semanalAtualizacao'), [])

  const m = matriz.dados?.ok ? matriz.dados : null
  const visiveis = useMemo(() => (m ? filtrar(m.linhas, { ramo, abaixo }) : []), [m, ramo, abaixo])
  const c = cards(visiveis)
  const total = m ? totalLinha(visiveis, m.semanas) : null

  async function exportar() {
    setAviso(null)
    if (!m || !visiveis.length) { setAviso(MSG_SEM_DADOS); return }
    setExportando(true)
    try {
      const produtos = await acao('semanalProdutos', input)
      const p = planilha(m, visiveis, (produtos.itens ?? []) as ItemProduto[], ano, mes)
      if (p) await baixarPlanilha(p)
      else setAviso(MSG_SEM_DADOS)
    } catch (falha) {
      console.error('exportar semanal', falha)
      setAviso('Não foi possível gerar a planilha. Tente de novo.')
    } finally {
      setExportando(false)
    }
  }

  const atualizado = textoAtualizacao(atualizacao.dados?.FIM_EM)

  return (
    <Stack>
      <FaixaIndicadores itens={[
        { rotulo: 'Clientes na carteira', valor: c.carteira },
        { rotulo: 'Com compra no mês', valor: c.comCompra },
        { rotulo: 'Fechamento do mês', valor: <ValorCard>{moeda(c.fechamento)}</ValorCard> },
        { rotulo: 'Clientes em alerta', valor: c.alerta, nota: 'B/W acima de 25,0% para mais ou para menos' },
        { rotulo: 'Semana de referência', valor: m?.semanaRef ? tituloSemana(m.semanaRef) : m?.mesEncerrado ? 'Fechamento' : '—' },
      ]} />
      {aviso ? <Alert tone="warn">{aviso}</Alert> : null}
      <Panel>
        <PanelHeader title="Acompanhamento semanal" hint={atualizado || undefined}>
          <Button size="sm" onClick={exportar} disabled={exportando || !m}><Download aria-hidden />{exportando ? 'Gerando…' : 'Exportar Excel'}</Button>
        </PanelHeader>
        <Toolbar>
          <Field label="Mês"><SelectMenu label="Mês" value={String(mes)} onChange={v => setMes(Number(v))} options={MESES.map((n, i) => ({ value: String(i + 1), label: n }))} /></Field>
          <Field label="Ano"><SelectMenu label="Ano" value={String(ano)} onChange={v => setAno(Number(v))} options={anos(hoje).map(a => ({ value: String(a), label: String(a) }))} /></Field>
          <Field label="Ramo">
            <SelectMenu label="Ramo" value={ramo} onChange={setRamo} options={[{ value: '', label: 'Todos' }, ...(m?.ramos ?? []).map(r => ({ value: r, label: r }))]} />
          </Field>
          <Field label="Abaixo da expectativa">
            <SelectMenu
              label="Abaixo da expectativa"
              value={String(abaixo)}
              onChange={v => setAbaixo(Number(v))}
              options={[{ value: '0', label: 'Desligado' }, ...(m?.semanas ?? []).map(s => ({ value: String(s.n), label: tituloSemana(s.n) }))]}
            />
          </Field>
          {ramo ? <FilterChip label="Ramo" value={ramo} onClear={() => setRamo('')} /> : null}
          {abaixo ? <FilterChip label="Abaixo da expectativa" value={tituloSemana(abaixo)} onClear={() => setAbaixo(0)} /> : null}
        </Toolbar>
        <div ref={caixa}>
        {matriz.erro || (matriz.dados && !matriz.dados.ok) ? (
          <div className="p-4"><Alert tone="error">Não foi possível carregar o acompanhamento semanal. <button type="button" className="underline" onClick={matriz.recarregar}>Tentar de novo</button></Alert></div>
        ) : !m ? (
          <p className="px-4 py-6 text-[13px] text-ink-secondary">Carregando…</p>
        ) : !visiveis.length ? (
          <EmptyState title="Nenhum cliente neste recorte" hint="Troque o mês, o ramo ou desligue o filtro de expectativa." />
        ) : (
          <Table className="min-w-max">
            <thead>
              <tr>
                <Th className="sticky left-0 z-10 min-w-56">Cliente</Th>
                {m.semanas.map(s => (
                  <Th key={s.n} numeric>
                    {tituloSemana(s.n)}
                    <span className="block font-normal tracking-normal normal-case">{rotuloSemana(s)}</span>
                  </Th>
                ))}
                <Th numeric>Fech. mês anterior</Th>
                <Th numeric>Fech. do mês</Th>
                <Th numeric>B/W</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const expandido = aberto === l.CLIENTE_ID
                return (
                <Fragment key={l.CLIENTE_ID}>
                <Tr className={cn('group', expandido && 'bg-accent/60')}>
                  <Td className={cn('sticky left-0 z-10 bg-card group-hover:bg-accent', expandido && 'bg-accent')}>
                    <button type="button" aria-expanded={expandido} className="flex items-start gap-1.5 text-left" onClick={() => setAberto(expandido ? null : l.CLIENTE_ID)} title={expandido ? 'Fechar detalhe' : 'Abrir detalhe do cliente'}>
                      {expandido ? <ChevronDown aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" /> : <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" />}
                      <span>
                        <span className="hover:underline"><RowTitle>{l.CLIENTE}</RowTitle></span>
                        <RowMeta>Curva {l.CURVA} · {l.RAMO}{l.DE_TITULAR ? ` · de ${l.DE_TITULAR}` : ''}</RowMeta>
                      </span>
                    </button>
                  </Td>
                  {l.SEMANAS.map((s, i) => <CelulaSemana key={i} valor={s.valor} bw={s.bw} />)}
                  <Td numeric>{moeda(l.FECH_ANT)}</Td>
                  <Td numeric><RowTitle>{moeda(l.FECH)}</RowTitle></Td>
                  <Td numeric className={corBw(l.BW_FECH)}>{fmtBw(l.BW_FECH)}</Td>
                  <Td><Status tone={tomStatus(l.STATUS)}>{l.STATUS}</Status></Td>
                </Tr>
                {expandido ? (
                  <tr>
                    <td colSpan={m.semanas.length + 5} className="p-0">
                      <div className="sticky left-0" style={{ width: largura || undefined }}>
                        <DetalheCliente cliente={l} input={input} />
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
                )
              })}
              {total ? (
                <tr className="font-semibold">
                  <Td className="sticky left-0 z-10 bg-card"><RowTitle>TOTAL</RowTitle></Td>
                  {total.SEMANAS.map((s, i) => <CelulaSemana key={i} valor={s.valor} bw={s.bw} />)}
                  <Td numeric>{moeda(total.FECH_ANT)}</Td>
                  <Td numeric>{moeda(total.FECH)}</Td>
                  <Td numeric className={corBw(total.BW_FECH)}>{fmtBw(total.BW_FECH)}</Td>
                  <Td />
                </tr>
              ) : null}
            </tbody>
          </Table>
        )}
        </div>
      </Panel>
      {sessao.papeis.includes('ADMIN') ? <ErrosIngestao /> : null}
    </Stack>
  )
}

function CelulaSemana({ valor, bw }: { valor: number; bw: number | null }) {
  return (
    <Td numeric>
      <span className="block text-ink">{moeda(valor)}</span>
      <span className={cn('block text-[12px]', corBw(bw))}>{fmtBw(bw)}</span>
    </Td>
  )
}

const TIPOS_ERRO = ['ERRO_DATA', 'ERRO_CLIENTE', 'ERRO_FILIAL', 'ERRO_BU', 'ERRO_SECAO', 'ERRO_SECAO_NAO_MAPEADA']

/** RF-017 (could): erros de ingestão abertos, só para a TI (ADMIN), recolhido. */
function ErrosIngestao() {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState('')
  const [pagina, setPagina] = useState(1)
  const erros = useBloco(() => (aberto ? linhas('semanalErros', { tipo, pagina: String(pagina) }) : Promise.resolve([])), [aberto, tipo, pagina])
  const lista = erros.dados ?? []
  const totalErros = Number(lista[0]?.TOTAL ?? 0)
  return (
    <details className="rounded-2xl border border-rule-table bg-card" onToggle={e => setAberto((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-4 py-3 font-title text-[15px] font-bold text-ink">Erros de ingestão</summary>
      <Toolbar>
        <Field label="Tipo de erro">
          <SelectMenu label="Tipo de erro" value={tipo} onChange={v => { setTipo(v); setPagina(1) }} options={[{ value: '', label: 'Todos' }, ...TIPOS_ERRO.map(t => ({ value: t, label: t }))]} />
        </Field>
      </Toolbar>
      {erros.erro ? <div className="p-4"><Alert tone="error">Não foi possível carregar os erros de ingestão.</Alert></div> : !lista.length ? (
        <EmptyState title="Nenhum erro aberto" />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Tipo</Th><Th>Pedido · produto</Th><Th>Cliente · filial</Th><Th>Detalhe</Th><Th numeric>Ocorrências</Th></tr></thead>
            <tbody>
              {lista.map(e => (
                <Tr key={`${e.TIPO_ERRO}-${e.NUMPED}-${e.CODPROD}`}>
                  <Td>{e.TIPO_ERRO}</Td>
                  <Td>{e.NUMPED} · {e.CODPROD}</Td>
                  <Td>{e.CODCLI ?? '—'} · {e.CODFILIAL ?? '—'}</Td>
                  <Td className="max-w-80 truncate" title={e.DETALHE}>{e.DETALHE}</Td>
                  <Td numeric>{e.QTD_OCORRENCIAS}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={pagina} lastPage={Math.max(1, Math.ceil(totalErros / 50))} total={totalErros} unit="erros" onPrevious={() => setPagina(p => p - 1)} onNext={() => setPagina(p => p + 1)} />
        </>
      )}
    </details>
  )
}
