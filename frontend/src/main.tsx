import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { TEMA_ESCURO_LIGADO } from './lib/temaLigado'
import { iniciarTema } from './lib/theme'

// Tema escuro desligado neste app (decisao da Benenutri, 23/10/2026): as telas
// ainda tem cores fixas e no escuro ficariam pela metade. Sempre claro, sem
// ouvir o Meu painel. Para religar, mude TEMA_ESCURO_LIGADO em lib/temaLigado.ts.
if (TEMA_ESCURO_LIGADO) iniciarTema()
else document.documentElement.removeAttribute('data-tema')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
