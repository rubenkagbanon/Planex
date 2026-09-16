import { useAuth } from '@/context/AuthContext'
import { AppHeader } from '@/components/AppHeader'

export function Accueil() {
  const { user } = useAuth()
  const firstName = user?.user_metadata?.first_name as string | undefined
  const etablissement = user?.user_metadata?.etablissement_name as string | undefined

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Bienvenue{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-2 text-muted-foreground">Connecté en tant que {etablissement || user?.email}</p>
      </main>
    </div>
  )
}
