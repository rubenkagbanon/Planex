import { Navigate, Route, Routes } from 'react-router-dom'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { Accueil } from '@/pages/Accueil'
import { Dashboard } from '@/pages/Dashboard'
import { Planning } from '@/pages/Planning'
import { Parametres } from '@/pages/Parametres'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RedirectIfAuthed>
            <Landing />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthed>
            <Signup />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/accueil"
        element={
          <ProtectedRoute>
            <Accueil />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/planning"
        element={
          <ProtectedRoute>
            <Planning />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-contraintes"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-classes"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-professeurs"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
