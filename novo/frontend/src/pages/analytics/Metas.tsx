// Aba Metas do Analytics (spec 007, RF-013..021): meta recebida do
// planejamento por Filial/BU, redistribuição entre os vendedores (coordenador)
// e acompanhamento em leitura (diretoria). Uma s360MetasCarregar ao abrir;
// Salvar grava tudo ou nada (s360MetasSalvar) e explica a recusa (Motivo).

import { useMemo, useState } from 'react'
import { Download, Layers, Save } from 'lucide-react'
import { acao, linha } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { fmtPct } from '@/lib/analytics'
import { MESES, anos } from '@/lib/semanal'
import {
  MSG_NADA, MSG_SEM_META, alteracoes, aplicarRamos, chaveBu, chaveRamo, chaveVendedor, insights, lerValor, mensagemInvalido,
  mensagemMotivo, mensagemRamosAcima, mensagemSalvar, metaNaTela, origem, paraCampo, perguntaDescartar, planilhaMetas, ramosDoVendedor,
  ratear, rotuloBu, statusRateio, statusVendedor, tomVendedor, validarRamos,
  type Base, type Bu, type Fixados, type LinhaRamo, type Personalizada, type RealizadoRamo, type TipoRateio, type UfVendedor, type Vendedor,
} from '@/lib/metas'
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field,
  IconButton, Input, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SelectMenu, Stack, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { useBloco, gravar } from '@/components/use-bloco'
import { baixarPlanilha } from '@/components/baixar-planilha'
import { FaixaIndicadores } from '../clientes/layout'
import { ValorCard } from './graficos'

interface DadosMetas {
  ok: boolean
  leitura: boolean
  diretoria: boolean
  coordenadores: { COD_SUPERVISOR: string; NOME: string }[]
  bus: Bu[]
  vendedores: Vendedor[]
  base: Base[]
  ufs: UfVendedor[]
  personalizadas: Personalizada[]
  realizadoRamo: RealizadoRamo[]
}

const chaveVd = (vendedorId: number, codepto: number) => `${vendedorId}|${codepto}`

