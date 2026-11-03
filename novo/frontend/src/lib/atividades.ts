// Atividades (spec 004) — regra pura da tela. O servidor repete as mesmas
// validações (add-004-atividades.mjs); aqui elas dão a mensagem antes de gravar.

import { fmtData, fmtDataHora } from './formato.ts'

export const STATUS = [
  { value: 'PENDENTE', label: 'A Fazer' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDA', label: 'Concluída' },
]

export const PRIORIDADES = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' },
]

/** Alta vermelho, Média amarelo, Baixa verde (verificação manual da spec). */
export const TOM_PRIORIDADE: Record<string, 'alert' | 'attention' | 'live'> = { ALTA: 'alert', MEDIA: 'attention', BAIXA: 'live' }

export const rotuloStatus = (s: unknown) => STATUS.find(o => o.value === s)?.label ?? String(s ?? '')
export const rotuloPrioridade = (p: unknown) => PRIORIDADES.find(o => o.value === p)?.label ?? String(p ?? '')

export const MSG = {
  criada: 'Atividade criada com sucesso.',
  atualizada: 'Atividade atualizada.',
  removida: 'Atividade removida.',
  refine: 'Refine a busca para ver mais clientes.',
}

export const FILTROS_VAZIOS = { status: '', prioridade: '', prazo: '' }

/** RF-001: a visão inicial é a preferência do usuário (spec 001). */
export function visaoInicial(sessao: { exibicaoAtividades?: string }): 'LISTA' | 'KANBAN' {
  return sessao.exibicaoAtividades === 'KANBAN' ? 'KANBAN' : 'LISTA'
}

/** RN-006: prazo antes de hoje (Brasília) e não concluída; a que vence hoje não. */
export function atrasada(a: { STATUS?: unknown; DATA_LIMITE?: unknown }, hoje: string): boolean {
  const prazo = String(a.DATA_LIMITE ?? '')
  return !!prazo && a.STATUS !== 'CONCLUIDA' && prazo < hoje
}

export interface FormAtividade {
  titulo: string
  descricao: string
  prioridade: string
  prazo: string
  /** Cliente escolhido na lista; '' = nenhum. */
  clienteId: string
  /** Rótulo da opção escolhida ("NOME · código"). */
  clienteNome: string
  /** O que está escrito no campo. */
  clienteTexto: string
}

