import type { HorairesGrid } from '@/hooks/useHorairesGrid'
import type { Cycle } from '@/lib/cycle'
import { REGLES_DEFAUT, type ReglesPedagogiques } from '@/lib/regles'
import { buildCharges, type ClasseEtablissementInput, type ProfesseurInput } from './charges'
import { activiteLabel, buildActivites, soustraireSeances, type RegroupementInput } from './activites'
import { buildSlots, computePeriodMinutes, type CreneauRow, type Slot } from './slots'
import { normalizeProfesseurNom, solve, type SalleInput, type Seance, type SeanceFixe } from './solver'
import type { Entorse } from './entorses'

export interface ContrainteInput {
  cycle: Cycle
  joursCours: string[]
  mercrediApresMidiBanalise: boolean
  creneauEgaleHeure: boolean
  regles?: ReglesPedagogiques
}

export interface IndisponibiliteInput {
  nomComplet: string
  cycle: Cycle
  jour: string
  creneauId: string
}

// Séance verrouillée existante (ligne `emploi_du_temps` avec `verrouille = true`)
export interface SeanceVerrouilleeInput {
  professeurId: string
  niveau: string
  section: number
  matiere: string
  cycle: Cycle
  jour: string
  creneauId: string
  salleId: string | null
  groupeSeance: string | null
}

export interface GenerateInput {
  professeurs: ProfesseurInput[]
  classesEtablissement: ClasseEtablissementInput[]
  horairesGrid: HorairesGrid
  creneaux: CreneauRow[]
  contraintes: ContrainteInput[]
  indisponibilites?: IndisponibiliteInput[]
  salles?: SalleInput[]
  typeSalleParMatiere?: Record<string, string>
  salleAttitreeParClasse?: Record<string, string>
  regroupements?: RegroupementInput[]
  seancesVerrouillees?: SeanceVerrouilleeInput[]
  tentatives?: number
  budgetMs?: number
}

export interface SeanceGeneree extends Omit<Seance, 'groupeKey'> {
  groupeSeance: string | null
}

export interface GenerateResult {
  seances: SeanceGeneree[]
  warnings: string[]
  entorses: Entorse[]
  totalCharges: number
  totalPlacees: number
  nbVerrouillees: number
}

const CYCLES: Cycle[] = ['college', 'lycee']

function nouvelId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

