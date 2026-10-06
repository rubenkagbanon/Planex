import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlanexLogo } from '@/components/PlanexLogo'
import { traduireErreurAuth } from '@/lib/authErreurs'
import { cn } from '@/lib/utils'

type Mode = 'creer' | 'rejoindre'

// Étape obligatoire pour un compte sans établissement (inscription avec Google, ou membre retiré de son
// établissement) : on y crée un nouvel établissement ou on en rejoint un avec un code d'invitation.
export function CompleterProfil() {
  const { user, signOut } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('creer')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [etablissement, setEtablissement] = useState('')
  const [codeInvitation, setCodeInvitation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Pré-remplit le prénom et le nom transmis par Google
  useEffect(() => {
    if (!profile) return
    setFirstName((v) => v || profile.first_name || '')
    setLastName((v) => v || profile.last_name || '')
  }, [profile])

  if (isLoading) return null
  if (profile?.etablissement_id) return <Navigate to="/accueil" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'rejoindre') {
        const { data: nom, error: rpcError } = await supabase.rpc('verifier_code_invitation', { p_code: codeInvitation })
        if (rpcError) throw rpcError
        if (!nom) {
          setError("Code d'invitation invalide. Demande-le à l'administrateur Planex de ton établissement.")
          return
        }
      } else {
        const { data: disponible, error: rpcError } = await supabase.rpc('etablissement_nom_disponible', { p_nom: etablissement })
        if (rpcError) throw rpcError
        if (!disponible) {
          setError(
            "Cet établissement existe déjà sur Planex. Pour le rejoindre, demande un code d'invitation à son administrateur et choisis « Rejoindre avec un code ».",
          )
          return
        }
      }

      const { error: rpcError } = await supabase.rpc(
        'completer_inscription',
        mode === 'rejoindre'
          ? { p_first_name: firstName, p_last_name: lastName, p_code_invitation: codeInvitation }
          : { p_first_name: firstName, p_last_name: lastName, p_etablissement: etablissement },
      )
      if (rpcError) throw rpcError
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      navigate('/accueil', { replace: true })
    } catch (err) {
      setError(traduireErreurAuth(err instanceof Error ? err : (err as { message?: string })))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 py-12">
      <div className="mb-10">
        <PlanexLogo size={30} />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">Compléter ton profil</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Dernière étape avant d'accéder à Planex{user?.email ? ` avec ${user.email}` : ''}.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: 'creer', label: 'Nouvel établissement' },
              { key: 'rejoindre', label: 'Rejoindre avec un code' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setMode(tab.key)
                setError(null)
              }}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                mode === tab.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          {mode === 'creer' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="etablissement">Établissement</Label>
              <Input
                id="etablissement"
                type="text"
                value={etablissement}
                onChange={(e) => setEtablissement(e.target.value)}
                placeholder="Lycée, collège..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Tu en deviendras l'administrateur : tu pourras inviter tes collègues avec un code.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="codeInvitation">Code d'invitation</Label>
              <Input
                id="codeInvitation"
                type="text"
                value={codeInvitation}
                onChange={(e) => setCodeInvitation(e.target.value.toUpperCase())}
                placeholder="ABCDE-FGHJK"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Fourni par l'administrateur Planex de ton établissement (Paramètres &gt; Établissement).
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Enregistrement...' : 'Continuer'}
          </Button>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  )
}
