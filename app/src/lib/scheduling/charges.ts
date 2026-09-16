import { NIVEAUX_ETABLISSEMENT, minutesForNiveauEtablissement, blocksForNiveauEtablissement } from '@/lib/horairesReference'
import type { HorairesGrid } from '@/hooks/useHorairesGrid'
import { expandNiveauCodes } from '@/lib/classeCode'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'

// Convertit un volume horaire de la circulaire (en minutes) en nombre de séances.
// - `creneauEgaleHeure` (réglage par défaut) : "N heures de cours" désigne directement N séances (une
//   demi-heure "Nh30" arrondit à la séance supérieure) — indépendant de la durée réelle des créneaux.
// - Sinon : les minutes sont divisées par la durée réelle d'une séance du cycle (`periodMinutes`, ex.
//   50 min) et arrondies au plus proche — calcul avec les vraies données d'heures.
function minutesToPeriods(minutes: number, creneauEgaleHeure: boolean, periodMinutes: number): number {
  if (creneauEgaleHeure) return Math.max(1, Math.ceil(minutes / 60))
  return Math.max(1, Math.round(minutes / periodMinutes))
}

export interface ProfesseurInput {
  id: string
  nomComplet: string
  matiere: string
  niveaux: string[]
}

export interface ClasseEtablissementInput {
  niveau: string
  nombreClasses: number
}

export interface Charge {
  professeurId: string
  professeurNom: string
  niveau: string
  section: number
  matiere: string
  cycle: Cycle
  // Séances à placer, regroupées par bloc de séances consécutives (ex. [1, 2] = une séance isolée +
  // un double cours). Un total non décomposé donne des blocs de taille 1 (répartition libre), sauf s'il
  // vaut exactement 2 : dans ce cas un seul bloc [2] (toujours un double cours consécutif).
  blocks: number[]
  requiredPeriods: number
  // Un bloc [2] auto-inféré (valeur non décomposée) peut, en tout dernier recours, être scindé en deux
  // séances isolées si aucun créneau consécutif n'est libre nulle part — jamais pour un bloc explicitement
  // décomposé avec "+" (celui-là reste strict, voir solver.ts).
  autoConsecutiveSplittable: boolean
}

export interface BuildChargesInput {
  professeurs: ProfesseurInput[]
  classesEtablissement: ClasseEtablissementInput[]
  horairesGrid: HorairesGrid
  creneauEgaleHeureByCycle: Record<Cycle, boolean>
  periodMinutesByCycle: Record<Cycle, number>
}

function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

// Dérive les charges d'enseignement (qui enseigne quelle matière, à quelle classe, combien de séances
// par semaine) à partir des professeurs, des classes de l'établissement et de la grille horaires de
// référence. Chaque ligne `professeurs` porte déjà une matière explicite et ses propres classes — une
// même personne peut apparaître sur plusieurs lignes (une par matière), ce que `professeurNom` permet de
// reconnaître en aval (le solveur ne doit jamais doubler la même personne, même sur deux lignes
// différentes).
export function buildCharges(input: BuildChargesInput): { charges: Charge[]; warnings: string[] } {
  const { professeurs, classesEtablissement, horairesGrid, creneauEgaleHeureByCycle, periodMinutesByCycle } = input
  const nombreClassesParNiveau = Object.fromEntries(
    classesEtablissement.map((c) => [c.niveau, c.nombreClasses]),
  )

  const charges: Charge[] = []
  const warnings: string[] = []

  for (const professeur of professeurs) {
    const classes = expandNiveauCodes(professeur.niveaux, nombreClassesParNiveau)
    const niveaux = [...new Set(classes.map((c) => c.niveau))]

    for (const niveau of niveaux) {
      const sections = classes.filter((c) => c.niveau === niveau).map((c) => c.section)
      const minutes = minutesForNiveauEtablissement(horairesGrid, professeur.matiere, niveau)

      if (minutes <= 0) {
        warnings.push(
          `${professeur.nomComplet} — ${niveauLabel(niveau)} : aucun volume horaire trouvé pour ${professeur.matiere}, niveau ignoré pour la génération.`,
        )
        continue
      }

      const cycle = cycleForNiveau(niveau)
      const decomposedBlocks = blocksForNiveauEtablissement(horairesGrid, professeur.matiere, niveau)
      const periods = minutesToPeriods(minutes, creneauEgaleHeureByCycle[cycle] ?? true, periodMinutesByCycle[cycle] || 60)
      // Une valeur non décomposée de 2 séances est toujours un double cours consécutif (un seul bloc de
      // 2), pas deux séances isolées sur des jours différents — au-delà de 2, la répartition reste libre.
      const blocks = decomposedBlocks ?? (periods === 2 ? [2] : Array(periods).fill(1))
      const requiredPeriods = blocks.reduce((sum: number, b: number) => sum + b, 0)
      const autoConsecutiveSplittable = decomposedBlocks === null && periods === 2

      for (const section of sections) {
        charges.push({
          professeurId: professeur.id,
          professeurNom: professeur.nomComplet,
          niveau,
          section,
          matiere: professeur.matiere,
          cycle,
          blocks: [...blocks],
          requiredPeriods,
          autoConsecutiveSplittable,
        })
      }
    }
  }

  return { charges, warnings }
}
