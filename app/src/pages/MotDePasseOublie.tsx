import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlanexLogo } from '@/components/PlanexLogo'
import { traduireErreurAuth } from '@/lib/authErreurs'

// Demande d'un lien de réinitialisation : Supabase envoie un email dont le lien ouvre
// /reinitialiser-mot-de-passe avec une session temporaire.
export function MotDePasseOublie() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    })
    setSubmitting(false)
    // Pas de distinction « compte inconnu » : on ne révèle pas quelles adresses ont un compte.
    if (error && error.code !== 'user_not_found') {
      setError(traduireErreurAuth(error))
      return
    }
    setEnvoye(true)
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 py-12">
      <Link to="/" className="mb-10">
        <PlanexLogo size={30} />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">Mot de passe oublié</h1>
        {envoye ? (
          <div className="mt-6 flex flex-col gap-4 text-center">
            <p className="text-sm text-foreground">
              Si un compte existe pour <span className="font-semibold">{email}</span>, un email vient d'être envoyé avec
              un lien pour choisir un nouveau mot de passe.
            </p>
            <p className="text-xs text-muted-foreground">
              Pense à regarder dans les courriers indésirables. Le lien n'est valable qu'une fois et pour une durée
              limitée.
            </p>
            <Link to="/login" className="text-sm font-semibold text-primary">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-8 text-center text-sm text-muted-foreground">
              Indique l'adresse email de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
            </p>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? 'Envoi...' : 'Envoyer le lien'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-semibold text-primary">
                  Retour à la connexion
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
