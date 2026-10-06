import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import type { Cycle } from '@/lib/cycle'
import type { ReglesPedagogiques } from '@/lib/regles'
import { seSuivent, type Slot } from './slots'

// Une entorse est un écart à une règle pédagogique "souple" (ou un contrôle non satisfait) dans un
// emploi du temps. Elles servent à la fois à départager les tentatives du solveur (pénalité pondérée) et
// à documenter le rapport de génération / la vue d'ensemble.
export interface Entorse {
  regle: keyof ReglesPedagogiques
  classe: string
  jour: string
  detail: string
}

export interface SeancePourAnalyse {
  niveau: string
  section: number
  matiere: string
  cycle: Cycle
  jour: string
  creneauId: string
}

const POIDS: Record<keyof ReglesPedagogiques, number> = {
  pasEnchainerLangues: 4,
  pasEnchainerSciences: 4,
  eviterCoupurePause: 6,
  uneSeanceParJour: 5,
  minDisciplinesParJour: 3,
  tandemsAutomatiques: 0,
}

function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

function jourLabel(jour: string): string {
  return JOURS_SEMAINE.find((j) => j.key === jour)?.label ?? jour
}

function heure(hhmmss: string): string {
  return hhmmss.slice(0, 5)
}

export function groupSlotsByJour(slots: Slot[]): Map<string, Slot[]> {
  const map = new Map<string, Slot[]>()
  for (const slot of slots) {
    const arr = map.get(slot.jour)
    if (arr) arr.push(slot)
    else map.set(slot.jour, [slot])
  }
  for (const arr of map.values()) arr.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))
  return map
}

export function analyserEntorses(
  seances: SeancePourAnalyse[],
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>,
  reglesByCycle: Record<Cycle, ReglesPedagogiques>,
): Entorse[] {
  // Par classe et par jour : matières présentes à chaque index de créneau de la journée (plusieurs
  // matières possibles au même créneau en cas de tandem).
  const parClasseJour = new Map<string, { niveau: string; section: number; cycle: Cycle; jour: string; cases: Map<number, Set<string>> }>()
  for (const s of seances) {
    const daySlots = slotsByJourByCycle[s.cycle]?.get(s.jour)
    if (!daySlots) continue
    const index = daySlots.findIndex((slot) => slot.creneauId === s.creneauId)
    if (index < 0) continue
    const key = `${s.niveau}|${s.section}|${s.jour}`
    const entry = parClasseJour.get(key) ?? { niveau: s.niveau, section: s.section, cycle: s.cycle, jour: s.jour, cases: new Map() }
    const matieres = entry.cases.get(index) ?? new Set<string>()
    matieres.add(s.matiere)
    entry.cases.set(index, matieres)
    parClasseJour.set(key, entry)
  }

  const entorses: Entorse[] = []

  for (const { niveau, section, cycle, jour, cases } of parClasseJour.values()) {
    const regles = reglesByCycle[cycle]
    const daySlots = slotsByJourByCycle[cycle].get(jour) ?? []
    const classe = `${niveauLabel(niveau)} ${section}`
    const push = (regle: keyof ReglesPedagogiques, detail: string) =>
      entorses.push({ regle, classe, jour, detail: `${classe} — ${jourLabel(jour)} : ${detail}` })
    const contigus = (i: number) => !!daySlots[i + 1] && seSuivent(daySlots[i], daySlots[i + 1])

    // e / f : deux disciplines différentes d'un même groupe qui se suivent sans pause
    for (const [regle, config] of [
      ['pasEnchainerLangues', regles.pasEnchainerLangues],
      ['pasEnchainerSciences', regles.pasEnchainerSciences],
    ] as const) {
      if (!config.actif) continue
      const groupe = new Set(config.matieres)
      for (let i = 0; i < daySlots.length - 1; i++) {
        const a = cases.get(i)
        const b = cases.get(i + 1)
        if (!a || !b || !contigus(i)) continue
        const enchainement = [...a].find((ma) => groupe.has(ma) && [...b].some((mb) => groupe.has(mb) && mb !== ma))
        if (enchainement) {
          const suivante = [...b].find((mb) => groupe.has(mb) && mb !== enchainement)
          push(regle, `${enchainement} puis ${suivante} à ${heure(daySlots[i + 1].heureDebut)}`)
        }
      }
    }

    // Séquences d'une même matière sur des créneaux voisins = une seule séance (bloc)
    const sequences: { matiere: string; debut: number; fin: number }[] = []
    const indexes = [...cases.keys()].sort((a, b) => a - b)
    for (const index of indexes) {
      for (const matiere of cases.get(index)!) {
        const enCours = sequences.find((seq) => seq.matiere === matiere && seq.fin === index - 1)
        if (enCours) enCours.fin = index
        else sequences.push({ matiere, debut: index, fin: index })
      }
    }

    // g : séance de plusieurs heures coupée par une récréation / le déjeuner
    if (regles.eviterCoupurePause.actif) {
      for (const seq of sequences) {
        for (let i = seq.debut; i < seq.fin; i++) {
          if (!contigus(i)) {
            push('eviterCoupurePause', `${seq.matiere} coupée par une pause (${heure(daySlots[i].heureFin)} - ${heure(daySlots[i + 1].heureDebut)})`)
            break
          }
        }
      }
    }

    // h : deux séances de la même discipline dans la journée
    if (regles.uneSeanceParJour.actif) {
      const parMatiere = new Map<string, number>()
      for (const seq of sequences) parMatiere.set(seq.matiere, (parMatiere.get(seq.matiere) ?? 0) + 1)
      for (const [matiere, count] of parMatiere) {
        if (count > 1) push('uneSeanceParJour', `${count} séances de ${matiere} dans la journée`)
      }
    }

    // h : nombre minimum de disciplines différentes dans la journée
    if (regles.minDisciplinesParJour.actif) {
      const distinctes = new Set(sequences.map((s) => s.matiere)).size
      if (distinctes < regles.minDisciplinesParJour.minimum) {
        push('minDisciplinesParJour', `${distinctes} discipline${distinctes > 1 ? 's' : ''} seulement (minimum ${regles.minDisciplinesParJour.minimum})`)
      }
    }

  }

  return entorses
}

export function penaliteEntorses(entorses: Entorse[]): number {
  return entorses.reduce((sum, e) => sum + POIDS[e.regle], 0)
}
