// Agenda (spec 003, etapa 1): Dia, Semana e Mês do escopo aberto (RF-001,
// RNT-003), criação dos quatro tipos, check-in/out, reagendar, cancelar,
// concluir, e o painel lateral com meta semanal, resumo e legenda (RF-014).
// A visão inicial é a preferência `Modo padrão da Agenda` (sessão da 001).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { linha, linhas, linhasAfetadas, acao as executar } from '@/lib/mitra-api'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { LEGENDA, meta, navegar, periodo, rotuloPeriodo, semanaDe } from '@/lib/agenda'
import type { Acao, Modo } from '@/lib/agenda'
import { Actions, Alert, Button, IconButton, PageHeader, Panel, PanelBody, PanelHeader, Stack } from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { useSessao } from '@/components/sessao-contexto'
import { Grade } from './agenda/Grade'
import { Detalhe, Encerrar, Historico, NovaAgenda, Reagendar, TextoAcao, VerTexto } from './agenda/dialogos'
import { BarraPeriodo, ComPainel, ItemPainel, ListaPainel, Progresso, RotuloPeriodo } from './agenda/layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Janela = { acao: Acao | 'detalhe'; item: Linha } | null

const MODOS: { modo: Modo; rotulo: string }[] = [
  { modo: 'DIA', rotulo: 'Dia' },
  { modo: 'SEMANA', rotulo: 'Semana' },
  { modo: 'MES', rotulo: 'Mês' },
]

