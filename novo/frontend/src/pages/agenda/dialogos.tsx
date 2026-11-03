// Janelas da Agenda (spec 003): nova agenda, detalhe, reagendar, relato e
// atividades (check-out), cancelar, concluir interno, editar e ver textos,
// histórico do cliente. A tela valida com as mesmas mensagens do servidor; o
// servidor é quem recusa, e 0 linhas vira mensagem (RNT-013, RN-004).

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { acao, linha, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { fmtData, fmtDataHora, moeda } from '@/lib/formato'
import {
  LIMITE_TEXTO, MSG, NOVA_AGENDA, TIPOS, acoes, atividadeVazia, ehDeslocamento, formularioDe, formularioInicial, mensagemConflito,
  participantes, pessoasJson, relatoInterno, rotuloOrigem, rotuloStatus, salvarAtividades, somenteVisualizacao, textoSimples,
  validar, validarAtividade, validarCancelar, validarCheckout, validarConclusao, validarReagendar,
} from '@/lib/agenda'
import type { Acao, Atividade, Formulario, Tipo } from '@/lib/agenda'
import {
  Actions, Alert, Button, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, FilterChip, FormRow, InfoGrid, InfoTile, Input, LabelledField, RowMeta, RowTitle, SearchInput, SelectMenu,
  Stack, Table, Td, Textarea, Th, Tr,
} from '@/components/page'
import { CaixaAtividade, Fichas, ListaOpcoes, Opcao, TextoLongo } from './layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Pessoa = { id: number; nome: string }

const gravar = async (chave: Parameters<typeof acao>[0], input: Record<string, unknown>) => linhasAfetadas(await acao(chave, input))
const FALHA = 'Não foi possível salvar agora. Tente de novo.'

function Moldura({ titulo, descricao, aberto, fechar, children, rodape, largo }: {
  titulo: string
  descricao?: ReactNode
  aberto: boolean
  fechar: () => void
  children: ReactNode
  rodape?: ReactNode
  largo?: boolean
}) {
  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent className={largo ? 'sm:max-w-2xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {rodape ? <DialogFooter>{rodape}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Depois de 0 linhas: o conflito de alguém da operação, ou o motivo padrão. */
async function recusa(pessoas: { id: number }[], f: Formulario, origem: string, id: string, padrao: string) {
  const c = await linha('agendaConflito', { pessoas: pessoasJson(pessoas), data: f.data, inicio: f.inicio, fim: f.fim, origem, id })
  return c ? mensagemConflito(c) : padrao
}

function usePessoas(aberto: boolean) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  useEffect(() => {
    if (!aberto) return
    linhas('agendaPessoas')
      .then(ls => setPessoas(ls.map(l => ({ id: Number(l.ID), nome: Number(l.EH_VOCE) === 1 ? `${l.NOME} (você)` : l.NOME }))))
      .catch(falha => console.error('s360AgendaPessoas', falha))
  }, [aberto])
  return pessoas
}

/** Fichas de pessoas escolhidas + seletor para incluir mais. */
function EscolherPessoas({ rotulo, dica, todas, escolhidas, excluir, incluir, retirar }: {
  rotulo: string
  dica?: string
  todas: Pessoa[]
  escolhidas: Pessoa[]
  excluir?: number
  incluir: (p: Pessoa) => void
  retirar: (p: Pessoa) => void
}) {
  const livres = todas.filter(p => p.id !== excluir && !escolhidas.some(e => e.id === p.id))
  return (
    <Field label={rotulo} hint={dica}>
      <SelectMenu
        label={rotulo}
        value=""
        placeholder="Adicionar..."
        options={livres.map(p => ({ value: String(p.id), label: p.nome }))}
        onChange={v => { const p = todas.find(x => String(x.id) === v); if (p) incluir(p) }}
      />
      {escolhidas.length ? (
        <Fichas>
          {escolhidas.map(p => <FilterChip key={p.id} label={rotulo === 'Participantes' ? 'Participante' : 'Vendedor'} value={p.nome} onClear={() => retirar(p)} />)}
        </Fichas>
      ) : null}
    </Field>
  )
}

/** Data, horário e tipo, comuns a criar e reagendar. */
function CamposHorario({ f, mudar }: { f: Formulario; mudar: (campo: keyof Formulario, valor: string) => void }) {
  return (
    <FormRow>
      <LabelledField label="Data" obrigatorio><Input type="date" value={f.data} onChange={e => mudar('data', e.target.value)} /></LabelledField>
      <LabelledField label="Início" obrigatorio><Input type="time" value={f.inicio} onChange={e => mudar('inicio', e.target.value)} /></LabelledField>
      <LabelledField label="Fim" obrigatorio><Input type="time" value={f.fim} onChange={e => mudar('fim', e.target.value)} /></LabelledField>
    </FormRow>
  )
}

/** Título/trajeto, tipo e texto do formulário, por tipo de compromisso. */
function CamposTipo({ f, mudar }: { f: Formulario; mudar: (campo: keyof Formulario, valor: string) => void }) {
  const rotuloTexto = f.tipo === 'PROSPECCAO' ? 'Objetivo' : f.tipo === 'VISITA' ? 'Planejamento' : 'Descrição'
  return (
    <>
      {f.tipo === 'INTERNA' ? (
        <LabelledField label="Título" obrigatorio><Input value={f.titulo} maxLength={200} onChange={e => mudar('titulo', e.target.value)} /></LabelledField>
      ) : null}
      {f.tipo === 'DESLOCAMENTO' ? (
        <FormRow>
          <LabelledField label="Origem" obrigatorio><Input value={f.origem} maxLength={200} onChange={e => mudar('origem', e.target.value)} /></LabelledField>
          <LabelledField label="Destino" obrigatorio><Input value={f.destino} maxLength={200} onChange={e => mudar('destino', e.target.value)} /></LabelledField>
        </FormRow>
      ) : (
        <Field label="Tipo" obrigatorio>
          <SelectMenu label="Tipo" value={f.tipoCompromisso} options={TIPOS[f.tipo].map(t => ({ value: t, label: t }))} onChange={v => mudar('tipoCompromisso', v)} />
        </Field>
      )}
      <LabelledField label={rotuloTexto} hint={f.tipo === 'PROSPECCAO' ? 'Até 200 caracteres, junto com o tipo.' : undefined}>
        <Textarea rows={3} value={f.texto} onChange={e => mudar('texto', e.target.value)} />
      </LabelledField>
    </>
  )
}

/* ─────────────── + Nova agenda (RF-003/004/005/010/011) ─────────────── */

// `cliente`: vem preenchido pelo "Agendar visita" da Prospecção (RF-014 da 008).
export function NovaAgenda({ aberto, hoje, eu, fechar, salvo, cliente }: {
  aberto: boolean; hoje: string; eu: number; fechar: () => void; salvo: (texto: string) => void; cliente?: { id: string; nome: string } | null
}) {
  const [f, setF] = useState<Formulario>(() => formularioInicial('VISITA', hoje))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Linha[] | null>(null)
  const [prospects, setProspects] = useState<Linha[] | null>(null)
  const pessoas = usePessoas(aberto)

  useEffect(() => {
    if (!aberto) return
    setF({ ...formularioInicial('VISITA', hoje), ...(cliente ? { clienteId: cliente.id, clienteNome: cliente.nome } : {}) })
    setErro(null)
    setBusca('')
    setClientes(null)
    linhas('agendaProspects', { busca: '' })
      .then(setProspects)
      .catch(falha => { console.error('s360AgendaProspects', falha); setProspects([]) })
  }, [aberto, hoje, cliente])

  // RF-004: a partir de 2 letras, depois de 400 ms parado.
  useEffect(() => {
    if (busca.trim().length < 2) { setClientes(null); return }
    const t = setTimeout(() => {
      linhas('agendaClientes', { busca: busca.trim() })
        .then(setClientes)
        .catch(falha => { console.error('s360AgendaClientes', falha); setClientes([]) })
    }, 400)
    return () => clearTimeout(t)
  }, [busca])

  const mudar = (campo: keyof Formulario, valor: string) => setF(atual => ({ ...atual, [campo]: valor }))
  const trocarTipo = (tipo: Tipo) => setF(atual => ({ ...formularioInicial(tipo, hoje), data: atual.data, inicio: atual.inicio, fim: atual.fim }))
  const interno = f.tipo === 'INTERNA' || f.tipo === 'DESLOCAMENTO'

  async function criar() {
    const invalido = validar(f, hoje)
    if (invalido) { setErro(invalido); return }
    setSalvando(true)
    setErro(null)
    const base = { data: f.data, inicio: f.inicio, fim: f.fim, tipo: f.tipoCompromisso }
    try {
      let n = 0
      if (f.tipo === 'VISITA') n = await gravar('visitaCriar', { ...base, clienteId: f.clienteId, vendedores: pessoasJson(f.pessoas), planejamento: f.texto })
      else if (f.tipo === 'PROSPECCAO') n = await gravar('prospeccaoCriar', { ...base, prospectId: f.prospectId, vendedores: pessoasJson(f.pessoas), objetivo: f.texto })
      else n = await gravar('internoCriar', {
        ...base, titulo: f.titulo, descricao: f.texto, origemDesloc: f.origem, destinoDesloc: f.destino, participantes: pessoasJson(f.pessoas),
      })
      if (n > 0) {
        salvo(f.tipo === 'VISITA' || f.tipo === 'PROSPECCAO'
          ? (f.pessoas.length > 1 ? `${f.pessoas.length} visitas criadas.` : 'Visita criada.')
          : f.tipo === 'DESLOCAMENTO' ? 'Deslocamento criado.' : 'Agenda interna criada.')
        return
      }
      const envolvidos = interno ? [{ id: eu }, ...f.pessoas] : f.pessoas.length ? f.pessoas : [{ id: eu }]
      const padrao = f.tipo === 'VISITA' ? MSG.carteira
        : f.tipo === 'PROSPECCAO' ? 'Não foi possível criar a visita. Verifique se o prospect está ativo e é da sua carteira.'
          : 'Nada foi gravado: confira os campos e tente de novo.'
      setErro(await recusa(envolvidos, f, '', '', padrao))
    } catch (falha) {
      console.error('criar agenda', falha)
      setErro(FALHA)
    } finally {
      setSalvando(false)
    }
  }

  const rotuloCriar = f.tipo === 'DESLOCAMENTO' ? 'Criar deslocamento' : f.tipo === 'INTERNA' ? 'Criar agenda' : 'Criar visita'
  return (
    <Moldura
      titulo="Nova agenda"
      largo
      aberto={aberto}
      fechar={fechar}
      rodape={<Actions><Button onClick={fechar}>Voltar</Button><Button variant="primary" disabled={salvando} onClick={criar}>{rotuloCriar}</Button></Actions>}
    >
      <Stack>
        <Field label="O que você vai agendar">
          <SelectMenu label="O que você vai agendar" value={f.tipo} options={NOVA_AGENDA.map(o => ({ value: o.tipo, label: o.rotulo }))} onChange={v => trocarTipo(v as Tipo)} />
        </Field>
        {f.tipo === 'VISITA' ? (
          <Field label="Cliente" obrigatorio hint={f.clienteId ? `Selecionado: ${f.clienteNome}` : 'Digite 2 letras do nome, o CNPJ ou o código.'}>
            <SearchInput value={busca} placeholder="Buscar cliente da carteira" onChange={e => setBusca(e.target.value)} aria-label="Buscar cliente" />
            {clientes ? (
              clientes.length ? (
                <ListaOpcoes>
                  {clientes.map(c => (
                    <Opcao key={c.ID} ativo={String(c.ID) === f.clienteId} onClick={() => setF(atual => ({ ...atual, clienteId: String(c.ID), clienteNome: c.NOME }))}>
                      <RowTitle>{c.NOME}</RowTitle>
                      <RowMeta>{[c.ID, c.CNPJ, c.CIDADE].filter(Boolean).join(' · ')}</RowMeta>
                    </Opcao>
                  ))}
                </ListaOpcoes>
              ) : <RowMeta>Nenhum cliente da sua carteira encontrado.</RowMeta>
            ) : null}
          </Field>
        ) : null}
        {f.tipo === 'PROSPECCAO' ? (
          prospects && !prospects.length ? (
            <Alert tone="warn">Nenhum prospect ativo encontrado. Cadastre o prospect na tela de prospecção antes de agendar.</Alert>
          ) : (
            <Field label="Prospect" obrigatorio>
              <SelectMenu label="Prospect" value={f.prospectId} options={(prospects ?? []).map(p => ({ value: String(p.ID), label: p.NOME, hint: p.CIDADE ?? undefined }))} onChange={v => mudar('prospectId', v)} />
            </Field>
          )
        ) : null}
        <CamposHorario f={f} mudar={mudar} />
        <CamposTipo f={f} mudar={mudar} />
        <EscolherPessoas
          rotulo={interno ? 'Participantes' : 'Adicionar vendedor'}
          dica={interno ? undefined : 'Sem seleção, a visita é só sua. Com seleção, uma visita para cada vendedor escolhido.'}
          todas={pessoas}
          escolhidas={f.pessoas}
          excluir={interno ? eu : undefined}
          incluir={p => setF(atual => ({ ...atual, pessoas: [...atual.pessoas, p] }))}
          retirar={p => setF(atual => ({ ...atual, pessoas: atual.pessoas.filter(x => x.id !== p.id) }))}
        />
        {erro ? <Alert tone="error">{erro}</Alert> : null}
      </Stack>
    </Moldura>
  )
}

/* ─────────────── detalhe e ações (RN-005) ─────────────── */

export function Detalhe({ item, fechar, agir }: { item: Linha | null; fechar: () => void; agir: (a: Acao, item: Linha) => void }) {
  if (!item) return null
  const convidados = participantes(item.PARTICIPANTES)
  const lista = acoes(item)
  return (
    <Moldura titulo={item.TITULO} descricao={`${rotuloOrigem(item)} · ${rotuloStatus(item.STATUS)}`} largo aberto fechar={fechar}>
      <Stack>
        {somenteVisualizacao(item) ? <Alert tone="info">Somente visualização: compromisso de {item.DONO}.</Alert> : null}
        <InfoGrid>
          <InfoTile label="Data">{fmtData(item.DATA)}</InfoTile>
          <InfoTile label="Horário">{item.HORA_INICIO}–{item.HORA_FIM}</InfoTile>
          <InfoTile label="Tipo">{item.TIPO || <Dash />}</InfoTile>
          <InfoTile label={item.ORIGEM === 'INTERNA' ? 'Criador' : 'Responsável'}>{item.DONO || <Dash />}</InfoTile>
        </InfoGrid>
        {item.CHECKIN_HORA ? <RowMeta>Check-in: {fmtDataHora(String(item.CHECKIN_HORA).replace(' ', 'T'))}{item.CHECKOUT_HORA ? ` · Check-out: ${fmtDataHora(String(item.CHECKOUT_HORA).replace(' ', 'T'))}` : ''}</RowMeta> : null}
        {ehDeslocamento(item) ? <RowMeta>Trajeto: {item.ORIGEM_DESLOC} → {item.DESTINO_DESLOC}</RowMeta> : null}
        {convidados.length ? <RowMeta>Participantes: {convidados.map(p => p.nome).join(', ')}</RowMeta> : null}
        <Actions>
          {lista.map((a, i) => (
            <Button key={a.acao} size="sm" variant={i === 0 && !a.acao.startsWith('ver') ? 'primary' : 'secondary'} onClick={() => agir(a.acao, item)}>
              {a.rotulo}
            </Button>
          ))}
        </Actions>
      </Stack>
    </Moldura>
  )
}

/** Ver Planejamento / objetivo / detalhes e Ver Relato. */
export function VerTexto({ item, qual, fechar }: { item: Linha | null; qual: 'planejamento' | 'relato'; fechar: () => void }) {
  if (!item) return null
  const texto = qual === 'planejamento'
    ? textoSimples(item.PLANEJAMENTO)
    : item.ORIGEM === 'INTERNA' ? relatoInterno(item.PLANEJAMENTO) : textoSimples(item.RELATO)
  const titulo = qual === 'relato' ? 'Relato' : item.ORIGEM === 'PROSPECCAO' ? 'Objetivo' : item.ORIGEM === 'INTERNA' ? 'Detalhes' : 'Planejamento'
  return (
    <Moldura titulo={titulo} descricao={item.TITULO} aberto fechar={fechar}>
      {texto ? <TextoLongo>{texto}</TextoLongo> : <EmptyState title={qual === 'relato' ? 'Sem relato ainda.' : 'Nada registrado.'} />}
    </Moldura>
  )
}

/* ─────────────── editar / reagendar (RF-008/010, RN-009) ─────────────── */

export function Reagendar({ item, hoje, eu, fechar, salvo, alterado }: {
  item: Linha | null
  hoje: string
  eu: number
  fechar: () => void
  salvo: (texto: string) => void
  alterado: () => void
}) {
  const [f, setF] = useState<Formulario | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const pessoas = usePessoas(!!item && item.ORIGEM === 'INTERNA')

  useEffect(() => {
    setF(item ? formularioDe(item) : null)
    setMotivo('')
    setErro(null)
  }, [item])

  if (!item || !f) return null
  const mudar = (campo: keyof Formulario, valor: string) => setF(atual => (atual ? { ...atual, [campo]: valor } : atual))
  const mudouData = f.data !== item.DATA && item.ORIGEM !== 'INTERNA'

  // RF-010: participantes mudam na hora, cada um com a sua resposta.
  async function incluir(p: Pessoa) {
    if (!f || !item) return
    setErro(null)
    try {
      const n = await gravar('internoParticipanteIncluir', { id: String(item.ID), pessoaId: String(p.id) })
      if (n > 0) { setF({ ...f, pessoas: [...f.pessoas, p] }); alterado(); return }
      setErro(await recusa([p], formularioDe(item), 'INTERNA', String(item.ID), `Nada foi alterado: não foi possível incluir ${p.nome}.`))
    } catch (falha) {
      console.error('s360InternoParticipanteIncluir', falha)
      setErro(FALHA)
    }
  }

  async function retirar(p: Pessoa) {
    if (!f || !item) return
    setErro(null)
    try {
      const n = await gravar('internoParticipanteRetirar', { id: String(item.ID), pessoaId: String(p.id) })
      if (n > 0) { setF({ ...f, pessoas: f.pessoas.filter(x => x.id !== p.id) }); alterado() }
      else setErro(`Nada foi alterado: não foi possível retirar ${p.nome}.`)
    } catch (falha) {
      console.error('s360InternoParticipanteRetirar', falha)
      setErro(FALHA)
    }
  }

  async function salvar() {
    if (!f || !item) return
    const invalido = validarReagendar(item, f, motivo, hoje)
    if (invalido) { setErro(invalido); return }
    setSalvando(true)
    setErro(null)
    try {
      const n = await gravar('agendaReagendar', {
        origem: item.ORIGEM, id: String(item.ID), data: f.data, inicio: f.inicio, fim: f.fim, tipo: f.tipoCompromisso,
        planejamento: f.texto, motivo, titulo: f.titulo, descricao: f.texto, origemDesloc: f.origem, destinoDesloc: f.destino,
      })
      if (n > 0) { salvo(mudouData ? 'Visita reagendada.' : 'Alterações salvas.'); return }
      const envolvidos = item.ORIGEM === 'INTERNA' ? [{ id: eu }, ...f.pessoas] : [{ id: Number(item.DONO_ID) }]
      setErro(await recusa(envolvidos, f, item.ORIGEM, String(item.ID), 'Nada foi alterado: o compromisso só pode ser editado enquanto está agendado.'))
    } catch (falha) {
      console.error('s360AgendaReagendar', falha)
      setErro(FALHA)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Moldura
      titulo="Editar / Reagendar"
      descricao={item.TITULO}
      largo
      aberto
      fechar={fechar}
      rodape={<Actions><Button onClick={fechar}>Voltar</Button><Button variant="primary" disabled={salvando} onClick={salvar}>Salvar</Button></Actions>}
    >
      <Stack>
        <CamposHorario f={f} mudar={mudar} />
        <CamposTipo f={f} mudar={mudar} />
        {item.ORIGEM !== 'INTERNA' ? (
          <LabelledField label="Relato da alteração" obrigatorio={mudouData} hint={mudouData ? 'A data mudou: o motivo entra no relato da visita.' : 'Só é pedido quando a data muda.'}>
            <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} />
          </LabelledField>
        ) : (
          <EscolherPessoas rotulo="Participantes" todas={pessoas} escolhidas={f.pessoas} excluir={eu} incluir={incluir} retirar={retirar} />
        )}
        {erro ? <Alert tone="error">{erro}</Alert> : null}
      </Stack>
    </Moldura>
  )
}

/* ─────────────── check-out: relato e atividades (RF-007, RN-007, C-006) ─────────────── */

function CamposAtividade({ a, mudar }: { a: Atividade; mudar: (campo: keyof Atividade, valor: string) => void }) {
  return (
    <CaixaAtividade>
      <LabelledField label="Título"><Input value={a.titulo} maxLength={300} onChange={e => mudar('titulo', e.target.value)} /></LabelledField>
      <LabelledField label="Descrição"><Input value={a.descricao} maxLength={500} onChange={e => mudar('descricao', e.target.value)} /></LabelledField>
      <FormRow>
        <Field label="Prioridade">
          <SelectMenu label="Prioridade" value={a.prioridade} options={[{ value: 'ALTA', label: 'Alta' }, { value: 'MEDIA', label: 'Média' }, { value: 'BAIXA', label: 'Baixa' }]} onChange={v => mudar('prioridade', v)} />
        </Field>
        <LabelledField label="Data limite"><Input type="date" value={a.dataLimite} onChange={e => mudar('dataLimite', e.target.value)} /></LabelledField>
      </FormRow>
    </CaixaAtividade>
  )
}

export function Encerrar({ item, fechar, salvo }: { item: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const [relato, setRelato] = useState('')
  // RF-017 / RN-024 da 008: resultado da visita de prospecção (opcional).
  const [resultado, setResultado] = useState({ objecoes: '', proximoPasso: '', dataProximoPasso: '' })
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [pendentes, setPendentes] = useState<Atividade[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setRelato('')
    setResultado({ objecoes: '', proximoPasso: '', dataProximoPasso: '' })
    setAtividades([])
    setPendentes(null)
    setErro(null)
  }, [item])

  if (!item) return null
  const visita = item.ORIGEM === 'VISITA'

  async function gravarAtividades(lista: Atividade[]) {
    if (!item) return
    const r = await salvarAtividades(lista, a => gravar('agendaAtividadeCriar', { visitaId: String(item.ID), ...a }))
    if (r.mensagem) { setPendentes(r.pendentes); setErro(r.mensagem); return }
    salvo(r.criadas ? `Visita concluída e ${r.criadas} atividade(s) criada(s).` : 'Visita concluída.')
  }

  async function concluir() {
    if (!item) return
    const invalido = validarCheckout(relato) ?? atividades.map(validarAtividade).find(Boolean) ?? null
    if (invalido) { setErro(invalido); return }
    setSalvando(true)
    setErro(null)
    try {
      const n = await gravar('agendaCheckout', { origem: item.ORIGEM, id: String(item.ID), relato })
      if (n < 1) { setErro('Nada foi alterado: só uma visita em andamento pode ser encerrada.'); return }
      if (visita && atividades.length) await gravarAtividades(atividades)
      else if (!visita && Object.values(resultado).some(v => v.trim())) {
        const r = await gravar('prospectVisitaResultado', { visitaId: String(item.ID), ...resultado })
        salvo(r > 0 ? 'Prospecção concluída com objeções e próximo passo.' : 'Prospecção concluída, mas objeções e próximo passo não foram gravados.')
      } else salvo(visita ? 'Visita concluída.' : 'Prospecção concluída.')
    } catch (falha) {
      console.error('s360AgendaCheckout', falha)
      setErro(FALHA)
    } finally {
      setSalvando(false)
    }
  }

  const rodape = pendentes ? (
    <Actions>
      <Button onClick={() => salvo('Visita concluída.')}>Fechar</Button>
      <Button variant="primary" disabled={salvando} onClick={async () => { setSalvando(true); try { await gravarAtividades(pendentes) } finally { setSalvando(false) } }}>Salvar atividades pendentes</Button>
    </Actions>
  ) : (
    <Actions>
      <Button onClick={fechar}>Voltar</Button>
      <Button variant="primary" disabled={salvando || !relato.trim()} onClick={concluir}>{visita ? 'Concluir visita' : 'Concluir prospecção'}</Button>
    </Actions>
  )

  return (
    <Moldura titulo={visita ? 'Relato e atividades' : 'Relato da prospecção'} descricao={item.TITULO} largo aberto fechar={fechar} rodape={rodape}>
      <Stack>
        {pendentes ? (
          pendentes.map((a, i) => (
            <CamposAtividade key={i} a={a} mudar={(campo, valor) => setPendentes(pendentes.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))} />
          ))
        ) : (
          <>
            <LabelledField label="Relato" obrigatorio hint={relato.trim() ? `${relato.length.toLocaleString('pt-BR')} de ${LIMITE_TEXTO.toLocaleString('pt-BR')} caracteres` : MSG.relatoVisita} hintTone={relato.trim() ? 'muted' : 'error'}>
              <Textarea rows={5} value={relato} onChange={e => setRelato(e.target.value)} />
            </LabelledField>
            {visita ? (
              <>
                {atividades.map((a, i) => (
                  <CamposAtividade key={i} a={a} mudar={(campo, valor) => setAtividades(atividades.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))} />
                ))}
                <Actions><Button size="sm" onClick={() => setAtividades([...atividades, atividadeVazia()])}><Plus aria-hidden />Adicionar atividade</Button></Actions>
              </>
            ) : (
              <>
                <LabelledField label="Objeções">
                  <Textarea rows={2} value={resultado.objecoes} onChange={e => setResultado(r => ({ ...r, objecoes: e.target.value }))} />
                </LabelledField>
                <FormRow>
                  <LabelledField label="Próximo passo">
                    <Input value={resultado.proximoPasso} onChange={e => setResultado(r => ({ ...r, proximoPasso: e.target.value }))} />
                  </LabelledField>
                  <LabelledField label="Data do próximo passo">
                    <Input type="date" value={resultado.dataProximoPasso} onChange={e => setResultado(r => ({ ...r, dataProximoPasso: e.target.value }))} />
                  </LabelledField>
                </FormRow>
              </>
            )}
          </>
        )}
        {erro ? <Alert tone={pendentes ? 'warn' : 'error'}>{erro}</Alert> : null}
      </Stack>
    </Moldura>
  )
}

