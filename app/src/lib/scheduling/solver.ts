import type { Cycle } from '@/lib/cycle'
import { REGLES_DEFAUT, type ReglesPedagogiques } from '@/lib/regles'
import type { Activite } from './activites'
import { seSuivent, type Slot } from './slots'
import { analyserEntorses, groupSlotsByJour, penaliteEntorses, type Entorse } from './entorses'

export interface Seance {
  professeurId: string
  niveau: string
  section: number
  matiere: string
  cycle: Cycle
  jour: string
  creneauId: string
  salleId: string | null
  // Identifie les lignes d'une même séance partagée (tandem / tronc commun) à un créneau donné ; null
  // pour une séance simple. `generate.ts` le convertit en identifiant unique pour la base.
  groupeKey: string | null
}

export interface UnplacedActivite {
  activite: Activite
  manquantes: number
}

export interface BlocScinde {
  activite: Activite
  taille: number
}

export interface SalleInput {
  id: string
  nom: string
  type: string
  capacite: number
}

// Séance déjà en place que le solveur ne doit pas toucher (verrouillée par le censeur).
export interface SeanceFixe extends Omit<Seance, 'groupeKey'> {
  professeurNom: string
  groupeKey: string | null
}

export interface SolveOptions {
  reglesByCycle?: Record<Cycle, ReglesPedagogiques>
  indisponibiliteKeys?: Set<string>
  salles?: SalleInput[]
  // Type de salle exigé par matière (ex. "S.V.T." → "laboratoire")
  typeSalleParMatiere?: Record<string, string>
  // Salle attitrée par classe ("niveau-section" → id de salle)
  salleAttitreeParClasse?: Record<string, string>
  seancesFixes?: SeanceFixe[]
  tentatives?: number
  // Budget de temps maximal (ms) : le solveur s'arrête plus tôt si les tentatives prennent trop de temps
  budgetMs?: number
}

const NUM_ATTEMPTS = 400

export function normalizeProfesseurNom(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
}

export function profTimeKey(professeurNom: string, jour: string, heureDebut: string, heureFin: string): string {
  return `${normalizeProfesseurNom(professeurNom)}|${jour}|${heureDebut}-${heureFin}`
}

// PRNG déterministe (mulberry32) — reproductible pour un seed donné, sans dépendance externe.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const classeCode = (niveau: string, section: number) => `${niveau}-${section}`

// Niveaux de relâchement, du plus exigeant au plus permissif :
// 0 — toutes les règles (souples comprises) et aucune séance coupée par une pause
// 1 — règles souples relâchées, toujours aucune coupure par une pause
// 2 — coupure par une pause autorisée (seulement si la règle le permet "exceptionnellement")
// 3 — dernier recours : la grille horaire de référence passe avant les règles pédagogiques. Un cours peut
//     être coupé par une pause, une matière
//     qui exige une salle spécialisée est placée sans salle si aucune n'est libre. Chaque écart est relevé
//     par l'analyse des entorses (rapport de génération).
// Les contraintes physiques (un professeur, une classe, une salle à la fois ; indisponibilités) ne sont
// jamais relâchées.
type Niveau = 0 | 1 | 2 | 3

interface Attempt {
  seances: Seance[]
  unplaced: UnplacedActivite[]
  scindes: BlocScinde[]
  entorses: Entorse[]
  penalite: number
}

interface Context {
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>
  reglesByCycle: Record<Cycle, ReglesPedagogiques>
  indisponibiliteKeys: Set<string>
  salles: SalleInput[]
  sallesParType: Map<string, SalleInput[]>
  typeSalleParMatiere: Record<string, string>
  salleAttitreeParClasse: Record<string, string>
  seancesFixes: SeanceFixe[]
}

