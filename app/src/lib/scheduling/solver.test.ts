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

describe('scheduling solver hard constraints', () => {
  it('does not double-book the same person across college and lycee', () => {
    const collegeCharge: Charge = { ...charge, professeurId: 'college', niveau: '3e' }
    const lyceeCharge: Charge = { ...charge, professeurId: 'lycee', niveau: '2nde' }

    const result = solve(
      [collegeCharge, lyceeCharge],
      { college: [slot], lycee: [{ ...slot, creneauId: 'lycee-slot-1' }] },
    )

    expect(result.seances).toHaveLength(1)
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0]?.manquantes).toBe(1)
  })

  it('keeps an explicit two-period block consecutive', () => {
    const doubleCharge: Charge = {
      ...charge,
      blocks: [2],
      requiredPeriods: 2,
      autoConsecutiveSplittable: false,
    }
    const secondSlot: Slot = {
      ...slot,
      creneauId: 'slot-2',
      heureDebut: '09:00:00',
      heureFin: '10:00:00',
    }

    const result = solve([doubleCharge], { college: [slot, secondSlot], lycee: [] })

    expect(result.seances).toHaveLength(2)
    expect(result.seances.map((seance) => seance.creneauId)).toEqual(['slot-1', 'slot-2'])
    expect(result.unplaced).toHaveLength(0)
  })
})