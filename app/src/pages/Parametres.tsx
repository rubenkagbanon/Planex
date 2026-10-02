import { Link, useLocation } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { HorairesTable } from '@/components/HorairesTable'
import { HorairesContraintes } from '@/components/HorairesContraintes'
import { ClassesEtablissement } from '@/components/ClassesEtablissement'
import { Professeurs } from '@/components/Professeurs'
import { ClassesDetails } from '@/components/ClassesDetails'
import { Salles } from '@/components/Salles'
import { Regroupements } from '@/components/Regroupements'
import { EtablissementInfos } from '@/components/EtablissementInfos'
import { PlanEtablissement } from '@/components/PlanEtablissement'
import { ApprentissageModele } from '@/components/ApprentissageModele'
import { cn } from '@/lib/utils'

const TABS = [
  { path: '/parametres-plan', label: 'Plan' },
  { path: '/parametres', label: 'Horaires des 1er et 2nd cycles' },
  { path: '/parametres-contraintes', label: 'Horaires & contraintes' },
  { path: '/parametres-classes', label: 'Classes' },
  { path: '/parametres-professeurs', label: 'Professeurs' },
  { path: '/parametres-salles', label: 'Salles' },
  { path: '/parametres-regroupements', label: 'Regroupements' },
  { path: '/parametres-modele', label: 'Apprendre d’un modèle' },
  { path: '/parametres-etablissement', label: 'Établissement' },
] as const

export function Parametres() {
  const { pathname } = useLocation()
  const activeTab = TABS.find((tab) => tab.path === pathname)?.path ?? '/parametres'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="p-8">
        <h1 className="mb-6 text-2xl font-semibold">Paramètres</h1>

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
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
        {activeTab === '/parametres-classes' && (
          <div className="flex flex-col gap-10 xl:flex-row xl:items-start [&>div]:mt-0">
            <ClassesEtablissement />
            <div className="min-w-0 flex-1">
              <ClassesDetails />
            </div>
          </div>
        )}
        {activeTab === '/parametres-professeurs' && <Professeurs />}
        {activeTab === '/parametres-salles' && <Salles />}
        {activeTab === '/parametres-regroupements' && <Regroupements />}
        {activeTab === '/parametres-etablissement' && <EtablissementInfos />}
        {activeTab === '/parametres-plan' && <PlanEtablissement />}
        {activeTab === '/parametres-modele' && <ApprentissageModele />}
      </main>
    </div>
  )
}
