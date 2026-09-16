import { describe, expect, it } from 'vitest'
import { normalizeProfesseurNom, solve, type Seance } from './solver'
import type { Charge } from './charges'
import type { Slot } from './slots'

const charge: Charge = {
  professeurId: 'prof-1',
  professeurNom: 'Élodie N\'Guessan',
  niveau: '3e',
  section: 1,
  matiere: 'Mathématiques',
  cycle: 'college',
  blocks: [1],
  requiredPeriods: 1,
  autoConsecutiveSplittable: false,
}

const slot: Slot = {
  jour: 'lundi',
  creneauId: 'slot-1',
  heureDebut: '08:00:00',
  heureFin: '09:00:00',
}

describe('scheduling solver identity keys', () => {
  it('normalizes accents, casing and repeated spaces', () => {
    expect(normalizeProfesseurNom('  Élodie   N\'Guessan ')).toBe("elodie n'guessan")
  })

  it('uses the normalized person name for existing unavailability keys', () => {
    const unavailableKey = `${normalizeProfesseurNom("elodie n'guessan")}\|lundi\|08:00:00-09:00:00`
    const result = solve([charge], { college: [slot], lycee: [] }, new Set([unavailableKey]))

    expect(result.seances as Seance[]).toHaveLength(0)
    expect(result.unplaced[0]?.manquantes).toBe(1)
  })
})