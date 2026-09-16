import { Link, useLocation } from 'react-router-dom'
import { PlanexLogo } from '@/components/PlanexLogo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { path: '/accueil', label: 'Accueil' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/planning', label: 'Planning' },
  { path: '/parametres', label: 'Paramètres' },
]

export function AppHeader() {
  const { signOut } = useAuth()
  const { pathname } = useLocation()

  return (
    <header className="flex items-center justify-between border-b-[3px] border-primary bg-secondary px-6 py-3 text-secondary-foreground">
      <div className="flex min-w-0 items-center gap-6">
        <Link to="/accueil" className="shrink-0">
          <PlanexLogo variant="light" size={22} />
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = item.path === '/parametres' ? pathname.startsWith('/parametres') : pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-opacity',
                  active ? 'bg-white/10 opacity-100' : 'opacity-70 hover:opacity-100',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <Button variant="default" size="sm" onClick={() => signOut()} className="shrink-0">
        Se déconnecter
      </Button>
    </header>
  )
}
