// Peças comuns às abas do Analytics (spec 007): seletor de vários itens,
// cabeçalho ordenável (RF-022) e o estado de bloco (carregando / falhou).

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, accentInsensitiveFilter } from '@/components/ui/command'
import { Alert, Th } from '@/components/page'

import type { Opcao } from './consulta'

/**
 * Vários itens com busca (RNT-014). `buscar` = busca no servidor (clientes);
 * sem ela, filtra as `opcoes` na tela (ramos). Os escolhidos ficam no topo.
 */
export function MultiEscolha({ label, opcoes, valor, mudar, buscar, vazio = 'Todos' }: {
  label: string
  opcoes: Opcao[]
  valor: Opcao[]
  mudar: (v: Opcao[]) => void
  buscar?: (texto: string) => void
  vazio?: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const marcado = new Set(valor.map(v => v.value))
  const lista = [...valor, ...opcoes.filter(o => !marcado.has(o.value))]
  const resumo = !valor.length ? vazio : valor.length === 1 ? valor[0].label : `${valor.length} selecionados`
  function alternar(o: Opcao) {
    mudar(marcado.has(o.value) ? valor.filter(v => v.value !== o.value) : [...valor, o])
  }
  return (
    <Popover modal open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={aberto}
          aria-label={label}
          className={cn(
            'flex h-9 w-full min-w-44 items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-[13px] text-ink shadow-xs transition-colors',
            'focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none',
            !valor.length && 'text-ink-secondary',
          )}
        >
          <span className="truncate">{resumo}</span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command filter={buscar ? () => 1 : accentInsensitiveFilter}>
          <CommandInput placeholder="Buscar..." onValueChange={buscar} />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {lista.map(o => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => alternar(o)}>
                  <span className="truncate">{o.label}</span>
                  {marcado.has(o.value) ? <Check className="ml-auto size-3.5 text-primary" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {valor.length ? (
            <button type="button" className="w-full border-t border-rule-row px-3 py-2 text-left text-[12px] text-ink-secondary hover:bg-accent" onClick={() => mudar([])}>
              Limpar seleção
            </button>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export type Direcao = 'asc' | 'desc'

/** RF-022: cabeçalho que ordena pelo número. */
export function ThOrdem<K extends string>({ campo, ordem, mudar, children, numeric }: {
  campo: K
  ordem: { campo: K; direcao: Direcao }
  mudar: (o: { campo: K; direcao: Direcao }) => void
  children: React.ReactNode
  numeric?: boolean
}) {
  const ativo = ordem.campo === campo
  return (
    <Th numeric={numeric} aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className="uppercase hover:text-ink"
        onClick={() => mudar({ campo, direcao: ativo && ordem.direcao === 'desc' ? 'asc' : 'desc' })}
      >
        {children}{ativo ? (ordem.direcao === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </Th>
  )
}

/** Estado de um bloco: falha com a mensagem padrão do bloco ou "Carregando…". */
export function EstadoBloco({ erro, carregando, nome, children }: { erro: boolean; carregando: boolean; nome: string; children: React.ReactNode }) {
  if (erro) return <div className="p-4"><Alert tone="error">Não foi possível carregar {nome}. Clique em Buscar para tentar de novo.</Alert></div>
  if (carregando) return <p className="px-4 py-6 text-[13px] text-ink-secondary">Carregando…</p>
  return <>{children}</>
}
