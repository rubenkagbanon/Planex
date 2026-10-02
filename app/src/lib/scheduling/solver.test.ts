import { describe, expect, it } from 'vitest'
import { REGLES_DEFAUT, type ReglesPedagogiques } from '@/lib/regles'
import { normalizeProfesseurNom, solve } from './solver'
import type { Activite } from './activites'
import { buildActivites } from './activites'
import type { Charge } from './charges'
import type { Slot } from './slots'
import { analyserEntorses, groupSlotsByJour } from './entorses'

const REGLES_NEUTRES: ReglesPedagogiques = {
  ...REGLES_DEFAUT,
  pasEnchainerLangues: { ...REGLES_DEFAUT.pasEnchainerLangues, actif: false },
  pasEnchainerSciences: { ...REGLES_DEFAUT.pasEnchainerSciences, actif: false },
  eviterCoupurePause: { actif: false, autoriserException: true },
  uneSeanceParJour: { actif: false },
  minDisciplinesParJour: { actif: false, minimum: 3 },
  epsAuxBords: { ...REGLES_DEFAUT.epsAuxBords, actif: false },
  heuresCreusesBienPlacees: { actif: false },
  demiJourneeLibreProfesseur: { actif: false },
}
const neutres = { college: REGLES_NEUTRES, lycee: REGLES_NEUTRES }

function slot(creneauId: string, heureDebut: string, heureFin: string, jour = 'lundi', apresMidi = false): Slot {
  return { jour, creneauId, heureDebut, heureFin, apresMidi }
}

function activite(partial: Partial<Activite> & Pick<Activite, 'groupes'>): Activite {
  return {
    id: partial.id ?? `a-${partial.groupes.map((g) => g.professeurId).join('-')}`,
    type: 'simple',
    cycle: 'college',
    classes: [{ niveau: '3e', section: 1 }],
    blocks: [1],
    requiredPeriods: 1,
    autoConsecutiveSplittable: false,
    bordsDeJournee: false,
    ...partial,
  }
}

const prof = (id: string, nom = id, matiere = 'Mathématiques') => ({ professeurId: id, professeurNom: nom, matiere })

describe('identité des professeurs', () => {
  it('normalise accents, casse et espaces', () => {
    expect(normalizeProfesseurNom("  Élodie   N'Guessan ")).toBe("elodie n'guessan")
  })

  it('respecte une indisponibilité déclarée', () => {
    const key = `${normalizeProfesseurNom("elodie n'guessan")}|lundi|08:00:00-09:00:00`
    const result = solve([activite({ groupes: [prof('p1', "Élodie N'Guessan")] })], { college: [slot('s1', '08:00:00', '09:00:00')], lycee: [] }, {
      reglesByCycle: neutres,
      indisponibiliteKeys: new Set([key]),
    })
    expect(result.seances).toHaveLength(0)
    expect(result.unplaced[0]?.manquantes).toBe(1)
  })

  it("ne place jamais la même personne au collège et au lycée en même temps", () => {
    const result = solve(
      [
        activite({ id: 'c', groupes: [prof('college', 'Bamba')] }),
        activite({ id: 'l', cycle: 'lycee', classes: [{ niveau: '2ndeC', section: 1 }], groupes: [prof('lycee', 'Bamba')] }),
      ],
      { college: [slot('s1', '08:00:00', '09:00:00')], lycee: [slot('l1', '08:00:00', '09:00:00')] },
      { reglesByCycle: neutres },
    )
    expect(result.seances).toHaveLength(1)
    expect(result.unplaced[0]?.manquantes).toBe(1)
  })
})

