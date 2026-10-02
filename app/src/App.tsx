import { Navigate, Route, Routes } from 'react-router-dom'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { MotDePasseOublie } from '@/pages/MotDePasseOublie'
import { ReinitialiserMotDePasse } from '@/pages/ReinitialiserMotDePasse'
import { Accueil } from '@/pages/Accueil'
import { Dashboard } from '@/pages/Dashboard'
import { Planning } from '@/pages/Planning'
import { Parametres } from '@/pages/Parametres'
import { Impression } from '@/pages/Impression'
import { VueEnsemble } from '@/pages/VueEnsemble'
import { Bibliotheque } from '@/pages/Bibliotheque'
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
        path="/mot-de-passe-oublie"
        element={
          <RedirectIfAuthed>
            <MotDePasseOublie />
          </RedirectIfAuthed>
        }
      />
      {/* Hors RedirectIfAuthed : le lien de l'email ouvre cette page avec une session temporaire */}
      <Route path="/reinitialiser-mot-de-passe" element={<ReinitialiserMotDePasse />} />
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
      <Route
        path="/parametres-plan"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-salles"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-regroupements"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-modele"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/parametres-etablissement"
        element={
          <ProtectedRoute>
            <Parametres />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bibliotheque"
        element={
          <ProtectedRoute>
            <Bibliotheque />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vue-ensemble"
        element={
          <ProtectedRoute>
            <VueEnsemble />
          </ProtectedRoute>
        }
      />
      <Route
        path="/impression"
        element={
          <ProtectedRoute>
            <Impression />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