/* ─────────────── cancelar, concluir, editar relato ─────────────── */

/** Uma caixa de texto e um botão: cancelar (RN-010), concluir interno (RN-011), editar relato (RN-005). */
export function TextoAcao({ item, qual, hoje, fechar, salvo }: {
  item: Linha | null
  qual: 'cancelar' | 'concluir' | 'editarRelato'
  hoje: string
  fechar: () => void
  salvo: (texto: string) => void
}) {
  const inicial = item && qual === 'editarRelato' ? textoSimples(item.ORIGEM === 'INTERNA' ? item.PLANEJAMENTO : item.RELATO) : ''
  const [texto, setTexto] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setTexto(inicial); setErro(null) }, [item, inicial])
  if (!item) return null

  const desloc = ehDeslocamento(item)
  const cfg = {
    cancelar: {
      titulo: 'Cancelar compromisso', botao: 'Confirmar cancelamento',
      rotulo: item.ORIGEM === 'INTERNA' ? 'Motivo (opcional)' : 'Motivo do cancelamento', obrigatorio: item.ORIGEM !== 'INTERNA',
      validar: () => validarCancelar(item, texto), sucesso: 'Compromisso cancelado.',
      gravar: () => gravar('agendaCancelar', { origem: item.ORIGEM, id: String(item.ID), motivo: texto }),
    },
    concluir: {
      titulo: desloc ? 'Concluir deslocamento' : 'Concluir', botao: desloc ? 'Concluir deslocamento' : 'Concluir',
      rotulo: desloc ? 'Relato do deslocamento' : 'Observação (opcional)', obrigatorio: desloc,
      validar: () => validarConclusao(item, texto, hoje), sucesso: desloc ? 'Deslocamento concluído.' : 'Compromisso concluído.',
      gravar: () => gravar('internoConcluir', { id: String(item.ID), relato: texto }),
    },
    editarRelato: {
      titulo: 'Editar Relato', botao: 'Salvar relato', rotulo: item.ORIGEM === 'INTERNA' ? 'Detalhes e relato' : 'Relato', obrigatorio: true,
      validar: () => (!texto.trim() && (item.ORIGEM !== 'INTERNA' || desloc) ? 'Preencha o relato.' : texto.length > LIMITE_TEXTO ? MSG.texto : null),
      sucesso: 'Relato salvo.',
      gravar: () => gravar('agendaRelatoEditar', { origem: item.ORIGEM, id: String(item.ID), relato: texto }),
    },
  }[qual]

  async function confirmar() {
    const invalido = cfg.validar()
    if (invalido) { setErro(invalido); return }
    setSalvando(true)
    setErro(null)
    try {
      if ((await cfg.gravar()) > 0) salvo(cfg.sucesso)
      else setErro('Nada foi alterado: o status do compromisso não permite esta ação ou ele não é seu.')
    } catch (falha) {
      console.error(qual, falha)
      setErro(FALHA)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Moldura
      titulo={cfg.titulo}
      descricao={item.TITULO}
      aberto
      fechar={fechar}
      rodape={<Actions><Button onClick={fechar}>Voltar</Button><Button variant={qual === 'cancelar' ? 'danger' : 'primary'} disabled={salvando} onClick={confirmar}>{cfg.botao}</Button></Actions>}
    >
      <Stack>
        <LabelledField label={cfg.rotulo} obrigatorio={cfg.obrigatorio}>
          <Textarea rows={qual === 'editarRelato' ? 8 : 3} value={texto} onChange={e => setTexto(e.target.value)} />
        </LabelledField>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
      </Stack>
    </Moldura>
  )
}

