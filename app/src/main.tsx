import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { AuthProvider } from '@/context/AuthContext'
import App from './App.tsx'

// Après un nouveau déploiement, un onglet resté ouvert réclame d'anciens fichiers (ex. le module PDF) qui
// n'existent plus : on recharge la page une fois pour récupérer la nouvelle version.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const dernier = Number(sessionStorage.getItem('planex-rechargement') ?? 0)
    if (Date.now() - dernier < 10_000) return
    sessionStorage.setItem('planex-rechargement', String(Date.now()))
  } catch {
    // sessionStorage indisponible : on recharge quand même
  }
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
