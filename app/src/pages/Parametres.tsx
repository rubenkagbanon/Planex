import { Link, useLocation } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { HorairesTable } from '@/components/HorairesTable'
import { HorairesContraintes } from '@/components/HorairesContraintes'
import { ClassesEtablissement } from '@/components/ClassesEtablissement'
import { Professeurs } from '@/components/Professeurs'
import { cn } from '@/lib/utils'

const TABS = [
  { path: '/parametres', label: 'Horaires des 1er et 2nd cycles' },
  { path: '/parametres-contraintes', label: 'Horaires & contraintes' },
  { path: '/parametres-classes', label: 'Classes' },
  { path: '/parametres-professeurs', label: 'Professeurs' },
] as const

export function Parametres() {
  const { pathname } = useLocation()
  const activeTab = TABS.find((tab) => tab.path === pathname)?.path ?? '/parametres'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="p-8">
        <h1 className="mb-6 text-2xl font-semibold">Paramètres</h1>

        <div className="mb-6 flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                'border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
                activeTab === tab.path
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === '/parametres' && <HorairesTable />}
        {activeTab === '/parametres-contraintes' && <HorairesContraintes />}
        {activeTab === '/parametres-classes' && <ClassesEtablissement />}
        {activeTab === '/parametres-professeurs' && <Professeurs />}
      </main>
    </div>
  )
}