/* ─────────────── histórico do cliente (RF-015, C-017) ─────────────── */

const ROTULO_EVENTO: Record<string, string> = { VISITA: 'Visita', TAREFA: 'Atividade', PEDIDO: 'Pedido' }

export function Historico({ clienteId, fechar }: { clienteId: number | null; fechar: () => void }) {
  const [resumo, setResumo] = useState<Linha | null | 'erro'>(null)
  const [eventos, setEventos] = useState<Linha[]>([])
  useEffect(() => {
    if (!clienteId) return
    setResumo(null)
    setEventos([])
    const input = { clienteId: String(clienteId) }
    Promise.all([linha('agendaHistoricoResumo', input), linhas('agendaHistoricoEventos', input)])
      .then(([r, e]) => { setResumo(r ?? 'erro'); setEventos(e) })
      .catch(falha => { console.error('s360AgendaHistorico', falha); setResumo('erro') })
  }, [clienteId])

  const nome = resumo && resumo !== 'erro' ? resumo.CLIENTE : 'cliente'
  return (
    <Moldura titulo={`Histórico de ${nome}`} largo aberto={!!clienteId} fechar={fechar}>
      {resumo === 'erro' ? (
        <Alert tone="error">Não foi possível abrir o histórico deste cliente.</Alert>
      ) : resumo ? (
        <Stack>
          <InfoGrid>
            <InfoTile label="Visitas">{resumo.VISITAS}</InfoTile>
            <InfoTile label="Tarefas">{resumo.TAREFAS}</InfoTile>
            <InfoTile label="Vendas">{resumo.VENDAS}</InfoTile>
          </InfoGrid>
          {eventos.length ? (
            <Table>
              <thead><tr><Th>Data</Th><Th>Evento</Th><Th numeric>Valor</Th></tr></thead>
              <tbody>
                {eventos.map((e, i) => (
                  <Tr key={i}>
                    <Td>{fmtData(e.DATA)}</Td>
                    <Td>
                      <RowTitle>{ROTULO_EVENTO[e.TIPO] ?? e.TIPO}: {e.TITULO}</RowTitle>
                      {e.TEXTO ? <RowMeta>{textoSimples(e.TEXTO).slice(0, 140)}</RowMeta> : null}
                    </Td>
                    <Td numeric>{e.VALOR != null ? moeda(e.VALOR) : <Dash />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="Nenhum evento registrado para este cliente." />}
        </Stack>
      ) : null}
    </Moldura>
  )
}

