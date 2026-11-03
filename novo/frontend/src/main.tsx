import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initMitra } from './lib/mitra-auth'
import { iniciarTema } from './lib/tema'
import { CHAVE_POS_LOGIN } from './lib/sessao'

// Antes do React: a aba nasce no tema certo (RNF-003) e o token sai da barra de endereço (RNF-002).
iniciarTema()
// Token chegando pelo fragment (redirect do Mitra ou do mitra-hub) = acabou de entrar: aplica o destino da RN-004.
if (window.location.hash.includes('tokenMitra=') && !window.location.hash.includes('tokenMitra=error')) {
  try { sessionStorage.setItem(CHAVE_POS_LOGIN, '1') } catch { /* sem sessionStorage: abre onde está */ }
}
initMitra()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