describe('blocs et pauses', () => {
  const matin = [slot('s1', '08:00:00', '09:00:00'), slot('s2', '09:00:00', '10:00:00')]

  it('garde un double cours explicite consécutif', () => {
    const result = solve([activite({ groupes: [prof('p1')], blocks: [2], requiredPeriods: 2 })], { college: matin, lycee: [] }, { reglesByCycle: neutres })
    expect(result.seances.map((s) => s.creneauId)).toEqual(['s1', 's2'])
  })

  it("préfère un double cours sans récréation au milieu", () => {
    const slots = [
      slot('s1', '08:00:00', '09:00:00'),
      slot('s2', '09:15:00', '10:15:00'), // récréation entre s1 et s2
      slot('s3', '10:15:00', '11:15:00'),
    ]
    const regles = { ...REGLES_NEUTRES, eviterCoupurePause: { actif: true, autoriserException: true } }
    const result = solve([activite({ groupes: [prof('p1')], blocks: [2], requiredPeriods: 2 })], { college: slots, lycee: [] }, {
      reglesByCycle: { college: regles, lycee: regles },
    })
    expect(result.seances.map((s) => s.creneauId)).toEqual(['s2', 's3'])
  })

  it("coupe par une pause en tout dernier recours plutôt que de perdre des heures de la grille", () => {
    const slots = [slot('s1', '08:00:00', '09:00:00'), slot('s2', '09:15:00', '10:15:00')]
    const regles = { ...REGLES_NEUTRES, eviterCoupurePause: { actif: true, autoriserException: false } }
    const result = solve([activite({ groupes: [prof('p1')], blocks: [2], requiredPeriods: 2 })], { college: slots, lycee: [] }, {
      reglesByCycle: { college: regles, lycee: regles },
    })
    expect(result.seances).toHaveLength(2)
    expect(result.unplaced).toHaveLength(0)
    expect(result.entorses.some((e) => e.regle === 'eviterCoupurePause')).toBe(true)
  })
})

describe('règles pédagogiques', () => {
  it("EPS uniquement aux 2 premiers créneaux du matin ou aux 2 derniers de l'après-midi", () => {
    const jour = [
      slot('m1', '07:45:00', '08:35:00'),
      slot('m2', '08:35:00', '09:25:00'),
      slot('m3', '09:25:00', '10:15:00'),
      slot('a1', '13:15:00', '14:05:00', 'lundi', true),
      slot('a2', '14:05:00', '14:55:00', 'lundi', true),
    ]
    const regles = { ...REGLES_NEUTRES, epsAuxBords: { actif: true, matiere: 'E.P.S.', duree: 2 } }
    // Le matin est déjà pris par une autre activité de la classe : l'EPS doit aller en fin d'après-midi.
    const result = solve(
      [
        activite({ id: 'eps', groupes: [prof('sport', 'Signo', 'E.P.S.')], blocks: [2], requiredPeriods: 2, bordsDeJournee: true }),
        activite({ id: 'maths', groupes: [prof('maths', 'Bamba')], blocks: [1], requiredPeriods: 1 }),
      ],
      { college: jour, lycee: [] },
      { reglesByCycle: { college: regles, lycee: regles }, tentatives: 20 },
    )
    const eps = result.seances.filter((s) => s.matiere === 'E.P.S.').map((s) => s.creneauId).sort()
    expect([['m1', 'm2'], ['a1', 'a2']]).toContainEqual(eps)
    expect(result.unplaced).toHaveLength(0)
  })

  it("évite d'enchaîner deux langues", () => {
    const jour = [slot('s1', '08:00:00', '09:00:00'), slot('s2', '09:00:00', '10:00:00'), slot('s3', '10:00:00', '11:00:00')]
    const regles = { ...REGLES_NEUTRES, pasEnchainerLangues: { actif: true, matieres: ['Français', 'Anglais'] } }
    const result = solve(
      [
        activite({ id: 'fr', groupes: [prof('fr', 'Nado', 'Français')] }),
        activite({ id: 'an', groupes: [prof('an', 'Siagbe', 'Anglais')] }),
        activite({ id: 'ma', groupes: [prof('ma', 'Bamba', 'Mathématiques')] }),
      ],
      { college: jour, lycee: [] },
      { reglesByCycle: { college: regles, lycee: regles }, tentatives: 50 },
    )
    const parCreneau = Object.fromEntries(result.seances.map((s) => [s.creneauId, s.matiere]))
    expect(parCreneau.s2).toBe('Mathématiques')
    expect(result.entorses.filter((e) => e.regle === 'pasEnchainerLangues')).toHaveLength(0)
  })

  it("signale une journée avec trop peu de disciplines et une heure creuse en milieu de matinée", () => {
    const jour = [slot('s1', '08:00:00', '09:00:00'), slot('s2', '09:00:00', '10:00:00'), slot('s3', '10:00:00', '11:00:00')]
    const regles = { ...REGLES_NEUTRES, minDisciplinesParJour: { actif: true, minimum: 3 }, heuresCreusesBienPlacees: { actif: true } }
    const entorses = analyserEntorses(
      [
        { niveau: '3e', section: 1, matiere: 'Français', cycle: 'college', jour: 'lundi', creneauId: 's1' },
        { niveau: '3e', section: 1, matiere: 'Anglais', cycle: 'college', jour: 'lundi', creneauId: 's3' },
      ],
      { college: groupSlotsByJour(jour), lycee: new Map() },
      { college: regles, lycee: regles },
    )
    expect(entorses.map((e) => e.regle).sort()).toEqual(['heuresCreusesBienPlacees', 'minDisciplinesParJour'])
  })
})

