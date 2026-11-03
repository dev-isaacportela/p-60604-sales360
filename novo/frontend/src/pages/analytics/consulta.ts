// Recorte aplicado no Buscar (RN-002) e os blocos que a página carrega.

import { paramsRecorte } from '@/lib/analytics'
import type { useBloco } from '@/components/use-bloco'

export interface Opcao { value: string; label: string }

export interface Consulta {
  escopo: Record<string, string>
  de: string
  ate: string
  ramos: Opcao[]
  clientes: Opcao[]
  produtos: Opcao[]
}

/** Parâmetros de todo bloco: escopo + recorte. */
export const paramsDe = (c: Consulta) => ({
  ...c.escopo,
  ...paramsRecorte(c.de, c.ate, { ramos: c.ramos.map(r => r.value), clientes: c.clientes.map(x => x.value), produtos: c.produtos.map(x => x.value) }),
})

type Linha = Record<string, unknown>
type Bloco<T> = ReturnType<typeof useBloco<T>>

export interface Blocos {
  resumo: Bloco<Linha | null>
  carteira: Bloco<Linha | null>
  evolucao: Bloco<Linha[]>
  produtos: Bloco<Linha[]>
  topClientes: Bloco<Linha[]>
  visitas: Bloco<Linha[]>
  evolucaoCliente: Bloco<Linha[]>
}

export type FiltrarPor = (grafico: 'CLIENTE' | 'PRODUTO', item: Opcao) => void

/** Barras de um grupo da s360AnalyticsProdutos. */
export function barrasDe(rows: Linha[] | null, grupo: string, campo: 'VALOR' | 'QT', limite: number) {
  return (rows ?? []).filter(r => r.GRUPO === grupo).slice(0, limite)
    .map(r => ({ chave: String(r.CHAVE), rotulo: String(r.NOME ?? r.CHAVE), valor: Number(r[campo] || 0) }))
}
