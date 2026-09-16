import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlanexLogo } from '@/components/PlanexLogo'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(error.message)
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
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">Connexion</h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">Accède à ton espace emploi du temps</p>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Connexion...' : 'Se connecter'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Pas encore de compte ?{' '}
            <Link to="/signup" className="font-semibold text-primary">
              Créer un compte
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
