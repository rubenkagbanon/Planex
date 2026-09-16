import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return null
  if (session) return <Navigate to="/accueil" replace />

  return children
}
