// Moldura do app — design.md §10. A janela não rola: quem rola é o <main>.
// Menu por seção (RN-005) filtrado ANTES de renderizar, com contadores
// (RN-008), recolhível no desktop (estado em localStorage) e gaveta no celular
// (☰, fecha por Escape e ao escolher um item). Marca no topo do menu; no
// rodapé, iniciais, nome, tema e Sair (RF-013). Sem busca, sino, ajuda nem
// janela de novidades.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Bell, Briefcase, CalendarDays, Compass, GitCompare,
  LayoutDashboard, ListChecks, LogOut, Menu as IconeMenu, PackagePlus, PanelLeftClose, PanelLeftOpen, Plane,
  Settings, ShieldCheck, UserCheck, UserCog, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { montarMenu } from '@/lib/menu'
import { rotuloContador } from '@/lib/contadores'
import { iniciais } from '@/lib/perfil'
import { BRAND_GREEN, Monogram, Wordmark } from '@/components/Logo'
import { NavCount } from '@/components/page'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useSessao } from './sessao-contexto'

const ICONES: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/agenda': CalendarDays,
  '/clientes': Users,
  '/tarefas': ListChecks,
  '/simulacao': PackagePlus,
  '/analytics': BarChart3,
  '/comparativo': GitCompare,
  '/alertas': Bell,
  '/direcionamento-semanal': Compass,
  '/gestao-carteira': Briefcase,
  '/gestao-titulares': UserCheck,
  '/ferias-vendedor': Plane,
  '/gestao-coordenadores': UserCog,
  '/governanca-rca': ShieldCheck,
  '/configuracoes': Settings,
}

const CHAVE_RECOLHIDO = 's360:menu-recolhido'

function lerRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDO) === '1'
  } catch {
    return false
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const { sessao, contadores, sair } = useSessao()
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  const [gaveta, setGaveta] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_RECOLHIDO, recolhido ? '1' : '0')
    } catch {
      // preferência não crítica
    }
  }, [recolhido])

  useEffect(() => {
    if (!gaveta) return
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setGaveta(false)
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [gaveta])

  const secoes = montarMenu(sessao)
  const valores = { atividades: contadores.atividades, alertas: contadores.alertas }
  const siglas = iniciais(sessao.nome)

  const menu = (fechado: boolean) => (
    <div className="flex h-full flex-col bg-nav">
      <div className={cn('flex flex-col items-center justify-center gap-1 px-4 py-4', fechado && 'h-14 px-0 py-0')}>
        {fechado ? (
          // Verde da MARCA, não o --primary (design.md §11); monta uma vez (§11.1).
          <span style={{ color: BRAND_GREEN }}>
            <Monogram animar="monta" className="size-7" />
          </span>
        ) : (
          <>
            <Wordmark className="h-6" />
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-secondary">Sales 360</p>
          </>
        )}
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-2 py-2">
        {secoes.map(secao => (
          <div key={secao.id} className="mb-4">
            {fechado ? (
              <div className="mx-auto mb-2 h-px w-6 bg-rule-row" aria-hidden />
            ) : secao.titulo ? (
              <p className="mb-1 px-2 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{secao.titulo}</p>
            ) : null}
            {secao.itens.map(item => {
              const Icone = ICONES[item.caminho] ?? LayoutDashboard
              const contador = item.contador ? rotuloContador(valores[item.contador]) : null
              return (
                <NavLink
                  key={item.caminho}
                  to={item.caminho}
                  end={item.caminho === '/'}
                  title={item.rotulo}
                  onClick={() => setGaveta(false)}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors',
                      fechado && 'justify-center px-0',
                      isActive ? 'bg-accent font-semibold text-nav-active' : 'text-nav-text hover:bg-nav-hover hover:text-ink',
                    )
                  }
                >
                  <Icone className="size-4 shrink-0" aria-hidden />
                  {fechado ? null : <span className="truncate">{item.rotulo}</span>}
                  {contador && !fechado ? <NavCount label={`${contador} pendentes`}>{contador}</NavCount> : null}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-rule-row p-2">
        <div className={cn('flex items-center gap-2.5 px-1.5 py-2', fechado && 'flex-col justify-center gap-2 px-0')}>
          <span
            title={sessao.nome}
            aria-label={`Usuário: ${sessao.nome}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-primary-foreground"
          >
            {siglas || '?'}
          </span>
          {fechado ? null : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-ink">{sessao.nome}</span>
              <span className="truncate text-[12px] text-ink-secondary">{sessao.email}</span>
            </span>
          )}
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={sair}
          aria-label="Sair"
          title="Sair"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-nav-text transition-colors',
            'hover:bg-alert-bg hover:text-alert focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            fechado && 'justify-center px-0',
          )}
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          {fechado ? null : 'Sair'}
        </button>
        <button
          type="button"
          onClick={() => setRecolhido(v => !v)}
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          title={recolhido ? 'Expandir menu' : 'Recolher menu'}
          className={cn(
            'mt-1 hidden w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-nav-text transition-colors lg:flex',
            'hover:bg-nav-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            fechado && 'justify-center px-0',
          )}
        >
          {recolhido ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
              Recolher
            </>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-ground">
      <aside className={cn('hidden shrink-0 border-r border-rule-table transition-[width] lg:block', recolhido ? 'lg:w-[4.5rem]' : 'lg:w-60')}>
        {menu(recolhido)}
      </aside>

      {gaveta ? (
        <button type="button" aria-label="Fechar menu" onClick={() => setGaveta(false)} className="fixed inset-0 z-30 bg-ink/40 lg:hidden" />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-rule-table transition-transform lg:hidden',
          gaveta ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setGaveta(false)}
          className="absolute top-3 right-2 z-50 rounded-lg p-2 text-ink-secondary hover:bg-nav-hover"
        >
          <X className="size-4" aria-hidden />
        </button>
        {menu(false)}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule-table bg-nav px-3 lg:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setGaveta(true)} className="rounded-lg p-2 text-ink-secondary hover:bg-nav-hover">
            <IconeMenu className="size-5" aria-hidden />
          </button>
          <Wordmark className="h-5" />
          <span className="ml-auto flex size-8 items-center justify-center rounded-xl bg-primary text-[12px] font-bold text-primary-foreground">
            {siglas || '?'}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
