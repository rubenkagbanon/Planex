import type { Cycle } from '@/lib/cycle'
import type { Charge } from './charges'
import type { Slot } from './slots'

export interface Seance {
  professeurId: string
  niveau: string
  section: number
  matiere: string
  cycle: Cycle
  jour: string
  creneauId: string
}

export interface UnplacedCharge {
  professeurNom: string
  niveau: string
  section: number
  matiere: string
  manquantes: number
  requiredPeriods: number
}

const NUM_ATTEMPTS = 400

export function normalizeProfesseurNom(nom: string): string {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
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

// Regroupe les créneaux d'un cycle par jour, triés chronologiquement — nécessaire pour chercher des
// séquences de créneaux consécutifs (blocs) au sein d'une même journée.
function groupSlotsByJour(slots: Slot[]): Map<string, Slot[]> {
  const map = new Map<string, Slot[]>()
  for (const slot of slots) {
    const arr = map.get(slot.jour)
    if (arr) arr.push(slot)
    else map.set(slot.jour, [slot])
  }
  for (const arr of map.values()) arr.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))
  return map
}

// Ordre des positions de départ à essayer dans la journée. Par défaut, du matin vers le soir (ce qui
// tasse naturellement les séances en début de journée et laisse les heures creuses en fin de segment).
// Avec `preferBoundaries` (E.P.S., voir plus bas), les deux positions "aux bords" — début de matinée et
// fin d'après-midi — sont essayées en priorité.
function candidateStartPositions(dayLength: number, blockSize: number, preferBoundaries: boolean): number[] {
  const maxStart = dayLength - blockSize
  if (maxStart < 0) return []
  const all = Array.from({ length: maxStart + 1 }, (_, i) => i)
  if (!preferBoundaries) return all
  const boundaries = [...new Set([0, maxStart])]
  return [...boundaries, ...all.filter((start) => !boundaries.includes(start))]
}

// Cherche, dans les créneaux de cours déjà triés d'une journée, une séquence de `blockSize` créneaux
// libres et consécutifs. `dayCreneaux` ne contient que les créneaux de type "cours" (récréation et
// déjeuner déjà exclus par `buildSlots`), donc deux créneaux voisins dans ce tableau peuvent être séparés
// dans la réalité par une récréation ou la pause déjeuner (ex. 1h juste avant la récré + 1h juste après).
// `strictOnly` limite la recherche aux séquences réellement sans coupure (la fin de l'une = le début de
// la suivante) — la coupure récréation/déjeuner n'est autorisée qu'en dernier recours, voir `runAttempt`.
// Premier enchaînement valide trouvé selon l'ordre de `candidateStartPositions`, sans optimiser davantage.
function findConsecutiveRun(
  dayCreneaux: Slot[],
  blockSize: number,
  isFree: (slot: Slot) => boolean,
  preferBoundaries: boolean,
  strictOnly: boolean,
): Slot[] | null {
  for (const start of candidateStartPositions(dayCreneaux.length, blockSize, preferBoundaries)) {
    let ok = true
    for (let i = 0; i < blockSize; i++) {
      const slot = dayCreneaux[start + i]
      if (!isFree(slot)) {
        ok = false
        break
      }
      if (strictOnly && i > 0 && dayCreneaux[start + i - 1].heureFin !== slot.heureDebut) {
        ok = false
        break
      }
    }
    if (ok) return dayCreneaux.slice(start, start + blockSize)
  }
  return null
}

interface Attempt {
  seances: Seance[]
  unplaced: { charge: Charge; manquantes: number }[]
  epsBoundaryHits: number
}