export default function AgendaPage() {
  const { sessao } = useSessao()
  const hoje = hojeBrasilia()
  const [modo, setModo] = useState<Modo>(sessao.modoAgenda)
  const [data, setData] = useState(hoje)
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hoje), [filtro.escopo, hoje])
  const { de, ate } = periodo(modo, data)
  const semana = semanaDe(data)

  const [itens, setItens] = useState<Linha[] | null>(null)
  const [resumo, setResumo] = useState<Linha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [recarga, setRecarga] = useState(0)
  // `?clienteId=&cliente=`: "Agendar visita" da Prospecção (spec 008) abre a Nova visita com o cliente.
  const local = useLocation()
  const clienteDaUrl = useMemo(() => {
    const p = new URLSearchParams(local.search)
    const id = (p.get('clienteId') ?? '').replace(/\D/g, '')
    return id ? { id, nome: p.get('cliente') || `Cliente ${id}` } : null
  }, [local.search])
  const [nova, setNova] = useState(!!clienteDaUrl)
  const [janela, setJanela] = useState<Janela>(null)
  const [historico, setHistorico] = useState<number | null>(null)
  const recarregar = useCallback(() => setRecarga(n => n + 1), [])

  useEffect(() => {
    let vivo = true
    setErro(null)
    Promise.all([
      linhas('agendaListar', { ...escopo, de, ate }),
      linha('agendaResumo', { ...escopo, ...semana }),
    ])
      .then(([lista, r]) => { if (vivo) { setItens(lista); setResumo(r) } })
      .catch(falha => {
        console.error('s360AgendaListar', falha)
        if (vivo) setErro('Não foi possível carregar a agenda. Tente de novo.')
      })
    return () => { vivo = false }
    // semana deriva de data; de/ate de modo e data
  }, [escopo, de, ate, semana.segunda, recarga]) // eslint-disable-line react-hooks/exhaustive-deps

  function concluido(texto: string) {
    setJanela(null)
    setNova(false)
    setAviso({ tom: 'success', texto })
    recarregar()
  }

  // RN-006: check-in com um toque, sem confirmação; abre o relato em seguida.
  async function agir(a: Acao, item: Linha) {
    setAviso(null)
    if (a !== 'checkin') { setJanela({ acao: a, item }); return }
    try {
      const n = linhasAfetadas(await executar('agendaCheckin', { origem: item.ORIGEM, id: String(item.ID) }))
      if (n < 1) {
        setJanela(null)
        setAviso({ tom: 'error', texto: 'Nada foi alterado: o check-in vale só para compromisso agendado que você opera.' })
        return
      }
      recarregar()
      setJanela({ acao: 'checkout', item: { ...item, STATUS: 'EM_ANDAMENTO' } })
    } catch (falha) {
      console.error('s360AgendaCheckin', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível fazer o check-in agora. Tente de novo.' })
    }
  }

  const m = meta(resumo)
  const fechar = () => setJanela(null)
  const aberta = (a: Acao | 'detalhe') => (janela?.acao === a ? janela.item : null)
  const eventos = { detalhe: (item: Linha) => setJanela({ acao: 'detalhe', item }), agir, historico: setHistorico }
  const contagem = (status: string) => {
    const chave = { AGENDADA: 'AGENDADAS', EM_ANDAMENTO: 'EM_ANDAMENTO', CONCLUIDA: 'CONCLUIDAS', CANCELADA: 'CANCELADAS' }[status] ?? ''
    return Number(resumo?.[chave] ?? 0)
  }

  return (
    <Stack>
      <PageHeader
        module="Comercial"
        title="Agenda"
        description="Visitas, prospecções, compromissos internos e deslocamentos."
        actions={
          <Actions>
            <FiltroEscopo {...filtro} />
            <Button variant="primary" onClick={() => { setAviso(null); setNova(true) }}><Plus aria-hidden />Nova agenda</Button>
          </Actions>
        }
      />
      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}
      <ComPainel
        painel={
          <>
            <Panel>
              <PanelHeader title="Status da Meta Semanal" hint="Concluídas de segunda a sexta." />
              <PanelBody>
                <Progresso fracao={m.meta ? m.realizadas / m.meta : 0} rotulo={`${m.realizadas} de ${m.meta} visitas, ${m.percentual}%`} />
                <ListaPainel>
                  <ItemPainel rotulo="Realizadas" valor={m.realizadas} />
                  <ItemPainel rotulo="Meta" valor={m.meta} />
                  <ItemPainel rotulo="Restantes" valor={m.restantes} />
                  <ItemPainel rotulo="Atingido" valor={`${m.percentual}%`} />
                </ListaPainel>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Resumo da semana" hint={rotuloPeriodo('SEMANA', data)} />
              <PanelBody>
                <ListaPainel>
                  {LEGENDA.map(l => <ItemPainel key={l.status} cor={l.cor} rotulo={l.status === 'AGENDADA' ? 'Agendadas' : l.status === 'CONCLUIDA' ? 'Concluídas' : l.status === 'CANCELADA' ? 'Canceladas' : 'Em andamento'} valor={contagem(l.status)} />)}
                </ListaPainel>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Legenda" />
              <PanelBody>
                <ListaPainel>
                  {LEGENDA.map(l => <ItemPainel key={l.status} cor={l.cor} rotulo={l.rotulo} />)}
                </ListaPainel>
              </PanelBody>
            </Panel>
          </>
        }
      >
        <Panel>
          <BarraPeriodo>
            <IconButton label="Período anterior" onClick={() => setData(navegar(modo, data, -1))}><ChevronLeft aria-hidden /></IconButton>
            <IconButton label="Próximo período" onClick={() => setData(navegar(modo, data, 1))}><ChevronRight aria-hidden /></IconButton>
            <Button size="sm" onClick={() => setData(hojeBrasilia())}>Hoje</Button>
            <RotuloPeriodo>{rotuloPeriodo(modo, data)}</RotuloPeriodo>
            <Actions>
              {MODOS.map(v => (
                <Button key={v.modo} size="sm" variant={v.modo === modo ? 'primary' : 'ghost'} aria-pressed={v.modo === modo} onClick={() => setModo(v.modo)}>
                  {v.rotulo}
                </Button>
              ))}
            </Actions>
          </BarraPeriodo>
          {erro ? (
            <PanelBody><Alert tone="error">{erro}</Alert></PanelBody>
          ) : itens ? (
            <Grade modo={modo} itens={itens} data={data} hoje={hoje} ev={eventos} abrirDia={dia => { setData(dia); setModo('DIA') }} />
          ) : (
            <PanelBody><span aria-live="polite">Carregando a agenda…</span></PanelBody>
          )}
        </Panel>
      </ComPainel>

      <NovaAgenda aberto={nova} hoje={hoje} eu={sessao.userId} fechar={() => setNova(false)} salvo={concluido} cliente={clienteDaUrl} />
      <Detalhe item={aberta('detalhe')} fechar={fechar} agir={agir} />
      <VerTexto item={aberta('verPlanejamento')} qual="planejamento" fechar={fechar} />
      <VerTexto item={aberta('verRelato')} qual="relato" fechar={fechar} />
      <Reagendar item={aberta('reagendar')} hoje={hoje} eu={sessao.userId} fechar={fechar} salvo={concluido} alterado={recarregar} />
      <Encerrar item={aberta('checkout')} fechar={() => { fechar(); recarregar() }} salvo={concluido} />
      <TextoAcao item={aberta('cancelar')} qual="cancelar" hoje={hoje} fechar={fechar} salvo={concluido} />
      <TextoAcao item={aberta('concluir')} qual="concluir" hoje={hoje} fechar={fechar} salvo={concluido} />
      <TextoAcao item={aberta('editarRelato')} qual="editarRelato" hoje={hoje} fechar={fechar} salvo={concluido} />
      <Historico clienteId={historico} fechar={() => setHistorico(null)} />
    </Stack>
  )
}

AgendaPage.rota = '/agenda'
