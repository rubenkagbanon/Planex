import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useEtablissement } from '@/hooks/useEtablissement'
import { AppHeader } from '@/components/AppHeader'
import { anneeScolaire } from '@/lib/anneeScolaire'
import { cn } from '@/lib/utils'

interface Etape {
  titre: string
  description: string
  lien: string
  action: string
  fait: boolean
  facultatif?: boolean
}

// Parcours guidé du censeur : paramétrer → générer → retoucher → contrôler → diffuser.
export function Accueil() {
  const { user } = useAuth()
  const { etablissementId, etablissement } = useEtablissement()
  const firstName = user?.user_metadata?.first_name as string | undefined

  const { data: etat } = useQuery({
    queryKey: ['accueil_etat', etablissementId],
    queryFn: async () => {
      const id = etablissementId!
      const compte = async (table: 'horaires_reference' | 'creneaux_horaires' | 'classes_etablissement' | 'professeurs' | 'salles' | 'regroupements' | 'emploi_du_temps' | 'generations') => {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('etablissement_id', id)
        if (error) throw error
        return count ?? 0
      }
      const [horaires, creneaux, classes, professeurs, salles, regroupements, seances, generations, verrouillees] = await Promise.all([
        compte('horaires_reference'),
        compte('creneaux_horaires'),
        compte('classes_etablissement'),
        compte('professeurs'),
        compte('salles'),
        compte('regroupements'),
        compte('emploi_du_temps'),
        compte('generations'),
        supabase
          .from('emploi_du_temps')
          .select('id', { count: 'exact', head: true })
          .eq('etablissement_id', id)
          .eq('verrouille', true)
          .then((r) => r.count ?? 0),
      ])
      return { horaires, creneaux, classes, professeurs, salles, regroupements, seances, generations, verrouillees }
    },
    enabled: !!etablissementId,
  })

  const enTeteComplet = !!(etablissement?.drena && etablissement?.signataire_nom)

  const etapes: Etape[] = [
    {
      titre: "En-tête de l'établissement",
      description: 'Ministère, DRENA, code, statut, signataire : imprimés en tête de chaque emploi du temps.',
      lien: '/parametres-etablissement',
      action: 'Compléter',
      fait: enTeteComplet,
    },
    {
      titre: 'Horaires officiels et grille de la journée',
      description: 'Volumes horaires par discipline et par niveau, créneaux, jours de cours et règles pédagogiques.',
      lien: '/parametres-contraintes',
      action: 'Paramétrer',
      fait: (etat?.horaires ?? 0) > 0 && (etat?.creneaux ?? 0) > 0,
    },
    {
      titre: 'Classes',
      description: 'Niveaux, nombre de classes, professeur principal et salle attitrée.',
      lien: '/parametres-classes',
      action: 'Renseigner',
      fait: (etat?.classes ?? 0) > 0,
    },
    {
      titre: 'Professeurs',
      description: 'Une fiche par matière, avec les classes — saisie directe ou import depuis Excel.',
      lien: '/parametres-professeurs',
      action: 'Renseigner',
      fait: (etat?.professeurs ?? 0) > 0,
    },
    {
      titre: 'Salles et regroupements',
      description: 'Salles, laboratoires, terrain ; troncs communs et tandems. Facultatif : sans salles, la génération fonctionne quand même.',
      lien: '/parametres-salles',
      action: 'Ajouter',
      fait: (etat?.salles ?? 0) > 0 || (etat?.regroupements ?? 0) > 0,
      facultatif: true,
    },
    {
      titre: "Générer l'emploi du temps",
      description: 'Placement automatique sans conflit, avec rapport détaillé des points à arbitrer.',
      lien: '/dashboard',
      action: 'Générer',
      fait: (etat?.generations ?? 0) > 0 && (etat?.seances ?? 0) > 0,
    },
    {
      titre: 'Retoucher à la main',
      description: 'Glisser-déposer sur le planning : chaque déplacement est contrôlé puis verrouillé.',
      lien: '/planning',
      action: 'Ouvrir le planning',
      fait: (etat?.verrouillees ?? 0) > 0,
      facultatif: true,
    },
    {
      titre: 'Contrôler',
      description: "Vue d'ensemble : toutes les classes, occupation des salles, règles pédagogiques, services des professeurs.",
      lien: '/vue-ensemble',
      action: 'Contrôler',
      fait: false,
      facultatif: true,
    },
    {
      titre: 'Imprimer et diffuser',
      description: 'Emplois du temps par classe, par professeur ou par salle — PDF (impression) ou Excel.',
      lien: '/impression',
      action: 'Imprimer',
      fait: false,
    },
  ]

  const prochaine = etapes.find((e) => !e.fait && !e.facultatif)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="font-serif text-3xl font-semibold">Bienvenue{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-1 text-muted-foreground">
          {etablissement?.name ?? user?.email} · Année scolaire {anneeScolaire(etablissement?.annee_scolaire)}
        </p>

        <ol className="mt-8 flex flex-col gap-3">
          {etapes.map((etape, i) => (
            <li
              key={etape.titre}
              className={cn(
                'flex items-start gap-4 rounded-xl border bg-card p-4',
                etape === prochaine ? 'border-primary shadow-sm' : 'border-border',
              )}
            >
              {etape.fait ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2F6F52]" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50" />
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {i + 1}. {etape.titre}
                  {etape.facultatif && <span className="ml-2 text-xs font-normal text-muted-foreground">(facultatif)</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{etape.description}</div>
              </div>
              <Link
                to={etape.lien}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  etape === prochaine ? 'bg-primary text-primary-foreground' : 'border border-border text-primary hover:border-primary',
                )}
              >
                {etape.action}
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}
