import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/hooks/useProfile'

// `sansEtablissement` : page accessible à un compte pas encore rattaché à un établissement (/completer-profil).
// Partout ailleurs, un tel compte (inscrit avec Google, ou retiré de son établissement) y est renvoyé.
export function ProtectedRoute({ children, sansEtablissement = false }: { children: ReactNode; sansEtablissement?: boolean }) {
  const { session, loading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (sansEtablissement) return children
  if (profileLoading) return null
  if (profile && !profile.etablissement_id) return <Navigate to="/completer-profil" replace />

  return children
}