describe('salles, tandems et troncs communs', () => {
  const unCreneau = { college: [slot('s1', '08:00:00', '09:00:00')], lycee: [] }

  it("n'accueille qu'une classe par salle et par créneau (l'autre est placée sans salle)", () => {
    const salles = [{ id: 'labo', nom: 'LABO1', type: 'laboratoire', capacite: 1 }]
    const result = solve(
      [
        activite({ id: 'a', groupes: [prof('p1', 'Goye', 'S.V.T.')] }),
        activite({ id: 'b', classes: [{ niveau: '3e', section: 2 }], groupes: [prof('p2', 'Die', 'S.V.T.')] }),
      ],
      unCreneau,
      { reglesByCycle: neutres, salles, typeSalleParMatiere: { 'S.V.T.': 'laboratoire' } },
    )
    expect(result.seances).toHaveLength(2)
    expect(result.seances.filter((s) => s.salleId === 'labo')).toHaveLength(1)
    expect(result.seances.filter((s) => s.salleId === null)).toHaveLength(1)
  })

  it('un tronc commun réunit plusieurs classes dans une seule salle, au même créneau', () => {
    const salles = [{ id: 's15', nom: 'S15', type: 'classe', capacite: 1 }]
    const result = solve(
      [activite({ type: 'tronc_commun', classes: [{ niveau: 'TleA2', section: 1 }, { niveau: 'TleA2', section: 2 }], groupes: [prof('p', 'Nana', 'Philosophie')] })],
      unCreneau,
      { reglesByCycle: neutres, salles, salleAttitreeParClasse: { 'TleA2-1': 's15' } },
    )
    expect(result.seances).toHaveLength(2)
    expect(new Set(result.seances.map((s) => s.salleId))).toEqual(new Set(['s15']))
    expect(result.seances[0].groupeKey).not.toBeNull()
    expect(result.seances[0].groupeKey).toBe(result.seances[1].groupeKey)
  })

  it('un tandem occupe la classe une seule fois, avec un professeur et une salle par groupe', () => {
    const salles = [
      { id: 's15', nom: 'S15', type: 'classe', capacite: 1 },
      { id: 's16', nom: 'S16', type: 'classe', capacite: 1 },
    ]
    const result = solve(
      [activite({ type: 'tandem', groupes: [prof('all', 'Kouadio', 'L.V.2 (All./Esp.)'), prof('esp', 'Ouattara', 'L.V.2 (All./Esp.)')] })],
      unCreneau,
      { reglesByCycle: neutres, salles, salleAttitreeParClasse: { '3e-1': 's15' } },
    )
    expect(result.seances).toHaveLength(2)
    expect(result.seances.map((s) => s.salleId).sort()).toEqual(['s15', 's16'])
  })

  it('regroupe automatiquement deux professeurs de la même matière dans une classe en tandem', () => {
    const base: Omit<Charge, 'professeurId' | 'professeurNom'> = {
      niveau: '3e',
      section: 2,
      matiere: 'L.V.2 (All./Esp.)',
      cycle: 'college',
      blocks: [1, 1, 1],
      requiredPeriods: 3,
      autoConsecutiveSplittable: false,
    }
    const { activites } = buildActivites({
      charges: [
        { ...base, professeurId: 'k', professeurNom: 'Kouadio N. A.' },
        { ...base, professeurId: 'o', professeurNom: 'Ouattara S.' },
      ],
      regroupements: [],
      reglesByCycle: { college: REGLES_DEFAUT, lycee: REGLES_DEFAUT },
    })
    expect(activites).toHaveLength(1)
    expect(activites[0].type).toBe('tandem')
    expect(activites[0].requiredPeriods).toBe(3)
  })

  it('respecte les séances verrouillées', () => {
    const result = solve([activite({ groupes: [prof('p1', 'Bamba')] })], unCreneau, {
      reglesByCycle: neutres,
      seancesFixes: [
        {
          professeurId: 'autre',
          professeurNom: 'Autre',
          niveau: '3e',
          section: 1,
          matiere: 'Français',
          cycle: 'college',
          jour: 'lundi',
          creneauId: 's1',
          salleId: null,
          groupeKey: null,
        },
      ],
    })
    expect(result.seances).toHaveLength(0)
    expect(result.unplaced[0]?.manquantes).toBe(1)
  })
})