function runAttempt(activites: Activite[], ctx: Context, seed: number): Attempt {
  const rand = mulberry32(seed)
  const { slotsByJourByCycle, reglesByCycle } = ctx

  const occupiedProf = new Set(ctx.indisponibiliteKeys)
  const occupiedClasse = new Set<string>()
  const salleUsage = new Map<string, number>()
  // Matières déjà placées par classe/jour/index de créneau — pour les règles d'enchaînement.
  const matieresParCase = new Map<string, Set<string>>()
  const dayLoadActivite = new Map<string, number>()
  const dayLoadClasse = new Map<string, number>()
  const classeSlotKey = (code: string, jour: string, creneauId: string) => `${code}|${jour}|${creneauId}`
  const salleKey = (salleId: string, slot: Slot) => `${salleId}|${slot.jour}|${slot.heureDebut}-${slot.heureFin}`
  const caseKey = (code: string, jour: string, index: number) => `${code}|${jour}|${index}`
  const indexOf = (cycle: Cycle, jour: string, creneauId: string) =>
    (slotsByJourByCycle[cycle]?.get(jour) ?? []).findIndex((s) => s.creneauId === creneauId)

  const seances: Seance[] = []

  // Les séances verrouillées occupent leurs créneaux avant tout placement.
  const salleGroupesVus = new Set<string>()
  for (const fixe of ctx.seancesFixes) {
    const slot = (slotsByJourByCycle[fixe.cycle]?.get(fixe.jour) ?? []).find((s) => s.creneauId === fixe.creneauId)
    const code = classeCode(fixe.niveau, fixe.section)
    occupiedClasse.add(classeSlotKey(code, fixe.jour, fixe.creneauId))
    if (slot) {
      occupiedProf.add(profTimeKey(fixe.professeurNom, fixe.jour, slot.heureDebut, slot.heureFin))
      if (fixe.salleId) {
        const usageId = `${fixe.salleId}|${fixe.groupeKey ?? `${code}|${fixe.professeurId}`}|${fixe.jour}|${fixe.creneauId}`
        if (!salleGroupesVus.has(usageId)) {
          salleGroupesVus.add(usageId)
          salleUsage.set(salleKey(fixe.salleId, slot), (salleUsage.get(salleKey(fixe.salleId, slot)) ?? 0) + 1)
        }
      }
      const index = indexOf(fixe.cycle, fixe.jour, fixe.creneauId)
      const matieres = matieresParCase.get(caseKey(code, fixe.jour, index)) ?? new Set<string>()
      matieres.add(fixe.matiere)
      matieresParCase.set(caseKey(code, fixe.jour, index), matieres)
    }
  }

  // Les activités les plus contraintes d'abord : regroupements (plusieurs professeurs ou classes à libérer
  // en même temps), puis les plus gros volumes.
  const difficulte = (a: Activite) => a.requiredPeriods * (a.groupes.length + a.classes.length) * 10 + Math.max(...a.blocks, 0)
  const ordered = shuffle(activites, rand).sort((a, b) => difficulte(b) - difficulte(a))

  // Choisit la salle de chaque groupe pour un enchaînement de créneaux. Renvoie null si une salle
  // obligatoire (type exigé) n'est pas libre — sauf en dernier recours, où la séance est placée sans salle.
  function choisirSalles(activite: Activite, run: Slot[], dernierRecours = false): (string | null)[] | null {
    const tentatives = new Map<string, number>()
    const usage = (salleId: string, slot: Slot) => (salleUsage.get(salleKey(salleId, slot)) ?? 0) + (tentatives.get(salleKey(salleId, slot)) ?? 0)
    const libre = (salle: SalleInput) => run.every((slot) => usage(salle.id, slot) < salle.capacite)

    const result: (string | null)[] = []
    for (let gi = 0; gi < activite.groupes.length; gi++) {
      const groupe = activite.groupes[gi]
      const typeExige = ctx.typeSalleParMatiere[groupe.matiere]
      const sallesDuType = typeExige ? ctx.sallesParType.get(typeExige) ?? [] : []
      const premiereClasse = activite.classes[0]
      const attitreeId = ctx.salleAttitreeParClasse[classeCode(premiereClasse.niveau, premiereClasse.section)]
      const attitree = attitreeId ? ctx.salles.find((s) => s.id === attitreeId) : undefined

      // Salle spécialisée exigée (laboratoire, informatique, terrain) : obligatoire. Sinon, la salle attitrée
      // de la classe est préférée, puis n'importe quelle salle de classe libre ; à défaut la séance est placée
      // sans salle (et signalée) — un établissement a souvent moins de salles que de classes, et plusieurs
      // classes partagent la même salle attitrée : en faire une contrainte dure rendrait l'emploi du temps
      // impossible là où la réalité s'en accommode.
      let candidates: SalleInput[]
      let obligatoire: boolean
      if (sallesDuType.length > 0) {
        candidates = sallesDuType
        obligatoire = true
      } else {
        const sallesDeClasse = ctx.sallesParType.get('classe') ?? []
        const preferee = attitree && (activite.type !== 'tandem' || gi === 0) ? [attitree] : []
        candidates = [...preferee, ...sallesDeClasse.filter((s) => s.id !== preferee[0]?.id)]
        obligatoire = false
        if (candidates.length === 0) {
          result.push(null)
          continue
        }
      }

      const choisie = candidates.find(libre)
      if (!choisie) {
        if (obligatoire && !dernierRecours) return null
        result.push(null)
        continue
      }
      for (const slot of run) tentatives.set(salleKey(choisie.id, slot), (tentatives.get(salleKey(choisie.id, slot)) ?? 0) + 1)
      result.push(choisie.id)
    }
    return result
  }

  function slotLibre(activite: Activite, slot: Slot): boolean {
    for (const groupe of activite.groupes) {
      if (occupiedProf.has(profTimeKey(groupe.professeurNom, slot.jour, slot.heureDebut, slot.heureFin))) return false
    }
    for (const classe of activite.classes) {
      if (occupiedClasse.has(classeSlotKey(classeCode(classe.niveau, classe.section), slot.jour, slot.creneauId))) return false
    }
    return true
  }

  // Règles souples vérifiées au niveau 0 uniquement : enchaînements e/f et une séance par jour (h).
  function respecteReglesSouples(activite: Activite, daySlots: Slot[], start: number, size: number): boolean {
    const regles = reglesByCycle[activite.cycle]
    const matieres = activite.groupes.map((g) => g.matiere)
    const jour = daySlots[start].jour
    for (const classe of activite.classes) {
      const code = classeCode(classe.niveau, classe.section)
      if (regles.uneSeanceParJour.actif) {
        for (let i = 0; i < daySlots.length; i++) {
          const present = matieresParCase.get(caseKey(code, jour, i))
          if (present && matieres.some((m) => present.has(m))) return false
        }
      }
      for (const config of [regles.pasEnchainerLangues, regles.pasEnchainerSciences]) {
        if (!config.actif) continue
        const groupe = new Set(config.matieres)
        if (!matieres.some((m) => groupe.has(m))) continue
        const voisins: number[] = []
        if (start > 0 && seSuivent(daySlots[start - 1], daySlots[start])) voisins.push(start - 1)
        const fin = start + size - 1
        if (fin + 1 < daySlots.length && seSuivent(daySlots[fin], daySlots[fin + 1])) voisins.push(fin + 1)
        for (const v of voisins) {
          const present = matieresParCase.get(caseKey(code, jour, v))
          if (present && [...present].some((p) => groupe.has(p) && !matieres.includes(p))) return false
        }
      }
    }
    return true
  }

  function findPlacement(activite: Activite, size: number, niveau: Niveau): { run: Slot[]; jour: string; salles: (string | null)[] } | null {
    const regles = reglesByCycle[activite.cycle]
    const slotsByJour = slotsByJourByCycle[activite.cycle] ?? new Map<string, Slot[]>()
    const classe0 = activite.classes[0]
    const loadKey = (jour: string) => `${activite.id}|${jour}`
    const classeLoadKey = (jour: string) => `${classe0.niveau}|${classe0.section}|${jour}`
    const jours = shuffle([...slotsByJour.keys()], rand).sort((a, b) => {
      const diff = (dayLoadActivite.get(loadKey(a)) ?? 0) - (dayLoadActivite.get(loadKey(b)) ?? 0)
      if (diff !== 0) return diff
      return (dayLoadClasse.get(classeLoadKey(a)) ?? 0) - (dayLoadClasse.get(classeLoadKey(b)) ?? 0)
    })

    const coupureInterdite = regles.eviterCoupurePause.actif && niveau < 3 && (niveau < 2 || !regles.eviterCoupurePause.autoriserException)

    // Premier placement valide : jour le moins chargé d'abord, puis du matin vers le soir.
    for (const jour of jours) {
      const daySlots = slotsByJour.get(jour) ?? []
      for (let start = 0; start + size <= daySlots.length; start++) {
        const run = daySlots.slice(start, start + size)
        if (!run.every((slot) => slotLibre(activite, slot))) continue
        if (coupureInterdite && run.some((slot, i) => i > 0 && !seSuivent(run[i - 1], slot))) continue
        if (niveau === 0 && !respecteReglesSouples(activite, daySlots, start, size)) continue
        const salles = choisirSalles(activite, run, niveau === 3)
        if (salles) return { run, jour, salles }
      }
    }
    return null
  }

  function commit(activite: Activite, run: Slot[], jour: string, salles: (string | null)[]) {
    const partagee = activite.groupes.length * activite.classes.length > 1
    for (const slot of run) {
      const index = indexOf(activite.cycle, jour, slot.creneauId)
      const groupeKey = partagee ? `${activite.id}|${slot.jour}|${slot.creneauId}` : null
      for (const groupe of activite.groupes) {
        occupiedProf.add(profTimeKey(groupe.professeurNom, slot.jour, slot.heureDebut, slot.heureFin))
      }
      salles.forEach((salleId) => {
        if (salleId) salleUsage.set(salleKey(salleId, slot), (salleUsage.get(salleKey(salleId, slot)) ?? 0) + 1)
      })
      for (const classe of activite.classes) {
        const code = classeCode(classe.niveau, classe.section)
        occupiedClasse.add(classeSlotKey(code, slot.jour, slot.creneauId))
        const matieres = matieresParCase.get(caseKey(code, jour, index)) ?? new Set<string>()
        activite.groupes.forEach((groupe, gi) => {
          matieres.add(groupe.matiere)
          seances.push({
            professeurId: groupe.professeurId,
            niveau: classe.niveau,
            section: classe.section,
            matiere: groupe.matiere,
            cycle: activite.cycle,
            jour: slot.jour,
            creneauId: slot.creneauId,
            salleId: salles[gi] ?? null,
            groupeKey,
          })
        })
        matieresParCase.set(caseKey(code, jour, index), matieres)
        const classeLoadKey = `${classe.niveau}|${classe.section}|${jour}`
        dayLoadClasse.set(classeLoadKey, (dayLoadClasse.get(classeLoadKey) ?? 0) + 1)
      }
    }
    const loadKey = `${activite.id}|${jour}`
    dayLoadActivite.set(loadKey, (dayLoadActivite.get(loadKey) ?? 0) + run.length)
  }

  function placer(activite: Activite, size: number): boolean {
    for (const niveau of [0, 1, 2, 3] as Niveau[]) {
      const placement = findPlacement(activite, size, niveau)
      if (placement) {
        commit(activite, placement.run, placement.jour, placement.salles)
        return true
      }
    }
    return false
  }

  const unplaced: UnplacedActivite[] = []
  const scindes: BlocScinde[] = []
  for (const activite of ordered) {
    let manquantes = 0
    const blocks = shuffle(activite.blocks, rand).sort((a, b) => b - a)
    for (const size of blocks) {
      if (placer(activite, size)) continue
      // Bloc de plusieurs heures sans créneaux consécutifs libres nulle part : la grille horaire passe avant
      // la forme, il est scindé en séances isolées plutôt que de perdre des heures (signalé au rapport).
      if (size > 1) {
        let placees = 0
        for (let i = 0; i < size; i++) {
          if (!placer(activite, 1)) break
          placees++
        }
        if (placees > 0) scindes.push({ activite, taille: size })
        manquantes += size - placees
        continue
      }
      manquantes += size
    }
    if (manquantes > 0) unplaced.push({ activite, manquantes })
  }

  const toutes = [
    ...ctx.seancesFixes.map((f) => ({ niveau: f.niveau, section: f.section, matiere: f.matiere, cycle: f.cycle, jour: f.jour, creneauId: f.creneauId })),
    ...seances,
  ]
  const entorses = analyserEntorses(toutes, slotsByJourByCycle, reglesByCycle)
  return { seances, unplaced, scindes, entorses, penalite: penaliteEntorses(entorses) + scindes.length * 8 }
}