function runAttempt(
  charges: Charge[],
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>,
  indisponibiliteKeys: Set<string>,
  seed: number,
): Attempt {
  const rand = mulberry32(seed)
  // La préférence "aux bords" pour l'E.P.S. peut, pour un professeur qui couvre beaucoup de classes,
  // entrer en compétition avec elle-même et rendre une charge injaçable. On ne l'active que dans une
  // partie des tentatives : `solve` choisit ensuite la meilleure combinaison (zéro séance manquante
  // d'abord, le plus de placements E.P.S. "au bord" ensuite) — jamais moins de séances placées pour
  // gagner en confort E.P.S.
  const epsPreferBoundariesThisAttempt = rand() < 0.6
  let epsBoundaryHits = 0

  // Un professeur ne peut être qu'à un seul endroit à la fois, y compris entre collège et lycée quand
  // ces deux cycles partagent les mêmes horaires — on identifie donc sa disponibilité par jour + plage
  // horaire réelle plutôt que par identifiant de créneau (propre à un cycle). On identifie aussi la
  // personne par son nom plutôt que par `professeurId` : une même personne peut avoir plusieurs lignes
  // `professeurs` (une par matière), et ces lignes ne doivent jamais se chevaucher entre elles non plus.
  const profKey = (professeurNom: string, jour: string, slot: Slot) =>
    `${normalizeProfesseurNom(professeurNom)}|${jour}|${slot.heureDebut}-${slot.heureFin}`
  const classeKey = (niveau: string, section: number, jour: string, creneauId: string) =>
    `${niveau}|${section}|${jour}|${creneauId}`
  const chargeDayKey = (charge: Charge, jour: string) => `${charge.niveau}|${charge.section}|${charge.matiere}|${jour}`
  const classeDayKey = (charge: Charge, jour: string) => `${charge.niveau}|${charge.section}|${jour}`

  // Les indisponibilités déclarées pour un professeur (voir Paramètres > Professeurs) sont une
  // contrainte dure, jamais violée : on les traite exactement comme une occupation déjà existante avant
  // même de commencer à placer des séances, avec les mêmes clés que `profKey` (nom + jour + heure réelle).
  const occupiedProf = new Set(indisponibiliteKeys)
  const occupiedClasse = new Set<string>()
  const dayLoadCharge = new Map<string, number>() // charge (niveau/section/matiere) × jour
  const dayLoadClasse = new Map<string, number>() // classe (niveau/section) × jour, toutes matières

  const seances: Seance[] = []
  const unplaced: { charge: Charge; manquantes: number }[] = []

  // Les charges qui demandent le plus de séances sont les plus difficiles à caser : on les place en
  // premier (heuristique "most-constrained-first"), en mélangeant l'ordre à chaque tentative pour
  // explorer différentes solutions.
  const orderedCharges = shuffle(charges, rand).sort((a, b) => b.requiredPeriods - a.requiredPeriods)

  // Cherche un créneau (ou une séquence consécutive) libre pour `blockSize` séances de cette charge, en
  // essayant tous les jours du moins chargé au plus chargé, dos-à-dos d'abord puis avec coupure
  // récréation/déjeuner autorisée en dernier recours. Recalcule l'ordre des jours à chaque appel (l'état
  // "jour le moins chargé" évolue au fil des placements, y compris pour les scissions de secours).
  function findPlacement(charge: Charge, blockSize: number, preferBoundaries: boolean): { run: Slot[]; jour: string } | null {
    const slotsByJour = slotsByJourByCycle[charge.cycle] ?? new Map<string, Slot[]>()
    const isFree = (slot: Slot) =>
      !occupiedProf.has(profKey(charge.professeurNom, slot.jour, slot)) &&
      !occupiedClasse.has(classeKey(charge.niveau, charge.section, slot.jour, slot.creneauId))
    const orderedJours = shuffle([...slotsByJour.keys()], rand).sort((a, b) => {
      const chargeDiff = (dayLoadCharge.get(chargeDayKey(charge, a)) ?? 0) - (dayLoadCharge.get(chargeDayKey(charge, b)) ?? 0)
      if (chargeDiff !== 0) return chargeDiff
      return (dayLoadClasse.get(classeDayKey(charge, a)) ?? 0) - (dayLoadClasse.get(classeDayKey(charge, b)) ?? 0)
    })
    for (const strictOnly of [true, false]) {
      for (const jour of orderedJours) {
        const run = findConsecutiveRun(slotsByJour.get(jour) ?? [], blockSize, isFree, preferBoundaries, strictOnly)
        if (run) return { run, jour }
      }
    }
    return null
  }

  function commitPlacement(charge: Charge, run: Slot[], jourPlace: string) {
    if (charge.matiere === 'E.P.S.') {
      const dayCreneaux = (slotsByJourByCycle[charge.cycle] ?? new Map<string, Slot[]>()).get(jourPlace) ?? []
      const startIdx = dayCreneaux.findIndex((s) => s.creneauId === run[0].creneauId)
      const maxStart = dayCreneaux.length - run.length
      if (startIdx === 0 || startIdx === maxStart) epsBoundaryHits++
    }
    for (const slot of run) {
      occupiedProf.add(profKey(charge.professeurNom, slot.jour, slot))
      occupiedClasse.add(classeKey(charge.niveau, charge.section, slot.jour, slot.creneauId))
      seances.push({
        professeurId: charge.professeurId,
        niveau: charge.niveau,
        section: charge.section,
        matiere: charge.matiere,
        cycle: charge.cycle,
        jour: slot.jour,
        creneauId: slot.creneauId,
      })
    }
    dayLoadCharge.set(chargeDayKey(charge, jourPlace), (dayLoadCharge.get(chargeDayKey(charge, jourPlace)) ?? 0) + run.length)
    dayLoadClasse.set(classeDayKey(charge, jourPlace), (dayLoadClasse.get(classeDayKey(charge, jourPlace)) ?? 0) + run.length)
  }

  for (const charge of orderedCharges) {
    let manquantes = 0

    // Les blocs les plus grands (donc les plus difficiles à caser d'un seul tenant) sont placés en
    // premier ; l'ordre est mélangé entre blocs de même taille pour varier les tentatives.
    const orderedBlocks = shuffle(charge.blocks, rand).sort((a, b) => b - a)

    // E.P.S. : priorité aux 2 premiers créneaux de la matinée ou aux 2 derniers de l'après-midi
    // (changement de tenue, moins de coupure avec le reste des cours).
    const preferBoundaries = charge.matiere === 'E.P.S.' && epsPreferBoundariesThisAttempt

    for (const blockSize of orderedBlocks) {
      const placement = findPlacement(charge, blockSize, preferBoundaries)

      if (placement) {
        commitPlacement(charge, placement.run, placement.jour)
        continue
      }

      // Bloc auto-inféré (valeur non décomposée valant 2, pas un "+" explicite) : en tout dernier
      // recours, si aucun créneau consécutif n'est libre nulle part, on scinde en séances isolées plutôt
      // que de laisser la classe sans cette matière — jamais pour un bloc explicitement décomposé.
      if (charge.autoConsecutiveSplittable && blockSize > 1) {
        let placedUnits = 0
        for (let i = 0; i < blockSize; i++) {
          const single = findPlacement(charge, 1, preferBoundaries)
          if (!single) break
          commitPlacement(charge, single.run, single.jour)
          placedUnits++
        }
        manquantes += blockSize - placedUnits
        continue
      }

      // Bloc jamais scindé : soit les `blockSize` créneaux consécutifs sont tous placés ensemble,
      // soit aucun ne l'est.
      manquantes += blockSize
    }

    if (manquantes > 0) unplaced.push({ charge, manquantes })
  }

  return { seances, unplaced, epsBoundaryHits }
}

