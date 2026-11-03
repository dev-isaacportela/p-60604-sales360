// Sessão em memória do app (RN-001, RN-004, RN-007, RN-016, RNF-004).
//
// Abertura = 2 consultas em paralelo (s360SessaoObter + s360ContadoresObter).
// Relê a cada 5 minutos e no evento `s360:contadores` (que também é o
// `recarregar` do contexto). BLOQUEADO = 1 encerra
// a sessão e volta ao login com o aviso da RN-016.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { linha } from '../lib/mitra-api'
import { clearSession } from '../lib/mitra-auth'
import { hojeBrasilia } from '../lib/formato'
import { CHAVE_DESTINO, CHAVE_POS_LOGIN, destinoAposLogin, normalizarSessao } from '../lib/sessao'
import { EVENTO_CONTADORES, avisarContadores, precisaRecarregar } from '../lib/contadores'
import { SessaoContexto } from './sessao-contexto'
import { Actions, Alert, AuthCard, Button, CenterScreen, Stack } from './page'
import { MonogramLoader, MonogramTile } from './Logo'

type Sessao = NonNullable<ReturnType<typeof normalizarSessao>>

function lerEApagar(chave: string): string | null {
  try {
    const valor = sessionStorage.getItem(chave)
    sessionStorage.removeItem(chave)
    return valor
  } catch {
    return null
  }
}

async function buscar() {
  const [s, c] = await Promise.allSettled([linha('sessaoObter', { hoje: hojeBrasilia() }), linha('contadoresObter')])
  if (s.status === 'rejected') console.error('s360SessaoObter', s.reason)
  if (c.status === 'rejected') console.error('s360ContadoresObter', c.reason)
  return {
    sessao: s.status === 'fulfilled' ? normalizarSessao(s.value) : null,
    contadores:
      c.status === 'fulfilled'
        ? { atividades: Number(c.value?.ATIVIDADES_PENDENTES) || 0, alertas: Number(c.value?.ALERTAS_NAO_LIDOS) || 0 }
        : null,
  }
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [contadores, setContadores] = useState({ atividades: 0, alertas: 0 })
  const [falhou, setFalhou] = useState(false)

  const sair = useCallback(
    (bloqueado = false) => {
      clearSession()
      setSessao(null)
      navigate(bloqueado ? '/login?bloqueado=1' : '/login', { replace: true })
    },
    [navigate],
  )

  const aplicar = useCallback(
    (r: Awaited<ReturnType<typeof buscar>>, primeira: boolean) => {
      if (r.sessao?.bloqueado) return sair(true)
      if (r.contadores) setContadores(r.contadores)
      if (!r.sessao) {
        // Recarga de fundo que falhou não derruba a tela já aberta.
        if (primeira) setFalhou(true)
        return
      }
      setFalhou(false)
      setSessao(r.sessao)
      if (primeira && lerEApagar(CHAVE_POS_LOGIN)) navigate(destinoAposLogin(lerEApagar(CHAVE_DESTINO), r.sessao), { replace: true })
    },
    [navigate, sair],
  )

  useEffect(() => {
    let vivo = true
    let primeira = true
    let ultima = 0
    const carregar = () => {
      ultima = Date.now()
      void buscar().then(r => {
        if (!vivo) return
        const era = primeira
        if (r.sessao) primeira = false
        aplicar(r, era)
      })
    }
    carregar()
    const relogio = window.setInterval(() => {
      if (precisaRecarregar(ultima, Date.now())) carregar()
    }, 30_000)
    window.addEventListener(EVENTO_CONTADORES, carregar)
    return () => {
      vivo = false
      window.clearInterval(relogio)
      window.removeEventListener(EVENTO_CONTADORES, carregar)
    }
  }, [aplicar])

  const valor = useMemo(
    () => (sessao ? { sessao, contadores, recarregar: avisarContadores, sair: () => sair() } : null),
    [sessao, contadores, sair],
  )

  if (falhou) {
    return (
      <CenterScreen>
        <AuthCard logo={<MonogramTile />} title="Sales 360">
          <Stack>
            <Alert tone="error">Não foi possível carregar seus dados de acesso.</Alert>
            <Actions>
              <Button variant="primary" onClick={avisarContadores}>
                Tentar novamente
              </Button>
              <Button onClick={() => sair()}>Sair</Button>
            </Actions>
          </Stack>
        </AuthCard>
      </CenterScreen>
    )
  }

  if (!valor) {
    return (
      <CenterScreen>
        <MonogramLoader rotulo="Carregando seus dados" />
      </CenterScreen>
    )
  }

  return <SessaoContexto.Provider value={valor}>{children}</SessaoContexto.Provider>
}
