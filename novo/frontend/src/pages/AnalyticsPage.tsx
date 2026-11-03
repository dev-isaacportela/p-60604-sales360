// Analytics (spec 007, RF-001/002): filtro de escopo, Período, Ramos e
// Clientes valem só no Buscar (RN-002). Os blocos de Overview, Clientes e
// Produtos carregam aqui, uma SF por bloco, e as abas reusam o que já veio.

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { acao, linha, linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import {
  MSG_BUSCAR, PERIODOS, abas, filtroDoClique, periodo, periodoAnterior, porDia, type TipoPeriodo,
} from '@/lib/analytics'
import {
  Actions, Alert, Button, Field, FilterChip, Input, PageHeader, Panel, SelectMenu, Stack, Tabs, TabsContent, TabsList, TabsTrigger, Toolbar,
} from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { useSessao } from '@/components/sessao-contexto'
import { useBloco } from '@/components/use-bloco'
import { MultiEscolha } from './analytics/comum'
import { paramsDe, type Consulta, type Opcao } from './analytics/consulta'
import { Overview } from './analytics/Overview'
import { Clientes } from './analytics/Clientes'
import { Produtos } from './analytics/Produtos'
import { Metas } from './analytics/Metas'
import { Modular } from './analytics/Modular'

export default function AnalyticsPage() {
  const { sessao } = useSessao()
  const hoje = hojeBrasilia()
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hoje), [filtro.escopo, hoje])
  const inicial = periodo('MES', hoje) as { de: string; ate: string }

  const [tipo, setTipo] = useState<TipoPeriodo>('MES')
  const [de, setDe] = useState(inicial.de)
  const [ate, setAte] = useState(inicial.ate)
  const [ramos, setRamos] = useState<Opcao[]>([])
  const [clientes, setClientes] = useState<Opcao[]>([])
  const [erroPeriodo, setErroPeriodo] = useState<string | null>(null)
  const [consulta, setConsulta] = useState<Consulta>({ escopo, de: inicial.de, ate: inicial.ate, ramos: [], clientes: [], produtos: [] })
  const [aba, setAba] = useState('Overview')

  const [opcoesRamo, setOpcoesRamo] = useState<Opcao[]>([])
  const [opcoesCliente, setOpcoesCliente] = useState<Opcao[]>([])
  const [busca, setBusca] = useState('')
  useEffect(() => {
    linhas('clientesRamos').then(rs => setOpcoesRamo(rs.map(r => ({ value: String(r.RAMO), label: String(r.RAMO) })))).catch(f => console.error('s360ClientesRamos', f))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      acao('carteiraCarregar', { ...escopo, busca, ramo: '', status: '', ordem: 'NOME_AZ', pendentes: '0', pagina: '1', porPagina: '8' })
        .then(r => setOpcoesCliente(((r.linhas ?? []) as Record<string, unknown>[]).map(l => ({ value: String(l.ID), label: String(l.NOME ?? l.ID) }))))
        .catch(f => console.error('s360CarteiraCarregar (busca)', f))
    }, 400)
    return () => clearTimeout(t)
  }, [busca, escopo])

  function buscar(extra: Partial<Consulta> = {}) {
    const p = periodo(tipo, hoje, de, ate)
    if ('erro' in p) { setErroPeriodo(p.erro); return }
    setErroPeriodo(null)
    setConsulta({ escopo, de: p.de, ate: p.ate, ramos, clientes, produtos: consulta.produtos, ...extra })
  }

  /** RF-023: clique no ranking de cliente ou produto aplica como um Buscar. */
  function filtrarPor(grafico: 'CLIENTE' | 'PRODUTO', item: Opcao) {
    if (grafico === 'CLIENTE') setClientes([item])
    setConsulta(c => filtroDoClique(c, grafico, item))
  }

  const p = useMemo(() => paramsDe(consulta), [consulta])
  const ant = periodoAnterior(consulta.de, consulta.ate)
  const resumo = useBloco(() => linha('analyticsResumo', p), [p])
  const evolucao = useBloco(() => linhas('analyticsEvolucao', { ...p, porDia: porDia(consulta.de, consulta.ate) ? '1' : '0' }), [p])
  const produtos = useBloco(() => linhas('analyticsProdutos', p), [p])
  const topClientes = useBloco(() => linhas('analyticsClientes', p), [p])
  const carteira = useBloco(() => linha('analyticsCarteira', { ...p, ...ant }), [p])
  const visitas = useBloco(() => linhas('analyticsVisitas', p), [p])
  const evolucaoCliente = useBloco(() => (consulta.clientes.length ? linhas('analyticsEvolucaoCliente', p) : Promise.resolve([])), [p])

  const listaAbas = abas(sessao)
  const blocos = { resumo, evolucao, produtos, topClientes, carteira, visitas, evolucaoCliente }

  return (
    <Stack>
      <PageHeader
        module="Análise"
        title="Analytics"
        description="Meta, faturamento, carteira, mix e devoluções no período."
        actions={<Actions><FiltroEscopo {...filtro} /></Actions>}
        meta={<>Período aplicado: {fmtData(consulta.de)} a {fmtData(consulta.ate)}</>}
      />
      <Panel>
        <Toolbar>
          <Field label="Período">
            <SelectMenu label="Período" value={tipo} onChange={v => setTipo(v as TipoPeriodo)} options={PERIODOS} />
          </Field>
          {tipo === 'PERSONALIZADO' ? (
            <>
              <Field label="De"><Input type="date" aria-label="Data inicial" value={de} onChange={e => setDe(e.target.value)} className="h-9" /></Field>
              <Field label="Até"><Input type="date" aria-label="Data final" value={ate} onChange={e => setAte(e.target.value)} className="h-9" /></Field>
            </>
          ) : null}
          <Field label="Ramos"><MultiEscolha label="Ramos" opcoes={opcoesRamo} valor={ramos} mudar={setRamos} /></Field>
          <Field label="Clientes"><MultiEscolha label="Clientes" opcoes={opcoesCliente} valor={clientes} mudar={setClientes} buscar={setBusca} vazio="Todos da carteira" /></Field>
          <Button variant="primary" onClick={() => buscar()}><Search aria-hidden />Buscar</Button>
        </Toolbar>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[12px] text-ink-secondary">
          <span>{MSG_BUSCAR}</span>
          {consulta.produtos.map(x => <FilterChip key={x.value} label="Produto" value={x.label} onClear={() => setConsulta(c => ({ ...c, produtos: c.produtos.filter(y => y.value !== x.value) }))} />)}
          {consulta.clientes.map(x => (
            <FilterChip key={x.value} label="Cliente" value={x.label} onClear={() => { setClientes(cs => cs.filter(y => y.value !== x.value)); setConsulta(c => ({ ...c, clientes: c.clientes.filter(y => y.value !== x.value) })) }} />
          ))}
        </div>
        {erroPeriodo ? <div className="px-4 pb-3"><Alert tone="error">{erroPeriodo}</Alert></div> : null}
      </Panel>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {listaAbas.map(a => <TabsTrigger key={a} value={a} className="flex-none">{a}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="Overview"><Overview consulta={consulta} params={p} hoje={hoje} blocos={blocos} filtrarPor={filtrarPor} /></TabsContent>
        <TabsContent value="Clientes"><Clientes consulta={consulta} params={p} ant={ant} blocos={blocos} filtrarPor={filtrarPor} /></TabsContent>
        <TabsContent value="Produtos"><Produtos blocos={blocos} filtrarPor={filtrarPor} /></TabsContent>
        {listaAbas.includes('Metas') ? <TabsContent value="Metas"><Metas hoje={hoje} /></TabsContent> : null}
        <TabsContent value="Modular"><Modular params={p} hoje={hoje} /></TabsContent>
      </Tabs>
    </Stack>
  )
}

AnalyticsPage.rota = '/analytics'
