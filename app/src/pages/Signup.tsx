import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlanexLogo } from '@/components/PlanexLogo'

export function Signup() {
  const { signUp } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [etablissement, setEtablissement] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signUp(email, password, { firstName, lastName, etablissement })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
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
        <h1 className="mb-8 text-center text-xl font-semibold text-foreground">Créer un compte Planex</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="etablissement">Établissement</Label>
            <Input
              id="etablissement"
              type="text"
              value={etablissement}
              onChange={(e) => setEtablissement(e.target.value)}
              placeholder="Lycée, collège, université..."
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
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