export function solve(
  activites: Activite[],
  slotsByCycle: Record<Cycle, Slot[]>,
  options: SolveOptions = {},
): { seances: Seance[]; unplaced: UnplacedActivite[]; scindes: BlocScinde[]; entorses: Entorse[]; tentatives: number } {
  const slotsByJourByCycle = Object.fromEntries(
    Object.entries(slotsByCycle).map(([cycle, slots]) => [cycle, groupSlotsByJour(slots)]),
  ) as Record<Cycle, Map<string, Slot[]>>

  const salles = options.salles ?? []
  const sallesParType = new Map<string, SalleInput[]>()
  for (const salle of [...salles].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))) {
    sallesParType.set(salle.type, [...(sallesParType.get(salle.type) ?? []), salle])
  }

  const ctx: Context = {
    slotsByJourByCycle,
    reglesByCycle: options.reglesByCycle ?? { college: REGLES_DEFAUT, lycee: REGLES_DEFAUT },
    indisponibiliteKeys: options.indisponibiliteKeys ?? new Set(),
    salles,
    sallesParType,
    typeSalleParMatiere: options.typeSalleParMatiere ?? {},
    salleAttitreeParClasse: options.salleAttitreeParClasse ?? {},
    seancesFixes: options.seancesFixes ?? [],
  }

  // Meilleure tentative : d'abord le moins de séances manquantes (jamais sacrifié), puis la plus petite
  // pénalité d'entorses aux règles pédagogiques.
  const maxTentatives = options.tentatives ?? NUM_ATTEMPTS
  const budget = options.budgetMs ?? Infinity
  const debut = Date.now()
  let best: Attempt | null = null
  let bestMissing = Infinity
  let tentatives = 0

  for (let seed = 1; seed <= maxTentatives; seed++) {
    const attempt = runAttempt(activites, ctx, seed)
    tentatives++
    const missing = attempt.unplaced.reduce((sum, u) => sum + u.manquantes, 0)
    if (missing < bestMissing || (missing === bestMissing && attempt.penalite < (best?.penalite ?? Infinity))) {
      best = attempt
      bestMissing = missing
    }
    if (Date.now() - debut > budget) break
  }

  const result = best ?? { seances: [], unplaced: [], scindes: [], entorses: [], penalite: 0 }
  return { seances: result.seances, unplaced: result.unplaced, scindes: result.scindes, entorses: result.entorses, tentatives }
}
