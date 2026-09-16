import type { HorairesGrid } from '@/hooks/useHorairesGrid'
import type { Cycle } from '@/lib/cycle'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { buildCharges, type ClasseEtablissementInput, type ProfesseurInput } from './charges'
import { buildSlots, computePeriodMinutes, type CreneauRow, type Slot } from './slots'
import { normalizeProfesseurNom, solve, type Seance } from './solver'

export interface ContrainteInput {
  cycle: Cycle
  joursCours: string[]
  mercrediApresMidiBanalise: boolean
  creneauEgaleHeure: boolean
}

export interface IndisponibiliteInput {
  nomComplet: string
  cycle: Cycle
  jour: string
  creneauId: string
}

export interface GenerateInput {
  professeurs: ProfesseurInput[]
  classesEtablissement: ClasseEtablissementInput[]
  horairesGrid: HorairesGrid
  creneaux: CreneauRow[]
  contraintes: ContrainteInput[]
  indisponibilites?: IndisponibiliteInput[]
}

export interface GenerateResult {
  seances: Seance[]
  warnings: string[]
  totalCharges: number
  totalPlacees: number
}

const CYCLES: Cycle[] = ['college', 'lycee']

function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

export function generateEmploiDuTemps(input: GenerateInput): GenerateResult {
  const { professeurs, classesEtablissement, horairesGrid, creneaux, contraintes, indisponibilites = [] } = input

  const slotsByCycle = Object.fromEntries(
    CYCLES.map((cycle): [Cycle, Slot[]] => {
      const contrainte = contraintes.find((c) => c.cycle === cycle)
      if (!contrainte) return [cycle, []]
      return [cycle, buildSlots(creneaux, cycle, contrainte.joursCours, contrainte.mercrediApresMidiBanalise)]
    }),
  ) as Record<Cycle, Slot[]>

  const creneauEgaleHeureByCycle = Object.fromEntries(
    CYCLES.map((cycle) => [cycle, contraintes.find((c) => c.cycle === cycle)?.creneauEgaleHeure ?? true]),
  ) as Record<Cycle, boolean>

  const periodMinutesByCycle = Object.fromEntries(
    CYCLES.map((cycle) => [cycle, computePeriodMinutes(creneaux, cycle)]),
  ) as Record<Cycle, number>

  const { charges, warnings: chargeWarnings } = buildCharges({
    professeurs,
    classesEtablissement,
    horairesGrid,
    creneauEgaleHeureByCycle,
    periodMinutesByCycle,
  })

  const chargesAvecCreneaux = charges.filter((c) => (slotsByCycle[c.cycle] ?? []).length > 0)
  const chargesSansCreneaux = charges.filter((c) => (slotsByCycle[c.cycle] ?? []).length === 0)

  const noCreneauxWarnings = [
    ...new Set(chargesSansCreneaux.map((c) => c.cycle)),
  ].map((cycle) => `Aucun créneau de cours configuré pour le cycle "${cycle}" — les classes de ce cycle n'ont pas pu être placées.`)

  // Résout chaque indisponibilité déclarée (nom + cycle + jour + créneau) en la même clé que le solveur
  // utilise pour la disponibilité d'un professeur (nom + jour + heure réelle) — cohérent avec le fait
  // qu'une personne peut avoir plusieurs fiches (une par matière) mais une seule vraie disponibilité.
  const creneauById = new Map(creneaux.map((c) => [c.id, c]))
  const indisponibiliteKeys = new Set(
    indisponibilites.flatMap((indispo) => {
      const creneau = creneauById.get(indispo.creneauId)
      if (!creneau) return []
      return [`${normalizeProfesseurNom(indispo.nomComplet)}|${indispo.jour}|${creneau.heure_debut}-${creneau.heure_fin}`]
    }),
  )

  const { seances, unplaced } = solve(chargesAvecCreneaux, slotsByCycle, indisponibiliteKeys)

  const unplacedWarnings = unplaced.map(
    (u) =>
      `${u.professeurNom} — ${niveauLabel(u.niveau)} ${u.section} (${u.matiere}) : ${u.requiredPeriods - u.manquantes}/${u.requiredPeriods} séances placées.`,
  )

  const totalCharges = charges.reduce((sum, c) => sum + c.requiredPeriods, 0)

  return {
    seances,
    warnings: [...chargeWarnings, ...noCreneauxWarnings, ...unplacedWarnings],
    totalCharges,
    totalPlacees: seances.length,
  }
}