describe('demi-journée libre des professeurs', () => {
  // 2 jours × (2 créneaux le matin + 2 l'après-midi) = 4 demi-journées
  const slots: Slot[] = ['lundi', 'mardi'].flatMap((jour) => [
    slot(`${jour}-1`, '08:00:00', '09:00:00', jour),
    slot(`${jour}-2`, '09:00:00', '10:00:00', jour),
    slot(`${jour}-3`, '14:00:00', '15:00:00', jour, true),
    slot(`${jour}-4`, '15:00:00', '16:00:00', jour, true),
  ])
  const avecRegle = { ...REGLES_NEUTRES, demiJourneeLibreProfesseur: { actif: true } }
  const demiJournees = (seances: { jour: string; creneauId: string }[]) =>
    new Set(seances.map((s) => `${s.jour}|${slots.find((x) => x.creneauId === s.creneauId)!.apresMidi}`)).size

  it('laisse au professeur au moins une demi-journée sans cours', () => {
    const activites = [1, 2, 3, 4].map((section) =>
      activite({ id: `a${section}`, classes: [{ niveau: '3e', section }], groupes: [prof('p1', 'Kone')] }),
    )
    for (let seed = 0; seed < 5; seed++) {
      const result = solve(activites, { college: slots, lycee: [] }, { reglesByCycle: { college: avecRegle, lycee: avecRegle }, tentatives: 3 + seed })
      expect(result.seances).toHaveLength(4)
      expect(demiJournees(result.seances)).toBeLessThan(4)
      expect(result.entorses.filter((e) => e.regle === 'demiJourneeLibreProfesseur')).toHaveLength(0)
    }
  })

  it("signale le professeur quand c'est impossible, sans laisser de séance de côté", () => {
    const activites = [1, 2, 3, 4, 5, 6, 7, 8].map((section) =>
      activite({ id: `a${section}`, classes: [{ niveau: '3e', section }], groupes: [prof('p1', 'Kone')] }),
    )
    const result = solve(activites, { college: slots, lycee: [] }, { reglesByCycle: { college: avecRegle, lycee: avecRegle }, tentatives: 3 })
    expect(result.seances).toHaveLength(8)
    expect(result.entorses.filter((e) => e.regle === 'demiJourneeLibreProfesseur')).toHaveLength(1)
  })
})
