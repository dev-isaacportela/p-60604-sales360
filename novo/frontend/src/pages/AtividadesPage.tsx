// Atividades (spec 004): Lista ou Kanban (inicial = preferência da sessão,
// RF-001), cards, filtros, criar, editar, trocar status e excluir. Abre com
// abertas + resumo; concluídas só sob demanda (RNF-001). Depois de criar,
// mudar status ou excluir, o menu relê o contador na hora (RF-010).

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { avisarContadores } from '@/lib/contadores'
import {
  FILTROS_VAZIOS, MSG, PRIORIDADES, STATUS, confirmacaoExclusao, mensagemRecusa, mensagemStatus, visaoInicial,
} from '@/lib/atividades'
import {
  Actions, Alert, Button, IconButton, InfoTile, PageHeader, Panel, Stack, TextLink, Toolbar,
} from '@/components/page'
import { cn } from '@/lib/utils'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { BlocoFalhou } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import { useSessao } from '@/components/sessao-contexto'
import { JanelaAtividade } from './atividades/JanelaAtividade'
import { Kanban } from './atividades/Kanban'
import { Lista } from './atividades/Lista'
import { FiltroPrazo, GradeCards, PONTO_PRIORIDADE, Pilulas } from './atividades/comum'
import type { AcoesAtividade, Linha } from './atividades/comum'

const TODOS = { value: '', label: 'Todos' }

