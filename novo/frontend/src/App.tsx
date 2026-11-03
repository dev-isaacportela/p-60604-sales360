// Rotas do sistema novo. Sem sessão → /login guardando o caminho pedido
// (RN-001, C-002). Com sessão → moldura + rota conferida por podeAbrir antes
// de montar a página (RN-015). Rota desconhecida ou cancelada → Dashboard.

import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { hasSession } from './lib/mitra-auth'
import { ROTAS, podeAbrir } from './lib/menu'
import { CHAVE_DESTINO, destinoSemSessao } from './lib/sessao'
import { Layout } from './components/Layout'
import { SessaoProvider } from './components/SessaoProvider'
import { useSessao } from './components/sessao-contexto'
import { AcessoRestrito } from './pages/AcessoRestrito'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { EmConstrucao } from './pages/EmConstrucao'
import { LoginPage } from './pages/LoginPage'

function Tela({ caminho }: { caminho: string }) {
  const { sessao } = useSessao()
  if (!podeAbrir(caminho, sessao)) return <AcessoRestrito caminho={caminho} />
  if (caminho === '/configuracoes') return <ConfiguracoesPage />
  return <EmConstrucao caminho={caminho} />
}

function AreaLogada() {
  const local = useLocation()
  if (!hasSession()) {
    const { destino, guardar } = destinoSemSessao(local.pathname + local.search)
    try {
      if (guardar) sessionStorage.setItem(CHAVE_DESTINO, guardar)
    } catch {
      // sessionStorage bloqueado: depois do login vai para a página inicial.
    }
    return <Navigate to={destino} replace />
  }
  return (
    <SessaoProvider>
      <Layout>
        <Routes>
          {ROTAS.map(r => (
            <Route key={r.caminho} path={r.caminho} element={<Tela caminho={r.caminho} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </SessaoProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<LoginPage passoInicial="recuperar" />} />
      <Route path="*" element={<AreaLogada />} />
    </Routes>
  )
}