export function generateEmploiDuTemps(input: GenerateInput): GenerateResult {
  const {
    professeurs,
    classesEtablissement,
    horairesGrid,
    creneaux,
    contraintes,
    indisponibilites = [],
    salles = [],
    typeSalleParMatiere = {},
    salleAttitreeParClasse = {},
    regroupements = [],
    seancesVerrouillees = [],
  } = input

  const reglesByCycle = Object.fromEntries(
    CYCLES.map((cycle) => [cycle, contraintes.find((c) => c.cycle === cycle)?.regles ?? REGLES_DEFAUT]),
  ) as Record<Cycle, ReglesPedagogiques>

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

  const { activites: toutesActivites, warnings: activiteWarnings } = buildActivites({ charges, regroupements, reglesByCycle })

  const avecCreneaux = toutesActivites.filter((a) => (slotsByCycle[a.cycle] ?? []).length > 0)
  const sansCreneaux = toutesActivites.filter((a) => (slotsByCycle[a.cycle] ?? []).length === 0)
  const noCreneauxWarnings = [...new Set(sansCreneaux.map((a) => a.cycle))].map(
    (cycle) => `Aucun créneau de cours configuré pour le cycle "${cycle}" — les classes de ce cycle n'ont pas pu être placées.`,
  )

  // Les séances verrouillées "consomment" une partie du besoin de l'activité qui leur correspond.
  const totalCharges = toutesActivites.reduce((sum, a) => sum + a.requiredPeriods, 0)
  const creneauxVerrouillesParActivite = new Map<string, Set<string>>()
  for (const activite of avecCreneaux) {
    const professeurIds = new Set(activite.groupes.map((g) => g.professeurId))
    const matieres = new Set(activite.groupes.map((g) => g.matiere))
    const classes = new Set(activite.classes.map((c) => `${c.niveau}-${c.section}`))
    const creneauxPris = new Set<string>()
    for (const v of seancesVerrouillees) {
      if (professeurIds.has(v.professeurId) && matieres.has(v.matiere) && classes.has(`${v.niveau}-${v.section}`)) {
        creneauxPris.add(`${v.jour}|${v.creneauId}`)
      }
    }
    creneauxVerrouillesParActivite.set(activite.id, creneauxPris)
  }
  const activites = avecCreneaux
    .map((a) => {
      const dejaPlacees = creneauxVerrouillesParActivite.get(a.id)?.size ?? 0
      if (dejaPlacees === 0) return a
      const blocks = soustraireSeances(a.blocks, dejaPlacees)
      return { ...a, blocks, requiredPeriods: blocks.reduce((s, b) => s + b, 0), autoConsecutiveSplittable: false }
    })
    .filter((a) => a.requiredPeriods > 0)
  const nbVerrouilleesConsommees = [...creneauxVerrouillesParActivite.values()].reduce((s, set) => s + set.size, 0)

  const creneauById = new Map(creneaux.map((c) => [c.id, c]))
  const indisponibiliteKeys = new Set(
    indisponibilites.flatMap((indispo) => {
      const creneau = creneauById.get(indispo.creneauId)
      if (!creneau) return []
      return [`${normalizeProfesseurNom(indispo.nomComplet)}|${indispo.jour}|${creneau.heure_debut}-${creneau.heure_fin}`]
    }),
  )

  const nomParProfesseurId = new Map(professeurs.map((p) => [p.id, p.nomComplet]))
  const seancesFixes: SeanceFixe[] = seancesVerrouillees
    .filter((v) => nomParProfesseurId.has(v.professeurId))
    .map((v) => ({ ...v, professeurNom: nomParProfesseurId.get(v.professeurId)!, groupeKey: v.groupeSeance }))

  const { seances, unplaced, scindes, entorses } = solve(activites, slotsByCycle, {
    reglesByCycle,
    indisponibiliteKeys,
    salles,
    typeSalleParMatiere,
    salleAttitreeParClasse,
    seancesFixes,
    tentatives: input.tentatives,
    budgetMs: input.budgetMs,
  })

  const salleTypes = new Set(salles.map((s) => s.type))
  const typesManquants = [...new Set(Object.values(typeSalleParMatiere))].filter((t) => !salleTypes.has(t))
  const salleWarnings = salles.length > 0 && typesManquants.length > 0
    ? [`Aucune salle de type ${typesManquants.join(', ')} : les matières qui en exigent une ont été placées sans salle.`]
    : []

  const scindesWarnings = scindes.map(
    (s) => `${activiteLabel(s.activite)} : un bloc de ${s.taille}h a été scindé en séances isolées, faute de ${s.taille} créneaux consécutifs libres.`,
  )

  // Matières qui exigent une salle spécialisée (laboratoire, informatique, terrain) placées sans salle en
  // dernier recours, parce qu'aucune n'était libre
  const sansSalleSpecialisee = new Map<string, number>()
  for (const s of seances) {
    const type = typeSalleParMatiere[s.matiere]
    if (type && salles.some((x) => x.type === type) && !s.salleId) {
      const cle = `${s.matiere} — ${s.niveau} ${s.section}`
      sansSalleSpecialisee.set(cle, (sansSalleSpecialisee.get(cle) ?? 0) + 1)
    }
  }
  const sansSalleWarnings = [...sansSalleSpecialisee].map(
    ([cle, nb]) => `${cle} : ${nb} séance(s) sans salle spécialisée (aucune libre à ce moment) — placées quand même pour respecter la grille horaire.`,
  )

  const unplacedWarnings = unplaced.map(
    (u) => `${activiteLabel(u.activite)} : ${u.activite.requiredPeriods - u.manquantes}/${u.activite.requiredPeriods} séances placées.`,
  )

  // Les lignes d'une même séance partagée reçoivent un identifiant commun (colonne `groupe_seance`).
  const groupeIds = new Map<string, string>()
  const seancesGenerees: SeanceGeneree[] = seances.map(({ groupeKey, ...s }) => {
    let groupeSeance: string | null = null
    if (groupeKey) {
      groupeSeance = groupeIds.get(groupeKey) ?? nouvelId()
      groupeIds.set(groupeKey, groupeSeance)
    }
    return { ...s, groupeSeance }
  })

  const manquantes = unplaced.reduce((sum, u) => sum + u.manquantes, 0)
  const nonPlaceesFauteDeCreneaux = sansCreneaux.reduce((sum, a) => sum + a.requiredPeriods, 0)

  return {
    seances: seancesGenerees,
    warnings: [...chargeWarnings, ...activiteWarnings, ...noCreneauxWarnings, ...salleWarnings, ...unplacedWarnings, ...scindesWarnings, ...sansSalleWarnings],
    entorses,
    totalCharges,
    totalPlacees: totalCharges - manquantes - nonPlaceesFauteDeCreneaux,
    nbVerrouillees: nbVerrouilleesConsommees,
  }
}