export default function AtividadesPage() {
  const { sessao } = useSessao()
  const [visao, setVisao] = useState(() => visaoInicial(sessao))
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [janela, setJanela] = useState<{ atividade: Linha | null } | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const [blocoConcluidas, setBlocoConcluidas] = useState(false)
  const [paginaDe, setPaginaDe] = useState({ chave: '', pagina: 1 })
  const [concluidas, setConcluidas] = useState<{ linhas: Linha[]; total: number } | null>(null)

  const filtro = useEscopo()
  const hoje = hojeBrasilia()
  const escopo = useMemo(() => paraInput(filtro.escopo, hojeBrasilia()), [filtro.escopo])
  const input = useMemo(() => ({ ...escopo, ...filtros }), [escopo, filtros])

  const bloco = useBloco(
    () => Promise.all([linhas('atividadesAbertas', input), linhas('atividadesResumo', input)]),
    [input, recarga],
  )
  const abertas = bloco.dados?.[0] ?? []
  const resumo = bloco.dados?.[1]?.[0]

  // Filtro ou escopo mudou: concluídas voltam à página 1.
  const chave = JSON.stringify(input)
  const pagina = paginaDe.chave === chave ? paginaDe.pagina : 1
  const setPagina = (p: number) => setPaginaDe({ chave, pagina: p })

  const precisaConcluidas = visao === 'KANBAN' || blocoConcluidas
  useEffect(() => {
    if (!precisaConcluidas) return
    let vivo = true
    linhas('atividadesConcluidas', { ...input, pagina: String(pagina) })
      .then(ls => { if (vivo) setConcluidas({ linhas: ls, total: Number(ls[0]?.TOTAL) || 0 }) })
      .catch(falha => { console.error('s360AtividadesConcluidas', falha); if (vivo) setConcluidas({ linhas: [], total: 0 }) })
    return () => { vivo = false }
  }, [precisaConcluidas, input, pagina, recarga])

  function feito(texto: string, contador = true) {
    setAviso({ tom: 'success', texto })
    setRecarga(n => n + 1)
    if (contador) avisarContadores()
  }

  const acoes: AcoesAtividade = {
    hoje,
    mostrarResponsavel: escopo.modo !== 'ME',
    abrir: a => setJanela({ atividade: a }),
    async trocarStatus(a, status) {
      try {
        const n = await gravar('atividadeStatus', { id: String(a.ID), status })
        if (n > 0) feito(mensagemStatus(status))
        else setAviso({ tom: 'error', texto: mensagemRecusa(!!a.SOMENTE_LEITURA, 'salvar') })
      } catch (falha) {
        console.error('s360AtividadeStatus', falha)
        setAviso({ tom: 'error', texto: mensagemRecusa(false, 'salvar') })
      }
    },
    excluir: a => setPedido({
      titulo: 'Excluir atividade',
      texto: confirmacaoExclusao(a.TITULO),
      botao: 'Excluir',
      perigo: true,
      async executar() {
        try {
          const n = await gravar('atividadeExcluir', { id: String(a.ID) })
          if (n > 0) feito(MSG.removida)
          else setAviso({ tom: 'error', texto: mensagemRecusa(!!a.SOMENTE_LEITURA, 'excluir') })
        } catch (falha) {
          console.error('s360AtividadeExcluir', falha)
          setAviso({ tom: 'error', texto: mensagemRecusa(false, 'excluir') })
        }
      },
    }),
  }

  const mudar = (campo: keyof typeof FILTROS_VAZIOS, valor: string) => setFiltros(f => ({ ...f, [campo]: valor }))
  const temFiltro = !!(filtros.status || filtros.prioridade || filtros.prazo)
  const n = (campo: string) => (resumo ? Number(resumo[campo]) || 0 : '—')

  return (
    <Stack>
      <PageHeader
        module="Atividades"
        title="Atividades"
        description="Retornos, cotações, propostas e cobranças, em lista ou kanban."
        actions={
          <Actions>
            <FiltroEscopo {...filtro} />
            <Button variant="primary" onClick={() => setJanela({ atividade: null })}><Plus aria-hidden />Nova Atividade</Button>
          </Actions>
        }
      />
      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}
      <GradeCards>
        <InfoTile label="Total">{n('TOTAL')}</InfoTile>
        <InfoTile label="Em andamento">{n('EM_ANDAMENTO')}</InfoTile>
        <InfoTile label="Atrasadas">{n('ATRASADAS')}</InfoTile>
        <InfoTile label="Concluídas">{n('CONCLUIDAS')}</InfoTile>
      </GradeCards>
      <Panel>
        {/* Uma linha só: status e prioridade em botões, prazo num botão, visão e atualizar à direita. */}
        <Toolbar className="items-center gap-x-5 gap-y-2.5">
          <Pilulas rotulo="Status" opcoes={[TODOS, ...STATUS]} valor={filtros.status} mudar={v => mudar('status', v)} />
          <Pilulas rotulo="Prioridade" opcoes={[{ value: '', label: 'Todas' }, ...PRIORIDADES.map(p => ({ ...p, ponto: PONTO_PRIORIDADE[p.value] }))]} valor={filtros.prioridade} mudar={v => mudar('prioridade', v)} />
          <FiltroPrazo valor={filtros.prazo} mudar={v => mudar('prazo', v)} />
          {temFiltro ? <TextLink onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</TextLink> : null}
          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label="Visão" className="inline-flex rounded-full border border-rule-table p-0.5">
              {([['LISTA', 'Lista'], ['KANBAN', 'Kanban']] as const).map(([v, rotulo]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  onClick={() => setVisao(v)}
                  className={cn('min-h-8 rounded-full px-3.5 text-[13px] transition-colors', visao === v ? 'bg-primary font-semibold text-primary-foreground' : 'text-ink-secondary hover:text-ink')}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <IconButton label="Atualizar" onClick={() => setRecarga(r => r + 1)}><RefreshCw aria-hidden /></IconButton>
          </div>
        </Toolbar>
      </Panel>
      {bloco.erro ? (
        <Panel><BlocoFalhou /></Panel>
      ) : visao === 'LISTA' ? (
        <Lista
          abertas={abertas}
          concluidas={concluidas}
          aberto={blocoConcluidas}
          alternar={() => setBlocoConcluidas(a => !a)}
          pagina={pagina}
          mudarPagina={setPagina}
          acoes={acoes}
        />
      ) : (
        <Kanban abertas={abertas} concluidas={concluidas} pagina={pagina} mudarPagina={setPagina} acoes={acoes} />
      )}
      {janela ? (
        <JanelaAtividade
          key={janela.atividade?.ID ?? 'nova'}
          aberta
          atividade={janela.atividade}
          escopo={escopo}
          hoje={hoje}
          fechar={() => setJanela(null)}
          salvo={texto => { setJanela(null); feito(texto, !janela.atividade) }}
        />
      ) : null}
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </Stack>
  )
}

AtividadesPage.rota = '/tarefas'
