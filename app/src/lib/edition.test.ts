import { describe, expect, it } from 'vitest'
import { calculerEchange, reaffecterSalles, verifierDeplacements, type ContexteEdition } from './edition'
import type { CreneauRow, SeanceRow } from './timetable'

const creneaux: CreneauRow[] = [
  { id: 'c1', cycle: 'college', heure_debut: '07:45:00', heure_fin: '08:35:00', type: 'cours' },
  { id: 'c2', cycle: 'college', heure_debut: '08:35:00', heure_fin: '09:25:00', type: 'cours' },
]

function seance(id: string, partial: Partial<SeanceRow>): SeanceRow {
  return {
    id,
    created_at: '',
    etablissement_id: 'e',
    cycle: 'college',
    jour: 'lundi',
    creneau_id: 'c1',
    niveau: '3e',
    section: 1,
    matiere: 'Mathématiques',
    professeur_id: 'bamba',
    salle_id: null,
    verrouille: false,
    groupe_seance: null,
    ...partial,
  }
}

const ctx: ContexteEdition = {
  creneauById: new Map(creneaux.map((c) => [c.id, c])),
  profNameById: { bamba: 'Bamba N.', nado: 'Nado P. S.' },
  salleById: new Map(),
  indisponibilites: [],
}

describe('édition manuelle', () => {
  it("échange deux séances d'une classe sans conflit", () => {
    const maths = seance('a', {})
    const francais = seance('b', { creneau_id: 'c2', matiere: 'Français', professeur_id: 'nado' })
    const all = [maths, francais]
    const deplacements = calculerEchange(all, [maths], [francais], { jour: 'lundi', creneauId: 'c2' }, { jour: 'lundi', creneauId: 'c1' }, ctx.creneauById)
    expect(Array.isArray(deplacements)).toBe(true)
    expect(verifierDeplacements(all, deplacements as never, ctx)).toEqual([])
  })

  it("refuse de mettre un professeur dans deux classes en même temps", () => {
    const maths31 = seance('a', {})
    const maths32 = seance('b', { section: 2, creneau_id: 'c2' })
    const deplacements = calculerEchange([maths31, maths32], [maths32], [], { jour: 'lundi', creneauId: 'c1' }, { jour: 'lundi', creneauId: 'c2' }, ctx.creneauById)
    const conflits = verifierDeplacements([maths31, maths32], deplacements as never, ctx)
    expect(conflits).toEqual(['Bamba N. a déjà cours avec la 3e 1 à ce moment.'])
  })

  it('refuse un créneau où le professeur est indisponible', () => {
    const maths = seance('a', { creneau_id: 'c2' })
    const deplacements = calculerEchange([maths], [maths], [], { jour: 'lundi', creneauId: 'c1' }, { jour: 'lundi', creneauId: 'c2' }, ctx.creneauById)
    const conflits = verifierDeplacements([maths], deplacements as never, {
      ...ctx,
      indisponibilites: [{ nom_complet: 'Bamba N.', jour: 'lundi', creneau_id: 'c1' }],
    })
    expect(conflits).toHaveLength(1)
  })
})

describe('réaffectation de salle après un déplacement', () => {
  const salles = [
    { id: 's1', nom: 'S1', type: 'classe', capacite: 1 },
    { id: 's2', nom: 'S2', type: 'classe', capacite: 1 },
    { id: 'labo', nom: 'LABO', type: 'laboratoire', capacite: 1 },
  ]
  const creneauById = new Map(creneaux.map((c) => [c.id, c]))

  it('donne une autre salle libre du même type si la sienne est prise au nouvel horaire', () => {
    const seances = [
      seance('a', { creneau_id: 'c1', salle_id: 's1' }),
      seance('b', { creneau_id: 'c2', salle_id: 's1', niveau: '4e' }),
    ]
    const { deplacements, changements } = reaffecterSalles(seances, [{ id: 'a', jour: 'lundi', creneauId: 'c2', salleId: 's1' }], salles, creneauById)
    expect(deplacements[0].salleId).toBe('s2')
    expect(changements[0]).toMatch(/S1 occupée .* S2/)
  })

  it('garde sa salle si elle est libre, et place sans salle quand aucune du type ne l’est', () => {
    const seances = [
      seance('a', { creneau_id: 'c1', salle_id: 'labo', matiere: 'S.V.T.' }),
      seance('b', { creneau_id: 'c2', salle_id: 'labo', niveau: '4e', matiere: 'S.V.T.' }),
    ]
    expect(reaffecterSalles(seances, [{ id: 'a', jour: 'mardi', creneauId: 'c2', salleId: 'labo' }], salles, creneauById).deplacements[0].salleId).toBe('labo')
    expect(reaffecterSalles(seances, [{ id: 'a', jour: 'lundi', creneauId: 'c2', salleId: 'labo' }], salles, creneauById).deplacements[0].salleId).toBeNull()
  })
})