export function Metas({ hoje }: { hoje: string }) {
  const [periodo, setPeriodo] = useState({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) })
  const [coordenador, setCoordenador] = useState('')
  const [buFiltro, setBuFiltro] = useState('')
  const [edicoes, setEdicoes] = useState<Record<string, string>>({})
  const [fixados, setFixados] = useState<Record<string, Fixados>>({})
  const [msg, setMsg] = useState<{ tom: 'success' | 'error' | 'warn'; texto: string } | null>(null)
  const [pergunta, setPergunta] = useState<{ texto: string; seguir: () => void } | null>(null)
  const [ramosDe, setRamosDe] = useState<Vendedor | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carga = useBloco(
    () => acao('metasCarregar', { ano: String(periodo.ano), mes: String(periodo.mes), coordenador }) as Promise<DadosMetas>,
    [periodo.ano, periodo.mes, coordenador],
  )
  const d = carga.dados?.ok ? carga.dados : null
  const leitura = !d || d.leitura

  const bus = useMemo(() => (d?.bus ?? []).filter(b => !buFiltro || chaveBu(b) === buFiltro), [d, buFiltro])
  const vendedores = useMemo(() => (d?.vendedores ?? []).filter(v => !buFiltro || chaveBu(v) === buFiltro), [d, buFiltro])
  const pendentes = Object.keys(edicoes).length + Object.keys(fixados).length

  /** RF-019: trocar mês, ano, BU ou recarregar com edição pendente pede confirmação. */
  function trocar(seguir: () => void) {
    if (!pendentes) { seguir(); return }
    setPergunta({ texto: perguntaDescartar(pendentes), seguir: () => { setEdicoes({}); setFixados({}); seguir() } })
  }

  const metaGeral = bus.reduce((t, b) => t + b.META, 0)
  const distribuido = vendedores.reduce((t, v) => t + metaNaTela(v, edicoes), 0)
  const comMeta = vendedores.filter(v => metaNaTela(v, edicoes) > 0).length
  const status = statusRateio({ carregando: !carga.dados && !carga.erro, semEquipe: !!d && !vendedores.length, pendente: pendentes > 0, meta: metaGeral, distribuido })

  /** Meta do vendedor no departamento (soma das filiais), com o que está na tela. */
  const metaNoDepto = (vendedorId: number, codepto: number) =>
    (d?.vendedores ?? []).filter(v => v.VENDEDOR_ID === vendedorId && v.CODEPTO === codepto).reduce((t, v) => t + metaNaTela(v, edicoes), 0)
  const ramosDoV = (v: Vendedor, extra?: Fixados) => ramosDoVendedor({
    vendedorId: v.VENDEDOR_ID, codepto: v.CODEPTO, metaBu: metaNoDepto(v.VENDEDOR_ID, v.CODEPTO),
    base: d?.base ?? [], ufs: d?.ufs ?? [], personalizadas: d?.personalizadas ?? [], realizado: d?.realizadoRamo ?? [],
    fixados: extra ?? fixados[chaveVd(v.VENDEDOR_ID, v.CODEPTO)],
  })

  function rateioRapido(tipo: TipoRateio, bu: Bu) {
    const daBu = vendedores.filter(v => chaveBu(v) === chaveBu(bu))
    const partes = ratear(tipo, bu.META, daBu.map(v => ({ realizado: v.REALIZADO, meta: metaNaTela(v, edicoes) })))
    setEdicoes(e => ({ ...e, ...Object.fromEntries(daBu.map((v, i) => [chaveVendedor(v), paraCampo(partes[i])])) }))
  }

  async function salvar() {
    if (!d) return
    setMsg(null)
    if (!d.bus.some(b => b.META > 0)) { setMsg({ tom: 'warn', texto: MSG_SEM_META }); return }
    const { metas, invalidos } = alteracoes(d.vendedores, edicoes)
    if (invalidos.length) { setMsg({ tom: 'error', texto: mensagemInvalido(invalidos) }); return }
    const ramosUf: Record<string, unknown>[] = []
    const ramosLimpar: { vendedorId: number; codepto: number }[] = []
    const acima: string[] = []
    for (const k of Object.keys(fixados)) {
      const [vendedorId, codepto] = k.split('|').map(Number)
      const v = d.vendedores.find(x => x.VENDEDOR_ID === vendedorId && x.CODEPTO === codepto)
      if (!v) continue
      const metaBu = metaNoDepto(vendedorId, codepto)
      const linhasRamo = ramosDoV(v)
      if (!validarRamos(linhasRamo, metaBu)) { acima.push(v.NOME); continue }
      ramosLimpar.push({ vendedorId, codepto })
      for (const l of linhasRamo.filter(x => x.personalizada)) {
        ramosUf.push({ vendedorId, codepto, ramo: l.ramo, ramoNome: l.ramoNome, uf: l.uf, valor: l.valor, percentual: metaBu ? Math.round((l.valor / metaBu) * 1e6) / 1e4 : 0 })
      }
    }
    if (acima.length) { setMsg({ tom: 'error', texto: mensagemRamosAcima(acima) }); return }
    if (!metas.length && !ramosLimpar.length) { setMsg({ tom: 'warn', texto: MSG_NADA }); return }

    const input = { ano: String(periodo.ano), mes: String(periodo.mes), metas: JSON.stringify(metas), ramosUf: JSON.stringify(ramosUf), ramosLimpar: JSON.stringify(ramosLimpar) }
    setSalvando(true)
    try {
      const afetadas = await gravar('metasSalvar', input)
      if (!afetadas) {
        setMsg({ tom: 'error', texto: mensagemMotivo(await linha('metasMotivo', input)) })
        return
      }
      setMsg({ tom: 'success', texto: mensagemSalvar(new Set(metas.map(m => m.vendedorId)).size, ramosLimpar.length) })
      setEdicoes({})
      setFixados({})
      carga.recarregar()
    } catch (falha) {
      console.error('s360MetasSalvar', falha)
      setMsg({ tom: 'error', texto: 'Não foi possível salvar as metas. Nada foi gravado. Tente de novo.' })
    } finally {
      setSalvando(false)
    }
  }

  async function exportar() {
    if (!d) return
    try {
      await baixarPlanilha(planilhaMetas(periodo.ano, periodo.mes, bus, vendedores, vendedores.map(v => ({ vendedor: v, linhas: ramosDoV(v) }))))
    } catch (falha) {
      console.error('exportar metas', falha)
      setMsg({ tom: 'error', texto: 'Não foi possível gerar o relatório. Tente de novo.' })
    }
  }

  const ins = d ? insights(bus, vendedores, d.realizadoRamo) : null
  const textoOrigem = origem(bus)

  return (
    <Stack>
      <Panel>
        <PanelHeader
          title={d?.diretoria ? 'Acompanhamento de Metas por Coordenador' : 'Distribuição de metas'}
          hint={textoOrigem || (d && !metaGeral ? MSG_SEM_META : undefined)}
        >
          <Button size="sm" onClick={exportar} disabled={!d}><Download aria-hidden />Exportar relatório</Button>
          {leitura ? <Button size="sm" disabled>Somente leitura</Button> : (
            <Button size="sm" variant="primary" onClick={salvar} disabled={salvando}><Save aria-hidden />{salvando ? 'Salvando…' : 'Salvar'}</Button>
          )}
        </PanelHeader>
        <Toolbar>
          <Field label="Mês">
            <SelectMenu label="Mês" value={String(periodo.mes)} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
              onChange={v => trocar(() => setPeriodo(p => ({ ...p, mes: Number(v) })))} />
          </Field>
          <Field label="Ano">
            <SelectMenu label="Ano" value={String(periodo.ano)} options={anos(hoje).map(a => ({ value: String(a), label: String(a) }))}
              onChange={v => trocar(() => setPeriodo(p => ({ ...p, ano: Number(v) })))} />
          </Field>
          {d?.diretoria ? (
            <Field label="Coordenador">
              <SelectMenu label="Coordenador" value={coordenador}
                options={[{ value: '', label: 'Todos os coordenadores' }, ...d.coordenadores.map(c => ({ value: c.COD_SUPERVISOR, label: c.NOME }))]}
                onChange={v => trocar(() => { setCoordenador(v); setBuFiltro('') })} />
            </Field>
          ) : null}
          <Field label="Filial / BU">
            <SelectMenu label="Filial / BU" value={buFiltro}
              options={[{ value: '', label: 'Todas' }, ...(d?.bus ?? []).map(b => ({ value: chaveBu(b), label: rotuloBu(b) }))]}
              onChange={v => trocar(() => setBuFiltro(v))} />
          </Field>
          <Button size="sm" onClick={() => trocar(carga.recarregar)}>Recarregar</Button>
        </Toolbar>
        {msg ? <div className="px-4 pt-3"><Alert tone={msg.tom}>{msg.texto}</Alert></div> : null}
        {carga.erro || (carga.dados && !carga.dados.ok) ? (
          <div className="p-4"><Alert tone="error">Não foi possível carregar as metas. <button type="button" className="underline" onClick={carga.recarregar}>Tentar de novo</button></Alert></div>
        ) : null}
        <PanelBody>
          <FaixaIndicadores itens={[
            { rotulo: 'Meta geral', valor: <ValorCard>{moeda(metaGeral)}</ValorCard> },
            { rotulo: 'Total distribuído', valor: <ValorCard>{moeda(distribuido)}</ValorCard> },
            { rotulo: 'Saldo disponível', valor: <ValorCard>{moeda(metaGeral - distribuido)}</ValorCard> },
            { rotulo: 'Vendedores com meta', valor: `${comMeta}/${vendedores.length}` },
            { rotulo: 'Status', valor: <ValorCard>{status}</ValorCard>, nota: `Status: ${status}` },
          ]} />
        </PanelBody>
      </Panel>

      {ins && ins.estados.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel>
            <PanelHeader title="Ocupação por região" hint="As 3 UFs de maior meta." />
            <Table>
              <thead><tr><Th>UF</Th><Th numeric>Meta</Th><Th numeric>Realizado</Th><Th numeric>Atingimento</Th></tr></thead>
              <tbody>
                {ins.ocupacao.map(e => <Tr key={e.uf}><Td>{e.uf || '—'}</Td><Td numeric>{moeda(e.meta)}</Td><Td numeric>{moeda(e.realizado)}</Td><Td numeric>{fmtPct(e.atingimento)}</Td></Tr>)}
              </tbody>
            </Table>
          </Panel>
          <Panel className="lg:col-span-2">
            <PanelHeader title="Insights estratégicos" />
            <PanelBody>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                <li>Região destaque: <span className="font-semibold text-ink">{ins.destaque ? `${ins.destaque.uf} (${fmtPct(ins.destaque.atingimento)} da meta)` : '—'}</span></li>
                <li>Ramo líder: <span className="font-semibold text-ink">{ins.ramoLider ? `${ins.ramoLider.ramo} (${moeda(ins.ramoLider.realizado)})` : '—'}</span></li>
                <li>Performance por estado: <span className="text-ink">{ins.estados.map(e => `${e.uf || '—'} ${fmtPct(e.atingimento)}`).join(' · ')}</span></li>
              </ul>
            </PanelBody>
          </Panel>
        </div>
      ) : null}

      {d && !bus.length ? <EmptyState title="Nenhuma Filial / BU no seu escopo para este mês" /> : null}
      {bus.map(b => {
        const daBu = vendedores.filter(v => chaveBu(v) === chaveBu(b))
        return (
          <Panel key={chaveBu(b)}>
            <PanelHeader title={rotuloBu(b)} hint={`Meta da BU ${moeda(b.META)}`}>
              {!leitura ? (
                <>
                  <Button size="sm" onClick={() => rateioRapido('IGUAL', b)} disabled={!daBu.length}>Ratear igual</Button>
                  <Button size="sm" onClick={() => rateioRapido('REALIZADO', b)} disabled={!daBu.length}>Por realizado</Button>
                  <Button size="sm" onClick={() => rateioRapido('PROPORCAO', b)} disabled={!daBu.length}>Manter proporção</Button>
                </>
              ) : null}
            </PanelHeader>
            {!daBu.length ? <p className="px-4 py-4 text-[13px] text-ink-secondary">Sem equipe nesta BU.</p> : (
              <Table>
                <thead>
                  <tr><Th>Vendedor</Th><Th numeric>Meta atual</Th><Th numeric>Nova meta</Th><Th numeric>Realizado líquido</Th><Th numeric>Atingimento</Th><Th>Status</Th><Th><span className="sr-only">Ramos</span></Th></tr>
                </thead>
                <tbody>
                  {daBu.map(v => {
                    const k = chaveVendedor(v)
                    const meta = metaNaTela(v, edicoes)
                    const sv = statusVendedor(meta, v.REALIZADO)
                    const invalido = edicoes[k] !== undefined && lerValor(edicoes[k]) === null
                    return (
                      <Tr key={k}>
                        <Td><RowTitle>{v.NOME}</RowTitle>{fixados[chaveVd(v.VENDEDOR_ID, v.CODEPTO)] ? <RowMeta>Ramos ajustados, falta salvar</RowMeta> : null}</Td>
                        <Td numeric>{moeda(v.META)}</Td>
                        <Td numeric className="py-1.5">
                          <Input
                            aria-label={`Nova meta de ${v.NOME}`}
                            aria-invalid={invalido || undefined}
                            disabled={leitura}
                            inputMode="decimal"
                            className="ml-auto h-8 w-36 text-right"
                            value={edicoes[k] ?? paraCampo(v.META)}
                            onChange={e => { const t = e.target.value; setEdicoes(x => ({ ...x, [k]: t })) }}
                          />
                        </Td>
                        <Td numeric>{moeda(v.REALIZADO)}</Td>
                        <Td numeric>{meta > 0 ? fmtPct(v.REALIZADO / meta) : '—'}</Td>
                        <Td><Status tone={tomVendedor(sv)}>{sv}</Status></Td>
                        <Td className="py-1.5"><IconButton label={`Meta por ramo/UF de ${v.NOME}`} onClick={() => setRamosDe(v)}><Layers aria-hidden /></IconButton></Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </Panel>
        )
      })}

      {ramosDe && d ? (
        <DialogoRamos
          vendedor={ramosDe}
          leitura={leitura}
          metaBu={metaNoDepto(ramosDe.VENDEDOR_ID, ramosDe.CODEPTO)}
          inicial={fixados[chaveVd(ramosDe.VENDEDOR_ID, ramosDe.CODEPTO)] ?? {}}
          calcular={f => ramosDoV(ramosDe, f)}
          fechar={() => setRamosDe(null)}
          aplicar={(f, linhasRamo) => {
            setFixados(x => ({ ...x, [chaveVd(ramosDe.VENDEDOR_ID, ramosDe.CODEPTO)]: f }))
            // Sem automática: a meta na BU vira a soma das personalizadas, nas filiais pela proporção atual.
            const filiais = d.vendedores.filter(v => v.VENDEDOR_ID === ramosDe.VENDEDOR_ID && v.CODEPTO === ramosDe.CODEPTO)
            const novas = aplicarRamos(linhasRamo, filiais.map(v => ({ meta: metaNaTela(v, edicoes) })))
            if (novas) setEdicoes(e => ({ ...e, ...Object.fromEntries(filiais.map((v, i) => [chaveVendedor(v), paraCampo(novas[i])])) }))
            setRamosDe(null)
          }}
        />
      ) : null}

      <Dialog open={!!pergunta} onOpenChange={a => { if (!a) setPergunta(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar alterações?</DialogTitle>
            <DialogDescription>{pergunta?.texto}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPergunta(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { pergunta?.seguir(); setPergunta(null) }}>Descartar e continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}

/** RF-017 / RN-012: ajuste por ramo/UF; `Aplicar ao vendedor` só mexe nos campos. */
function DialogoRamos({ vendedor, leitura, metaBu, inicial, calcular, fechar, aplicar }: {
  vendedor: Vendedor; leitura: boolean; metaBu: number; inicial: Fixados
  calcular: (f: Fixados) => LinhaRamo[]; fechar: () => void; aplicar: (f: Fixados, linhas: LinhaRamo[]) => void
}) {
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const fixadosTela: Fixados = { ...inicial }
  for (const [k, t] of Object.entries(textos)) fixadosTela[k] = t.trim() === '' ? null : lerValor(t) ?? 0
  const linhasRamo = calcular(fixadosTela)

  function confirmar() {
    if (Object.values(textos).some(t => t.trim() !== '' && lerValor(t) === null)) { setErro(mensagemInvalido([vendedor.NOME])); return }
    if (!validarRamos(linhasRamo, metaBu)) { setErro(mensagemRamosAcima([vendedor.NOME])); return }
    aplicar(fixadosTela, linhasRamo)
  }

  return (
    <Dialog open onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Meta por ramo/UF · {vendedor.NOME}</DialogTitle>
          <DialogDescription>Meta do vendedor no departamento: {moeda(metaBu)}. Valor digitado fica personalizado; campo vazio volta a automático e divide a sobra pela base do planejamento.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          {!linhasRamo.length ? <EmptyState title="Sem planejamento por ramo nas UFs deste vendedor" /> : (
            <Table>
              <thead><tr><Th>UF · Ramo</Th><Th numeric>Meta</Th><Th numeric>Realizado</Th><Th>Tipo</Th></tr></thead>
              <tbody>
                {linhasRamo.map(l => {
                  const k = chaveRamo(l.ramo, l.uf)
                  return (
                    <Tr key={k}>
                      <Td><RowTitle>{l.ramoNome}</RowTitle><RowMeta>{l.uf}</RowMeta></Td>
                      <Td numeric className="py-1.5">
                        {l.editavel ? (
                          <Input
                            aria-label={`Meta de ${l.ramoNome} ${l.uf}`}
                            disabled={leitura}
                            inputMode="decimal"
                            className="ml-auto h-8 w-36 text-right"
                            placeholder={paraCampo(l.valor)}
                            value={textos[k] ?? (l.personalizada ? paraCampo(l.valor) : '')}
                            onChange={e => { const t = e.target.value; setTextos(x => ({ ...x, [k]: t })) }}
                          />
                        ) : <span className="text-ink-muted" title="Ramo sem planejamento: não recebe meta">—</span>}
                      </Td>
                      <Td numeric>{moeda(l.realizado)}</Td>
                      <Td>{!l.editavel ? 'Sem planejamento' : l.personalizada ? 'Personalizada' : 'Automática'}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={fechar}>Cancelar</Button>
          {!leitura ? <Button variant="primary" onClick={confirmar}>Aplicar ao vendedor</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
