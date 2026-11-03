// Regra de tela do Dashboard (spec 005). Sem React, sem SDK: é o que
// tests/dashboard.test.mjs importa. As SFs devolvem somas e listas; as contas
// (percentual, projeção, selo, variação, relato) moram aqui (D-505).

import { semanaDe, somarDias } from './agenda.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Modo = 'ME' | 'TEAM' | 'ALL' | 'COORD' | 'SELLER' | string

export const MSG_FALHA_BLOCO = 'Não foi possível carregar este bloco agora. Tente atualizar a tela.'

/** `12.34` → `12,3%`; com `sinal`, `+12,3%` / `-12,3%`. */
export function pct(valor: number, sinal = false): string {
  const t = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${sinal && valor > 0 ? '+' : valor < 0 && t !== '0,0' ? '-' : ''}${t}%`
}

/* ─────────────── saudação e compromissos (RN-001, RN-002) ─────────────── */

/** Nome de exibição; vazio ou com "@", a parte do e-mail antes do "@"; sem e-mail, `você`. */
export function nomeSaudacao(nome: string, email: string): string {
  const n = (nome ?? '').trim()
  if (n && !n.includes('@')) return n
  const local = (email ?? '').split('@')[0].trim()
  if (!local) return 'você'
  return local.split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

/** `horaMinuto` = `HH:MM` de Brasília. */
export function saudacao(horaMinuto: string, nome: string, email: string): string {
  const periodo = horaMinuto < '12:00' ? 'Bom dia' : horaMinuto < '18:00' ? 'Boa tarde' : 'Boa noite'
  return `${periodo}, ${nomeSaudacao(nome, email)}.`
}

/** Itens de s360AgendaListar de hoje, sem cancelados, por horário. */
export function compromissosDeHoje(itens: Linha[], hoje: string): Linha[] {
  return itens
    .filter(i => i.DATA === hoje && i.STATUS !== 'CANCELADA')
    .sort((a, b) => String(a.HORA_INICIO).localeCompare(String(b.HORA_INICIO)))
}

export function fraseCompromissos(n: number, modo: Modo, nomeVendedor = ''): string {
  const quem = modo === 'ME' ? 'Você' : modo === 'SELLER' ? nomeVendedor || 'O vendedor' : 'O time'
  if (n === 0) return `${quem} não tem nenhum compromisso para hoje.`
  return `${quem} tem ${n} compromisso${n > 1 ? 's' : ''} para hoje.`
}

/* ─────────────── meta semanal (RN-005) ─────────────── */

/** Texto abaixo do card; null quando é a meta de uma pessoa só. */
export function textoMetaComposta(modo: Modo, valores: Linha | null, pessoas: number): string | null {
  if (pessoas === 0) return 'Nenhuma pessoa no filtro atual.'
  if (modo === 'ME' || modo === 'SELLER') return null
  return `Meta composta do filtro atual: vendedores ${Number(valores?.VENDEDOR ?? 0)}/semana e coordenadores ${Number(valores?.COORDENADOR ?? 0)}/semana.`
}

/** A partir de quando vale uma meta salva hoje (RF-004). */
export const proximaSegunda = (hoje: string) => somarDias(semanaDe(hoje).segunda, 7)

/* ─────────────── meta mensal (RN-006, RN-007, RN-008) ─────────────── */

const util = (iso: string) => semanaDe(iso).segunda <= iso && iso <= semanaDe(iso).sexta

export function mesDe(hoje: string) {
  const inicio = `${hoje.slice(0, 7)}-01`
  const [a, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  return { inicio, fim: somarDias(proximo, -1) }
}

/** RNT-016: segunda a sexta, sem descontar feriados; decorridos inclui hoje. */
export function diasUteis(inicio: string, fim: string, hoje: string) {
  let total = 0
  let decorridos = 0
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (!util(d)) continue
    total += 1
    if (d <= hoje) decorridos += 1
  }
  return { total, decorridos }
}

export type Selo = 'Acima da meta' | 'No ritmo' | 'Abaixo da meta'

export function cardMensal({ liquido, meta, inicio, fim, hoje }: { liquido: number; meta: number | null; inicio: string; fim: string; hoje: string }) {
  const { total, decorridos } = diasUteis(inicio, fim, hoje)
  // Sem dia útil decorrido ou mês já fechado: projeção = realizado (e sem erro de arredondamento).
  const projecao = decorridos === 0 || decorridos >= total ? liquido : (liquido * total) / decorridos
  const alvo = Number(meta ?? 0)
  if (!(alvo > 0)) return { distribuida: false as const, projecao, percentual: null, circulo: 0, selo: null }
  const percentual = (liquido / alvo) * 100
  const selo: Selo = projecao >= alvo ? 'Acima da meta' : projecao >= alvo * 0.9 ? 'No ritmo' : 'Abaixo da meta'
  return { distribuida: true as const, projecao, percentual, circulo: Math.max(0, Math.min(100, percentual)), selo }
}

/* ─────────────── vendas diárias (RN-009) ─────────────── */

/** Os `n` últimos dias úteis até hoje (sábado/domingo → até sexta), do mais antigo ao mais novo. */
export function ultimosDiasUteis(hoje: string, n: number): string[] {
  const dias: string[] = []
  for (let d = hoje; dias.length < n; d = somarDias(d, -1)) if (util(d)) dias.unshift(d)
  return dias
}

/** Variação contra o dia útil anterior: `—` com anterior zero, negativo ou ausente; `0,0%` com os dois zero. */
export function variacao(atual: number, anterior: number | null | undefined): string {
  if (anterior === 0 && atual === 0) return '0,0%'
  if (anterior == null || anterior <= 0) return '—'
  return pct(((atual - anterior) / anterior) * 100, true)
}

/** Barras dos últimos 7 dias úteis; pede 8 à SF para o primeiro ter dia anterior. */
export function serieDiaria(linhas: Linha[], hoje: string) {
  const valor = new Map(linhas.map(l => [String(l.DIA), Number(l.LIQUIDO)]))
  const dias = ultimosDiasUteis(hoje, 8).map(dia => ({ dia, valor: valor.get(dia) ?? 0 }))
  return dias.slice(1).map((d, i) => ({ ...d, variacao: variacao(d.valor, dias[i].valor) }))
}

/* ─────────────── atividades e resumo da semana (RN-011, RN-012) ─────────────── */

export const DESCRICAO_PADRAO = 'Atividade registrada na agenda comercial.'

/** As 3 pendentes com prazo mais próximo (vencidas primeiro, sem prazo por último). */
export function ultimasAtividades(abertas: Linha[]): Linha[] {
  const prazo = (a: Linha) => (a.DATA_LIMITE ? String(a.DATA_LIMITE) : '9999-99-99')
  return [...abertas]
    .sort((a, b) => prazo(a).localeCompare(prazo(b)) || Number(a.ID) - Number(b.ID))
    .slice(0, 3)
    .map(a => ({ ...a, DESCRICAO: String(a.DESCRICAO ?? '').trim() || DESCRICAO_PADRAO }))
}

export function relato(item: Linha, hoje: string): { relato: string; dataRelato: string | null } {
  if (item.STATUS === 'CONCLUIDA') return { relato: 'Ok', dataRelato: item.CHECKOUT_HORA ? String(item.CHECKOUT_HORA).slice(0, 10) : null }
  if (item.STATUS === 'CANCELADA') return { relato: 'Cancelada', dataRelato: null }
  return { relato: String(item.DATA) <= hoje ? 'Relato pendente' : '—', dataRelato: null }
}

/** Visitas e prospecções da semana, da mais recente para a mais antiga, até 12. */
export function resumoSemana(itens: Linha[], hoje: string): Linha[] {
  return itens
    .filter(i => i.ORIGEM === 'VISITA' || i.ORIGEM === 'PROSPECCAO')
    .sort((a, b) => `${b.DATA} ${b.HORA_INICIO}`.localeCompare(`${a.DATA} ${a.HORA_INICIO}`))
    .slice(0, 12)
    .map(i => ({ ...i, ...relato(i, hoje) }))
}
