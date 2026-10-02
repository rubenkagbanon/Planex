import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChampMotDePasse } from '@/components/ChampMotDePasse'
import { traduireErreurAuth } from '@/lib/authErreurs'
import { PlanexLogo } from '@/components/PlanexLogo'
import { cn } from '@/lib/utils'

type Mode = 'creer' | 'rejoindre'

export function Signup() {
  const { signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('creer')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [etablissement, setEtablissement] = useState('')
  const [codeInvitation, setCodeInvitation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Vérifications préalables : la base refuse de toute façon ces cas, mais Supabase Auth ne renverrait
      // qu'un message générique ("Database error saving new user").
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
            "Cet établissement existe déjà sur Planex. Pour le rejoindre, demande un code d'invitation à son administrateur et choisis « Rejoindre un établissement ».",
          )
          return
        }
      }

      const { error: signUpError } = await signUp(
        email,
        password,
        mode === 'rejoindre' ? { firstName, lastName, codeInvitation } : { firstName, lastName, etablissement },
      )
      if (signUpError) {
        setError(traduireErreurAuth(signUpError))
        return
      }
      setSubmitted(true)
    } catch (err) {
      setError(traduireErreurAuth(err instanceof Error ? err : { message: "Échec de l'inscription." }))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 py-12">
        <Link to="/" className="mb-10">
          <PlanexLogo size={30} />
        </Link>
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-1 text-xl font-semibold text-foreground">Vérifie ta boîte mail</h1>
          <p className="mb-8 text-sm text-muted-foreground">Un email de confirmation a été envoyé à {email}.</p>
          <Link to="/login" className="text-sm font-semibold text-primary">
            Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 py-12">
      <Link to="/" className="mb-10">
        <PlanexLogo size={30} />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-foreground">Créer un compte Planex</h1>

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

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mot de passe</Label>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Création...' : 'Créer le compte'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{' '}
            <Link to="/login" className="font-semibold text-primary">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
