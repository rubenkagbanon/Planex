import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ChampMotDePasse } from '@/components/ChampMotDePasse'
import { PlanexLogo } from '@/components/PlanexLogo'
import { traduireErreurAuth } from '@/lib/authErreurs'

// Ouverte depuis le lien de l'email « Mot de passe oublié » : Supabase y place une session temporaire
// (lue automatiquement dans l'URL), qui permet de définir le nouveau mot de passe.
export function ReinitialiserMotDePasse() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Lien invalide ou expiré : Supabase le signale dans l'URL
  const erreurLien = new URLSearchParams(window.location.hash.slice(1)).get('error_description')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(traduireErreurAuth(error))
      return
    }
    navigate('/accueil')
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 py-12">
      <Link to="/" className="mb-10">
        <PlanexLogo size={30} />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">Nouveau mot de passe</h1>
        {loading ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">Vérification du lien…</p>
        ) : !session ? (
          <div className="mt-6 flex flex-col gap-4 text-center">
            <p className="text-sm text-destructive">
              {erreurLien ? 'Ce lien a expiré ou a déjà été utilisé.' : "Ce lien n'est pas valide."} Demande un nouveau
              lien de réinitialisation.
            </p>
            <Link to="/mot-de-passe-oublie" className="text-sm font-semibold text-primary">
              Recevoir un nouveau lien
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-8 text-center text-sm text-muted-foreground">
              Choisis le nouveau mot de passe de {session.user.email}.
            </p>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <ChampMotDePasse
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">Au moins 8 caractères.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
                <ChampMotDePasse
                  id="confirmation"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
