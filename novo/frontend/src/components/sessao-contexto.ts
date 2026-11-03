import { createContext, useContext } from 'react'

// Tipo local (verbatimModuleSyntax: nada de importar tipo de outro arquivo).
// Mesmo formato de normalizarSessao em lib/sessao.ts.
interface Sessao {
  userId: number
  email: string
  nome: string
  papeis: string[]
  coordenadorAtivo: boolean
  bloqueado: boolean
  configurado: boolean
  modoAgenda: 'DIA' | 'SEMANA' | 'MES'
  exibicaoAtividades: 'LISTA' | 'KANBAN'
  pagina: string
}

interface ValorSessao {
  sessao: Readonly<Sessao>
  contadores: { atividades: number; alertas: number }
  /** Relê sessão e contadores (após salvar Configurações, por exemplo). */
  recarregar: () => void
  sair: () => void
}

export const SessaoContexto = createContext<ValorSessao | null>(null)

export function useSessao(): ValorSessao {
  const valor = useContext(SessaoContexto)
  if (!valor) throw new Error('useSessao fora do SessaoProvider')
  return valor
}
