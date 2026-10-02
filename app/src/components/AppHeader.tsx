import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Home, Library, LayoutDashboard, LayoutGrid, LogOut, Menu, Printer, Settings, X, type LucideIcon } from 'lucide-react'
import { PlanexLogo } from '@/components/PlanexLogo'
import { useAuth } from '@/context/AuthContext'
import { useEtablissement } from '@/hooks/useEtablissement'
import { anneeScolaire } from '@/lib/anneeScolaire'
import { cn } from '@/lib/utils'

const NAV_ITEMS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/accueil', label: 'Accueil', icon: Home },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/planning', label: 'Planning', icon: CalendarDays },
  { path: '/vue-ensemble', label: "Vue d'ensemble", icon: LayoutGrid },
  { path: '/impression', label: 'Impression', icon: Printer },
  { path: '/bibliotheque', label: 'Bibliothèque', icon: Library },
  { path: '/parametres', label: 'Paramètres', icon: Settings },
]

const estActif = (path: string, pathname: string) => (path === '/parametres' ? pathname.startsWith('/parametres') : pathname === path)

export function AppHeader() {
  const { signOut } = useAuth()
  const { pathname } = useLocation()
  const { etablissement } = useEtablissement()
  const [menuOuvert, setMenuOuvert] = useState(false)

  // Referme le menu mobile à chaque changement de page
  useEffect(() => setMenuOuvert(false), [pathname])

  return (
    <header className="no-print sticky top-0 z-40 border-b-[3px] border-primary bg-secondary text-secondary-foreground">
      <div className="flex h-16 items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/accueil" className="shrink-0">
          <PlanexLogo variant="light" size={26} />
        </Link>
        {etablissement && (
          <Link
            to="/bibliotheque"
            title="Année scolaire en cours — voir la bibliothèque des années"
            className="hidden shrink-0 rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground/85 hover:bg-white/10 2xl:inline-block"
          >
            {anneeScolaire(etablissement.annee_scolaire)}
          </Link>
        )}

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_ITEMS.map(({ path, label, icon: Icone }) => {
            const actif = estActif(path, pathname)
            return (
              <Link
                key={path}
                to={path}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'relative flex h-16 items-center gap-2 whitespace-nowrap px-2.5 text-[15px] font-medium transition-colors xl:px-3 2xl:px-3.5',
                  actif ? 'text-secondary-foreground' : 'text-secondary-foreground/65 hover:text-secondary-foreground',
                )}
              >
                <Icone className="hidden h-[18px] w-[18px] 2xl:block" />
                {label}
                <span
                  className={cn(
                    'absolute inset-x-3 -bottom-[3px] h-[3px] rounded-t bg-secondary-foreground transition-opacity',
                    actif ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
          <button
            type="button"
            onClick={() => signOut()}
            className="hidden items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:flex xl:px-4"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
            <span className="lg:hidden xl:inline">Se déconnecter</span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOuvert((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10 lg:hidden"
            aria-label={menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOuvert}
          >
            {menuOuvert ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {menuOuvert && (
        <nav className="flex flex-col gap-1 border-t border-white/10 px-4 pb-4 pt-2 lg:hidden">
          {NAV_ITEMS.map(({ path, label, icon: Icone }) => {
            const actif = estActif(path, pathname)
            return (
              <Link
                key={path}
                to={path}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium',
                  actif ? 'bg-white/10 text-secondary-foreground' : 'text-secondary-foreground/75 hover:bg-white/5',
                )}
              >
                <Icone className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-2 flex items-center gap-3 rounded-md px-3 py-3 text-base font-semibold text-primary sm:hidden"
          >
            <LogOut className="h-5 w-5" /> Se déconnecter
          </button>
        </nav>
      )}
    </header>
  )
}