export function solve(
  charges: Charge[],
  slotsByCycle: Record<Cycle, Slot[]>,
  indisponibiliteKeys: Set<string> = new Set(),
): { seances: Seance[]; unplaced: UnplacedCharge[] } {
  const slotsByJourByCycle = Object.fromEntries(
    Object.entries(slotsByCycle).map(([cycle, slots]) => [cycle, groupSlotsByJour(slots)]),
  ) as Record<Cycle, Map<string, Slot[]>>

  // Sélectionne la meilleure tentative : d'abord le moins de séances manquantes (jamais sacrifié), puis
  // le plus de séances E.P.S. placées "au bord" de la matinée/après-midi à égalité de séances manquantes.
  let best: Attempt | null = null
  let bestMissing = Infinity
  let bestEpsBoundaryHits = -1

  for (let seed = 1; seed <= NUM_ATTEMPTS; seed++) {
    const attempt = runAttempt(charges, slotsByJourByCycle, indisponibiliteKeys, seed)
    const missing = attempt.unplaced.reduce((sum, u) => sum + u.manquantes, 0)
    const better =
      missing < bestMissing || (missing === bestMissing && attempt.epsBoundaryHits > bestEpsBoundaryHits)
    if (better) {
      best = attempt
      bestMissing = missing
      bestEpsBoundaryHits = attempt.epsBoundaryHits
    }
  }

  const result = best ?? { seances: [], unplaced: [], epsBoundaryHits: 0 }
  return {
    seances: result.seances,
    unplaced: result.unplaced.map(({ charge, manquantes }) => ({
      professeurNom: charge.professeurNom,
      niveau: charge.niveau,
      section: charge.section,
      matiere: charge.matiere,
      manquantes,
      requiredPeriods: charge.requiredPeriods,
    })),
  }
}
