// Mix Builder (spec 009): Construtor e Meus Mix. Regra de cálculo, troca de
// cliente, bloqueio do salvar, planilha e proposta em lib/mix.ts; aqui só
// estado, chamadas e desenho. Avisos ficam como Alert onde a ação aconteceu
// (design.md §1.4: sem toast).

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Download, Eye, Pencil, Printer, Send, Trash2, X } from 'lucide-react'
import logoBenenutri from '@/assets/logo-benenutri.png'
import { acao, linha, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, fmtData, hojeBrasilia, moeda } from '@/lib/formato'
import {
  AVISO_FORA_CARTEIRA, AVISO_POPUP, ETIQUETA_SEM_CUSTO, LIMITE_CONTROLES,
  abrirProposta, aplicarTrocaCliente, calcularItem, csvMix, duplicar, faixaCmvConcorrente, faixaMargem, filtrarOrdenar,
  fotoSegura, htmlProposta, idadeCustos, itemGravado, itemNovo, lerValor, motivoBloqueioSalvar, mudarMargem, mudarPreco,
  nomeArquivo, opcoesPorProduto, payloadItens, pct, rotuloCusto, totais, trocarCusto,
} from '@/lib/mix'
import type { FaixaMargem, Item, OpcaoCusto, Ordem, Preferencia, Produto } from '@/lib/mix'
import {
  Alert, Badge, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, IconButton, Input, LabelledField, PageHeader, Panel, PanelBody, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Stack, Status, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Cliente = { id: number; rotulo: string }
type Aviso = { tom: 'success' | 'error' | 'warn' | 'info'; texto: string }

const POR_PAGINA = 20
const ORDENS = [
  { value: 'inclusao', label: 'Ordem de inclusão' },
  { value: 'menorMargem', label: 'Menor margem' },
  { value: 'maiorMargem', label: 'Maior margem' },
  { value: 'maiorSubtotal', label: 'Maior subtotal' },
]
const TOM_FAIXA: Record<FaixaMargem, 'live' | 'attention' | 'alert'> = { 'Saudável': 'live', 'Atenção': 'attention', Baixa: 'alert' }
const TOM_CMV = { verde: 'live', ambar: 'attention', vermelho: 'alert' } as const
const FALHA = 'Não foi possível concluir agora. Tente de novo em instantes.'

const num = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const logoAbsoluto = () => new URL(logoBenenutri, window.location.href).href

/** Espera a pessoa parar de digitar (RNF-003). */
function useAtrasado<T>(valor: T, ms = 250): T {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return atrasado
}

export default function SimulacaoPage() {
  const [aba, setAba] = useState('construtor')
  const [aviso, setAviso] = useState<Aviso | null>(null)

  // Construtor
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preferencia, setPreferencia] = useState<Preferencia>('PADRAO')
  const [itens, setItens] = useState<Item[]>([])
  const [opcoes, setOpcoes] = useState<Map<number, OpcaoCusto[]>>(new Map())
  const [editando, setEditando] = useState<{ id: number; data: string } | null>(null)
  const [foraDaCarteira, setForaDaCarteira] = useState(false)
  const [comparativo, setComparativo] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('inclusao')
  const [ocupado, setOcupado] = useState(false)

  // Meus Mix
  const [mixes, setMixes] = useState<Linha[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [listaEstado, setListaEstado] = useState<'carregando' | 'ok' | 'falha'>('carregando')
  const [custos, setCustos] = useState<{ texto: string; aviso: boolean } | null>(null)
  const [visualizar, setVisualizar] = useState<{ mix: Linha; itens: Item[] } | null>(null)
  const [excluir, setExcluir] = useState<Linha | null>(null)

  // Quem pagina marca 'carregando' antes; a recarga depois de salvar mantém a lista na tela.
  const carregarLista = useCallback((paginaPedida: number) =>
    linhas('mixListar', { offset: (paginaPedida - 1) * POR_PAGINA, hoje: hojeBrasilia() })
      .then(rows => {
        setMixes(rows)
        setTotal(Number(rows[0]?.TOTAL ?? 0))
        setPagina(paginaPedida)
        setListaEstado('ok')
      })
      .catch(falha => {
        console.error('s360MixListar', falha)
        setListaEstado('falha')
      }), [])

  // Abertura: 2 consultas (RNFT-002).
  useEffect(() => {
    linha('mixCustosStatus')
      .then(s => setCustos(idadeCustos(s?.ULTIMA_ATUALIZACAO)))
      .catch(falha => {
        console.error('s360MixCustosStatus', falha)
        setCustos({ texto: 'Não foi possível ver quando os custos foram atualizados.', aviso: true })
      })
    void carregarLista(1)
  }, [carregarLista])

  function limpar() {
    setCliente(null); setNome(''); setDescricao(''); setItens([]); setOpcoes(new Map())
    setEditando(null); setForaDaCarteira(false); setFiltro(''); setOrdem('inclusao')
  }

  async function buscarOpcoes(clienteId: number, produtos: number[]) {
    if (!produtos.length) return new Map<number, OpcaoCusto[]>()
    return opcoesPorProduto(await linhas('mixCustosOpcoes', { clienteId, produtos: produtos.join(','), hoje: hojeBrasilia() }))
  }

  // RN-010: trocar o cliente com itens no mix reavalia os custos especiais.
  async function escolherCliente(novo: Cliente) {
    setAviso(null)
    if (!itens.length) {
      setCliente(novo); setForaDaCarteira(false)
      return
    }
    setOcupado(true)
    try {
      const novas = await buscarOpcoes(novo.id, itens.map(i => i.codprod))
      const troca = aplicarTrocaCliente(itens, novas)
      setCliente(novo); setForaDaCarteira(false); setOpcoes(novas); setItens(troca.itens)
      if (troca.mensagem) setAviso({ tom: 'info', texto: troca.mensagem })
    } catch (falha) {
      console.error('troca de cliente', falha)
      setAviso({ tom: 'error', texto: FALHA })
    } finally {
      setOcupado(false)
    }
  }

  async function incluir(produto: Produto) {
    setAviso(null)
    if (!cliente) return
    if (itens.some(i => i.codprod === produto.codprod)) {
      setAviso({ tom: 'warn', texto: 'Este produto já está no mix.' })
      return
    }
    setOcupado(true)
    try {
      const doProduto = (await buscarOpcoes(cliente.id, [produto.codprod])).get(produto.codprod) ?? []
      const { item, aviso: semCusto } = itemNovo(produto, doProduto, preferencia)
      setOpcoes(atual => new Map(atual).set(produto.codprod, doProduto))
      setItens(atual => [...atual, item])
      if (semCusto) setAviso({ tom: 'warn', texto: semCusto })
    } catch (falha) {
      console.error('incluir produto', falha)
      setAviso({ tom: 'error', texto: FALHA })
    } finally {
      setOcupado(false)
    }
  }

  const mudar = (codprod: number, fn: (i: Item) => Item) => setItens(atual => atual.map(i => (i.codprod === codprod ? fn(i) : i)))

  const motivo = motivoBloqueioSalvar({ clienteId: cliente?.id ?? null, nome, itens, foraDaCarteira })

  async function salvar() {
    if (motivo || !cliente) return
    setOcupado(true)
    setAviso(null)
    try {
      const entrada = { nome: nome.trim(), descricao: descricao.trim(), clienteId: cliente.id, itens: payloadItens(itens), agora: agoraBrasilia(), hoje: hojeBrasilia() }
      const resposta = editando ? await acao('mixAtualizar', { ...entrada, mixId: editando.id }) : await acao('mixCriar', entrada)
      if (linhasAfetadas(resposta) < 1) {
        setAviso({ tom: 'error', texto: 'Nada foi salvo: este cliente não está na sua carteira ou há itens inválidos no mix.' })
        return
      }
      const texto = editando ? 'Mix atualizado com sucesso.' : 'Mix salvo com sucesso.'
      limpar()
      setAviso({ tom: 'success', texto })
      void carregarLista(1)
    } catch (falha) {
      console.error('salvar mix', falha)
      setAviso({ tom: 'error', texto: FALHA })
    } finally {
      setOcupado(false)
    }
  }

  async function itensDoMix(mix: Linha, comOpcoes: boolean) {
    const rows = await linhas('mixItens', { mixId: mix.ID })
    const mapa = comOpcoes ? await buscarOpcoes(Number(mix.CLIENTE_ID), rows.map(r => Number(r.ID_PRODUTO))) : new Map<number, OpcaoCusto[]>()
    return { mapa, itens: rows.map(r => itemGravado(r, mapa.get(Number(r.ID_PRODUTO)) ?? [])) }
  }

  // Editar e duplicar abrem no Construtor; duplicar não grava nada (RF-012).
  async function abrirNoConstrutor(mix: Linha, modo: 'editar' | 'duplicar') {
    setAviso(null)
    setOcupado(true)
    try {
      const { mapa, itens: doMix } = await itensDoMix(mix, true)
      const base = { nome: String(mix.NOME), itens: doMix }
      const alvo = modo === 'duplicar' ? duplicar(base, doMix) : base
      setCliente({ id: Number(mix.CLIENTE_ID), rotulo: String(mix.CLIENTE) })
      setNome(alvo.nome)
      setDescricao(String(mix.DESCRICAO ?? ''))
      setItens(alvo.itens)
      setOpcoes(mapa)
      setEditando(modo === 'editar' ? { id: Number(mix.ID), data: String(mix.DT_CRIACAO) } : null)
      setForaDaCarteira(Number(mix.NA_CARTEIRA) === 0)
      setAba('construtor')
    } catch (falha) {
      console.error('abrir mix', falha)
      setAviso({ tom: 'error', texto: FALHA })
    } finally {
      setOcupado(false)
    }
  }

  async function verMix(mix: Linha) {
    setAviso(null)
    try {
      setVisualizar({ mix, itens: (await itensDoMix(mix, false)).itens })
    } catch (falha) {
      console.error('visualizar mix', falha)
      setAviso({ tom: 'error', texto: FALHA })
    }
  }

  // A janela abre já no clique: depois de um await o navegador a bloquearia.
  async function imprimir(origem: Linha | null) {
    setAviso(null)
    const janela = window.open('', '_blank')
    if (!janela) {
      setAviso({ tom: 'error', texto: AVISO_POPUP })
      return
    }
    try {
      const doMix = origem ? (await itensDoMix(origem, false)).itens : itens
      const proposta = origem
        ? { nome: String(origem.NOME), cliente: String(origem.CLIENTE), descricao: String(origem.DESCRICAO ?? ''), data: String(origem.DT_CRIACAO) }
        : { nome: nome.trim() || 'Proposta', cliente: cliente?.rotulo ?? '', descricao: descricao.trim(), data: editando?.data ?? hojeBrasilia() }
      abrirProposta(() => janela, htmlProposta(proposta, doMix, logoAbsoluto()))
    } catch (falha) {
      janela.close()
      console.error('imprimir mix', falha)
      setAviso({ tom: 'error', texto: FALHA })
    }
  }

  function exportar() {
    const url = URL.createObjectURL(new Blob([csvMix(itens)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo(nome || 'mix')
    a.click()
    URL.revokeObjectURL(url)
    setAviso({ tom: 'success', texto: 'Planilha do mix exportada.' })
  }

  async function enviar(mix: Linha) {
    setAviso(null)
    try {
      const resposta = await acao('mixEnviarHistorico', { mixId: mix.ID, agora: agoraBrasilia() })
      if (linhasAfetadas(resposta) < 1) throw new Error('s360MixEnviarHistorico: 0 linhas')
      setAviso({ tom: 'success', texto: 'Mix enviado para o histórico do cliente.' })
      void carregarLista(pagina)
    } catch (falha) {
      console.error('enviar mix', falha)
      setAviso({ tom: 'error', texto: 'Nada foi alterado: não foi possível enviar o mix ao histórico.' })
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    const mix = excluir
    setExcluir(null)
    try {
      const resposta = await acao('mixExcluir', { mixId: mix.ID })
      if (linhasAfetadas(resposta) < 1) throw new Error('s360MixExcluir: 0 linhas')
      if (editando?.id === Number(mix.ID)) limpar()
      setAviso({ tom: 'success', texto: `Mix "${mix.NOME}" excluído.` })
      void carregarLista(mixes.length === 1 && pagina > 1 ? pagina - 1 : pagina)
    } catch (falha) {
      console.error('excluir mix', falha)
      setAviso({ tom: 'error', texto: 'Nada foi alterado: não foi possível excluir o mix.' })
    }
  }

  const t = totais(itens)
  const comControles = itens.length > LIMITE_CONTROLES
  const visiveis = comControles ? filtrarOrdenar(itens, filtro, ordem) : itens
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA))
  const rotuloSalvar = ocupado ? 'Aguarde…' : editando ? 'Atualizar Mix' : 'Salvar Mix'

  return (
    <>
      <PageHeader
        module="Vendas"
        title="Mix Builder"
        description="Monte a proposta com o custo que vale para o cliente hoje e entregue o PDF sem custo nem margem."
        meta={custos && !custos.aviso ? custos.texto : undefined}
      />
      <Stack>
        {custos?.aviso && <Alert tone="warn">{custos.texto}</Alert>}
        {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="construtor">Construtor{itens.length ? ` (${itens.length})` : ''}</TabsTrigger>
            <TabsTrigger value="meus">Meus Mix</TabsTrigger>
          </TabsList>

          <TabsContent value="construtor">
            <Stack>
              {editando && (
                <Alert tone="info">
                  <span className="flex items-center justify-between gap-2">
                    Editando Mix #{editando.id}
                    <IconButton label="Cancelar edição" onClick={() => { limpar(); setAviso(null) }}><X /></IconButton>
                  </span>
                </Alert>
              )}
              {foraDaCarteira && <Alert tone="warn">{AVISO_FORA_CARTEIRA}</Alert>}

              <Panel>
                <PanelBody>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-0 flex-[1_1_260px]">
                      <Field label="Cliente" obrigatorio>
                        <SeletorCliente valor={cliente} onEscolher={escolherCliente} disabled={ocupado} />
                      </Field>
                    </div>
                    <div className="min-w-0 flex-[1_1_220px]">
                      <LabelledField label="Nome do mix" obrigatorio>
                        <Input value={nome} maxLength={220} onChange={e => setNome(e.target.value)} placeholder="Ex.: Campanha Verão" />
                      </LabelledField>
                    </div>
                    <div className="min-w-0 flex-[2_1_260px]">
                      <LabelledField label="Descrição">
                        <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Aparece na proposta" />
                      </LabelledField>
                    </div>
                    <Field label="Custo ao incluir">
                      <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Custo ao incluir" title="Especial usa o menor custo negociado vigente; sem nenhum, o padrão.">
                        {(['PADRAO', 'ESPECIAL'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={preferencia === p}
                            onClick={() => setPreferencia(p)}
                            className={cn('h-7 rounded-lg px-3 text-[13px] font-semibold', preferencia === p ? 'bg-card text-accent-foreground shadow-sm' : 'text-ink-secondary hover:text-ink')}
                          >
                            {p === 'PADRAO' ? 'Padrão' : 'Especial'}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                </PanelBody>
              </Panel>

              <div className="flex flex-wrap items-start gap-4">
                <Panel className="min-w-0 flex-[999_1_640px]">
                  <div className="flex flex-wrap items-start gap-3 border-b border-rule-row px-4 py-3">
                    <div className="min-w-0 flex-[1_1_320px]">
                      <Catalogo liberado={!!cliente && !foraDaCarteira} ocupado={ocupado} onIncluir={incluir} />
                    </div>
                    <Button size="sm" variant={comparativo ? 'primary' : 'secondary'} aria-pressed={comparativo} onClick={() => setComparativo(c => !c)}>Comparativo</Button>
                  </div>
                  {comControles && (
                    <Toolbar>
                      <SearchInput placeholder="Filtrar itens..." value={filtro} onChange={e => setFiltro(e.target.value)} />
                      <SelectMenu label="Ordenar itens" value={ordem} options={ORDENS} onChange={v => setOrdem(v as Ordem)} className="sm:w-56" />
                    </Toolbar>
                  )}
                  {itens.length === 0 ? (
                    <EmptyState title="Nenhum produto no mix" hint={cliente ? 'Busque acima e inclua os produtos da proposta.' : 'Escolha o cliente para liberar o catálogo.'} />
                  ) : (
                    <ItensMix
                      itens={visiveis}
                      opcoes={opcoes}
                      comparativo={comparativo}
                      onQtd={(c, q) => mudar(c, i => ({ ...i, qtd: Math.max(1, Math.round(q)) }))}
                      onMargem={(c, m) => mudar(c, i => mudarMargem(i, m))}
                      onPreco={(c, p) => mudar(c, i => mudarPreco(i, p))}
                      onConcorrente={(c, p) => mudar(c, i => ({ ...i, precoConcorrente: Math.max(0, p) }))}
                      onCusto={(c, o) => mudar(c, i => trocarCusto(i, o))}
                      onRemover={c => setItens(atual => atual.filter(i => i.codprod !== c))}
                    />
                  )}
                </Panel>

                <aside aria-label="Resumo do mix" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 lg:sticky lg:top-4 lg:max-w-[340px]">
                  <ResumoMix t={t} />
                  <div className="hidden flex-col gap-1 lg:flex">
                    <span title={motivo ?? undefined}>
                      <Button variant="primary" wide disabled={!!motivo || ocupado} onClick={salvar}>{rotuloSalvar}</Button>
                    </span>
                    {motivo && <span className="text-[12px] text-ink-secondary">{motivo}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" disabled={!itens.length} onClick={() => imprimir(null)}><Printer aria-hidden />Imprimir/PDF</Button>
                    <MenuExportar desabilitado={!itens.length} onCsv={exportar} />
                  </div>
                </aside>
              </div>

              {/* Celular: total e salvar sempre à mão (layout C/E). */}
              <div className="sticky bottom-2 z-20 flex items-center gap-3 rounded-2xl border border-rule-table bg-card px-4 py-3 shadow-lg lg:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block font-title text-[18px] font-extrabold text-ink">{moeda(t.venda)}</span>
                  {t.itens > 0 && <span className="text-[13px]"><Status tone={TOM_FAIXA[faixaMargem(t.margem)]}>{pct(t.margem)} · {faixaMargem(t.margem)}</Status></span>}
                </span>
                <span title={motivo ?? undefined}>
                  <Button variant="primary" disabled={!!motivo || ocupado} onClick={salvar}>{rotuloSalvar}</Button>
                </span>
              </div>
            </Stack>
          </TabsContent>

          <TabsContent value="meus">
            <Panel>
              <PanelHeader
                title="Meus Mix"
                hint={listaEstado === 'ok' && total > 0 ? `Exibindo ${(pagina - 1) * POR_PAGINA + 1}-${(pagina - 1) * POR_PAGINA + mixes.length} de ${total}` : undefined}
              />
              {listaEstado === 'falha' ? (
                <PanelBody><Alert tone="error">Não foi possível carregar este bloco agora. Tente atualizar a tela.</Alert></PanelBody>
              ) : listaEstado === 'ok' && !mixes.length ? (
                <EmptyState title="Nenhum mix salvo ainda." hint="Monte a proposta no Construtor e clique em Salvar Mix." action={<Button onClick={() => setAba('construtor')}>Ir ao Construtor</Button>} />
              ) : (
                <ListaMix mixes={mixes} onVer={verMix} onEditar={m => abrirNoConstrutor(m, 'editar')} onDuplicar={m => abrirNoConstrutor(m, 'duplicar')} onEnviar={enviar} onImprimir={imprimir} onExcluir={setExcluir} />
              )}
              {total > POR_PAGINA && (
                <div className="flex items-center justify-end gap-2 border-t border-rule-row px-4 py-3">
                  <Button size="sm" disabled={pagina <= 1 || listaEstado === 'carregando'} onClick={() => { setListaEstado('carregando'); void carregarLista(pagina - 1) }}>Anterior</Button>
                  <Button size="sm" disabled={pagina >= ultimaPagina || listaEstado === 'carregando'} onClick={() => { setListaEstado('carregando'); void carregarLista(pagina + 1) }}>Próxima</Button>
                </div>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </Stack>

      <Dialog open={!!visualizar} onOpenChange={aberto => !aberto && setVisualizar(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{visualizar?.mix.NOME}</DialogTitle>
            <DialogDescription>{visualizar?.mix.CLIENTE} · {fmtData(visualizar?.mix.DT_CRIACAO)}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {visualizar && <ItensMix itens={visualizar.itens} opcoes={new Map()} comparativo={false} />}
            {visualizar && <Rodape t={totais(visualizar.itens)} />}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setVisualizar(null)}>Fechar</Button>
            {visualizar && <Button variant="primary" onClick={() => imprimir(visualizar.mix)}><Printer aria-hidden />Imprimir/PDF</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluir} onOpenChange={aberto => !aberto && setExcluir(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir mix</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-[13px] text-ink">Excluir "{excluir?.NOME}" e todos os seus itens? Esta ação não pode ser desfeita.</p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setExcluir(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarExclusao}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

SimulacaoPage.rota = '/simulacao'

/* ─────────────── partes da tela ─────────────── */

const gatilho = 'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-[13px] text-ink shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none disabled:pointer-events-none disabled:bg-muted disabled:text-ink-muted'

/** RF-002: busca no servidor, só carteira (+ herdados por férias ativas). */
function SeletorCliente({ valor, onEscolher, disabled }: { valor: Cliente | null; onEscolher: (c: Cliente) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const termo = useAtrasado(busca)
  const [resultado, setResultado] = useState<{ termo: string | null; lista: Linha[]; falhou: boolean }>({ termo: null, lista: [], falhou: false })
  const estado = resultado.termo !== termo ? 'buscando' : resultado.falhou ? 'falha' : 'ocioso'
  const lista = resultado.lista

  useEffect(() => {
    if (!aberto) return
    let vivo = true
    linhas('mixClientesBuscar', { busca: termo.trim(), buscaDigitos: termo.replace(/\D/g, ''), hoje: hojeBrasilia() })
      .then(rows => { if (vivo) setResultado({ termo, lista: rows, falhou: false }) })
      .catch(falha => { console.error('s360MixClientesBuscar', falha); if (vivo) setResultado({ termo, lista: [], falhou: true }) })
    return () => { vivo = false }
  }, [aberto, termo])

  return (
    <Popover modal open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={aberto} aria-label="Cliente" disabled={disabled} className={cn(gatilho, !valor && 'text-ink-secondary')}>
          <span className="truncate">{valor?.rotulo ?? 'Selecione o cliente'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="pointer-events-auto w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={busca} onValueChange={setBusca} placeholder="Nome, fantasia, CNPJ ou código" />
          <CommandList>
            <CommandEmpty>{estado === 'buscando' ? 'Buscando…' : estado === 'falha' ? 'Não foi possível buscar agora.' : 'Nenhum cliente da sua carteira encontrado.'}</CommandEmpty>
            {lista.map(c => {
              const rotulo = `${c.CODIGO} - ${c.NOME}`
              return (
                <CommandItem key={c.ID} value={String(c.ID)} onSelect={() => { setAberto(false); onEscolher({ id: Number(c.ID), rotulo }) }}>
                  <span className="truncate">{rotulo}</span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** RF-003: catálogo só com cliente; até 8 resultados com foto. */
function Catalogo({ liberado, ocupado, onIncluir }: { liberado: boolean; ocupado: boolean; onIncluir: (p: Produto) => void }) {
  const [busca, setBusca] = useState('')
  const termo = useAtrasado(busca)
  const [encontrados, setLista] = useState<Produto[]>([])
  const [falhou, setFalhou] = useState(false)
  const lista = liberado && termo.trim() ? encontrados : []

  useEffect(() => {
    if (!liberado || !termo.trim()) return
    let vivo = true
    linhas('mixCatalogoBuscar', { busca: termo.trim() })
      .then(rows => {
        if (!vivo) return
        setFalhou(false)
        setLista(rows.map(r => ({ codprod: Number(r.CODPROD), nome: String(r.NOME), categoria: String(r.CATEGORIA ?? ''), foto: fotoSegura(r.FOTO_URL) })))
      })
      .catch(falha => { console.error('s360MixCatalogoBuscar', falha); if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [liberado, termo])

  return (
    <Field label="Adicionar produto">
      <SearchInput
        value={busca}
        disabled={!liberado}
        placeholder={liberado ? 'Nome, código, código de fábrica ou auxiliar' : 'Selecione um cliente para liberar o catálogo de custos'}
        onChange={e => setBusca(e.target.value)}
      />
      {falhou && <Alert tone="error">Não foi possível buscar no catálogo agora.</Alert>}
      {lista.length > 0 && (
        <ul className="mt-2 divide-y divide-rule-row rounded-2xl border border-rule-table">
          {lista.map(p => (
            <li key={p.codprod} className="flex items-center gap-3 px-3 py-2">
              <Foto url={p.foto} nome={p.nome} />
              <span className="min-w-0 flex-1">
                <RowTitle>{p.nome}</RowTitle>
                <RowMeta><Code>{p.codprod}</Code> · {p.categoria}</RowMeta>
              </span>
              <Button size="sm" disabled={ocupado} onClick={() => onIncluir(p)}>Incluir</Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}

/** RN-017: texto primeiro, foto depois; falha ou endereço inseguro = "Sem foto". */
function Foto({ url, nome }: { url: string; nome: string }) {
  const [falhou, setFalhou] = useState(false)
  if (!url || falhou) {
    return <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-center text-[10px] leading-tight text-ink-secondary">Sem foto</span>
  }
  return (
    <button type="button" className="group relative size-10 shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none" aria-label={`Ampliar foto de ${nome}`}>
      <img src={url} alt="" loading="lazy" onError={() => setFalhou(true)} className="size-10 rounded-lg border border-rule-table bg-card object-contain" />
      <img src={url} alt={nome} loading="lazy" className="pointer-events-none absolute top-0 left-12 z-30 hidden size-40 rounded-xl border border-rule-table bg-card object-contain shadow-lg group-hover:block group-focus:block" />
    </button>
  )
}

/** Campo de valor que aceita `1.500,50` e `1500.50` (RNT-011); grava ao sair. */
function CampoNumero({ valor, onGravar, label, casas = 2, className }: { valor: number; onGravar: (n: number) => void; label: string; casas?: number; className?: string }) {
  const [texto, setTexto] = useState<string | null>(null)
  const gravar = () => {
    if (texto === null) return
    const n = lerValor(texto)
    setTexto(null)
    if (Number.isFinite(n)) onGravar(n)
  }
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className={cn('h-8 w-24 text-right', className)}
      value={texto ?? num(valor, casas)}
      onFocus={e => { setTexto(num(valor, casas)); e.target.select() }}
      onChange={e => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

/** RF-005: menu de custo do item com as opções válidas para o cliente. */
function MenuCusto({ item, opcoes, onEscolher }: { item: Item; opcoes: OpcaoCusto[]; onEscolher: (o: OpcaoCusto) => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className="text-left text-[13px] text-ink hover:underline">
          {moeda(item.custo)}
          <span className="block text-[12px] text-ink-secondary">{rotuloCusto(item)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {opcoes.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-ink-secondary">Sem custos disponíveis</p>
        ) : opcoes.map(o => (
          <button
            key={`${o.tipo}-${o.politicaId}-${o.custo}`}
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-accent"
            onClick={() => { setAberto(false); onEscolher(o) }}
          >
            <span>{o.tipo === 'ESPECIAL' ? `Especial · ${o.politicaNome}` : 'Padrão'}</span>
            <span className="font-semibold">{moeda(o.custo)}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

interface ItensProps {
  itens: Item[]
  opcoes: Map<number, OpcaoCusto[]>
  comparativo: boolean
  onQtd?: (c: number, q: number) => void
  onMargem?: (c: number, m: number) => void
  onPreco?: (c: number, p: number) => void
  onConcorrente?: (c: number, p: number) => void
  onCusto?: (c: number, o: OpcaoCusto) => void
  onRemover?: (c: number) => void
}

/** Tabela no computador, cartões no celular (RNF-004). Sem handlers = só leitura. */
function ItensMix({ itens, opcoes, comparativo, onQtd, onMargem, onPreco, onConcorrente, onCusto, onRemover }: ItensProps) {
  const editavel = !!onQtd
  const celula = (item: Item) => {
    const c = calcularItem(item)
    const faixa = faixaMargem(item.margem)
    return {
      c,
      faixa,
      custo: editavel && onCusto ? <MenuCusto item={item} opcoes={opcoes.get(item.codprod) ?? []} onEscolher={o => onCusto(item.codprod, o)} /> : <>{moeda(item.custo)}<RowMeta>{rotuloCusto(item)}</RowMeta></>,
      qtd: editavel ? <CampoNumero label={`Quantidade de ${item.nome}`} casas={0} className="w-16" valor={item.qtd} onGravar={q => onQtd!(item.codprod, q)} /> : item.qtd,
      margem: editavel ? <CampoNumero label={`Margem de ${item.nome}`} className="w-20" valor={item.margem} onGravar={m => onMargem!(item.codprod, m)} /> : pct(item.margem),
      preco: editavel ? <CampoNumero label={`Preço de ${item.nome}`} valor={item.preco} onGravar={p => onPreco!(item.codprod, p)} /> : moeda(item.preco),
      conc: editavel ? <CampoNumero label={`Preço do concorrente de ${item.nome}`} valor={item.precoConcorrente} onGravar={p => onConcorrente!(item.codprod, p)} /> : item.precoConcorrente ? moeda(item.precoConcorrente) : <Dash />,
      cmvConc: c.cmvConcorrente === null ? <Dash /> : <Status tone={TOM_CMV[faixaCmvConcorrente(c.cmvConcorrente)]}>{pct(c.cmvConcorrente)}</Status>,
      etiqueta: item.tipo === 'SEM_CUSTO' ? <Badge tone="attention">{ETIQUETA_SEM_CUSTO}</Badge> : null,
      remover: onRemover ? <IconButton label={`Remover ${item.nome}`} tone="danger" onClick={() => onRemover(item.codprod)}><Trash2 /></IconButton> : null,
    }
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th><Th>Custo</Th><Th numeric>Qtd</Th><Th numeric>Margem %</Th><Th numeric>Preço</Th>
              <Th>Faixa</Th><Th numeric>Subtotal</Th>
              {comparativo && <><Th numeric>Preço Conc.</Th><Th numeric>CMV Conc.</Th></>}
              {onRemover && <Th><span className="sr-only">Ações</span></Th>}
            </tr>
          </thead>
          <tbody>
            {itens.map(item => {
              const x = celula(item)
              return (
                <Tr key={item.codprod} className={cn(x.faixa === 'Baixa' && 'bg-destructive-bg hover:bg-destructive-bg')}>
                  <Td>
                    <span className="flex items-start gap-2">
                      <Foto url={item.foto} nome={item.nome} />
                      <span className="min-w-0">
                        <RowTitle>{item.nome}</RowTitle>
                        <RowMeta><Code>{item.codprod}</Code> · CMV {pct(x.c.cmv)} · Mark up {pct(x.c.markup)}</RowMeta>
                        {x.etiqueta}
                      </span>
                    </span>
                  </Td>
                  <Td>{x.custo}</Td>
                  <Td numeric>{x.qtd}</Td>
                  <Td numeric>{x.margem}</Td>
                  <Td numeric>{x.preco}</Td>
                  <Td><Status tone={TOM_FAIXA[x.faixa]}>{x.faixa}</Status></Td>
                  <Td numeric><span className="font-semibold">{moeda(x.c.subtotal)}</span></Td>
                  {comparativo && <><Td numeric>{x.conc}</Td><Td numeric>{x.cmvConc}</Td></>}
                  {onRemover && <Td>{x.remover}</Td>}
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </div>
      <ul className="divide-y divide-rule-row md:hidden">
        {itens.map(item => {
          const x = celula(item)
          return (
            <li key={item.codprod} className={cn('flex flex-col gap-2 px-4 py-3', x.faixa === 'Baixa' && 'bg-destructive-bg')}>
              <div className="flex items-start gap-2">
                <Foto url={item.foto} nome={item.nome} />
                <span className="min-w-0 flex-1">
                  <RowTitle>{item.nome}</RowTitle>
                  <RowMeta><Code>{item.codprod}</Code> · <Status tone={TOM_FAIXA[x.faixa]}>{x.faixa}</Status></RowMeta>
                  {x.etiqueta}
                </span>
                {x.remover}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[13px]">
                <Par rotulo="Custo">{x.custo}</Par>
                <Par rotulo="Qtd">{x.qtd}</Par>
                <Par rotulo="Margem %">{x.margem}</Par>
                <Par rotulo="Preço">{x.preco}</Par>
                <Par rotulo="CMV · Mark up">{pct(x.c.cmv)} · {pct(x.c.markup)}</Par>
                <Par rotulo="Subtotal"><span className="font-semibold">{moeda(x.c.subtotal)}</span></Par>
                {comparativo && <><Par rotulo="Preço Conc.">{x.conc}</Par><Par rotulo="CMV Conc.">{x.cmvConc}</Par></>}
              </dl>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Par({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{rotulo}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

/** RF-007: rodapé de totais. */
function Rodape({ t }: { t: ReturnType<typeof totais> }) {
  const faixa = faixaMargem(t.margem)
  return (
    <dl className="grid grid-cols-2 gap-3 border-t border-rule-row px-4 py-3 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
      <Par rotulo="Itens">{t.itens}</Par>
      <Par rotulo="Unidades">{t.unidades}</Par>
      <Par rotulo="Custo Total">{moeda(t.custo)}</Par>
      <Par rotulo="Venda Total"><span className="font-semibold">{moeda(t.venda)}</span></Par>
      <Par rotulo="Mark up Médio">{pct(t.markup)}</Par>
      <Par rotulo="Margem Bruta Média">{t.itens ? <Status tone={TOM_FAIXA[faixa]}>{pct(t.margem)} · {faixa}</Status> : <Dash />}</Par>
    </dl>
  )
}

/** RF-007 no layout C: venda em destaque e régua da margem (faixas 20% e 30%, escala até 50%). */
function ResumoMix({ t }: { t: ReturnType<typeof totais> }) {
  const faixa = faixaMargem(t.margem)
  const tom = TOM_FAIXA[faixa]
  const barra = { live: 'bg-primary', attention: 'bg-attention', alert: 'bg-destructive' }[tom]
  const texto = { live: 'text-primary', attention: 'text-attention', alert: 'text-destructive' }[tom]
  const largura = `${Math.min(Math.max(t.margem, 0), 50) * 2}%`
  const rotulo = 'text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase'
  return (
    <section className="rounded-2xl border border-rule-table bg-card p-5">
      <p className={rotulo}>Venda total</p>
      <p className="mt-1 font-title text-[32px] leading-tight font-extrabold text-ink">{moeda(t.venda)}</p>
      <p className="mt-0.5 mb-4 text-[12px] text-ink-secondary">
        {t.itens} {t.itens === 1 ? 'produto' : 'produtos'} · {t.unidades} unidades · preço médio {moeda(t.precoMedio)}
      </p>
      <p className={rotulo}>Margem bruta média</p>
      {t.itens ? (
        <>
          <p className="mt-1 mb-2 flex items-baseline gap-2">
            <span className={cn('font-title text-[22px] font-bold', texto)}>{pct(t.margem)}</span>
            <span className="text-[13px]"><Status tone={tom}>{faixa}</Status></span>
          </p>
          <div aria-hidden className="relative h-2 rounded-full bg-muted">
            <div className={cn('absolute inset-y-0 left-0 rounded-full', barra)} style={{ width: largura }} />
            <div className="absolute -top-[3px] left-[40%] h-3.5 w-px bg-ink-muted" />
            <div className="absolute -top-[3px] left-[60%] h-3.5 w-px bg-ink-muted" />
          </div>
          <div aria-hidden className="relative mt-1 mb-3 h-4 text-[11px] text-ink-secondary">
            <span className="absolute left-0">0%</span>
            <span className="absolute left-[40%] -translate-x-1/2">20%</span>
            <span className="absolute left-[60%] -translate-x-1/2">30%</span>
            <span className="absolute right-0">50%</span>
          </div>
        </>
      ) : <p className="mt-1 mb-3"><Dash /></p>}
      <dl className="divide-y divide-rule-row text-[13px]">
        {([['Custo total', moeda(t.custo)], ['CMV', pct(t.cmv)], ['Mark up médio', pct(t.markup)]] as const).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 py-2">
            <dt className="text-ink-secondary">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function MenuExportar({ desabilitado, onCsv }: { desabilitado: boolean; onCsv: () => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={desabilitado}><Download aria-hidden />Exportar</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-accent" onClick={() => { setAberto(false); onCsv() }}>
          Exportar planilha (CSV)
        </button>
      </PopoverContent>
    </Popover>
  )
}

/** RF-011: lista paginada com situação de envio e ações. */
function ListaMix({ mixes, onVer, onEditar, onDuplicar, onEnviar, onImprimir, onExcluir }: {
  mixes: Linha[]
  onVer: (m: Linha) => void
  onEditar: (m: Linha) => void
  onDuplicar: (m: Linha) => void
  onEnviar: (m: Linha) => void
  onImprimir: (m: Linha) => void
  onExcluir: (m: Linha) => void
}) {
  const situacao = (m: Linha) => (Number(m.ENVIADO_HISTORICO) === 1
    ? <Status tone="live">Enviado em {fmtData(m.DT_ENVIO_HISTORICO)}</Status>
    : <Status tone="off">Não enviado</Status>)
  const acoes = (m: Linha) => (
    <span className="flex items-center gap-0.5">
      <IconButton label="Visualizar" onClick={() => onVer(m)}><Eye /></IconButton>
      <IconButton label="Editar Mix" onClick={() => onEditar(m)}><Pencil /></IconButton>
      <IconButton label="Duplicar Mix" onClick={() => onDuplicar(m)}><Copy /></IconButton>
      <IconButton label="Enviar ao Histórico" onClick={() => onEnviar(m)}><Send /></IconButton>
      <IconButton label="Imprimir/PDF" onClick={() => onImprimir(m)}><Printer /></IconButton>
      <IconButton label="Excluir" tone="danger" onClick={() => onExcluir(m)}><Trash2 /></IconButton>
    </span>
  )
  const margem = (m: Linha) => {
    const v = Number(m.MARGEM_MEDIA)
    return <Status tone={TOM_FAIXA[faixaMargem(v)]}>{pct(v)}</Status>
  }
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr><Th>Mix</Th><Th>Cliente</Th><Th>Data</Th><Th numeric>Venda</Th><Th numeric>Margem</Th><Th>Histórico</Th><Th><span className="sr-only">Ações</span></Th></tr>
          </thead>
          <tbody>
            {mixes.map(m => (
              <Tr key={m.ID}>
                <Td><RowTitle>{m.NOME}</RowTitle><RowMeta><Code prefix="#">{m.ID}</Code>{m.DESCRICAO ? ` · ${m.DESCRICAO}` : ''}</RowMeta></Td>
                <Td>{m.CLIENTE}{Number(m.NA_CARTEIRA) === 0 && <RowMeta>Fora da sua carteira</RowMeta>}</Td>
                <Td>{fmtData(m.DT_CRIACAO)}</Td>
                <Td numeric>{moeda(m.TOTAL_VENDA)}</Td>
                <Td numeric>{margem(m)}</Td>
                <Td>{situacao(m)}</Td>
                <Td>{acoes(m)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="divide-y divide-rule-row md:hidden">
        {mixes.map(m => (
          <li key={m.ID} className="flex flex-col gap-1 px-4 py-3">
            <RowTitle>{m.NOME}</RowTitle>
            <RowMeta>{m.CLIENTE} · {fmtData(m.DT_CRIACAO)}</RowMeta>
            <span className="flex flex-wrap items-center gap-3 text-[13px]">{moeda(m.TOTAL_VENDA)} {margem(m)} {situacao(m)}</span>
            {acoes(m)}
          </li>
        ))}
      </ul>
    </>
  )
}