export const FORM_VAZIO: FormAtividade = { titulo: '', descricao: '', prioridade: 'MEDIA', prazo: '', clienteId: '', clienteNome: '', clienteTexto: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formDe(a: Record<string, any>): FormAtividade {
  const nome = a.CLIENTE ? String(a.CLIENTE) : ''
  return {
    titulo: String(a.TITULO ?? ''),
    descricao: String(a.DESCRICAO ?? ''),
    prioridade: String(a.PRIORIDADE || 'MEDIA'),
    prazo: String(a.DATA_LIMITE ?? ''),
    clienteId: a.CLIENTE_ID == null ? '' : String(a.CLIENTE_ID),
    clienteNome: nome,
    clienteTexto: nome,
  }
}

/** Campo vazio = sem cliente; texto sem opção escolhida não vale (RN-008). */
const clienteEfetivo = (f: FormAtividade) => (f.clienteTexto.trim() ? f.clienteId : '')

/** RN-005 e RN-008: a primeira mensagem que impede salvar, ou null. */
export function validarAtividade(f: FormAtividade): string | null {
  const titulo = f.titulo.trim()
  if (!titulo) return 'Informe o título da atividade.'
  if (titulo.length > 300) return 'O título pode ter até 300 caracteres.'
  if (!f.prazo) return 'Informe o prazo da atividade.'
  if (f.descricao.length > 4000) return 'A descrição pode ter até 4.000 caracteres.'
  if (f.clienteTexto.trim() && (!f.clienteId || f.clienteTexto !== f.clienteNome)) return 'Selecione um cliente da lista ou apague o campo.'
  return null
}

/** Salvar sem mudança não chama o servidor. */
export function mudou(original: FormAtividade, f: FormAtividade): boolean {
  return original.titulo.trim() !== f.titulo.trim()
    || original.descricao.trim() !== f.descricao.trim()
    || clienteEfetivo(original) !== clienteEfetivo(f)
    || original.prioridade !== f.prioridade
    || original.prazo !== f.prazo
}

export function paraInputForm(f: FormAtividade): Record<string, string> {
  return { titulo: f.titulo.trim(), descricao: f.descricao.trim(), clienteId: clienteEfetivo(f), prioridade: f.prioridade, prazo: f.prazo }
}

/** RN-003. */
export function mensagemStatus(status: string): string {
  return `Atividade marcada como ${rotuloStatus(status).toLowerCase()}.`
}

/** RNT-013: 0 alterados nunca vira sucesso. */
export function mensagemRecusa(somenteLeitura: boolean, acao: 'salvar' | 'excluir'): string {
  if (somenteLeitura) return 'Nada foi alterado: a atividade não é sua.'
  return acao === 'excluir' ? 'Não foi possível excluir a atividade.' : 'Não foi possível salvar a atividade.'
}

export function confirmacaoExclusao(titulo: string): string {
  return `Tem certeza que deseja excluir ${titulo}? Esta ação não pode ser desfeita.`
}

/* ── log (RN-009) ── */

const CAMPOS_LOG: Record<string, string> = {
  TITULO: 'Título alterado',
  DESCRICAO: 'Descrição alterada',
  CLIENTE_ID: 'Cliente alterado',
  PRIORIDADE: 'Prioridade alterada',
  DATA_LIMITE: 'Prazo alterado',
  STATUS: 'Status alterado',
}

function valorLog(campo: string, valor: unknown): string {
  const v = valor == null ? '' : String(valor)
  if (!v) return campo === 'DATA_LIMITE' ? 'sem prazo' : campo === 'CLIENTE_ID' ? 'sem cliente' : 'vazio'
  if (campo === 'DATA_LIMITE') return fmtData(v)
  if (campo === 'STATUS') return rotuloStatus(v)
  if (campo === 'PRIORIDADE') return rotuloPrioridade(v)
  return v
}

/** "Prazo alterado — De 05/11/2026 para 08/11/2026 — Ana Souza — 30/10/2026 14:32". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function textoLog(l: Record<string, any>): string {
  const campo = String(l.CAMPO_ALTERADO ?? '')
  const quando = fmtDataHora(String(l.DATA_ALTERACAO ?? '').replace(' ', 'T'))
  const quem = String(l.USUARIO ?? '')
  if (campo === 'CRIACAO') return `Atividade criada — ${quem} — ${quando}`
  const titulo = CAMPOS_LOG[campo] ?? campo
  return `${titulo} — De ${valorLog(campo, l.VALOR_ANTERIOR)} para ${valorLog(campo, l.VALOR_NOVO)} — ${quem} — ${quando}`
}

/* ── Kanban (RN-007) ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/** Colunas A FAZER, EM ANDAMENTO e CONCLUÍDA; a ordem de cada uma vem do servidor. */
export function colunasKanban(abertas: Linha[], concluidas: Linha[]) {
  return [
    { status: 'PENDENTE', titulo: 'A FAZER', itens: abertas.filter(a => a.STATUS === 'PENDENTE') },
    { status: 'EM_ANDAMENTO', titulo: 'EM ANDAMENTO', itens: abertas.filter(a => a.STATUS === 'EM_ANDAMENTO') },
    { status: 'CONCLUIDA', titulo: 'CONCLUÍDA', itens: concluidas },
  ]
}

/** Cliente e responsável numa linha só (linha compacta). */
export function metaAtividade(a: Linha, mostrarResponsavel: boolean): string {
  return [a.CLIENTE, mostrarResponsavel ? a.RESPONSAVEL : null].filter(Boolean).join(' · ')
}
