import type { Cycle } from '@/lib/cycle'

export interface CreneauRow {
  id: string
  cycle: string
  heure_debut: string
  heure_fin: string
  type: string
}

export interface Slot {
  jour: string
  creneauId: string
  heureDebut: string
  heureFin: string
}

function minutesOf(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number)
  return h * 60 + m
}

// Durée type d'une séance pour un cycle : la durée la plus fréquente parmi ses créneaux de type "cours"
// (fallback 60 min si aucun créneau de cours n'est configuré). Utilisée par `charges.ts` uniquement quand
// le réglage "1 créneau = 1 heure" est désactivé (calcul avec la durée réelle des créneaux).
export function computePeriodMinutes(creneaux: CreneauRow[], cycle: Cycle): number {
  const cours = creneaux.filter((c) => c.cycle === cycle && c.type === 'cours')
  if (cours.length === 0) return 60

  const counts = new Map<number, number>()
  for (const c of cours) {
    const duree = minutesOf(c.heure_fin) - minutesOf(c.heure_debut)
    counts.set(duree, (counts.get(duree) ?? 0) + 1)
  }
  let best = 60
  let bestCount = 0
  for (const [duree, count] of counts) {
    if (count > bestCount || (count === bestCount && duree < best)) {
      best = duree
      bestCount = count
    }
  }
  return best > 0 ? best : 60
}

// Grille des créneaux plaçables (jour × créneau de type "cours") pour un cycle donné, en tenant compte
// des jours de cours actifs et du mercredi après-midi banalisé — même règle que l'aperçu de
// HorairesContraintes.tsx (comparaison lexicographique des heures "HH:MM").
export function buildSlots(
  creneaux: CreneauRow[],
  cycle: Cycle,
  joursCours: string[],
  mercrediApresMidiBanalise: boolean,
): Slot[] {
  const coursCreneaux = [...creneaux]
    .filter((c) => c.cycle === cycle && c.type === 'cours')
    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
  const heureDejeuner = creneaux.find((c) => c.cycle === cycle && c.type === 'dejeuner')?.heure_debut

  const slots: Slot[] = []
  for (const jour of joursCours) {
    for (const creneau of coursCreneaux) {
      const banalise =
        jour === 'mercredi' && mercrediApresMidiBanalise && !!heureDejeuner && creneau.heure_debut > heureDejeuner
      if (banalise) continue
      slots.push({ jour, creneauId: creneau.id, heureDebut: creneau.heure_debut, heureFin: creneau.heure_fin })
    }
  }
  return slots
}
